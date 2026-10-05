/**
 * Test Suite for Task 03.8: Prompt generator (backend/src/server/prompt.ts)
 *
 * Verifies:
 * 1. Acceptance Criteria: Prompt has all sections:
 *    - Project Context
 *    - Requirement
 *    - Dependencies
 *    - Files
 *    - Acceptance Criteria
 *    - Tests
 *    - Commit Rule with '[node-ID] message'
 * 2. Snapshot Test: Exact character-level matching of generated agent prompt against golden snapshot
 * 3. Dependencies handling (root node with no prerequisites vs node with multiple dependencies)
 * 4. Graph-level prompt generation (attaching prompts to all nodes in a build graph)
 * 5. Commit message helpers (formatCommitMessage, parseCommitMessage)
 * 6. Error handling (empty graph, null inputs, missing node_key)
 * 7. Function aliases
 */

import {
  buildNodePrompt,
  generateNodePrompt,
  generateGraphPrompts,
  attachNodePrompts,
  generatePrompts,
  prompt,
  formatCommitMessage,
  parseCommitMessage,
  PROMPT_GENERATOR_VERSION,
  type ProjectContext,
} from "../src/server/prompt";
import { BadRequestError } from "../src/lib/errors";

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
// Snapshot Fixtures
// ---------------------------------------------------------------------------
const SNAPSHOT_FIXTURE_NODE = {
  node_key: "01.1",
  phase: "01",
  title: "Scaffolding & Next.js Setup",
  type: "setup",
  status: "not_started" as const,
  requirement_key: "REQ-1",
  files: ["package.json", "tsconfig.json", "src/app/layout.tsx"],
  explanation: "Initial workspace scaffolding and configuration.",
  acceptance: [
    "Repository initializes cleanly with package.json and tsconfig.json.",
    "TypeScript compiler runs without errors on clean repository.",
  ],
  tests: [
    "Verify `npm run build` succeeds.",
    "Verify `npm run typecheck` produces zero warnings or errors.",
    "Assert workspace dependencies match specification.",
  ],
};

const SNAPSHOT_FIXTURE_PROJECT: ProjectContext = {
  name: "Kalp Habit Tracker",
  description: "A dependency-aware habit tracking platform.",
  stack: [
    "Next.js (App Router)",
    "TypeScript",
    "Tailwind CSS",
    "Supabase Postgres",
    "zod",
  ],
  repoLayout: "kalp-io/frontend and kalp-io/backend",
};

const SNAPSHOT_FIXTURE_REQ = {
  key: "REQ-1",
  title: "User Authentication & Scaffolding",
  description: "Core setup and user authentication infrastructure.",
};

const EXPECTED_SNAPSHOT = `# TASK: [01.1] Scaffolding & Next.js Setup
**Phase**: 01 | **Type**: setup | **Status**: not_started
Initial workspace scaffolding and configuration.

## Project Context
- **Project**: Kalp Habit Tracker
- **Overview**: A dependency-aware habit tracking platform.
- **Stack**: Next.js (App Router), TypeScript, Tailwind CSS, Supabase Postgres, zod
- **Repo Layout**: kalp-io/frontend and kalp-io/backend

## Requirement
- **Key**: REQ-1
- **Title**: User Authentication & Scaffolding
- **Description**: Core setup and user authentication infrastructure.

## Dependencies
- None (this is an initial setup / root node with no prerequisites).

## Files
Target files to create, modify, or test:
- \`package.json\`
- \`tsconfig.json\`
- \`src/app/layout.tsx\`

## Acceptance Criteria
The implementation must satisfy the following criteria:
- [ ] Repository initializes cleanly with package.json and tsconfig.json.
- [ ] TypeScript compiler runs without errors on clean repository.

## Tests
Verify the implementation with the following test cases:
- [ ] Verify \`npm run build\` succeeds.
- [ ] Verify \`npm run typecheck\` produces zero warnings or errors.
- [ ] Assert workspace dependencies match specification.

## Commit Rule
Rule: Commit as '[node-ID] message'.
All commits for this task must follow the format:
\`[01.1] <message>\`

Example:
\`git commit -m "[01.1] Scaffolding & Next.js Setup"\`
`;

// ---------------------------------------------------------------------------
// Sample Graph Fixture
// ---------------------------------------------------------------------------
const SAMPLE_GRAPH = {
  requirements: [
    {
      key: "REQ-1",
      title: "User Authentication",
      description: "Users can register, sign in, and maintain sessions.",
    },
    {
      key: "REQ-2",
      title: "Habit Streaks",
      description: "Tracks consecutive daily completions.",
    },
  ],
  nodes: [
    {
      node_key: "01.1",
      phase: "01",
      title: "Scaffolding & Next.js Setup",
      type: "setup",
      status: "not_started" as const,
      requirement_key: "REQ-1",
      files: ["package.json", "tsconfig.json"],
      explanation: "Initial workspace scaffolding.",
      acceptance: ["Repo initializes", "Types check cleanly"],
      tests: ["Run build", "Run typecheck", "Check scripts"],
    },
    {
      node_key: "02.1",
      phase: "02",
      title: "Database Migrations",
      type: "database",
      status: "not_started" as const,
      requirement_key: "REQ-1",
      files: ["supabase/migrations/001_init.sql"],
      explanation: "Users table migration.",
      acceptance: ["Tables created", "Foreign keys validated"],
      tests: ["Run migration", "Verify schema", "Test constraints"],
    },
    {
      node_key: "02.2",
      phase: "02",
      title: "Auth Route Handlers",
      type: "backend",
      status: "not_started" as const,
      requirement_key: "REQ-1",
      files: ["src/app/api/auth/route.ts"],
      explanation: "Validates JWT tokens.",
      acceptance: [
        "POST /api/auth returns 200",
        "Returns 401 on invalid token",
      ],
      tests: ["Test valid JWT", "Test invalid token", "Test expired session"],
    },
    {
      node_key: "03.1",
      phase: "03",
      title: "Habit Dashboard",
      type: "frontend",
      status: "not_started" as const,
      requirement_key: "REQ-2",
      files: ["src/app/habits/page.tsx"],
      explanation: "Habit tracker UI.",
      acceptance: ["Renders list", "Allows toggle complete"],
      tests: ["Render test", "Toggle button test", "Responsive viewport test"],
    },
    {
      node_key: "03.2",
      phase: "03",
      title: "Streak Calculation Service",
      type: "backend",
      status: "not_started" as const,
      requirement_key: "REQ-2",
      files: ["src/server/streaks.ts"],
      explanation: "Computes streaks.",
      acceptance: ["Calculates consecutive days", "Resets on missed day"],
      tests: [
        "5-day streak test",
        "Missed day reset test",
        "Timezone boundary test",
      ],
    },
  ],
  edges: [
    { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" as const },
    { from_node: "02.2", to_node: "01.1", type: "DEPENDS_ON" as const },
    { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" as const },
    { from_node: "03.2", to_node: "02.2", type: "DEPENDS_ON" as const },
  ],
};

async function runTests() {
  console.log("=== RUNNING TASK 03.8 PROMPT GENERATOR TEST SUITE ===\n");

  // =========================================================================
  // Part 1: Snapshot Test
  // =========================================================================
  console.log("--- Part 1: Snapshot Test ---");

  const snapshotActual = buildNodePrompt({
    node: SNAPSHOT_FIXTURE_NODE,
    project: SNAPSHOT_FIXTURE_PROJECT,
    requirement: SNAPSHOT_FIXTURE_REQ,
  });

  const snapshotMatches = snapshotActual === EXPECTED_SNAPSHOT;
  check(
    "Snapshot test matches golden snapshot exactly",
    snapshotMatches,
    snapshotMatches
      ? undefined
      : {
          diff: `ACTUAL LENGTH: ${snapshotActual.length}, EXPECTED LENGTH: ${EXPECTED_SNAPSHOT.length}`,
        },
  );

  // =========================================================================
  // Part 2: Acceptance Criteria: Prompt Has All Sections & Commit Rule
  // =========================================================================
  console.log(
    "\n--- Part 2: Acceptance Criteria - All Sections & Commit Rule ---",
  );

  // 1. Project Context
  check(
    "ACCEPTANCE CRITERIA: Has '## Project Context' section",
    snapshotActual.includes("## Project Context"),
  );
  check(
    "Project Context includes project details",
    snapshotActual.includes("Kalp Habit Tracker") &&
      snapshotActual.includes("Next.js (App Router)"),
  );

  // 2. Requirement
  check(
    "ACCEPTANCE CRITERIA: Has '## Requirement' section",
    snapshotActual.includes("## Requirement"),
  );
  check(
    "Requirement includes key, title, and description",
    snapshotActual.includes("REQ-1") &&
      snapshotActual.includes("User Authentication & Scaffolding"),
  );

  // 3. Dependencies
  check(
    "ACCEPTANCE CRITERIA: Has '## Dependencies' section",
    snapshotActual.includes("## Dependencies"),
  );
  check(
    "Dependencies mentions root node setup when no prerequisites",
    snapshotActual.includes("initial setup / root node with no prerequisites"),
  );

  // 4. Files
  check(
    "ACCEPTANCE CRITERIA: Has '## Files' section",
    snapshotActual.includes("## Files"),
  );
  check(
    "Files lists expected target files",
    snapshotActual.includes("`package.json`") &&
      snapshotActual.includes("`tsconfig.json`"),
  );

  // 5. Criteria
  check(
    "ACCEPTANCE CRITERIA: Has '## Acceptance Criteria' section",
    snapshotActual.includes("## Acceptance Criteria"),
  );
  check(
    "Acceptance Criteria contains criteria checkboxes",
    snapshotActual.includes("- [ ] Repository initializes cleanly") &&
      snapshotActual.includes("- [ ] TypeScript compiler runs without errors"),
  );

  // 6. Tests
  check(
    "ACCEPTANCE CRITERIA: Has '## Tests' section",
    snapshotActual.includes("## Tests"),
  );
  check(
    "Tests contains test checkboxes",
    snapshotActual.includes("- [ ] Verify `npm run build` succeeds.") &&
      snapshotActual.includes("- [ ] Verify `npm run typecheck`"),
  );

  // 7. Commit Rule
  check(
    "ACCEPTANCE CRITERIA: Has '## Commit Rule' section",
    snapshotActual.includes("## Commit Rule"),
  );
  check(
    "ACCEPTANCE CRITERIA: Contains the rule to commit as '[node-ID] message'",
    snapshotActual.includes("Rule: Commit as '[node-ID] message'."),
  );
  check(
    "Commit Rule contains format '[01.1] <message>'",
    snapshotActual.includes("`[01.1] <message>`"),
  );
  check(
    "Commit Rule contains concrete example commit command",
    snapshotActual.includes(
      '`git commit -m "[01.1] Scaffolding & Next.js Setup"`',
    ),
  );

  // =========================================================================
  // Part 3: Dependencies with Prerequisites
  // =========================================================================
  console.log("\n--- Part 3: Dependencies with Multiple Prerequisites ---");

  const dependentNodePrompt = buildNodePrompt({
    node: {
      node_key: "03.3",
      title: "Composite Notification Service",
      phase: "03",
    },
    dependencies: [
      {
        node_key: "02.1",
        title: "Database Migrations",
        phase: "02",
        status: "completed",
      },
      {
        node_key: "02.2",
        title: "Auth Route Handlers",
        phase: "02",
        status: "completed",
      },
    ],
  });

  check(
    "Lists multiple prerequisite dependencies with titles and statuses",
    dependentNodePrompt.includes(
      "[02.1] Database Migrations (Phase: 02, Status: completed)",
    ) &&
      dependentNodePrompt.includes(
        "[02.2] Auth Route Handlers (Phase: 02, Status: completed)",
      ),
  );
  check(
    "Dependent node commit rule uses node key [03.3]",
    dependentNodePrompt.includes("`[03.3] <message>`") &&
      dependentNodePrompt.includes(
        'git commit -m "[03.3] Composite Notification Service"',
      ),
  );

  // =========================================================================
  // Part 4: Graph-Level Prompt Attachment
  // =========================================================================
  console.log("\n--- Part 4: Graph-Level Prompt Generation & Attachment ---");

  const graphResult = generateGraphPrompts(SAMPLE_GRAPH, {
    project: SNAPSHOT_FIXTURE_PROJECT,
  });

  check(
    "Returns enriched graph with all 5 nodes",
    Array.isArray(graphResult.nodes) && graphResult.nodes.length === 5,
  );
  check(
    "All nodes have prompt string property populated",
    graphResult.nodes.every(
      (n) => typeof n.prompt === "string" && n.prompt.length > 50,
    ),
  );
  check(
    "Prompts map contains all node keys",
    Object.keys(graphResult.prompts).length === 5 &&
      SAMPLE_GRAPH.nodes.every((n) => n.node_key in graphResult.prompts),
  );
  check(
    "Graph prompt version is prompt.v1",
    graphResult.version === PROMPT_GENERATOR_VERSION,
  );

  // Node 02.1 should depend on 01.1
  const prompt021 = graphResult.prompts["02.1"];
  check(
    "Node 02.1 prompt includes dependency [01.1]",
    prompt021.includes("[01.1] Scaffolding & Next.js Setup"),
  );
  check(
    "Node 02.1 prompt links to REQ-1",
    prompt021.includes("REQ-1") && prompt021.includes("User Authentication"),
  );

  // =========================================================================
  // Part 5: Commit Message Helpers
  // =========================================================================
  console.log("\n--- Part 5: Commit Message Helpers ---");

  const formattedMsg1 = formatCommitMessage("01.1", "Initial project setup");
  check(
    "formatCommitMessage produces '[01.1] Initial project setup'",
    formattedMsg1 === "[01.1] Initial project setup",
  );

  const formattedMsg2 = formatCommitMessage(
    "[01.1]",
    "[01.1] Initial project setup",
  );
  check(
    "formatCommitMessage strips redundant brackets and prefixes",
    formattedMsg2 === "[01.1] Initial project setup",
  );

  const parsed1 = parseCommitMessage("[02.2] Implement auth route handlers");
  check(
    "parseCommitMessage correctly extracts nodeId and message",
    parsed1 !== null &&
      parsed1.nodeId === "02.2" &&
      parsed1.message === "Implement auth route handlers",
  );

  const parsedInvalid = parseCommitMessage("Unformatted commit message");
  check(
    "parseCommitMessage returns null for non-matching commit format",
    parsedInvalid === null,
  );

  // =========================================================================
  // Part 6: Error Handling
  // =========================================================================
  console.log("\n--- Part 6: Error Handling ---");

  // 6.1 Null input to buildNodePrompt
  try {
    buildNodePrompt(null as unknown as { node: { node_key: string } });
    check("Null input throws error", false);
  } catch (err) {
    check(
      "Null input throws BadRequestError",
      err instanceof BadRequestError && err.message.includes("cannot be empty"),
    );
  }

  // 6.2 Node missing key
  try {
    buildNodePrompt({
      node: { title: "No Key" } as unknown as { node_key: string },
    });
    check("Node without key throws error", false);
  } catch (err) {
    check(
      "Node without key throws BadRequestError",
      err instanceof BadRequestError &&
        err.message.includes("missing a node_key"),
    );
  }

  // 6.3 Empty graph to generateGraphPrompts
  try {
    generateGraphPrompts({ nodes: [] });
    check("Empty nodes array throws error", false);
  } catch (err) {
    check(
      "Empty nodes array throws BadRequestError",
      err instanceof BadRequestError &&
        err.message.includes("at least one node"),
    );
  }

  // =========================================================================
  // Part 7: Function Aliases
  // =========================================================================
  console.log("\n--- Part 7: Function Aliases ---");

  const p1 = generateNodePrompt({ node: SNAPSHOT_FIXTURE_NODE });
  const p2 = prompt({ node: SNAPSHOT_FIXTURE_NODE });
  check("Alias generateNodePrompt works", p1.includes("[01.1]"));
  check("Alias prompt works", p2.includes("[01.1]"));

  const g1 = attachNodePrompts(SAMPLE_GRAPH);
  const g2 = generatePrompts(SAMPLE_GRAPH);
  check("Alias attachNodePrompts works", g1.nodes[0].prompt !== undefined);
  check("Alias generatePrompts works", g2.nodes[0].prompt !== undefined);

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
    console.log("\nALL PROMPT GENERATOR CHECKS PASSED!");
  }
}

runTests().catch((err) => {
  console.error("Unhandled error in test-prompt:", err);
  process.exit(1);
});
