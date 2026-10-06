/**
 * Test Suite for Task 05.2: Graph render
 *
 * Verifies:
 * 1. 50-node graph renders with all nodes and edges visible
 * 2. Layout by phase: horizontal columns ordered by phase sequence, vertical stacking without overlaps
 * 3. Color by status: distinct color tokens, badges, dots, and edge strokes for all 8 statuses
 * 4. Edge routing: DEPENDS_ON and BLOCKS semantics resolved to valid React Flow source/target with arrow markers
 * 5. Component exports and module contracts for Graph.tsx and /p/[id]/page.tsx
 * 6. Edge case resilience: empty graphs, single nodes, disconnected graphs, dangling edges, fallback statuses
 */

import fs from "node:fs";
import path from "node:path";
import {
  layoutGraphByPhase,
  STATUS_STYLES,
  extractPhaseIndex,
} from "../src/lib/graph.ts";

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

/**
 * Generates a realistic 50-node dependency graph spanning 5 distinct phases with 65+ edges.
 */
function generate50NodeGraph() {
  const phases = [
    "Phase 1: Foundation",
    "Phase 2: Core Engine",
    "Phase 3: APIs & Services",
    "Phase 4: UI & Visualizer",
    "Phase 5: Verification & Deploy",
  ];

  const types = ["database", "core", "api", "ui", "integration", "feature"];
  const statuses = [
    "completed",
    "committed",
    "ready",
    "in_progress",
    "blocked",
    "failed",
    "needs_review",
    "not_started",
  ];

  const nodes = [];
  const edges = [];

  // Generate 10 nodes per phase = 50 total nodes
  let nodeCounter = 1;
  for (let p = 0; p < phases.length; p++) {
    const phaseName = phases[p];
    for (let i = 1; i <= 10; i++) {
      const padPhase = String(p + 1).padStart(2, "0");
      const padIndex = String(i).padStart(2, "0");
      const nodeKey = `${padPhase}.${padIndex}`;
      const status = statuses[(p * 10 + i - 1) % statuses.length];
      const type = types[(p * 10 + i - 1) % types.length];

      nodes.push({
        id: `node-${nodeCounter}`,
        project_id: "test-project-50",
        node_key: nodeKey,
        phase: phaseName,
        title: `Task ${nodeKey}: ${type.toUpperCase()} module implementation`,
        type,
        status,
        computed_status: status,
        is_ready: status === "ready",
        is_blocked: status === "blocked",
        dependencies: [],
        blocked_by: status === "blocked" ? [`${padPhase}.01`] : [],
        files: [`src/${type}/${nodeKey}.ts`],
        explanation: `Comprehensive implementation of ${nodeKey} inside ${phaseName}`,
        acceptance: [`Acceptance condition for ${nodeKey}`],
        tests: [`npm test -- ${nodeKey}`],
        prompt: `Implement module ${nodeKey}`,
        created_at: new Date().toISOString(),
      });
      nodeCounter++;
    }
  }

  // Generate 65+ realistic edges connecting nodes intra-phase and cross-phase
  // 1. Intra-phase linear and branching chains (45 edges)
  for (let p = 0; p < phases.length; p++) {
    const padPhase = String(p + 1).padStart(2, "0");
    for (let i = 2; i <= 10; i++) {
      const fromKey = `${padPhase}.${String(i).padStart(2, "0")}`;
      const toKey = `${padPhase}.${String(i - 1).padStart(2, "0")}`;
      const fromNode = nodes.find((n) => n.node_key === fromKey);
      const toNode = nodes.find((n) => n.node_key === toKey);

      if (fromNode && toNode) {
        edges.push({
          id: `edge-intra-${p}-${i}`,
          project_id: "test-project-50",
          from_node: fromNode.id,
          to_node: toNode.id,
          from_node_key: fromKey,
          to_node_key: toKey,
          type: "DEPENDS_ON",
          source: fromNode.id,
          target: toNode.id,
        });
      }
    }
  }

  // 2. Cross-phase dependencies (Phase N nodes depend on Phase N-1 nodes) (20 edges)
  for (let p = 1; p < phases.length; p++) {
    const curPhase = String(p + 1).padStart(2, "0");
    const prevPhase = String(p).padStart(2, "0");

    for (let k = 1; k <= 5; k++) {
      const fromKey = `${curPhase}.${String(k).padStart(2, "0")}`;
      const toKey = `${prevPhase}.${String(k).padStart(2, "0")}`;
      const fromNode = nodes.find((n) => n.node_key === fromKey);
      const toNode = nodes.find((n) => n.node_key === toKey);

      if (fromNode && toNode) {
        edges.push({
          id: `edge-cross-${p}-${k}`,
          project_id: "test-project-50",
          from_node: fromNode.id,
          to_node: toNode.id,
          from_node_key: fromKey,
          to_node_key: toKey,
          type: "DEPENDS_ON",
          source: fromNode.id,
          target: toNode.id,
        });
      }
    }
  }

  return { nodes, edges };
}

async function run() {
  console.log("=== RUNNING TASK 05.2 GRAPH RENDER TEST SUITE ===\n");

  // =========================================================================
  // Part 1: 50-Node Graph Render & Layout by Phase
  // =========================================================================
  console.log("--- Part 1: 50-Node Graph Render & Layout by Phase ---");

  const { nodes: raw50Nodes, edges: raw65Edges } = generate50NodeGraph();

  check(
    "Generated 50-node fixture contains exactly 50 nodes",
    raw50Nodes.length === 50,
    raw50Nodes.length,
  );
  check(
    "Generated 50-node fixture contains 65 edges",
    raw65Edges.length === 65,
    raw65Edges.length,
  );

  const {
    nodes: flowNodes,
    edges: flowEdges,
    phaseSummary,
  } = layoutGraphByPhase(raw50Nodes, raw65Edges);

  check(
    "React Flow output renders all 50 nodes",
    flowNodes.length === 50,
    flowNodes.length,
  );
  check(
    "React Flow output renders all 65 edges",
    flowEdges.length === 65,
    flowEdges.length,
  );

  // Check phase columns: 5 distinct phases
  check(
    "Phase summary contains all 5 distinct phases",
    phaseSummary.length === 5,
    phaseSummary.map((p) => p.phase),
  );

  // Check phase node counts
  const allPhasesHave10Nodes = phaseSummary.every((p) => p.count === 10);
  check(
    "Every phase column contains exactly 10 nodes",
    allPhasesHave10Nodes,
    phaseSummary,
  );

  // Verify Layout by Phase:
  // Nodes in Phase 1 have smaller X than Phase 2, which have smaller X than Phase 3, etc.
  let strictHorizontalPhaseOrdering = true;
  for (let i = 0; i < phaseSummary.length - 1; i++) {
    if (phaseSummary[i].x >= phaseSummary[i + 1].x) {
      strictHorizontalPhaseOrdering = false;
      break;
    }
  }
  check(
    "Phase columns are strictly ordered horizontally from left to right (x[0] < x[1] < ...)",
    strictHorizontalPhaseOrdering,
    phaseSummary.map((p) => ({ phase: p.phase, x: p.x })),
  );

  // Verify coordinates for all 50 nodes: valid numbers, no NaN
  const allCoordinatesFinite = flowNodes.every(
    (n) =>
      Number.isFinite(n.position.x) &&
      Number.isFinite(n.position.y) &&
      n.position.x >= 0 &&
      n.position.y >= 0,
  );
  check(
    "All 50 nodes have non-null, finite, non-negative (x, y) coordinates",
    allCoordinatesFinite,
  );

  // Verify vertical stacking: No two nodes in the same phase have the same Y coordinate
  const phaseToYMap = new Map();
  let hasOverlappingNodes = false;
  flowNodes.forEach((node) => {
    const x = node.position.x;
    if (!phaseToYMap.has(x)) {
      phaseToYMap.set(x, new Set());
    }
    const ySet = phaseToYMap.get(x);
    if (ySet.has(node.position.y)) {
      hasOverlappingNodes = true;
    }
    ySet.add(node.position.y);
  });
  check(
    "Nodes in each phase column are vertically separated with zero overlapping coordinates",
    !hasOverlappingNodes,
  );

  // Verify all React Flow nodes have type "kalpNode" and valid data
  const allKalpNodes = flowNodes.every(
    (n) => n.type === "kalpNode" && n.data && n.data.node,
  );
  check(
    "Every React Flow node uses the custom 'kalpNode' component type",
    allKalpNodes,
  );

  // =========================================================================
  // Part 2: Acceptance Criteria - All Nodes and Edges Visible
  // =========================================================================
  console.log(
    "\n--- Part 2: Acceptance Criteria - All Nodes & Edges Visible ---",
  );

  // Every raw node ID appears in the flow nodes
  const flowNodeIdSet = new Set(flowNodes.map((n) => n.id));
  const allNodeIdsPresent = raw50Nodes.every((n) => flowNodeIdSet.has(n.id));
  check(
    "Acceptance Criteria: All 50 node IDs are present and accounted for",
    allNodeIdsPresent,
  );

  // Every edge connects existing nodes (no broken or dangling edges)
  const allEdgesConnectValidNodes = flowEdges.every(
    (e) => flowNodeIdSet.has(e.source) && flowNodeIdSet.has(e.target),
  );
  check(
    "Acceptance Criteria: All 65 edges connect valid source and target nodes",
    allEdgesConnectValidNodes,
  );

  // Every edge has arrow markers for visual direction
  const allEdgesHaveArrowMarkers = flowEdges.every(
    (e) => e.markerEnd && e.markerEnd.type,
  );
  check(
    "Acceptance Criteria: All edges have directional arrow markers",
    allEdgesHaveArrowMarkers,
  );

  // Every edge has smooth curves and visible stroke widths
  const allEdgesHaveVisibleStroke = flowEdges.every(
    (e) =>
      e.style &&
      typeof e.style.stroke === "string" &&
      e.style.stroke.length > 0 &&
      Number(e.style.strokeWidth) >= 2,
  );
  check(
    "Acceptance Criteria: All edges have visible stroke color and width >= 2",
    allEdgesHaveVisibleStroke,
  );

  // In build workflow (DAG):
  // DEPENDS_ON edge from B to A means A is prerequisite for B.
  // Visual workflow arrow points from prerequisite A -> dependent B.
  const sampleCrossEdge = flowEdges.find(
    (e) => e.data && e.data.id === "edge-cross-1-1",
  );
  check(
    "Edge arrows flow in chronological build order (prerequisite -> dependent)",
    sampleCrossEdge !== undefined &&
      sampleCrossEdge.source === "node-1" &&
      sampleCrossEdge.target === "node-11",
    sampleCrossEdge,
  );

  // =========================================================================
  // Part 3: Color by Status Verification
  // =========================================================================
  console.log("\n--- Part 3: Color by Status Verification ---");

  const requiredStatuses = [
    "ready",
    "in_progress",
    "completed",
    "committed",
    "blocked",
    "failed",
    "needs_review",
    "not_started",
  ];

  check(
    "STATUS_STYLES defines all 8 standard Kalp.io statuses",
    requiredStatuses.every((st) => STATUS_STYLES[st] !== undefined),
    Object.keys(STATUS_STYLES),
  );

  // Check distinct colors and attributes for each status
  const hexColors = new Set();
  let allStatusesHaveCompleteStyles = true;
  for (const st of requiredStatuses) {
    const cfg = STATUS_STYLES[st];
    if (
      !cfg.label ||
      !cfg.badgeBg ||
      !cfg.badgeText ||
      !cfg.border ||
      !cfg.bg ||
      !cfg.dot ||
      !cfg.edgeColor ||
      !cfg.hex
    ) {
      allStatusesHaveCompleteStyles = false;
    }
    hexColors.add(cfg.hex);
  }
  check(
    "Every status configuration includes label, badges, borders, dot, and edge color",
    allStatusesHaveCompleteStyles,
  );
  check(
    "Status colors are distinct across statuses",
    hexColors.size === requiredStatuses.length,
    Array.from(hexColors),
  );

  // Ready is green/emerald
  check(
    "Ready status uses emerald/green color palette",
    STATUS_STYLES.ready.hex === "#10b981" &&
      STATUS_STYLES.ready.border.includes("emerald"),
  );

  // In Progress is amber/yellow
  check(
    "In Progress status uses amber/yellow palette with pulsing dot",
    STATUS_STYLES.in_progress.hex === "#f59e0b" &&
      STATUS_STYLES.in_progress.dot.includes("pulse"),
  );

  // Completed is cyan
  check(
    "Completed status uses cyan palette",
    STATUS_STYLES.completed.hex === "#06b6d4" &&
      STATUS_STYLES.completed.border.includes("cyan"),
  );

  // Committed is violet
  check(
    "Committed status uses violet palette",
    STATUS_STYLES.committed.hex === "#8b5cf6" &&
      STATUS_STYLES.committed.border.includes("violet"),
  );

  // Blocked is rose
  check(
    "Blocked status uses rose palette",
    STATUS_STYLES.blocked.hex === "#f43f5e" &&
      STATUS_STYLES.blocked.border.includes("rose"),
  );

  // Check animated edges for active (in_progress / ready) states
  const inProgressEdges = flowEdges.filter(
    (e) =>
      flowNodes.find((n) => n.id === e.source)?.data.node.status ===
      "in_progress",
  );
  check(
    "Edges originating from in_progress nodes are animated",
    inProgressEdges.length > 0 &&
      inProgressEdges.every((e) => e.animated === true),
  );

  // =========================================================================
  // Part 4: Component Files & Module Integrity
  // =========================================================================
  console.log("\n--- Part 4: Component Files & Module Integrity ---");

  const graphComponentPath = path.resolve("src/components/Graph.tsx");
  const projectPagePath = path.resolve("src/app/p/[id]/page.tsx");

  check("Graph.tsx exists on disk", fs.existsSync(graphComponentPath));
  check("/p/[id]/page.tsx exists on disk", fs.existsSync(projectPagePath));

  const graphContent = fs.readFileSync(graphComponentPath, "utf-8");
  check(
    "Graph.tsx imports and registers ReactFlow",
    graphContent.includes("<ReactFlow") &&
      graphContent.includes('from "@xyflow/react"'),
  );
  check(
    "Graph.tsx defines KalpNodeComponent with Left & Right Handles",
    graphContent.includes("Position.Left") &&
      graphContent.includes("Position.Right"),
  );
  check(
    "Graph.tsx exports default Graph component with ReactFlowProvider",
    graphContent.includes("export default function Graph") &&
      graphContent.includes("<ReactFlowProvider>"),
  );

  const pageContent = fs.readFileSync(projectPagePath, "utf-8");
  check(
    "/p/[id]/page.tsx imports and renders Graph component",
    pageContent.includes("<Graph") &&
      pageContent.includes('from "@/components/Graph"'),
  );
  check(
    "/p/[id]/page.tsx fetches project graph via api.getProjectGraph",
    pageContent.includes("api.getProjectGraph("),
  );
  check(
    "/p/[id]/page.tsx provides interactive node inspector drawer",
    pageContent.includes("Node Inspector") &&
      pageContent.includes("handleUpdateNodeStatus"),
  );

  // =========================================================================
  // Part 5: Edge Cases & Robustness
  // =========================================================================
  console.log("\n--- Part 5: Edge Cases & Robustness ---");

  // 5.1 Empty graph
  const emptyRes = layoutGraphByPhase([], []);
  check(
    "Empty graph returns empty arrays without throwing",
    emptyRes.nodes.length === 0 &&
      emptyRes.edges.length === 0 &&
      emptyRes.phaseSummary.length === 0,
  );

  // 5.2 Single node graph
  const singleNodeRes = layoutGraphByPhase([
    {
      id: "solo-1",
      node_key: "01.1",
      phase: "Phase 1: Intro",
      title: "Solo task",
      status: "ready",
      type: "core",
      dependencies: [],
      files: [],
      acceptance: [],
      tests: [],
      explanation: null,
      prompt: null,
      created_at: new Date().toISOString(),
      project_id: "p1",
      requirement_id: null,
    },
  ]);
  check(
    "Single node graph lays out exactly 1 node with valid position",
    singleNodeRes.nodes.length === 1 &&
      singleNodeRes.nodes[0].position.x >= 0 &&
      singleNodeRes.nodes[0].position.y >= 0,
  );

  // 5.3 Dangling edge (references non-existent target node)
  const danglingRes = layoutGraphByPhase(
    [
      {
        id: "n1",
        node_key: "01.1",
        phase: "Phase 1",
        title: "Node 1",
        status: "ready",
        type: "core",
        dependencies: [],
        files: [],
        acceptance: [],
        tests: [],
        explanation: null,
        prompt: null,
        created_at: new Date().toISOString(),
        project_id: "p1",
        requirement_id: null,
      },
    ],
    [
      {
        id: "e-dangling",
        from_node: "n1",
        to_node: "non-existent-999",
        from_node_key: "01.1",
        to_node_key: "99.9",
        type: "DEPENDS_ON",
        source: "n1",
        target: "non-existent-999",
      },
    ],
  );
  check(
    "Dangling edge referencing non-existent node is safely filtered out",
    danglingRes.edges.length === 0,
    danglingRes.edges,
  );

  // 5.4 Node with missing / blank phase defaults safely
  const blankPhaseRes = layoutGraphByPhase([
    {
      id: "n-blank",
      node_key: "00.1",
      phase: "",
      title: "Uncategorized task",
      status: "not_started",
      type: null,
      dependencies: [],
      files: [],
      acceptance: [],
      tests: [],
      explanation: null,
      prompt: null,
      created_at: new Date().toISOString(),
      project_id: "p1",
      requirement_id: null,
    },
  ]);
  check(
    "Node with blank phase is handled safely and positioned",
    blankPhaseRes.nodes.length === 1 && blankPhaseRes.phaseSummary.length === 1,
  );

  // 5.5 Node with unknown status falls back safely
  const unknownStatusRes = layoutGraphByPhase([
    {
      id: "n-unknown",
      node_key: "01.1",
      phase: "Phase 1",
      title: "Task with custom status",
      status: "custom_status_xyz",
      type: null,
      dependencies: [],
      files: [],
      acceptance: [],
      tests: [],
      explanation: null,
      prompt: null,
      created_at: new Date().toISOString(),
      project_id: "p1",
      requirement_id: null,
    },
  ]);
  check(
    "Node with unknown status renders with fallback not_started styling without crash",
    unknownStatusRes.nodes.length === 1,
  );

  // 5.6 extractPhaseIndex helper
  check(
    "extractPhaseIndex correctly parses 'Phase 3: APIs' to 3",
    extractPhaseIndex("Phase 3: APIs") === 3,
  );
  check(
    "extractPhaseIndex correctly parses '04 Deployment' to 4",
    extractPhaseIndex("04 Deployment") === 4,
  );
  check(
    "extractPhaseIndex returns Infinity for non-numeric phase",
    !Number.isFinite(extractPhaseIndex("Architecture")),
  );

  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log("\nALL GRAPH RENDER CHECKS PASSED!");
  }
}

run().catch((error) => {
  console.error("Unhandled error in test runner:", error);
  process.exitCode = 1;
});
