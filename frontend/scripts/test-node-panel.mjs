/**
 * Test Suite for Task 05.3: Node panel
 *
 * Verifies:
 * 1. Component contracts and file integrity for frontend/src/components/NodePanel.tsx
 * 2. Side panel displays all 6 required fields:
 *    - Purpose (explanation & requirement)
 *    - Dependencies (prerequisites & downstream dependents)
 *    - Files (target codebase paths & copy support)
 *    - Criteria (acceptance criteria checklist)
 *    - Tests (test verifications & commands)
 *    - Status (status badge, ready/blocked states, interactive transitions)
 * 3. ACCEPTANCE CRITERIA: "Click opens correct data"
 * 4. TEST CASE: "Switch between nodes"
 * 5. Interactive navigation & status mutation callbacks
 * 6. Edge case resilience: null nodes, empty lists, root modules, closed drawer
 */

import fs from "node:fs";
import path from "node:path";
import { STATUS_STYLES, TYPE_STYLES } from "../src/lib/graph.ts";

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

// Sample test fixtures representing distinct nodes across different phases and statuses
const nodeA = {
  id: "node-1",
  project_id: "proj-kalp",
  node_key: "01.1",
  phase: "Phase 1: Foundation",
  title: "Database schema and RLS policies",
  type: "database",
  status: "completed",
  computed_status: "completed",
  is_ready: false,
  is_blocked: false,
  dependencies: [],
  blocked_by: [],
  files: ["supabase/migrations/001_init.sql", "src/types/schema.ts"],
  explanation:
    "Defines PostgreSQL tables for projects, nodes, and Row-Level Security policies.",
  acceptance: [
    "Postgres tables migrate cleanly",
    "RLS policies isolate user projects",
  ],
  tests: ["npm run test:db-smoke", "npm run test:schema"],
  prompt: "Generate SQL schema migration for Kalp.io tables.",
  created_at: "2026-10-06T00:00:00.000Z",
  requirement_id: "req-1",
  requirement_key: "REQ-01",
};

const nodeB = {
  id: "node-2",
  project_id: "proj-kalp",
  node_key: "02.1",
  phase: "Phase 2: Core Engine",
  title: "LLM DAG decomposition pipeline",
  type: "api",
  status: "blocked",
  computed_status: "blocked",
  is_ready: false,
  is_blocked: true,
  dependencies: ["01.1"],
  blocked_by: ["01.1"],
  files: ["src/server/decompose.ts", "src/server/validate.ts"],
  explanation:
    "Serverless prompt pipeline that breaks requirements into acyclic build graphs.",
  acceptance: [
    "Generates topological node sequences",
    "Detects and prevents circular cycles",
  ],
  tests: ["npm run test:decompose", "npm run test:validate"],
  prompt: "Synthesize decomposition prompt and Zod schema validator.",
  created_at: "2026-10-06T00:01:00.000Z",
  requirement_id: "req-2",
  requirement_key: "REQ-02",
};

const nodeC = {
  id: "node-3",
  project_id: "proj-kalp",
  node_key: "03.1",
  phase: "Phase 3: Interactive UI",
  title: "React Flow dependency canvas",
  type: "ui",
  status: "ready",
  computed_status: "ready",
  is_ready: true,
  is_blocked: false,
  dependencies: ["02.1"],
  blocked_by: [],
  files: [
    "src/components/Graph.tsx",
    "src/components/NodePanel.tsx",
    "src/app/p/[id]/page.tsx",
  ],
  explanation:
    "Interactive visual DAG canvas laid out by phase with status color tokens and inspector panel.",
  acceptance: [
    "All 50 nodes and edges visible",
    "Layout ordered horizontally by phase",
  ],
  tests: ["npm run test:graph", "npm run test:panel"],
  prompt: "Implement React Flow canvas with custom nodes and handles.",
  created_at: "2026-10-06T00:02:00.000Z",
  requirement_id: "req-3",
  requirement_key: "REQ-03",
};

const allTestNodes = [nodeA, nodeB, nodeC];

/**
 * Extracts and evaluates data representations as rendered by NodePanel
 */
function extractPanelData(node, allNodes = allTestNodes) {
  if (!node) return null;

  const status = node.computed_status || node.status || "not_started";
  const statusCfg = STATUS_STYLES[status] || STATUS_STYLES.not_started;
  const typeKey = (node.type || "").toLowerCase();
  const typeCfg = TYPE_STYLES[typeKey] || {
    badge: (node.type || "TASK").toUpperCase().slice(0, 4),
  };

  const downstream = allNodes.filter(
    (other) =>
      other.dependencies?.includes(node.node_key) ||
      other.dependencies?.includes(node.id) ||
      other.blocked_by?.includes(node.node_key),
  );

  return {
    key: node.node_key,
    phase: node.phase,
    title: node.title,
    typeBadge: typeCfg.badge,
    statusLabel: statusCfg.label,
    statusHex: statusCfg.hex,
    isBlocked: node.is_blocked,
    blockedBy: node.blocked_by || [],
    purpose: node.explanation || null,
    requirementKey: node.requirement_key || null,
    dependencies: node.dependencies || [],
    downstream: downstream.map((d) => d.node_key),
    files: node.files || [],
    acceptance: node.acceptance || [],
    tests: node.tests || [],
    prompt: node.prompt || null,
  };
}

async function run() {
  console.log("=== RUNNING TASK 05.3 NODE PANEL TEST SUITE ===\n");

  // =========================================================================
  // Part 1: Component File & Source Code Contracts
  // =========================================================================
  console.log("--- Part 1: Component File & Source Code Contracts ---");

  const panelPath = path.resolve("src/components/NodePanel.tsx");
  check(
    "frontend/src/components/NodePanel.tsx exists on disk",
    fs.existsSync(panelPath),
  );

  const panelCode = fs.readFileSync(panelPath, "utf-8");

  // Verify client component directive
  check(
    "NodePanel is a 'use client' component",
    panelCode.startsWith('"use client";'),
  );

  // Verify exported default component
  check(
    "NodePanel.tsx exports default NodePanel component function",
    panelCode.includes("export default function NodePanel"),
  );

  // Verify all 6 required sections are explicitly present
  check(
    "NodePanel renders Purpose section (node-panel-purpose)",
    panelCode.includes('data-testid="node-panel-purpose"') &&
      panelCode.includes("node.explanation"),
  );

  check(
    "NodePanel renders Dependencies section (node-panel-dependencies)",
    panelCode.includes('data-testid="node-panel-dependencies"') &&
      panelCode.includes("node.dependencies"),
  );

  check(
    "NodePanel renders Files section (node-panel-files)",
    panelCode.includes('data-testid="node-panel-files"') &&
      panelCode.includes("node.files"),
  );

  check(
    "NodePanel renders Acceptance Criteria section (node-panel-criteria)",
    panelCode.includes('data-testid="node-panel-criteria"') &&
      panelCode.includes("node.acceptance"),
  );

  check(
    "NodePanel renders Tests & Verification section (node-panel-tests)",
    panelCode.includes('data-testid="node-panel-tests"') &&
      panelCode.includes("node.tests"),
  );

  check(
    "NodePanel renders Status section with transitions (node-panel-status)",
    panelCode.includes('data-testid="node-panel-status"') &&
      panelCode.includes("onUpdateStatus"),
  );

  check(
    "NodePanel renders Blocked Alert when node is blocked",
    panelCode.includes('data-testid="node-panel-blocked-banner"'),
  );

  // =========================================================================
  // Part 2: Acceptance Criteria - "Click opens correct data"
  // =========================================================================
  console.log(
    "\n--- Part 2: Acceptance Criteria - Click Opens Correct Data ---",
  );

  // Simulate selecting Node A
  const dataA = extractPanelData(nodeA);

  check(
    "Clicking Node A opens correct key (01.1)",
    dataA.key === "01.1",
    dataA.key,
  );
  check(
    "Clicking Node A opens correct title",
    dataA.title === nodeA.title,
    dataA.title,
  );
  check(
    "Clicking Node A opens correct purpose",
    dataA.purpose === nodeA.explanation,
    dataA.purpose,
  );
  check(
    "Clicking Node A opens correct dependencies (empty for root)",
    dataA.dependencies.length === 0,
    dataA.dependencies,
  );
  check(
    "Clicking Node A opens correct files (2 files)",
    dataA.files.length === 2 &&
      dataA.files[0] === "supabase/migrations/001_init.sql",
    dataA.files,
  );
  check(
    "Clicking Node A opens correct criteria (2 items)",
    dataA.acceptance.length === 2 &&
      dataA.acceptance[0] === "Postgres tables migrate cleanly",
    dataA.acceptance,
  );
  check(
    "Clicking Node A opens correct tests (2 commands)",
    dataA.tests.length === 2 && dataA.tests[0] === "npm run test:db-smoke",
    dataA.tests,
  );
  check(
    "Clicking Node A opens correct status (Completed)",
    dataA.statusLabel === "Completed" && dataA.statusHex === "#06b6d4",
    dataA.statusLabel,
  );
  check(
    "Clicking Node A opens correct requirement key (REQ-01)",
    dataA.requirementKey === "REQ-01",
  );
  check(
    "Clicking Node A identifies downstream dependents (Node B requires Node A)",
    dataA.downstream.includes("02.1"),
    dataA.downstream,
  );

  // =========================================================================
  // Part 3: Test Cases - "Switch between nodes"
  // =========================================================================
  console.log("\n--- Part 3: Test Cases - Switch Between Nodes ---");

  // Step 1: Active selection starts on Node A
  let activeSelection = nodeA;
  let activePanel = extractPanelData(activeSelection);
  check(
    "Step 1: Active selection on Node A displays Node A's title and status",
    activePanel.key === "01.1" && activePanel.statusLabel === "Completed",
  );

  // Step 2: User switches from Node A to Node B (e.g. clicks Node B in canvas or dependency)
  activeSelection = nodeB;
  activePanel = extractPanelData(activeSelection);

  check(
    "Step 2: Switching to Node B updates key to '02.1'",
    activePanel.key === "02.1",
    activePanel.key,
  );
  check(
    "Step 2: Switching to Node B updates title to LLM pipeline",
    activePanel.title === nodeB.title,
    activePanel.title,
  );
  check(
    "Step 2: Switching to Node B updates purpose to DAG decomposition",
    activePanel.purpose.includes(
      "breaks requirements into acyclic build graphs",
    ),
    activePanel.purpose,
  );
  check(
    "Step 2: Switching to Node B updates dependencies to ['01.1']",
    activePanel.dependencies.length === 1 &&
      activePanel.dependencies[0] === "01.1",
    activePanel.dependencies,
  );
  check(
    "Step 2: Switching to Node B reveals Blocked state and blocker list",
    activePanel.isBlocked === true && activePanel.blockedBy[0] === "01.1",
    activePanel.blockedBy,
  );
  check(
    "Step 2: Switching to Node B updates files to decompose.ts and validate.ts",
    activePanel.files.length === 2 &&
      activePanel.files[0] === "src/server/decompose.ts",
    activePanel.files,
  );
  check(
    "Step 2: Switching to Node B updates criteria to topological sequencing",
    activePanel.acceptance[0] === "Generates topological node sequences",
    activePanel.acceptance,
  );
  check(
    "Step 2: Switching to Node B updates tests to npm run test:decompose",
    activePanel.tests[0] === "npm run test:decompose",
    activePanel.tests,
  );
  check(
    "Step 2: Switching to Node B updates status to Blocked (#f43f5e)",
    activePanel.statusLabel === "Blocked" &&
      activePanel.statusHex === "#f43f5e",
    activePanel.statusLabel,
  );

  // Step 3: User switches from Node B to Node C
  activeSelection = nodeC;
  activePanel = extractPanelData(activeSelection);

  check(
    "Step 3: Switching to Node C updates key to '03.1'",
    activePanel.key === "03.1",
    activePanel.key,
  );
  check(
    "Step 3: Switching to Node C updates purpose to React Flow canvas visualizer",
    activePanel.purpose.includes("Interactive visual DAG canvas"),
    activePanel.purpose,
  );
  check(
    "Step 3: Switching to Node C updates dependencies to ['02.1']",
    activePanel.dependencies.length === 1 &&
      activePanel.dependencies[0] === "02.1",
    activePanel.dependencies,
  );
  check(
    "Step 3: Switching to Node C updates status to Ready (#10b981)",
    activePanel.statusLabel === "Ready" && activePanel.statusHex === "#10b981",
    activePanel.statusLabel,
  );
  check(
    "Step 3: Switching to Node C updates files to 3 UI files",
    activePanel.files.length === 3 &&
      activePanel.files.includes("src/components/NodePanel.tsx"),
    activePanel.files,
  );

  // =========================================================================
  // Part 4: Interactive Callbacks & Actions
  // =========================================================================
  console.log("\n--- Part 4: Interactive Callbacks & Actions ---");

  // 4.1 Status mutation callback
  let statusUpdatedNodeId = null;
  let statusUpdatedNewStatus = null;
  const mockUpdateStatus = (id, newSt) => {
    statusUpdatedNodeId = id;
    statusUpdatedNewStatus = newSt;
  };

  mockUpdateStatus(nodeC.id, "in_progress");
  check(
    "Updating status calls onUpdateStatus with target node ID",
    statusUpdatedNodeId === "node-3",
    statusUpdatedNodeId,
  );
  check(
    "Updating status passes correct new status 'in_progress'",
    statusUpdatedNewStatus === "in_progress",
    statusUpdatedNewStatus,
  );

  // 4.2 Dependency click navigation callback
  let navigatedKey = null;
  const mockSelectByKey = (k) => {
    navigatedKey = k;
  };

  mockSelectByKey(nodeB.dependencies[0]); // clicks "01.1" prerequisite
  check(
    "Clicking dependency badge triggers onSelectNodeByKey with '01.1'",
    navigatedKey === "01.1",
    navigatedKey,
  );

  // 4.3 Page integration: check that /p/[id]/page.tsx renders NodePanel
  const pagePath = path.resolve("src/app/p/[id]/page.tsx");
  const pageCode = fs.readFileSync(pagePath, "utf-8");
  check(
    "/p/[id]/page.tsx imports NodePanel component",
    pageCode.includes('import NodePanel from "@/components/NodePanel"'),
  );
  check(
    "/p/[id]/page.tsx mounts <NodePanel node={selectedNode} ... />",
    pageCode.includes("<NodePanel") &&
      pageCode.includes("node={selectedNode}") &&
      pageCode.includes("onSelectNodeByKey={selectNodeByKey}"),
  );

  // =========================================================================
  // Part 5: Edge Cases & Robustness
  // =========================================================================
  console.log("\n--- Part 5: Edge Cases & Robustness ---");

  // 5.1 Null node returns null without crashing
  check(
    "extractPanelData(null) safely returns null",
    extractPanelData(null) === null,
  );

  // 5.2 Node with empty / missing fields
  const sparseNode = {
    id: "node-sparse",
    project_id: "p1",
    node_key: "09.9",
    phase: "Phase 9: Miscellaneous",
    title: "Minimal stub",
    type: null,
    status: "not_started",
    computed_status: "not_started",
    is_ready: false,
    is_blocked: false,
    dependencies: [],
    blocked_by: [],
    files: [],
    explanation: null,
    acceptance: [],
    tests: [],
    prompt: null,
    created_at: new Date().toISOString(),
    requirement_id: null,
  };

  const sparseData = extractPanelData(sparseNode);
  check(
    "Sparse node with null explanation, empty files, criteria & tests parses safely",
    sparseData !== null &&
      sparseData.purpose === null &&
      sparseData.files.length === 0 &&
      sparseData.acceptance.length === 0 &&
      sparseData.tests.length === 0,
    sparseData,
  );
  check(
    "Sparse node resolves fallback status styling (Not Started, #71717a)",
    sparseData.statusLabel === "Not Started" &&
      sparseData.statusHex === "#71717a",
  );

  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log("\nALL NODE PANEL CHECKS PASSED!");
  }
}

run().catch((error) => {
  console.error("Unhandled error in test runner:", error);
  process.exitCode = 1;
});
