import {
  RequirementSchema,
  NodeSchema,
  EdgeSchema,
  EdgeTypeSchema,
  NodeStatusSchema,
  StatusSchema,
  GraphSchema,
  toDbNodeStatus,
  toDisplayNodeStatus,
  CanonicalNodeStatusSchema,
  DB_NODE_STATUSES,
  DISPLAY_NODE_STATUSES,
  EDGE_TYPES,
  Requirement,
  Node,
  Edge,
} from "../src/lib/schema";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, error?: string): void {
  results.push({
    name,
    passed: condition,
    error: condition ? undefined : (error ?? "Assertion failed"),
  });
}

function runTests(): void {
  console.log("=== RUNNING GRAPH SCHEMA FIXTURE TESTS ===\n");

  // ---------------------------------------------------------------------------
  // 1. STATUSES - VALID FIXTURES
  // ---------------------------------------------------------------------------
  console.log("1. Testing Statuses (Valid fixtures)...");
  for (const status of DB_NODE_STATUSES) {
    const parsed = NodeStatusSchema.safeParse(status);
    assert(`Valid DB status: '${status}' accepted`, parsed.success);
    if (parsed.success) {
      assert(
        `toDbNodeStatus('${status}') maps to '${status}'`,
        toDbNodeStatus(parsed.data) === status,
      );
    }
  }

  for (const status of DISPLAY_NODE_STATUSES) {
    const parsed = NodeStatusSchema.safeParse(status);
    assert(`Valid Display status: '${status}' accepted`, parsed.success);
    if (parsed.success) {
      assert(
        `toDisplayNodeStatus('${status}') maps to '${status}'`,
        toDisplayNodeStatus(parsed.data) === status,
      );
    }
  }

  // Canonical preprocessor test
  for (const status of DISPLAY_NODE_STATUSES) {
    const canonical = CanonicalNodeStatusSchema.safeParse(status);
    assert(
      `CanonicalNodeStatusSchema normalizes '${status}' to snake_case`,
      canonical.success &&
        typeof canonical.data === "string" &&
        canonical.data === toDbNodeStatus(status),
    );
  }

  // StatusSchema alias test
  assert(
    "StatusSchema is identical to NodeStatusSchema",
    StatusSchema.safeParse("In Progress").success &&
      StatusSchema.safeParse("in_progress").success,
  );

  // ---------------------------------------------------------------------------
  // 2. STATUSES - INVALID FIXTURES (MUST REJECT)
  // ---------------------------------------------------------------------------
  console.log("2. Testing Statuses (Invalid fixtures - rejection)...");
  const invalidStatuses = [
    "",
    "   ",
    "done",
    "pending",
    "wip",
    "finished",
    "unknown",
    "in progress", // lowercase with space
    123,
    null,
    undefined,
    {},
    [],
  ];

  for (const invalid of invalidStatuses) {
    const parsed = NodeStatusSchema.safeParse(invalid);
    assert(
      `Invalid status ${JSON.stringify(invalid)} rejected`,
      parsed.success === false,
    );
  }

  // ---------------------------------------------------------------------------
  // 3. EDGE TYPES - VALID & INVALID FIXTURES
  // ---------------------------------------------------------------------------
  console.log("3. Testing Edge Types...");
  for (const edgeType of EDGE_TYPES) {
    const parsed = EdgeTypeSchema.safeParse(edgeType);
    assert(`Valid edge type '${edgeType}' accepted`, parsed.success);
  }

  const invalidEdgeTypes = [
    "depends_on",
    "DEPENDSON",
    "implements",
    "TEST",
    "BLOCK",
    "RELATES_TO",
    "PARENT_OF",
    "",
    123,
    null,
    undefined,
  ];

  for (const invalid of invalidEdgeTypes) {
    const parsed = EdgeTypeSchema.safeParse(invalid);
    assert(
      `Invalid edge type ${JSON.stringify(invalid)} rejected`,
      parsed.success === false,
    );
  }

  // ---------------------------------------------------------------------------
  // 4. REQUIREMENT - VALID FIXTURES
  // ---------------------------------------------------------------------------
  console.log("4. Testing Requirement (Valid fixtures)...");
  const validRequirements = [
    {
      key: "REQ-01",
      title: "User Authentication",
    },
    {
      key: "01.1",
      title: "Scaffold Next.js Project",
      description: "Initialize repository and basic layout",
    },
    {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      project_id: "11111111-2222-3333-4444-555555555555",
      key: "SEC-03",
      title: "OAuth 2.0 with GitHub",
      description: null,
      created_at: new Date().toISOString(),
    },
    {
      projectId: "11111111-2222-3333-4444-555555555555",
      key: "PERF-01",
      title: "Serverless Cold Start Optimization",
      description: "Ensure fast bootstrap without external connections",
      createdAt: new Date(),
    },
  ];

  for (const req of validRequirements) {
    const parsed = RequirementSchema.safeParse(req);
    assert(
      `Valid requirement '${req.key}' accepted`,
      parsed.success,
      parsed.success ? undefined : JSON.stringify(parsed.error.issues),
    );
  }

  // Dual-use value constructor test
  const parsedByVal = Requirement.safeParse(validRequirements[0]);
  assert(
    "Requirement.parse (value export) accepts valid requirement",
    parsedByVal.success,
  );

  // ---------------------------------------------------------------------------
  // 5. REQUIREMENT - INVALID FIXTURES (MUST REJECT)
  // ---------------------------------------------------------------------------
  console.log("5. Testing Requirement (Invalid fixtures - rejection)...");
  const invalidRequirements = [
    { title: "Missing key" },
    { key: "", title: "Empty key" },
    { key: "   ", title: "Whitespace key" },
    { key: "REQ-01" }, // missing title
    { key: "REQ-01", title: "" }, // empty title
    { key: "REQ-01", title: "   " }, // whitespace title
    { key: 123, title: "Number key" },
    { key: "REQ-01", title: 456 },
    "not an object",
    null,
    undefined,
    [],
  ];

  for (const [idx, invalid] of invalidRequirements.entries()) {
    const parsed = RequirementSchema.safeParse(invalid);
    assert(
      `Invalid requirement fixture #${idx + 1} rejected`,
      parsed.success === false,
    );
  }

  // ---------------------------------------------------------------------------
  // 6. NODE - VALID FIXTURES
  // ---------------------------------------------------------------------------
  console.log("6. Testing Node (Valid fixtures)...");
  const validNodes = [
    // Minimal node: defaults status to 'not_started', files/acceptance/tests to []
    {
      node_key: "01.1",
      phase: "Foundation",
      title: "Initialize Repository",
    },
    // Node with Title Case status
    {
      node_key: "01.2",
      phase: "Foundation",
      title: "Scaffold Frontend",
      status: "Ready",
    },
    // Node with snake_case status
    {
      node_key: "02.1",
      phase: "Database",
      title: "Supabase Connection",
      status: "in_progress",
    },
    // Node using 'key' alias
    {
      key: "03.1",
      phase: "Plan engine",
      title: "LLM Client",
      status: "Completed",
    },
    // Full node with all fields
    {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      project_id: "11111111-2222-3333-4444-555555555555",
      node_key: "03.2",
      phase: "Plan engine",
      title: "Graph Schemas",
      type: "core",
      status: "in_progress",
      requirement_id: "req-uuid-1234",
      files: ["backend/src/lib/schema.ts", "backend/scripts/test-schema.ts"],
      explanation: "Define strict zod schemas for graph components",
      acceptance: ["Invalid shapes are rejected", "Edge types validated"],
      tests: ["npm run test:schema"],
      prompt: "Create schema.ts with Zod schemas",
      created_at: new Date().toISOString(),
    },
  ];

  for (const node of validNodes) {
    const parsed = NodeSchema.safeParse(node);
    assert(
      `Valid node '${node.node_key ?? (node as { key?: string }).key}' accepted`,
      parsed.success,
      parsed.success ? undefined : JSON.stringify(parsed.error.issues),
    );
    if (parsed.success) {
      assert(
        `Node defaults applied properly`,
        Array.isArray(parsed.data.files) &&
          Array.isArray(parsed.data.acceptance) &&
          Array.isArray(parsed.data.tests) &&
          Boolean(parsed.data.status),
      );
    }
  }

  // Dual-use value constructor test
  assert(
    "Node.parse (value export) accepts valid node",
    Node.safeParse(validNodes[0]).success,
  );

  // ---------------------------------------------------------------------------
  // 7. NODE - INVALID FIXTURES (MUST REJECT)
  // ---------------------------------------------------------------------------
  console.log("7. Testing Node (Invalid fixtures - rejection)...");
  const invalidNodes = [
    { phase: "Foundation", title: "No key" },
    { node_key: "", phase: "Foundation", title: "Empty node_key" },
    { node_key: "   ", phase: "Foundation", title: "Whitespace node_key" },
    { key: "", phase: "Foundation", title: "Empty key alias" },
    { node_key: "01.1", title: "Missing phase" },
    { node_key: "01.1", phase: "", title: "Empty phase" },
    { node_key: "01.1", phase: "   ", title: "Whitespace phase" },
    { node_key: "01.1", phase: "Foundation" }, // missing title
    { node_key: "01.1", phase: "Foundation", title: "" }, // empty title
    { node_key: "01.1", phase: "Foundation", title: "   " }, // whitespace title
    {
      node_key: "01.1",
      phase: "Foundation",
      title: "Test",
      status: "non_existent_status",
    },
    {
      node_key: "01.1",
      phase: "Foundation",
      title: "Test",
      files: "should-be-array",
    },
    {
      node_key: "01.1",
      phase: "Foundation",
      title: "Test",
      acceptance: "should-be-array",
    },
    {
      node_key: "01.1",
      phase: "Foundation",
      title: "Test",
      tests: "should-be-array",
    },
    null,
    undefined,
    "node string",
    123,
  ];

  for (const [idx, invalid] of invalidNodes.entries()) {
    const parsed = NodeSchema.safeParse(invalid);
    assert(
      `Invalid node fixture #${idx + 1} rejected`,
      parsed.success === false,
    );
  }

  // ---------------------------------------------------------------------------
  // 8. EDGE - VALID FIXTURES
  // ---------------------------------------------------------------------------
  console.log("8. Testing Edge (Valid fixtures)...");
  const validEdges = [
    {
      from_node: "node-1",
      to_node: "node-2",
      type: "DEPENDS_ON",
    },
    {
      from_node: "node-1",
      to_node: "node-3",
      type: "IMPLEMENTS",
    },
    {
      from_node: "test-node",
      to_node: "feature-node",
      type: "TESTS",
    },
    {
      from_node: "builder-node",
      to_node: "artifact-node",
      type: "PRODUCES",
    },
    {
      from_node: "patch-node",
      to_node: "core-node",
      type: "MODIFIES",
    },
    {
      from_node: "blocker-node",
      to_node: "blocked-node",
      type: "BLOCKS",
    },
    // Alias from/to
    {
      from: "01.1",
      to: "01.2",
      type: "DEPENDS_ON",
    },
    // Alias source/target
    {
      source: "01.2",
      target: "01.3",
      type: "IMPLEMENTS",
    },
    // Full edge with id & project_id
    {
      id: "edge-uuid-1",
      project_id: "project-uuid-1",
      from_node: "node-A",
      to_node: "node-B",
      type: "DEPENDS_ON",
    },
  ];

  for (const edge of validEdges) {
    const parsed = EdgeSchema.safeParse(edge);
    assert(
      `Valid edge [${edge.type}] accepted`,
      parsed.success,
      parsed.success ? undefined : JSON.stringify(parsed.error.issues),
    );
  }

  // Dual-use value constructor test
  assert(
    "Edge.parse (value export) accepts valid edge",
    Edge.safeParse(validEdges[0]).success,
  );

  // ---------------------------------------------------------------------------
  // 9. EDGE - INVALID FIXTURES (SELF-EDGE & MISSING/INVALID FIELDS)
  // ---------------------------------------------------------------------------
  console.log("9. Testing Edge (Invalid fixtures - rejection)...");
  const invalidEdges = [
    // Self-edge: from_node === to_node (must be rejected!)
    {
      from_node: "node-1",
      to_node: "node-1",
      type: "DEPENDS_ON",
    },
    // Self-edge with aliases
    {
      from: "01.1",
      to: "01.1",
      type: "DEPENDS_ON",
    },
    {
      source: "A",
      target: "A",
      type: "BLOCKS",
    },
    // Missing source
    {
      to_node: "node-2",
      type: "DEPENDS_ON",
    },
    // Missing target
    {
      from_node: "node-1",
      type: "DEPENDS_ON",
    },
    // Empty source
    {
      from_node: "",
      to_node: "node-2",
      type: "DEPENDS_ON",
    },
    // Empty target
    {
      from_node: "node-1",
      to_node: "",
      type: "DEPENDS_ON",
    },
    // Whitespace source / target
    {
      from_node: "   ",
      to_node: "node-2",
      type: "DEPENDS_ON",
    },
    {
      from_node: "node-1",
      to_node: "   ",
      type: "DEPENDS_ON",
    },
    // Invalid edge type
    {
      from_node: "node-1",
      to_node: "node-2",
      type: "INVALID_RELATION",
    },
    {
      from_node: "node-1",
      to_node: "node-2",
      type: "depends_on", // lowercase not allowed
    },
    null,
    undefined,
    "edge string",
    123,
    [],
  ];

  for (const [idx, invalid] of invalidEdges.entries()) {
    const parsed = EdgeSchema.safeParse(invalid);
    assert(
      `Invalid edge fixture #${idx + 1} rejected`,
      parsed.success === false,
    );
  }

  // ---------------------------------------------------------------------------
  // 10. GRAPH - VALID & INVALID FIXTURES
  // ---------------------------------------------------------------------------
  console.log("10. Testing Graph...");
  const validGraph = {
    projectId: "p-1",
    requirements: [{ key: "REQ-1", title: "Setup" }],
    nodes: [
      { node_key: "01.1", phase: "Init", title: "First Step" },
      { node_key: "01.2", phase: "Init", title: "Second Step" },
    ],
    edges: [{ from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" }],
  };
  assert("Valid Graph accepted", GraphSchema.safeParse(validGraph).success);

  const invalidGraphs = [
    // Missing nodes
    { requirements: [], edges: [] },
    // Nodes not an array
    { nodes: "not-an-array" },
    // Graph containing invalid node
    {
      nodes: [{ phase: "Init" }], // missing node_key and title
      edges: [],
    },
    // Graph containing invalid edge (self-edge)
    {
      nodes: [{ node_key: "01.1", phase: "Init", title: "First Step" }],
      edges: [{ from_node: "01.1", to_node: "01.1", type: "DEPENDS_ON" }],
    },
  ];

  for (const [idx, invalid] of invalidGraphs.entries()) {
    const parsed = GraphSchema.safeParse(invalid);
    assert(
      `Invalid graph fixture #${idx + 1} rejected`,
      parsed.success === false,
    );
  }

  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log("\n==========================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`TOTAL CHECKS: ${total}`);
  console.log(`PASSED:       ${passed}`);
  console.log(`FAILED:       ${failed}`);

  if (failed > 0) {
    console.error("\nFAILURES:");
    for (const res of results.filter((r) => !r.passed)) {
      console.error(`✖ ${res.name}: ${res.error}`);
    }
    process.exit(1);
  }

  console.log("\nALL GRAPH SCHEMA FIXTURE CHECKS PASSED!");
}

runTests();
