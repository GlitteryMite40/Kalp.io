/**
 * Test Suite for Task 05.5: Status controls
 *
 * Verifies:
 * 1. Component contracts and file integrity:
 *    - frontend/src/components/StatusControls.tsx exists and is a client component
 *    - frontend/src/lib/status.ts helper logic
 *    - NodePanel.tsx integration
 * 2. Required buttons:
 *    - In Progress (status-btn-in-progress)
 *    - Completed (status-btn-completed)
 *    - Failed (status-btn-failed)
 * 3. Highlight Ready nodes:
 *    - Detects ready state
 *    - Displays ready highlight banner (status-ready-highlight)
 *    - Prominently highlights In Progress action
 * 4. Disable blocked nodes & ACCEPTANCE CRITERIA: "blocked cannot start":
 *    - Action buttons are disabled on blocked nodes
 *    - Displays blocked alert banner (status-blocked-banner)
 *    - TEST CASE: blocked click -> click/transition is intercepted, prevented, and rejected
 * 5. ACCEPTANCE CRITERIA & TEST CASE: "Status survives reload":
 *    - Status transition updates persist through graph reload/refetch
 *    - Completing prerequisites unblocks downstream nodes upon reload
 */

import fs from "node:fs";
import path from "node:path";
import {
  STATUS_ACTIONS,
  isNodeBlocked,
  isNodeReady,
  canTransitionToStatus,
  executeStatusTransition,
  computeGraphStatuses,
} from "../src/lib/status.ts";

let totalChecks = 0;
let passedChecks = 0;
let failed = false;

function check(desc, condition, details) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`PASS: ${desc}`);
  } else {
    failed = true;
    console.error(`FAIL: ${desc}`);
    if (details !== undefined) {
      console.error("  Details:", details);
    }
  }
}

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------
const readyNode = {
  id: "node-1",
  project_id: "p1",
  node_key: "01.1",
  phase: "01",
  title: "Setup Database and Schema",
  status: "not_started",
  computed_status: "ready",
  is_ready: true,
  is_blocked: false,
  dependencies: [],
  blocked_by: [],
  files: ["schema.sql"],
  acceptance: ["Tables created"],
  tests: ["test:db"],
  explanation: "Root database module.",
  prompt: "Setup DB",
  created_at: "2026-10-06T00:00:00Z",
  requirement_id: null,
};

const blockedNode = {
  id: "node-2",
  project_id: "p1",
  node_key: "02.1",
  phase: "02",
  title: "Build API Route Handlers",
  status: "not_started",
  computed_status: "blocked",
  is_ready: false,
  is_blocked: true,
  dependencies: ["01.1"],
  blocked_by: ["01.1"],
  files: ["route.ts"],
  acceptance: ["Routes respond"],
  tests: ["test:api"],
  explanation: "Dependent API layer.",
  prompt: "Build API",
  created_at: "2026-10-06T00:00:00Z",
  requirement_id: null,
};

const inProgressNode = {
  ...readyNode,
  id: "node-3",
  node_key: "01.2",
  status: "in_progress",
  computed_status: "in_progress",
  is_ready: false,
  is_blocked: false,
};

async function run() {
  console.log("=== RUNNING TASK 05.5 STATUS CONTROLS TEST SUITE ===\n");

  // =========================================================================
  // Part 1: Component File & Source Code Contracts
  // =========================================================================
  console.log("--- Part 1: Component File & Source Code Contracts ---");

  const componentPath = path.resolve("src/components/StatusControls.tsx");
  check(
    "frontend/src/components/StatusControls.tsx exists on disk",
    fs.existsSync(componentPath),
  );

  const componentCode = fs.readFileSync(componentPath, "utf-8");

  check(
    "StatusControls is a 'use client' component",
    componentCode.startsWith('"use client";'),
  );

  check(
    "StatusControls.tsx exports default function StatusControls",
    componentCode.includes("export default function StatusControls"),
  );

  // Check required buttons
  check(
    "Includes button for 'In Progress' with test id 'status-btn-in-progress'",
    componentCode.includes("status-btn-in-progress") ||
      STATUS_ACTIONS.some(
        (a) =>
          a.testId === "status-btn-in-progress" && a.status === "in_progress",
      ),
  );

  check(
    "Includes button for 'Completed' with test id 'status-btn-completed'",
    componentCode.includes("status-btn-completed") ||
      STATUS_ACTIONS.some(
        (a) => a.testId === "status-btn-completed" && a.status === "completed",
      ),
  );

  check(
    "Includes button for 'Failed' with test id 'status-btn-failed'",
    componentCode.includes("status-btn-failed") ||
      STATUS_ACTIONS.some(
        (a) => a.testId === "status-btn-failed" && a.status === "failed",
      ),
  );

  // Check Ready highlight & Blocked banner test IDs
  check(
    "Defines 'status-ready-highlight' for highlighting Ready nodes",
    componentCode.includes('data-testid="status-ready-highlight"'),
  );

  check(
    "Defines 'status-blocked-banner' for disabled blocked nodes",
    componentCode.includes('data-testid="status-blocked-banner"'),
  );

  // Check integration into NodePanel.tsx
  const panelPath = path.resolve("src/components/NodePanel.tsx");
  const panelCode = fs.readFileSync(panelPath, "utf-8");
  check(
    "NodePanel.tsx imports StatusControls component",
    panelCode.includes(
      'import StatusControls from "@/components/StatusControls"',
    ),
  );
  check(
    "NodePanel.tsx renders StatusControls inside node-panel-status",
    panelCode.includes("<StatusControls") &&
      panelCode.includes('data-testid="node-panel-status"'),
  );

  // =========================================================================
  // Part 2: Highlight Ready Nodes
  // =========================================================================
  console.log("\n--- Part 2: Highlight Ready Nodes ---");

  check(
    "isNodeReady returns true for root / unblocked node",
    isNodeReady(readyNode) === true,
  );

  check(
    "isNodeReady returns false for blocked node",
    isNodeReady(blockedNode) === false,
  );

  check(
    "isNodeReady returns false for already in_progress node",
    isNodeReady(inProgressNode) === false,
  );

  check(
    "Component code renders status-ready-highlight conditionally when isReady",
    componentCode.includes("isReady &&") &&
      componentCode.includes('data-testid="status-ready-highlight"'),
  );

  // =========================================================================
  // Part 3: Disable Blocked Nodes & TEST CASE: "blocked click"
  // =========================================================================
  console.log(
    "\n--- Part 3: Disable Blocked Nodes & TEST CASE: Blocked Click ---",
  );

  check(
    "isNodeBlocked returns true for blockedNode",
    isNodeBlocked(blockedNode) === true,
  );

  check(
    "isNodeBlocked returns false for readyNode",
    isNodeBlocked(readyNode) === false,
  );

  // Check that buttons are disabled in JSX
  check(
    "Component disables action buttons when isBlocked is true",
    componentCode.includes("disabled={disabled}") &&
      componentCode.includes("isBlocked"),
  );

  // TEST CASE: blocked click -> canTransitionToStatus must reject starting a blocked node
  const blockedStartTransition = canTransitionToStatus(
    blockedNode,
    "in_progress",
  );
  check(
    "TEST CASE (blocked click): canTransitionToStatus('in_progress') returns allowed: false",
    blockedStartTransition.allowed === false,
  );

  check(
    "ACCEPTANCE CRITERIA: Rejection reason states that blocked node cannot start",
    blockedStartTransition.reason?.includes("Cannot start blocked node") &&
      blockedStartTransition.reason?.includes("01.1"),
    blockedStartTransition.reason,
  );

  // Also verify completing or readier states on blocked node are prohibited
  const blockedCompleteTransition = canTransitionToStatus(
    blockedNode,
    "completed",
  );
  check(
    "TEST CASE: cannot complete a blocked node",
    blockedCompleteTransition.allowed === false,
  );

  // TEST CASE: executeStatusTransition guards against blocked execution
  let apiCallCount = 0;
  const mockApiUpdate = async () => {
    apiCallCount++;
  };

  const executeBlockedResult = await executeStatusTransition(
    blockedNode,
    "in_progress",
    mockApiUpdate,
  );

  check(
    "TEST CASE (blocked click): executeStatusTransition returns success: false",
    executeBlockedResult.success === false,
  );

  check(
    "TEST CASE (blocked click): update function was NOT called for blocked node (call count = 0)",
    apiCallCount === 0,
  );

  // =========================================================================
  // Part 4: Valid Status Transitions (In Progress, Completed, Failed)
  // =========================================================================
  console.log("\n--- Part 4: Valid Status Transitions ---");

  // 4.1 Ready -> In Progress
  const readyToInProgress = canTransitionToStatus(readyNode, "in_progress");
  check(
    "Unblocked ready node can transition to 'in_progress'",
    readyToInProgress.allowed === true,
  );

  let updatedNodeId = null;
  let updatedStatus = null;
  const trackingUpdate = async (id, status) => {
    updatedNodeId = id;
    updatedStatus = status;
  };

  const startResult = await executeStatusTransition(
    readyNode,
    "in_progress",
    trackingUpdate,
  );
  check(
    "executeStatusTransition successfully starts ready task",
    startResult.success === true &&
      updatedNodeId === "node-1" &&
      updatedStatus === "in_progress",
  );

  // 4.2 In Progress -> Completed
  const inProgressToCompleted = canTransitionToStatus(
    inProgressNode,
    "completed",
  );
  check(
    "In Progress node can transition to 'completed'",
    inProgressToCompleted.allowed === true,
  );

  const completeResult = await executeStatusTransition(
    inProgressNode,
    "completed",
    trackingUpdate,
  );
  check(
    "executeStatusTransition successfully completes task",
    completeResult.success === true &&
      updatedNodeId === "node-3" &&
      updatedStatus === "completed",
  );

  // 4.3 In Progress -> Failed
  const inProgressToFailed = canTransitionToStatus(inProgressNode, "failed");
  check(
    "In Progress node can transition to 'failed'",
    inProgressToFailed.allowed === true,
  );

  const failResult = await executeStatusTransition(
    inProgressNode,
    "failed",
    trackingUpdate,
  );
  check(
    "executeStatusTransition successfully marks task as failed",
    failResult.success === true &&
      updatedNodeId === "node-3" &&
      updatedStatus === "failed",
  );

  // =========================================================================
  // Part 5: ACCEPTANCE CRITERIA & TEST CASE: "Status survives reload"
  // =========================================================================
  console.log(
    "\n--- Part 5: Acceptance Criteria & TEST CASE: Status Survives Reload ---",
  );

  // Simulate persistent backend state and DAG recomputation on reload
  const mockDatabase = {
    nodes: [
      {
        id: "db-node-1",
        node_key: "01.1",
        status: "not_started",
        dependencies: [],
      },
      {
        id: "db-node-2",
        node_key: "02.1",
        status: "not_started",
        dependencies: ["01.1"],
      },
    ],
    edges: [{ from_node_key: "02.1", to_node_key: "01.1", type: "DEPENDS_ON" }],
  };

  // Helper simulating GET /api/projects/:id/graph on page load/reload
  function reloadProjectGraph() {
    return computeGraphStatuses(mockDatabase.nodes, mockDatabase.edges);
  }

  // 5.1 Initial load
  const initialGraph = reloadProjectGraph();
  check(
    "Initial load: Node 01.1 computed status is 'ready'",
    initialGraph.find((n) => n.node_key === "01.1")?.computed_status ===
      "ready",
  );
  check(
    "Initial load: Node 02.1 computed status is 'blocked' by '01.1'",
    initialGraph.find((n) => n.node_key === "02.1")?.computed_status ===
      "blocked" &&
      initialGraph
        .find((n) => n.node_key === "02.1")
        ?.blocked_by.includes("01.1"),
  );

  // 5.2 Transition Node 1 to 'in_progress' and trigger reload
  mockDatabase.nodes[0].status = "in_progress";
  const reloadAfterStart = reloadProjectGraph();
  const reloadedNode1Start = reloadAfterStart.find(
    (n) => n.node_key === "01.1",
  );
  const reloadedNode2Start = reloadAfterStart.find(
    (n) => n.node_key === "02.1",
  );

  check(
    "TEST CASE (reload 1): Node 01.1 status 'in_progress' survives reload",
    reloadedNode1Start?.status === "in_progress" &&
      reloadedNode1Start?.computed_status === "in_progress",
  );
  check(
    "TEST CASE (reload 1): Dependent Node 02.1 remains 'blocked' on reload",
    reloadedNode2Start?.computed_status === "blocked",
  );

  // 5.3 Transition Node 1 to 'completed' and trigger reload
  // Completing Node 1 should unblock Node 2 into 'ready'!
  mockDatabase.nodes[0].status = "completed";
  const reloadAfterComplete = reloadProjectGraph();
  const reloadedNode1Done = reloadAfterComplete.find(
    (n) => n.node_key === "01.1",
  );
  const reloadedNode2Unblocked = reloadAfterComplete.find(
    (n) => n.node_key === "02.1",
  );

  check(
    "ACCEPTANCE CRITERIA: Node 01.1 'completed' status survives reload",
    reloadedNode1Done?.status === "completed" &&
      reloadedNode1Done?.computed_status === "completed",
  );

  check(
    "ACCEPTANCE CRITERIA: Dependent Node 02.1 unblocks to 'ready' after reload",
    reloadedNode2Unblocked?.computed_status === "ready" &&
      reloadedNode2Unblocked?.is_ready === true &&
      reloadedNode2Unblocked?.is_blocked === false,
  );

  // 5.4 Transition Node 2 to 'failed' and trigger reload
  mockDatabase.nodes[1].status = "failed";
  const reloadAfterFail = reloadProjectGraph();
  const reloadedNode2Failed = reloadAfterFail.find(
    (n) => n.node_key === "02.1",
  );

  check(
    "ACCEPTANCE CRITERIA: Node 02.1 'failed' status survives reload",
    reloadedNode2Failed?.status === "failed" &&
      reloadedNode2Failed?.computed_status === "failed",
  );

  // =========================================================================
  // Part 6: Edge Cases & Robustness
  // =========================================================================
  console.log("\n--- Part 6: Edge Cases & Robustness ---");

  check(
    "isNodeBlocked(null) safely returns false",
    isNodeBlocked(null) === false,
  );

  check("isNodeReady(null) safely returns false", isNodeReady(null) === false);

  check(
    "canTransitionToStatus(null) returns allowed: false",
    canTransitionToStatus(null, "in_progress").allowed === false,
  );

  check(
    "Cannot transition to the same status the node already has",
    canTransitionToStatus(inProgressNode, "in_progress").allowed === false,
  );

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");

  if (failed) {
    console.error("\nTEST SUITE FAILED!");
    process.exit(1);
  } else {
    console.log("\nALL STATUS CONTROLS CHECKS PASSED!");
  }
}

run().catch((err) => {
  console.error("Unhandled error in test-status-controls:", err);
  process.exit(1);
});
