/**
 * Test Suite for Task 03.6: Graph validator (backend/src/server/validate.ts)
 *
 * Verifies:
 * 1. Cycle detection (cycle fixtures, self-edges)
 * 2. Orphan detection (orphan fixtures, disconnected nodes)
 * 3. Duplicate detection (duplicate node_key, duplicate UUID, duplicate edge)
 * 4. Missing dependencies (unknown edge endpoints, unknown requirement keys)
 * 5. Valid graph validation
 * 6. "On failure, regenerate once":
 *    - Valid graph saved on first attempt
 *    - Invalid graph healed on single regeneration attempt and saved
 *    - Invalid graph rejected after regeneration failure
 * 7. Acceptance Criteria:
 *    - "Invalid graphs are never saved" (saveFn is never invoked for invalid graphs)
 */

import {
  validateGraph,
  assertValidGraph,
  validateAndSaveGraph,
  validateWithRegeneration,
  InvalidGraphError,
  formatValidationFeedback,
  type GraphLike,
} from "../src/server/validate";

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
// Base Valid Graph Fixture
// ---------------------------------------------------------------------------
const VALID_BASE_GRAPH: GraphLike = {
  requirements: [
    {
      key: "REQ-1",
      title: "User Auth",
      id: "10000000-0000-4000-8000-000000000001",
    },
    {
      key: "REQ-2",
      title: "Dashboard",
      id: "10000000-0000-4000-8000-000000000002",
    },
  ],
  nodes: [
    {
      node_key: "01.1",
      phase: "01",
      title: "Scaffolding & Setup",
      type: "setup",
      status: "not_started",
      requirement_key: "REQ-1",
      files: ["package.json"],
      explanation: "Initial workspace scaffolding.",
      id: "a0000000-0000-4000-8000-000000000001",
    },
    {
      node_key: "02.1",
      phase: "02",
      title: "Auth Database Schema",
      type: "database",
      status: "not_started",
      requirement_key: "REQ-1",
      files: ["src/lib/db.ts"],
      explanation: "Configures user authentication tables.",
      id: "a0000000-0000-4000-8000-000000000002",
    },
    {
      node_key: "02.2",
      phase: "02",
      title: "Dashboard UI Layout",
      type: "frontend",
      status: "not_started",
      requirement_key: "REQ-2",
      files: ["src/app/dashboard/page.tsx"],
      explanation: "Renders analytics dashboard.",
      id: "a0000000-0000-4000-8000-000000000003",
    },
    {
      node_key: "03.1",
      phase: "03",
      title: "End-to-End Verification",
      type: "testing",
      status: "not_started",
      requirement_key: "REQ-2",
      files: ["tests/e2e.spec.ts"],
      explanation: "Validates auth and dashboard flows.",
      id: "a0000000-0000-4000-8000-000000000004",
    },
  ],
  edges: [
    {
      from_node: "02.1",
      to_node: "01.1",
      type: "DEPENDS_ON",
      id: "e0000000-0000-4000-8000-000000000001",
    },
    {
      from_node: "02.2",
      to_node: "01.1",
      type: "DEPENDS_ON",
      id: "e0000000-0000-4000-8000-000000000002",
    },
    {
      from_node: "03.1",
      to_node: "02.1",
      type: "DEPENDS_ON",
      id: "e0000000-0000-4000-8000-000000000003",
    },
    {
      from_node: "03.1",
      to_node: "02.2",
      type: "DEPENDS_ON",
      id: "e0000000-0000-4000-8000-000000000004",
    },
  ],
};

async function runTests() {
  console.log("=== RUNNING TASK 03.6 GRAPH VALIDATOR TEST SUITE ===\n");

  // =========================================================================
  // Part 1: Valid Graph Baseline
  // =========================================================================
  console.log("--- Part 1: Valid Baseline Graph ---");

  const validRes = validateGraph(VALID_BASE_GRAPH);
  check("Valid graph passes validateGraph", validRes.valid);
  check("Valid graph has 0 errors", validRes.errors.length === 0);
  check("Valid graph has no cycle", validRes.cycle === null);
  check("Valid graph has no orphans", validRes.orphans.length === 0);

  const asserted = assertValidGraph(VALID_BASE_GRAPH);
  check(
    "assertValidGraph returns graph without throwing",
    asserted === VALID_BASE_GRAPH,
  );

  // =========================================================================
  // Part 2: Cycle Fixtures
  // =========================================================================
  console.log("\n--- Part 2: Cycle Fixtures ---");

  // 2.1 2-node cycle: 02.1 -> 02.2 -> 02.1
  const cycleGraph2Node: GraphLike = {
    ...VALID_BASE_GRAPH,
    edges: [
      { from_node: "02.1", to_node: "02.2", type: "DEPENDS_ON" },
      { from_node: "02.2", to_node: "02.1", type: "DEPENDS_ON" },
    ],
  };
  const cycleRes1 = validateGraph(cycleGraph2Node);
  check("Detects 2-node DEPENDS_ON cycle", !cycleRes1.valid);
  check(
    "Cycle reported with CYCLE_DETECTED code",
    cycleRes1.errors.some((e) => e.code === "CYCLE_DETECTED"),
  );
  check(
    "Cycle path returned in result.cycle",
    Array.isArray(cycleRes1.cycle) && cycleRes1.cycle.length >= 2,
  );

  // 2.2 3-node cycle: 02.1 -> 02.2 -> 03.1 -> 02.1
  const cycleGraph3Node: GraphLike = {
    ...VALID_BASE_GRAPH,
    edges: [
      { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
      { from_node: "02.2", to_node: "02.1", type: "DEPENDS_ON" },
      { from_node: "03.1", to_node: "02.2", type: "DEPENDS_ON" },
      { from_node: "02.1", to_node: "03.1", type: "DEPENDS_ON" }, // back-edge creating cycle
    ],
  };
  const cycleRes2 = validateGraph(cycleGraph3Node);
  check(
    "Detects 3-node DEPENDS_ON cycle",
    !cycleRes2.valid && cycleRes2.cycle !== null,
  );

  // 2.3 Self-edge: 02.1 -> 02.1
  const selfEdgeGraph: GraphLike = {
    ...VALID_BASE_GRAPH,
    edges: [
      ...VALID_BASE_GRAPH.edges!,
      { from_node: "02.1", to_node: "02.1", type: "DEPENDS_ON" },
    ],
  };
  const selfEdgeRes = validateGraph(selfEdgeGraph);
  check("Detects self-edge as cycle/invalid", !selfEdgeRes.valid);
  check(
    "Self-edge error message mentions self-edge",
    selfEdgeRes.errors.some(
      (e) => e.code === "CYCLE_DETECTED" && e.message.includes("Self-edge"),
    ),
  );

  // =========================================================================
  // Part 3: Orphan Fixtures
  // =========================================================================
  console.log("\n--- Part 3: Orphan Fixtures ---");

  // 3.1 Node in later phase (02.2) has no prerequisite (no outgoing DEPENDS_ON edge)
  const orphanLaterPhaseGraph: GraphLike = {
    ...VALID_BASE_GRAPH,
    edges: [
      { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
      // 02.2 is missing its prerequisite!
      { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" },
    ],
  };
  const orphanRes1 = validateGraph(orphanLaterPhaseGraph);
  check("Detects orphan node in later phase", !orphanRes1.valid);
  check(
    "Orphan node 02.2 detected with ORPHAN_NODE code",
    orphanRes1.errors.some(
      (e) => e.code === "ORPHAN_NODE" && e.message.includes("02.2"),
    ),
  );
  check("result.orphans contains 02.2", orphanRes1.orphans.includes("02.2"));

  // 3.2 Completely disconnected node (no incoming, no outgoing edges)
  const disconnectedNodeGraph: GraphLike = {
    ...VALID_BASE_GRAPH,
    nodes: [
      ...VALID_BASE_GRAPH.nodes,
      {
        node_key: "09.9",
        phase: "09",
        title: "Forgotten Island Component",
        type: "backend",
        status: "not_started",
        files: [],
      },
    ],
  };
  const orphanRes2 = validateGraph(disconnectedNodeGraph);
  check("Detects completely disconnected node", !orphanRes2.valid);
  check(
    "Disconnected node 09.9 listed in orphans",
    orphanRes2.orphans.includes("09.9"),
  );

  // =========================================================================
  // Part 4: Duplicate Fixtures
  // =========================================================================
  console.log("\n--- Part 4: Duplicate Fixtures ---");

  // 4.1 Duplicate node_key
  const duplicateKeyGraph: GraphLike = {
    ...VALID_BASE_GRAPH,
    nodes: [
      ...VALID_BASE_GRAPH.nodes,
      {
        node_key: "02.1", // DUPLICATE!
        phase: "02",
        title: "Duplicate Auth Schema",
        type: "database",
        status: "not_started",
        files: [],
      },
    ],
  };
  const dupKeyRes = validateGraph(duplicateKeyGraph);
  check("Detects duplicate node_key", !dupKeyRes.valid);
  check(
    "Duplicate node_key reported with DUPLICATE_NODE_KEY code",
    dupKeyRes.errors.some((e) => e.code === "DUPLICATE_NODE_KEY"),
  );
  check(
    "result.duplicates.nodeKeys contains '02.1'",
    dupKeyRes.duplicates.nodeKeys.includes("02.1"),
  );

  // 4.2 Duplicate node UUID id
  const duplicateNodeIdGraph: GraphLike = {
    ...VALID_BASE_GRAPH,
    nodes: [
      VALID_BASE_GRAPH.nodes[0],
      {
        ...VALID_BASE_GRAPH.nodes[1],
        id: VALID_BASE_GRAPH.nodes[0].id, // DUPLICATE UUID!
      },
      ...VALID_BASE_GRAPH.nodes.slice(2),
    ],
  };
  const dupIdRes = validateGraph(duplicateNodeIdGraph);
  check("Detects duplicate node UUID id", !dupIdRes.valid);
  check(
    "Duplicate UUID reported with DUPLICATE_ID code",
    dupIdRes.errors.some((e) => e.code === "DUPLICATE_ID"),
  );

  // 4.3 Duplicate edge
  const duplicateEdgeGraph: GraphLike = {
    ...VALID_BASE_GRAPH,
    edges: [
      ...VALID_BASE_GRAPH.edges!,
      {
        from_node: "02.1",
        to_node: "01.1",
        type: "DEPENDS_ON", // Duplicate of first edge!
      },
    ],
  };
  const dupEdgeRes = validateGraph(duplicateEdgeGraph);
  check("Detects duplicate edge", !dupEdgeRes.valid);
  check(
    "Duplicate edge reported with DUPLICATE_EDGE code",
    dupEdgeRes.errors.some((e) => e.code === "DUPLICATE_EDGE"),
  );

  // 4.4 Duplicate requirement key
  const duplicateReqKeyGraph: GraphLike = {
    ...VALID_BASE_GRAPH,
    requirements: [
      { key: "REQ-1", title: "First Requirement" },
      { key: "REQ-1", title: "Duplicate Requirement" },
    ],
  };
  const dupReqRes = validateGraph(duplicateReqKeyGraph);
  check("Detects duplicate requirement key", !dupReqRes.valid);

  // =========================================================================
  // Part 5: Missing Dependencies Fixtures
  // =========================================================================
  console.log("\n--- Part 5: Missing Dependencies Fixtures ---");

  // 5.1 Edge references non-existent node
  const missingEndpointGraph: GraphLike = {
    ...VALID_BASE_GRAPH,
    edges: [
      ...VALID_BASE_GRAPH.edges!,
      {
        from_node: "02.1",
        to_node: "99.9", // Does NOT exist!
        type: "DEPENDS_ON",
      },
    ],
  };
  const missingDepRes1 = validateGraph(missingEndpointGraph);
  check("Detects missing edge target node dependency", !missingDepRes1.valid);
  check(
    "Missing dependency reported with MISSING_DEPENDENCY code",
    missingDepRes1.errors.some((e) => e.code === "MISSING_DEPENDENCY"),
  );
  check(
    "unknownEdgeNodes contains '99.9'",
    missingDepRes1.missingDependencies.unknownEdgeNodes.includes("99.9"),
  );

  // 5.2 Node references unknown requirement_key
  const missingReqGraph: GraphLike = {
    ...VALID_BASE_GRAPH,
    nodes: [
      ...VALID_BASE_GRAPH.nodes,
      {
        node_key: "02.9",
        phase: "02",
        title: "Secret Feature",
        type: "backend",
        status: "not_started",
        requirement_key: "REQ-UNKNOWN-999", // Unknown!
        files: [],
      },
    ],
    edges: [
      ...VALID_BASE_GRAPH.edges!,
      { from_node: "02.9", to_node: "01.1", type: "DEPENDS_ON" },
    ],
  };
  const missingReqRes = validateGraph(missingReqGraph);
  check(
    "Detects node referencing unknown requirement key",
    !missingReqRes.valid,
  );
  check(
    "unknownRequirementKeys contains 'REQ-UNKNOWN-999'",
    missingReqRes.missingDependencies.unknownRequirementKeys.includes(
      "REQ-UNKNOWN-999",
    ),
  );

  // =========================================================================
  // Part 6: On Failure, Regenerate Once & Acceptance Criteria
  // "Invalid graphs are never saved"
  // =========================================================================
  console.log("\n--- Part 6: On Failure Regenerate Once & Save Guard ---");

  // 6.1 Valid graph saved directly (0 regenerations)
  let saveCallCount = 0;
  let savedData: GraphLike | null = null;
  const mockSave = async (g: GraphLike) => {
    saveCallCount++;
    savedData = g;
    return { savedId: "saved-123" };
  };

  const resDirectSave = await validateAndSaveGraph(VALID_BASE_GRAPH, mockSave);
  check(
    "Valid graph saved on first attempt",
    resDirectSave.result.savedId === "saved-123",
  );
  check("Save function called exactly once", saveCallCount === 1);
  check("Regenerated was false", !resDirectSave.regenerated);

  // 6.2 Invalid graph on attempt 1, healed on single regeneration attempt, then saved
  let regenerateCallCount = 0;
  let receivedFeedback = "";
  const mockRegenerateSuccess = async (feedback: string) => {
    regenerateCallCount++;
    receivedFeedback = feedback;
    return VALID_BASE_GRAPH; // Fixed on retry!
  };

  saveCallCount = 0;
  savedData = null;

  const resHealedSave = await validateAndSaveGraph(
    cycleGraph2Node, // Invalid initial graph!
    mockSave,
    mockRegenerateSuccess,
  );

  check(
    "Invalid graph healed on regeneration and saved",
    resHealedSave.result.savedId === "saved-123",
  );
  check("Regenerate called exactly once", regenerateCallCount === 1);
  check(
    "Regenerate received error feedback with CYCLE_DETECTED",
    receivedFeedback.includes("CYCLE_DETECTED"),
  );
  check(
    "Save function called exactly once after regeneration",
    saveCallCount === 1,
  );
  check("Regenerated flag is true", resHealedSave.regenerated);

  // 6.3 CRITICAL ACCEPTANCE CRITERIA: Invalid graphs are NEVER saved
  // If regeneration STILL produces an invalid graph, saveFn must NEVER be called!
  saveCallCount = 0;
  savedData = null;
  let secondRegenerateFailed = false;

  const mockRegenerateFail = async () => {
    return orphanLaterPhaseGraph; // Still invalid on retry!
  };

  try {
    await validateAndSaveGraph(cycleGraph2Node, mockSave, mockRegenerateFail);
    check("Persistent invalid graph throws error", false);
  } catch (err) {
    secondRegenerateFailed = err instanceof InvalidGraphError;
  }

  check(
    "ACCEPTANCE CRITERIA: Persistent invalid graph throws InvalidGraphError",
    secondRegenerateFailed,
  );
  check(
    "ACCEPTANCE CRITERIA: Invalid graphs are NEVER saved (save function call count is 0)",
    saveCallCount === 0 && savedData === null,
  );

  // 6.4 Invalid graph with no regenerator provided is NEVER saved
  saveCallCount = 0;
  let noRegenFailed = false;
  try {
    await validateAndSaveGraph(orphanLaterPhaseGraph, mockSave);
    check("Invalid graph without regenerator throws", false);
  } catch (err) {
    noRegenFailed = err instanceof InvalidGraphError;
  }

  check(
    "Invalid graph with no regenerator throws InvalidGraphError",
    noRegenFailed,
  );
  check(
    "ACCEPTANCE CRITERIA: Save function NEVER called when graph is invalid (call count 0)",
    saveCallCount === 0,
  );

  // 6.5 validateWithRegeneration standalone workflow
  let genAttempts = 0;
  const resGenFlow = await validateWithRegeneration(async (feedback) => {
    genAttempts++;
    if (genAttempts === 1) {
      check("Attempt 1 receives no feedback", feedback === undefined);
      return cycleGraph2Node; // fail first attempt
    }
    check(
      "Attempt 2 receives feedback",
      typeof feedback === "string" && feedback.includes("CYCLE_DETECTED"),
    );
    return VALID_BASE_GRAPH; // succeed second attempt
  });

  check(
    "validateWithRegeneration succeeds on attempt 2",
    resGenFlow.graph === VALID_BASE_GRAPH &&
      resGenFlow.regenerated &&
      genAttempts === 2,
  );

  // 6.6 Feedback formatting helper
  const feedbackText = formatValidationFeedback(orphanRes1.errors);
  check(
    "formatValidationFeedback formats errors cleanly for prompt",
    feedbackText.includes("ORPHAN_NODE") &&
      feedbackText.includes("Please regenerate"),
  );

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
    console.log("\nALL GRAPH VALIDATOR CHECKS PASSED!");
  }
}

runTests().catch((err) => {
  console.error("Unhandled error in test-validate:", err);
  process.exit(1);
});
