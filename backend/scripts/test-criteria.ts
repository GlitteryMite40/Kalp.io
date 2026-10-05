/**
 * Test Suite for Task 03.7: Criteria and tests (backend/src/server/criteria.ts)
 *
 * Verifies:
 * 1. Empty and invalid inputs error cases
 * 2. Sample graph criteria and test generation:
 *    - Acceptance Criteria: At least 2 criteria and 3 tests per actionable node
 *    - Node acceptance and tests arrays populated and valid
 *    - Criteria dictionary output mapped by node_key
 * 3. Batching behavior for large graphs (> 8 nodes):
 *    - Splits 18 nodes into batches of <= 8 nodes
 *    - Merges criteria across batches without duplicate keys
 * 4. Context propagation (prerequisite titles and requirement titles)
 * 5. Rejection if generator produces < 2 criteria or < 3 tests
 * 6. Function aliases (generateCriteria, attachCriteriaAndTests, criteria)
 * 7. Optional live Gemini API execution when --live is passed
 */

import {
  generateCriteriaAndTests,
  generateCriteria,
  attachCriteriaAndTests,
  criteria,
  type CriteriaBatchJsonGenerator,
  type EnrichedGraphWithCriteria,
} from "../src/server/criteria";
import { BadRequestError } from "../src/lib/errors";
import { type CriteriaOutput } from "../src/server/prompts/criteria";

let totalChecks = 0;
let passedChecks = 0;
let failed = false;

function check(name: string, condition: boolean, details?: unknown) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`PASS: ${name}`);
  } else {
    failed = true;
    console.error(`FAIL: ${name}`);
    if (details !== undefined) {
      console.error("  Details:", details);
    }
  }
}

// ---------------------------------------------------------------------------
// Sample Graph Fixture (6 Actionable Nodes)
// ---------------------------------------------------------------------------
const SAMPLE_GRAPH = {
  requirements: [
    {
      key: "REQ-1",
      title: "User Authentication",
      id: "10000000-0000-4000-8000-000000000001",
    },
    {
      key: "REQ-2",
      title: "Habit Streaks",
      id: "10000000-0000-4000-8000-000000000002",
    },
  ],
  nodes: [
    {
      node_key: "01.1",
      phase: "01",
      title: "Scaffolding & Next.js Setup",
      type: "setup",
      status: "not_started",
      requirement_key: "REQ-1",
      files: ["package.json", "tsconfig.json"],
      explanation: "Initial workspace scaffolding and configuration.",
      id: "a0000000-0000-4000-8000-000000000001",
    },
    {
      node_key: "02.1",
      phase: "02",
      title: "Supabase Database Schema",
      type: "database",
      status: "not_started",
      requirement_key: "REQ-1",
      files: ["supabase/migrations/001_init.sql"],
      explanation: "Creates users and profiles tables.",
      id: "a0000000-0000-4000-8000-000000000002",
    },
    {
      node_key: "02.2",
      phase: "02",
      title: "Auth Route Handlers",
      type: "backend",
      status: "not_started",
      requirement_key: "REQ-1",
      files: ["src/app/api/auth/route.ts"],
      explanation: "Handles session token validation.",
      id: "a0000000-0000-4000-8000-000000000003",
    },
    {
      node_key: "03.1",
      phase: "03",
      title: "Habit Tracker Dashboard UI",
      type: "frontend",
      status: "not_started",
      requirement_key: "REQ-2",
      files: ["src/app/habits/page.tsx"],
      explanation: "Renders habits list with streak counter.",
      id: "a0000000-0000-4000-8000-000000000004",
    },
    {
      node_key: "03.2",
      phase: "03",
      title: "Habit Streak Calculation Service",
      type: "backend",
      status: "not_started",
      requirement_key: "REQ-2",
      files: ["src/server/streaks.ts"],
      explanation: "Computes consecutive active days.",
      id: "a0000000-0000-4000-8000-000000000005",
    },
    {
      node_key: "04.1",
      phase: "04",
      title: "End-to-End Verification Suite",
      type: "testing",
      status: "not_started",
      requirement_key: "REQ-2",
      files: ["tests/habits.spec.ts"],
      explanation: "Full lifecycle validation tests.",
      id: "a0000000-0000-4000-8000-000000000006",
    },
  ],
  edges: [
    { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
    { from_node: "02.2", to_node: "01.1", type: "DEPENDS_ON" },
    { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" },
    { from_node: "03.2", to_node: "02.2", type: "DEPENDS_ON" },
    { from_node: "04.1", to_node: "03.1", type: "DEPENDS_ON" },
    { from_node: "04.1", to_node: "03.2", type: "DEPENDS_ON" },
  ],
};

const MOCK_CRITERIA_OUTPUT: CriteriaOutput = {
  "01.1": {
    acceptance: [
      "Repository initializes with package.json and tsconfig.json.",
      "TypeScript compiler runs without errors on clean repo.",
    ],
    tests: [
      "Verify `npm run build` succeeds.",
      "Verify `npm run typecheck` produces zero warnings or errors.",
      "Assert workspace dependencies match specification.",
    ],
  },
  "02.1": {
    acceptance: [
      "Migration applies cleanly creating users and profiles tables.",
      "UUID primary keys and foreign key constraints are enforced.",
    ],
    tests: [
      "Run database migration in clean test container.",
      "Attempt inserting user without required email and assert failure.",
      "Query information_schema to verify table and column names.",
    ],
  },
  "02.2": {
    acceptance: [
      "POST /api/auth verifies valid JWT session credentials.",
      "Returns HTTP 401 Unauthorized for expired or missing auth tokens.",
    ],
    tests: [
      "Invoke POST /api/auth with valid bearer token and assert HTTP 200.",
      "Invoke POST /api/auth with missing header and assert HTTP 401.",
      "Verify token expiry edge case returns informative error body.",
    ],
  },
  "03.1": {
    acceptance: [
      "Dashboard renders habit cards with current streak numbers.",
      "User can click complete button to increment streak for today.",
    ],
    tests: [
      "Render dashboard page with mock habit data and verify UI elements.",
      "Click complete button and assert optimistic update triggers.",
      "Test responsive view at mobile viewport width (375px).",
    ],
  },
  "03.2": {
    acceptance: [
      "Streak service computes consecutive days correctly accounting for timezone.",
      "Resets streak to 0 if a habit is missed for more than 24 hours.",
    ],
    tests: [
      "Unit test consecutive 5-day completions returns streak of 5.",
      "Unit test missed day resets streak counter to 0.",
      "Verify leap year and month rollover calculations.",
    ],
  },
  "04.1": {
    acceptance: [
      "E2E test suite executes clean habit creation to completion lifecycle.",
      "All automated tests pass in under 30 seconds in CI.",
    ],
    tests: [
      "Run full Playwright test suite in headless mode.",
      "Simulate network failure during habit save and assert graceful retry.",
      "Verify test exit code is 0 on all assertions passed.",
    ],
  },
};

async function runTests() {
  console.log("=== RUNNING TASK 03.7 CRITERIA AND TESTS TEST SUITE ===\n");

  // =========================================================================
  // Part 1: Empty and Invalid Inputs Error Cases
  // =========================================================================
  console.log("--- Part 1: Empty and Invalid Input Error Cases ---");

  // 1.1 Empty array
  try {
    await generateCriteriaAndTests([]);
    check("Empty nodes array throws error", false);
  } catch (err) {
    check(
      "Empty nodes array throws BadRequestError",
      err instanceof BadRequestError &&
        err.message.includes("at least one node"),
    );
  }

  // 1.2 Empty object { nodes: [] }
  try {
    await generateCriteriaAndTests({ nodes: [] });
    check("{ nodes: [] } throws error", false);
  } catch (err) {
    check(
      "{ nodes: [] } throws BadRequestError",
      err instanceof BadRequestError &&
        err.message.includes("at least one node"),
    );
  }

  // 1.3 Null / Undefined
  try {
    await generateCriteriaAndTests(null as unknown as []);
    check("Null throws error", false);
  } catch (err) {
    check(
      "Null throws BadRequestError",
      err instanceof BadRequestError && err.message.includes("cannot be empty"),
    );
  }

  // 1.4 Node missing node_key
  try {
    await generateCriteriaAndTests([
      { title: "Missing Key", phase: "01" } as unknown as { node_key: string },
    ]);
    check("Node missing node_key throws error", false);
  } catch (err) {
    check(
      "Node missing node_key throws BadRequestError",
      err instanceof BadRequestError &&
        err.message.includes("missing node_key"),
    );
  }

  // =========================================================================
  // Part 2: Sample Graph Criteria and Tests Generation (Acceptance Criteria)
  // =========================================================================
  console.log(
    "\n--- Part 2: Sample Graph Criteria and Tests (Acceptance Criteria) ---",
  );

  let promptReceived = "";

  const mockGenerator: CriteriaBatchJsonGenerator = async (prompt) => {
    promptReceived = prompt;
    return {
      data: MOCK_CRITERIA_OUTPUT,
      model: "gemini-2.5-flash-mock",
    };
  };

  const result: EnrichedGraphWithCriteria = await generateCriteriaAndTests(
    SAMPLE_GRAPH,
    { generator: mockGenerator },
  );

  // Check 1: Output nodes populated
  check(
    "Result contains all 6 graph nodes",
    Array.isArray(result.nodes) &&
      result.nodes.length === SAMPLE_GRAPH.nodes.length,
  );

  // Check 2: ACCEPTANCE CRITERIA: At least 2 criteria per actionable node
  const allMeetCriteriaCount = result.nodes.every(
    (n) => Array.isArray(n.acceptance) && n.acceptance.length >= 2,
  );
  check(
    "ACCEPTANCE CRITERIA: At least 2 acceptance criteria per actionable node",
    allMeetCriteriaCount,
  );

  // Check 3: ACCEPTANCE CRITERIA: At least 3 tests per actionable node
  const allMeetTestCount = result.nodes.every(
    (n) => Array.isArray(n.tests) && n.tests.length >= 3,
  );
  check(
    "ACCEPTANCE CRITERIA: At least 3 test specifications per actionable node",
    allMeetTestCount,
  );

  // Check 4: Criteria content is non-empty strings
  const validContent = result.nodes.every(
    (n) =>
      n.acceptance.every((a) => typeof a === "string" && a.trim().length > 0) &&
      n.tests.every((t) => typeof t === "string" && t.trim().length > 0),
  );
  check(
    "Acceptance criteria and test items are non-empty strings",
    validContent,
  );

  // Check 5: Criteria dictionary output mapped by node_key
  const nodeKeys = SAMPLE_GRAPH.nodes.map((n) => n.node_key);
  const allKeysPresent = nodeKeys.every((k) => k in result.criteria);
  check("result.criteria contains entries for all node keys", allKeysPresent);
  check(
    "result.criteriaMap equals result.criteria",
    result.criteriaMap === result.criteria,
  );

  // Check 6: Prompt received prerequisite titles & requirement context
  check(
    "Prompt received prerequisite titles (depends_on)",
    promptReceived.includes("depends_on") &&
      promptReceived.includes("Scaffolding & Next.js Setup"),
  );
  check(
    "Prompt received requirement titles",
    promptReceived.includes("requirement_title") &&
      promptReceived.includes("User Authentication"),
  );

  // Check 7: Model & version metadata
  check("Model is populated", result.model === "gemini-2.5-flash-mock");
  check("Version is criteria.v2", result.version === "criteria.v2");

  // =========================================================================
  // Part 3: Batching for Graphs with > 8 Nodes
  // =========================================================================
  console.log("\n--- Part 3: Batching (> 8 Nodes) ---");

  // 18 nodes: 8 + 8 + 2 batches
  const eighteenNodes = Array.from({ length: 18 }, (_, i) => ({
    node_key: `0${Math.floor(i / 5) + 1}.${(i % 5) + 1}`,
    phase: `0${Math.floor(i / 5) + 1}`,
    title: `Node Title ${i + 1}`,
    type: "backend",
    status: "not_started" as const,
    files: [`src/node_${i + 1}.ts`],
    explanation: `Explanation for node ${i + 1}.`,
  }));

  let batchCallCount = 0;
  const mockBatchGenerator: CriteriaBatchJsonGenerator = async (prompt) => {
    batchCallCount++;
    const match = prompt.match(/"node_key":\s*"([^"]+)"/g);
    const keys = match
      ? match.map((m) => m.replace(/"node_key":\s*"/, "").replace(/"/, ""))
      : [];

    const batchData: CriteriaOutput = {};
    for (const key of keys) {
      batchData[key] = {
        acceptance: [`Acceptance 1 for ${key}`, `Acceptance 2 for ${key}`],
        tests: [`Test 1 for ${key}`, `Test 2 for ${key}`, `Test 3 for ${key}`],
      };
    }
    return { data: batchData, model: "mock-model" };
  };

  const res18 = await generateCriteriaAndTests(eighteenNodes, {
    generator: mockBatchGenerator,
  });

  check("18 nodes batched into 3 LLM calls (8 + 8 + 2)", batchCallCount === 3);
  check("All 18 nodes have criteria attached", res18.nodes.length === 18);
  check(
    "All 18 nodes satisfy >= 2 criteria and >= 3 tests",
    res18.nodes.every((n) => n.acceptance.length >= 2 && n.tests.length >= 3),
  );

  // =========================================================================
  // Part 4: Acceptance Criteria Count Enforcement
  // =========================================================================
  console.log("\n--- Part 4: Acceptance Criteria Count Enforcement ---");

  // If generator produces only 1 acceptance criterion, it must fail
  const invalidAccGenerator: CriteriaBatchJsonGenerator = async () => ({
    data: {
      "01.1": {
        acceptance: ["Only one criterion"], // INVALID!
        tests: ["Test 1", "Test 2", "Test 3"],
      },
    },
    model: "mock-model",
  });

  let accFailed = false;
  try {
    await generateCriteriaAndTests([SAMPLE_GRAPH.nodes[0]], {
      generator: invalidAccGenerator,
    });
  } catch {
    accFailed = true;
  }
  check("Rejects output with fewer than 2 acceptance criteria", accFailed);

  // If generator produces only 2 tests, it must fail
  const invalidTestsGenerator: CriteriaBatchJsonGenerator = async () => ({
    data: {
      "01.1": {
        acceptance: ["Criterion 1", "Criterion 2"],
        tests: ["Test 1", "Test 2"], // INVALID! Only 2 tests
      },
    },
    model: "mock-model",
  });

  let testsFailed = false;
  try {
    await generateCriteriaAndTests([SAMPLE_GRAPH.nodes[0]], {
      generator: invalidTestsGenerator,
    });
  } catch {
    testsFailed = true;
  }
  check("Rejects output with fewer than 3 test specifications", testsFailed);

  // =========================================================================
  // Part 5: Function Aliases
  // =========================================================================
  console.log("\n--- Part 5: Function Aliases ---");

  const singleNode = [SAMPLE_GRAPH.nodes[0]];
  const mockSingleGen: CriteriaBatchJsonGenerator = async () => ({
    data: { "01.1": MOCK_CRITERIA_OUTPUT["01.1"] },
    model: "mock-model",
  });

  const resAlias1 = await generateCriteria(singleNode, {
    generator: mockSingleGen,
  });
  const resAlias2 = await attachCriteriaAndTests(singleNode, {
    generator: mockSingleGen,
  });
  const resAlias3 = await criteria(singleNode, { generator: mockSingleGen });

  check(
    "Alias `generateCriteria` works",
    resAlias1.nodes[0].acceptance.length >= 2,
  );
  check(
    "Alias `attachCriteriaAndTests` works",
    resAlias2.nodes[0].acceptance.length >= 2,
  );
  check("Alias `criteria` works", resAlias3.nodes[0].acceptance.length >= 2);

  // =========================================================================
  // Part 6: Optional Live Gemini LLM Execution
  // =========================================================================
  const isLive = process.argv.includes("--live");
  if (isLive) {
    console.log("\n--- Part 6: Live Gemini LLM Execution ---");
    if (!process.env.LLM_API_KEY) {
      console.warn("  Skipping live test: LLM_API_KEY is not set.");
    } else {
      try {
        console.log(
          "  Running live generateCriteriaAndTests with real Gemini model...",
        );
        const liveRes = await generateCriteriaAndTests(
          SAMPLE_GRAPH.nodes.slice(0, 3),
        );
        check(
          "Live criteria: all nodes have >= 2 acceptance criteria",
          liveRes.nodes.every((n) => n.acceptance.length >= 2),
        );
        check(
          "Live criteria: all nodes have >= 3 tests",
          liveRes.nodes.every((n) => n.tests.length >= 3),
        );
        console.log(`  Live model: ${liveRes.model}`);
        console.log(
          `  Live criteria generated for: ${liveRes.nodes.map((n) => n.node_key).join(", ")}`,
        );
      } catch (liveErr) {
        console.error("  Live criteria failed:", liveErr);
        check("Live criteria passed", false, liveErr);
      }
    }
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);

  if (failed) {
    console.error("\nTEST SUITE FAILED!");
    process.exit(1);
  } else {
    console.log("\nALL CRITERIA AND TESTS CHECKS PASSED!");
  }
}

runTests().catch((err) => {
  console.error("Unhandled error in test-criteria:", err);
  process.exit(1);
});
