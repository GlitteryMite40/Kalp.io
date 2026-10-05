import {
  RequirementSchema,
  NodeSchema,
  EdgeSchema,
  EdgeTypeSchema,
  NodeStatusSchema,
  StatusSchema,
  GraphSchema,
  normalizeAliases,
  toDbNodeStatus,
  toDisplayNodeStatus,
  CanonicalNodeStatusSchema,
  DB_NODE_STATUSES,
  DISPLAY_NODE_STATUSES,
  EDGE_TYPES,
  Requirement,
  Node,
  Edge,
  findDependsOnCycle,
  checkGraphIntegrity,
  findUncoveredRequirements,
  sortNodesByPhase,
  analyzeGraphShape,
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
  console.log("=== RUNNING HARDENED GRAPH SCHEMA FIXTURE TESTS ===\n");

  const VALID_UUID_1 = "11111111-1111-4111-8111-111111111111";
  const VALID_UUID_2 = "22222222-2222-4222-8222-222222222222";
  const VALID_UUID_3 = "33333333-3333-4333-8333-333333333333";
  const VALID_UUID_4 = "44444444-4444-4444-8444-444444444444";

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
  // 3. NODE STATUS NORMALIZATION (CanonicalNodeStatusSchema)
  // ---------------------------------------------------------------------------
  console.log(
    "3. Testing NodeSchema.status normalization with CanonicalNodeStatusSchema...",
  );
  const testNodeStatusPairs = [
    { input: "Not Started", expected: "not_started" },
    { input: "Ready", expected: "ready" },
    { input: "In Progress", expected: "in_progress" },
    { input: "Committed", expected: "committed" },
    { input: "Completed", expected: "completed" },
    { input: "Blocked", expected: "blocked" },
    { input: "Failed", expected: "failed" },
    { input: "Needs Review", expected: "needs_review" },
    { input: "not_started", expected: "not_started" },
    { input: "ready", expected: "ready" },
    { input: "in_progress", expected: "in_progress" },
    { input: "committed", expected: "committed" },
    { input: "completed", expected: "completed" },
    { input: "blocked", expected: "blocked" },
    { input: "failed", expected: "failed" },
    { input: "needs_review", expected: "needs_review" },
  ];

  for (const pair of testNodeStatusPairs) {
    const parsed = NodeSchema.safeParse({
      node_key: "01.1",
      phase: "Phase",
      title: "Title",
      status: pair.input,
    });
    assert(
      `NodeSchema normalizes status '${pair.input}' to canonical '${pair.expected}'`,
      parsed.success && parsed.data.status === pair.expected,
    );
  }

  // Default status check
  const defaultNode = NodeSchema.safeParse({
    node_key: "01.1",
    phase: "Phase",
    title: "Title",
  });
  assert(
    "NodeSchema applies default status 'not_started'",
    defaultNode.success && defaultNode.data.status === "not_started",
  );

  // ---------------------------------------------------------------------------
  // 4. EDGE TYPES - VALID & INVALID FIXTURES
  // ---------------------------------------------------------------------------
  console.log("4. Testing Edge Types...");
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
  // 5. REQUIREMENT - VALID & INVALID FIXTURES & COLLAPSED SHAPE
  // ---------------------------------------------------------------------------
  console.log("5. Testing Requirement Schema...");
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
      id: VALID_UUID_1,
      project_id: VALID_UUID_2,
      key: "SEC-03",
      title: "OAuth 2.0 with GitHub",
      description: null,
      created_at: new Date().toISOString(),
    },
    // Alias input: projectId, createdAt
    {
      projectId: VALID_UUID_2,
      key: "PERF-01",
      title: "Serverless Optimization",
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

  // Verify collapsed snake_case shape (no projectId, only project_id)
  const reqWithAlias = RequirementSchema.parse({
    projectId: VALID_UUID_2,
    key: "ALIAS-1",
    title: "Alias test",
  });
  assert(
    "Requirement output shape has project_id and no projectId",
    reqWithAlias.project_id === VALID_UUID_2 && !("projectId" in reqWithAlias),
  );

  // Dual-use value constructor test
  const parsedByVal = Requirement.safeParse(validRequirements[0]);
  assert(
    "Requirement.parse (value export) accepts valid requirement",
    parsedByVal.success,
  );

  // Invalid requirements
  const invalidRequirements = [
    { title: "Missing key" },
    { key: "", title: "Empty key" },
    { key: "   ", title: "Whitespace key" },
    { key: "REQ-01" }, // missing title
    { key: "REQ-01", title: "" }, // empty title
    { key: "REQ-01", title: "   " }, // whitespace title
    { key: 123, title: "Number key" },
    { key: "REQ-01", title: 456 },
    { key: "REQ-01", title: "Bad ID", id: "not-a-valid-uuid" },
    { key: "REQ-01", title: "Bad Project ID", project_id: "not-a-valid-uuid" },
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
  // 6. NODE - VALID & INVALID FIXTURES & COLLAPSED SHAPE
  // ---------------------------------------------------------------------------
  console.log("6. Testing Node Schema...");
  const validNodes = [
    // Minimal node
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
    // Full node with all fields
    {
      id: VALID_UUID_1,
      project_id: VALID_UUID_2,
      node_key: "03.2",
      phase: "Plan engine",
      title: "Graph Schemas",
      type: "core",
      status: "In Progress",
      requirement_id: VALID_UUID_3,
      files: ["backend/src/lib/schema.ts", "backend/scripts/test-schema.ts"],
      explanation: "Define strict zod schemas for graph components",
      acceptance: ["Invalid shapes are rejected", "Edge types validated"],
      tests: ["npm run test:schema"],
      prompt: "Create schema.ts with Zod schemas",
      created_at: new Date().toISOString(),
    },
    // Node with aliases (key, projectId, requirementId, createdAt)
    {
      key: "04.1",
      phase: "UI",
      title: "Node View",
      projectId: VALID_UUID_2,
      requirementId: VALID_UUID_3,
      createdAt: new Date().toISOString(),
    },
  ];

  for (const node of validNodes) {
    const parsed = NodeSchema.safeParse(node);
    assert(
      `Valid node '${node.node_key ?? (node as { key?: string }).key}' accepted`,
      parsed.success,
      parsed.success ? undefined : JSON.stringify(parsed.error.issues),
    );
  }

  // Verify collapsed snake_case shape for Node
  const nodeWithAliases = NodeSchema.parse({
    key: "09.1",
    nodeKey: undefined,
    projectId: VALID_UUID_2,
    requirementId: VALID_UUID_3,
    phase: "Phase",
    title: "Title",
    status: "Completed",
  });
  assert(
    "Node output shape has node_key, project_id, requirement_id and no aliases",
    nodeWithAliases.node_key === "09.1" &&
      nodeWithAliases.project_id === VALID_UUID_2 &&
      nodeWithAliases.requirement_id === VALID_UUID_3 &&
      nodeWithAliases.status === "completed" &&
      !("key" in nodeWithAliases) &&
      !("nodeKey" in nodeWithAliases) &&
      !("projectId" in nodeWithAliases) &&
      !("requirementId" in nodeWithAliases),
  );

  // Dual-use value constructor test
  assert(
    "Node.parse (value export) accepts valid node",
    Node.safeParse(validNodes[0]).success,
  );

  // Invalid nodes
  const invalidNodes = [
    { phase: "Foundation", title: "No key" },
    { node_key: "", phase: "Foundation", title: "Empty node_key" },
    { node_key: "   ", phase: "Foundation", title: "Whitespace node_key" },
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
      id: "invalid-uuid-id",
    },
    {
      node_key: "01.1",
      phase: "Foundation",
      title: "Test",
      project_id: "invalid-uuid-project",
    },
    {
      node_key: "01.1",
      phase: "Foundation",
      title: "Test",
      requirement_id: "invalid-uuid-req",
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
  // 7. EDGE - VALID & INVALID FIXTURES & COLLAPSED SHAPE
  // ---------------------------------------------------------------------------
  console.log("7. Testing Edge Schema...");
  const validEdges = [
    {
      from_node: "01.1",
      to_node: "01.2",
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
    // Full edge with valid UUIDs
    {
      id: VALID_UUID_4,
      project_id: VALID_UUID_2,
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

  // Verify collapsed snake_case shape for Edge
  const edgeWithAliases = EdgeSchema.parse({
    source: "node-X",
    target: "node-Y",
    projectId: VALID_UUID_2,
    type: "BLOCKS",
  });
  assert(
    "Edge output shape has from_node, to_node, project_id and no aliases",
    edgeWithAliases.from_node === "node-X" &&
      edgeWithAliases.to_node === "node-Y" &&
      edgeWithAliases.project_id === VALID_UUID_2 &&
      !("source" in edgeWithAliases) &&
      !("target" in edgeWithAliases) &&
      !("projectId" in edgeWithAliases),
  );

  // Dual-use value constructor test
  assert(
    "Edge.parse (value export) accepts valid edge",
    Edge.safeParse(validEdges[0]).success,
  );

  // Invalid edges
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
    // Invalid UUID
    {
      id: "not-a-uuid",
      from_node: "node-1",
      to_node: "node-2",
      type: "DEPENDS_ON",
    },
    {
      project_id: "not-a-uuid",
      from_node: "node-1",
      to_node: "node-2",
      type: "DEPENDS_ON",
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
  // 8. GRAPH - VALID FIXTURES & ALIAS COLLAPSE
  // ---------------------------------------------------------------------------
  console.log("8. Testing Graph Schema (Valid)...");
  const validGraph = {
    projectId: VALID_UUID_1,
    requirements: [{ key: "REQ-1", title: "Setup" }],
    nodes: [
      { node_key: "01.1", phase: "Init", title: "First Step" },
      {
        node_key: "01.2",
        phase: "Init",
        title: "Second Step",
        id: VALID_UUID_2,
      },
    ],
    edges: [
      { from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" },
      // Edge referencing node by id
      { from_node: "01.1", to_node: VALID_UUID_2, type: "TESTS" },
    ],
  };

  const parsedValidGraph = GraphSchema.safeParse(validGraph);
  assert(
    "Valid Graph accepted",
    parsedValidGraph.success,
    parsedValidGraph.success
      ? undefined
      : JSON.stringify(parsedValidGraph.error.issues),
  );
  if (parsedValidGraph.success) {
    assert(
      "Graph output shape collapses projectId into project_id",
      parsedValidGraph.data.project_id === VALID_UUID_1 &&
        !("projectId" in parsedValidGraph.data),
    );
  }

  // ---------------------------------------------------------------------------
  // 9. GRAPH - superRefine CHECKS (NEW RULES)
  // ---------------------------------------------------------------------------
  console.log("9. Testing GraphSchema superRefine checks...");

  // RULE A: Duplicate node_key rejected
  const graphWithDuplicateNodeKeys = {
    nodes: [
      { node_key: "01.1", phase: "Init", title: "First Step" },
      { node_key: "01.1", phase: "Init", title: "Duplicate Key Step" },
    ],
    edges: [],
  };
  const duplicateNodeKeyResult = GraphSchema.safeParse(
    graphWithDuplicateNodeKeys,
  );
  assert(
    "Graph with duplicate node_key rejected by superRefine",
    duplicateNodeKeyResult.success === false &&
      duplicateNodeKeyResult.error.issues.some((i) =>
        i.message.includes("Duplicate node_key"),
      ),
  );

  // RULE B: Edge referencing unknown from_node rejected
  const graphWithUnknownFromNode = {
    nodes: [
      { node_key: "01.1", phase: "Init", title: "Step 1" },
      { node_key: "01.2", phase: "Init", title: "Step 2" },
    ],
    edges: [{ from_node: "UNKNOWN_NODE", to_node: "01.2", type: "DEPENDS_ON" }],
  };
  const unknownFromNodeResult = GraphSchema.safeParse(graphWithUnknownFromNode);
  assert(
    "Graph with edge referencing unknown from_node rejected by superRefine",
    unknownFromNodeResult.success === false &&
      unknownFromNodeResult.error.issues.some(
        (i) =>
          i.path.join(".") === "edges.0.from_node" &&
          i.message.includes("does not exist"),
      ),
  );

  // RULE C: Edge referencing unknown to_node rejected
  const graphWithUnknownToNode = {
    nodes: [
      { node_key: "01.1", phase: "Init", title: "Step 1" },
      { node_key: "01.2", phase: "Init", title: "Step 2" },
    ],
    edges: [{ from_node: "01.1", to_node: "UNKNOWN_NODE", type: "DEPENDS_ON" }],
  };
  const unknownToNodeResult = GraphSchema.safeParse(graphWithUnknownToNode);
  assert(
    "Graph with edge referencing unknown to_node rejected by superRefine",
    unknownToNodeResult.success === false &&
      unknownToNodeResult.error.issues.some(
        (i) =>
          i.path.join(".") === "edges.0.to_node" &&
          i.message.includes("does not exist"),
      ),
  );

  // RULE D: Duplicate edge (identical from_node, to_node, type) rejected
  const graphWithDuplicateEdge = {
    nodes: [
      { node_key: "01.1", phase: "Init", title: "Step 1" },
      { node_key: "01.2", phase: "Init", title: "Step 2" },
    ],
    edges: [
      { from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" },
      { from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" },
    ],
  };
  const duplicateEdgeResult = GraphSchema.safeParse(graphWithDuplicateEdge);
  assert(
    "Graph with duplicate edge (from, to, type) rejected by superRefine",
    duplicateEdgeResult.success === false &&
      duplicateEdgeResult.error.issues.some((i) =>
        i.message.includes("Duplicate edge"),
      ),
  );

  // Multiple edges between same nodes but DIFFERENT types must be ACCEPTED
  const graphWithMultiTypeEdges = {
    nodes: [
      { node_key: "01.1", phase: "Init", title: "Step 1" },
      { node_key: "01.2", phase: "Init", title: "Step 2" },
    ],
    edges: [
      { from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" },
      { from_node: "01.1", to_node: "01.2", type: "TESTS" },
    ],
  };
  assert(
    "Graph with distinct edge types between same nodes is accepted",
    GraphSchema.safeParse(graphWithMultiTypeEdges).success,
  );

  // RULE E: Node referencing valid requirement_key accepted
  const graphWithValidReqKey = {
    requirements: [{ key: "REQ-AUTH", title: "Authentication" }],
    nodes: [
      {
        node_key: "01.1",
        phase: "Init",
        title: "Step 1",
        requirement_key: "REQ-AUTH",
      },
    ],
    edges: [],
  };
  assert(
    "Graph with node referencing valid requirement_key accepted",
    GraphSchema.safeParse(graphWithValidReqKey).success,
  );

  // RULE F: Node referencing unknown requirement_key rejected
  const graphWithUnknownReqKey = {
    requirements: [{ key: "REQ-AUTH", title: "Authentication" }],
    nodes: [
      {
        node_key: "01.1",
        phase: "Init",
        title: "Step 1",
        requirement_key: "UNKNOWN-REQ",
      },
    ],
    edges: [],
  };
  const unknownReqResult = GraphSchema.safeParse(graphWithUnknownReqKey);
  assert(
    "Graph with node referencing unknown requirement_key rejected",
    unknownReqResult.success === false &&
      unknownReqResult.error.issues.some(
        (i) =>
          i.path.join(".") === "nodes.0.requirement_key" &&
          i.message ===
            "Node 01.1 references unknown requirement_key UNKNOWN-REQ",
      ),
  );

  // RULE G: Duplicate requirement keys within graph.requirements rejected
  const graphWithDuplicateReqKeys = {
    requirements: [
      { key: "REQ-1", title: "First Req" },
      { key: "REQ-1", title: "Duplicate Key Req" },
    ],
    nodes: [{ node_key: "01.1", phase: "Init", title: "Step 1" }],
    edges: [],
  };
  const duplicateReqKeyResult = GraphSchema.safeParse(
    graphWithDuplicateReqKeys,
  );
  assert(
    "Graph with duplicate requirement keys rejected by superRefine",
    duplicateReqKeyResult.success === false &&
      duplicateReqKeyResult.error.issues.some((i) =>
        i.message.includes("Duplicate requirement key"),
      ),
  );

  // RULE H: Duplicate edge written once by key and once by id rejected
  const graphWithDuplicateEdgeKeyAndId = {
    nodes: [
      { node_key: "01.1", phase: "Init", title: "Step 1", id: VALID_UUID_1 },
      { node_key: "01.2", phase: "Init", title: "Step 2", id: VALID_UUID_2 },
    ],
    edges: [
      { from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" },
      // Edge referring to the exact same nodes, but by id
      { from_node: VALID_UUID_1, to_node: VALID_UUID_2, type: "DEPENDS_ON" },
    ],
  };
  const duplicateEdgeKeyAndIdResult = GraphSchema.safeParse(
    graphWithDuplicateEdgeKeyAndId,
  );
  assert(
    "Graph with duplicate edge (one by key, one by id) rejected by superRefine",
    duplicateEdgeKeyAndIdResult.success === false &&
      duplicateEdgeKeyAndIdResult.error.issues.some((i) =>
        i.message.includes("Duplicate edge"),
      ),
  );

  // Duplicate edge with mixed key and id
  const graphWithDuplicateEdgeMixed = {
    nodes: [
      { node_key: "01.1", phase: "Init", title: "Step 1", id: VALID_UUID_1 },
      { node_key: "01.2", phase: "Init", title: "Step 2", id: VALID_UUID_2 },
    ],
    edges: [
      { from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" },
      { from_node: "01.1", to_node: VALID_UUID_2, type: "DEPENDS_ON" },
    ],
  };
  const duplicateEdgeMixedResult = GraphSchema.safeParse(
    graphWithDuplicateEdgeMixed,
  );
  assert(
    "Graph with duplicate edge (mixed key and id) rejected by superRefine",
    duplicateEdgeMixedResult.success === false &&
      duplicateEdgeMixedResult.error.issues.some((i) =>
        i.message.includes("Duplicate edge"),
      ),
  );

  // RULE I: requirementKey alias in NodeSchema
  const nodeWithReqKeyAlias = NodeSchema.parse({
    node_key: "01.1",
    phase: "Init",
    title: "Step 1",
    requirementKey: "REQ-ALIAS",
  });
  assert(
    "NodeSchema normalizes requirementKey alias to requirement_key",
    nodeWithReqKeyAlias.requirement_key === "REQ-ALIAS" &&
      !("requirementKey" in nodeWithReqKeyAlias),
  );

  // ---------------------------------------------------------------------------
  // 10. DIRECT normalizeAliases UNIT TEST
  // ---------------------------------------------------------------------------
  console.log("10. Testing normalizeAliases standalone...");
  const rawObj = {
    projectId: VALID_UUID_1,
    requirementId: VALID_UUID_2,
    requirementKey: "REQ-10",
    createdAt: "2026-10-04T00:00:00Z",
    nodeKey: "01.1",
    fromNode: "node-1",
    toNode: "node-2",
  };
  const normalized = normalizeAliases(rawObj) as Record<string, unknown>;
  assert(
    "normalizeAliases converts projectId -> project_id",
    normalized.project_id === VALID_UUID_1 && !("projectId" in normalized),
  );
  assert(
    "normalizeAliases converts requirementId -> requirement_id",
    normalized.requirement_id === VALID_UUID_2 &&
      !("requirementId" in normalized),
  );
  assert(
    "normalizeAliases converts requirementKey -> requirement_key",
    normalized.requirement_key === "REQ-10" &&
      !("requirementKey" in normalized),
  );
  assert(
    "normalizeAliases converts createdAt -> created_at",
    normalized.created_at === "2026-10-04T00:00:00Z" &&
      !("createdAt" in normalized),
  );
  assert(
    "normalizeAliases converts nodeKey -> node_key",
    normalized.node_key === "01.1" && !("nodeKey" in normalized),
  );
  assert(
    "normalizeAliases converts fromNode -> from_node and toNode -> to_node",
    normalized.from_node === "node-1" &&
      normalized.to_node === "node-2" &&
      !("fromNode" in normalized) &&
      !("toNode" in normalized),
  );

  // ---------------------------------------------------------------------------
  // 11. DEPENDS_ON CYCLE DETECTION & GRAPH INTEGRITY HARDENING
  // ---------------------------------------------------------------------------
  console.log(
    "11. Testing DEPENDS_ON Cycle Detection & Graph Integrity Hardening...",
  );

  // (e) findDependsOnCycle returns null for acyclic graphs and correct ordered path for cyclic ones
  const acyclicNodes = [
    { node_key: "01.1" },
    { node_key: "01.2" },
    { node_key: "01.3" },
  ];
  const acyclicEdges = [
    { from_node: "01.3", to_node: "01.2", type: "DEPENDS_ON" },
    { from_node: "01.2", to_node: "01.1", type: "DEPENDS_ON" },
  ];
  assert(
    "findDependsOnCycle returns null for acyclic graphs",
    findDependsOnCycle(acyclicNodes, acyclicEdges) === null,
  );

  const cyclicNodes2 = [{ node_key: "01.1" }, { node_key: "01.2" }];
  const cyclicEdges2 = [
    { from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" },
    { from_node: "01.2", to_node: "01.1", type: "DEPENDS_ON" },
  ];
  const cycle2 = findDependsOnCycle(cyclicNodes2, cyclicEdges2);
  assert(
    "findDependsOnCycle returns ordered path for length-2 cycle",
    cycle2 !== null &&
      (cycle2.join(" -> ") === "01.1 -> 01.2 -> 01.1" ||
        cycle2.join(" -> ") === "01.2 -> 01.1 -> 01.2"),
  );

  const cyclicNodes3 = [
    { node_key: "01.1" },
    { node_key: "01.2" },
    { node_key: "01.3" },
  ];
  const cyclicEdges3 = [
    { from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" },
    { from_node: "01.2", to_node: "01.3", type: "DEPENDS_ON" },
    { from_node: "01.3", to_node: "01.1", type: "DEPENDS_ON" },
  ];
  const cycle3 = findDependsOnCycle(cyclicNodes3, cyclicEdges3);
  assert(
    "findDependsOnCycle returns ordered path for length-3 cycle",
    cycle3 !== null &&
      cycle3.length === 4 &&
      cycle3[0] === cycle3[3] &&
      (cycle3.join(" -> ") === "01.1 -> 01.2 -> 01.3 -> 01.1" ||
        cycle3.join(" -> ") === "01.2 -> 01.3 -> 01.1 -> 01.2" ||
        cycle3.join(" -> ") === "01.3 -> 01.1 -> 01.2 -> 01.3"),
  );

  // (a) DEPENDS_ON cycle of length 2 and length 3 rejected via GraphSchema, message names the path
  const graphWithCycle2 = {
    nodes: [
      { node_key: "01.1", phase: "01", title: "Task 1" },
      { node_key: "01.2", phase: "01", title: "Task 2" },
    ],
    edges: cyclicEdges2,
  };
  const resGraphCycle2 = GraphSchema.safeParse(graphWithCycle2);
  assert(
    "Graph with length-2 DEPENDS_ON cycle rejected naming path",
    resGraphCycle2.success === false &&
      resGraphCycle2.error.issues.some((i) =>
        i.message.includes("DEPENDS_ON cycle detected: 01.1 -> 01.2 -> 01.1"),
      ),
  );

  const graphWithCycle3 = {
    nodes: [
      { node_key: "01.1", phase: "01", title: "Task 1" },
      { node_key: "01.2", phase: "01", title: "Task 2" },
      { node_key: "01.3", phase: "01", title: "Task 3" },
    ],
    edges: cyclicEdges3,
  };
  const resGraphCycle3 = GraphSchema.safeParse(graphWithCycle3);
  assert(
    "Graph with length-3 DEPENDS_ON cycle rejected naming path",
    resGraphCycle3.success === false &&
      resGraphCycle3.error.issues.some((i) =>
        i.message.includes(
          "DEPENDS_ON cycle detected: 01.1 -> 01.2 -> 01.3 -> 01.1",
        ),
      ),
  );

  // (b) Chain with no cycle accepted
  const chainGraph = {
    nodes: [
      { node_key: "01.1", phase: "01", title: "Task 1" },
      { node_key: "01.2", phase: "01", title: "Task 2" },
      { node_key: "01.3", phase: "01", title: "Task 3" },
    ],
    edges: acyclicEdges,
  };
  const resChain = GraphSchema.safeParse(chainGraph);
  assert("Chain graph with no cycle is accepted", resChain.success === true);

  // (c) Cycle made only of non-DEPENDS_ON edge types accepted
  const nonDependsOnCycleGraph = {
    nodes: [
      { node_key: "01.1", phase: "01", title: "Task 1" },
      { node_key: "01.2", phase: "01", title: "Task 2" },
    ],
    edges: [
      { from_node: "01.1", to_node: "01.2", type: "TESTS" },
      { from_node: "01.2", to_node: "01.1", type: "TESTS" },
    ],
  };
  const resNonDependsOn = GraphSchema.safeParse(nonDependsOnCycleGraph);
  assert(
    "Cycle made only of non-DEPENDS_ON edge types is accepted",
    resNonDependsOn.success === true,
  );

  // (d) Self-edge written as node key to same node's id rejected
  const selfEdgeKeyToIdGraph = {
    nodes: [
      { node_key: "01.1", phase: "01", title: "Task 1", id: VALID_UUID_1 },
    ],
    edges: [{ from_node: "01.1", to_node: VALID_UUID_1, type: "DEPENDS_ON" }],
  };
  const resSelfEdgeKeyToId = GraphSchema.safeParse(selfEdgeKeyToIdGraph);
  assert(
    "Self-edge written as node key to same node id rejected by superRefine",
    resSelfEdgeKeyToId.success === false &&
      resSelfEdgeKeyToId.error.issues.some((i) =>
        i.message.includes("Self-edge is not allowed"),
      ),
  );

  // Direct checkGraphIntegrity unit test with options
  let integrityCustomIssue = false;
  const dummyCtx = {
    addIssue: (issue: { message: string }) => {
      if (issue.message.includes("is missing required requirement_key")) {
        integrityCustomIssue = true;
      }
    },
  };
  checkGraphIntegrity(
    {
      nodes: [{ node_key: "01.1" }],
      edges: [],
    },
    dummyCtx as never,
    { requireRequirementKey: true },
  );
  assert(
    "checkGraphIntegrity standalone unit test flags missing requirement_key",
    integrityCustomIssue,
  );

  // ---------------------------------------------------------------------------
  // 6. REQUIREMENT COVERAGE, PRECEDENCE, CONSISTENCY & PHASE SORTING (B1 - B4)
  // ---------------------------------------------------------------------------
  console.log(
    "6. Testing Requirement Coverage, Precedence, Consistency & Phase Sorting...",
  );

  // B1: findUncoveredRequirements helper
  const uncovered1 = findUncoveredRequirements(
    ["REQ-1", "REQ-2", "REQ-3"],
    [{ requirement_key: "REQ-1" }, { requirement_key: "REQ-2" }],
  );
  assert(
    "findUncoveredRequirements returns uncovered key REQ-3",
    uncovered1.length === 1 && uncovered1[0] === "REQ-3",
  );

  const uncoveredNone = findUncoveredRequirements(
    ["REQ-1", "REQ-2"],
    [
      { requirement_key: "REQ-1" },
      { requirement_key: "REQ-2" },
      { requirement_key: "REQ-1" },
    ],
  );
  assert(
    "findUncoveredRequirements returns empty array when all covered",
    uncoveredNone.length === 0,
  );

  // B1: requireFullCoverage option in checkGraphIntegrity
  const coverageIssues: Array<{ message: string; path: (string | number)[] }> =
    [];
  const coverageCtx = {
    addIssue: (issue: { message: string; path: (string | number)[] }) => {
      coverageIssues.push(issue);
    },
  };

  // Valid full coverage
  coverageIssues.length = 0;
  checkGraphIntegrity(
    {
      requirements: [{ key: "REQ-1" }, { key: "REQ-2" }],
      nodes: [
        { node_key: "01.1", requirement_key: "REQ-1" },
        { node_key: "01.2", requirement_key: "REQ-2" },
      ],
      edges: [],
    },
    coverageCtx as never,
    { requireFullCoverage: true },
  );
  assert(
    "requireFullCoverage: true passes when all requirements covered",
    coverageIssues.length === 0,
  );

  // Invalid coverage with input.requirements: path ["requirements", index]
  coverageIssues.length = 0;
  checkGraphIntegrity(
    {
      requirements: [{ key: "REQ-1" }, { key: "REQ-2" }, { key: "REQ-3" }],
      nodes: [
        { node_key: "01.1", requirement_key: "REQ-1" },
        { node_key: "01.2", requirement_key: "REQ-2" },
      ],
      edges: [],
    },
    coverageCtx as never,
    { requireFullCoverage: true },
  );
  assert(
    "requireFullCoverage: true flags uncovered REQ-3 at path ['requirements', 2]",
    coverageIssues.some(
      (i) =>
        i.message === "Requirement REQ-3 is not covered by any node" &&
        i.path[0] === "requirements" &&
        i.path[1] === 2,
    ),
  );

  // Invalid coverage without input.requirements (e.g. knownRequirementKeys): path ["nodes"]
  coverageIssues.length = 0;
  checkGraphIntegrity(
    {
      nodes: [{ node_key: "01.1", requirement_key: "REQ-1" }],
      edges: [],
    },
    coverageCtx as never,
    { knownRequirementKeys: ["REQ-1", "REQ-2"], requireFullCoverage: true },
  );
  assert(
    "requireFullCoverage: true flags uncovered REQ-2 at path ['nodes'] when input.requirements absent",
    coverageIssues.some(
      (i) =>
        i.message === "Requirement REQ-2 is not covered by any node" &&
        i.path.length === 1 &&
        i.path[0] === "nodes",
    ),
  );

  // Default requireFullCoverage is false: GraphSchema doesn't reject uncovered
  const partialCoverageGraph = {
    requirements: [
      { key: "REQ-1", title: "Req 1" },
      { key: "REQ-2", title: "Req 2" },
    ],
    nodes: [
      {
        node_key: "01.1",
        phase: "01",
        title: "Task 1",
        requirement_key: "REQ-1",
      },
    ],
    edges: [],
  };
  const resPartial = GraphSchema.safeParse(partialCoverageGraph);
  assert(
    "Default GraphSchema does not require full coverage",
    resPartial.success === true,
  );

  // B2: Known keys precedence
  const precedenceIssues: Array<{ message: string }> = [];
  const precedenceCtx = {
    addIssue: (issue: { message: string }) => {
      precedenceIssues.push(issue);
    },
  };
  checkGraphIntegrity(
    {
      requirements: [{ key: "REQ-FROM-GRAPH" }],
      nodes: [
        { node_key: "01.1", requirement_key: "REQ-FROM-KNOWN" },
        { node_key: "01.2", requirement_key: "REQ-FROM-GRAPH" },
      ],
      edges: [],
    },
    precedenceCtx as never,
    { knownRequirementKeys: ["REQ-FROM-KNOWN"] },
  );
  assert(
    "knownRequirementKeys takes precedence over input.requirements",
    precedenceIssues.some((m) =>
      m.message.includes("references unknown requirement_key REQ-FROM-GRAPH"),
    ) && !precedenceIssues.some((m) => m.message.includes("REQ-FROM-KNOWN")),
  );

  // B3: requirement_id vs requirement_key consistency
  const consistencyIssues: Array<{ message: string }> = [];
  const consistencyCtx = {
    addIssue: (issue: { message: string }) => {
      consistencyIssues.push(issue);
    },
  };

  // Valid consistency
  consistencyIssues.length = 0;
  checkGraphIntegrity(
    {
      requirements: [{ id: VALID_UUID_1, key: "REQ-1" }],
      nodes: [
        {
          node_key: "01.1",
          requirement_id: VALID_UUID_1,
          requirement_key: "REQ-1",
        },
      ],
      edges: [],
    },
    consistencyCtx as never,
  );
  assert(
    "Consistent requirement_id and requirement_key accepted",
    consistencyIssues.length === 0,
  );

  // Inconsistent requirement_id vs requirement_key
  consistencyIssues.length = 0;
  checkGraphIntegrity(
    {
      requirements: [{ id: VALID_UUID_1, key: "REQ-1" }],
      nodes: [
        {
          node_key: "01.1",
          requirement_id: VALID_UUID_1,
          requirement_key: "REQ-MISMATCH",
        },
      ],
      edges: [],
    },
    consistencyCtx as never,
  );
  assert(
    "Inconsistent requirement_id vs requirement_key rejected",
    consistencyIssues.some(
      (m) =>
        m.message.includes('does not match requirement_key "REQ-MISMATCH"') &&
        m.message.includes(VALID_UUID_1),
    ),
  );

  // Node requirement_id not present in requirements: consistency check skips
  consistencyIssues.length = 0;
  checkGraphIntegrity(
    {
      requirements: [{ id: VALID_UUID_1, key: "REQ-1" }],
      nodes: [
        {
          node_key: "01.1",
          requirement_id: VALID_UUID_2,
          requirement_key: "REQ-1",
        },
      ],
      edges: [],
    },
    consistencyCtx as never,
  );
  assert(
    "requirement_id not found in requirements does not trigger consistency issue",
    consistencyIssues.length === 0,
  );

  // B4: sortNodesByPhase helper
  const unorderedNodes = [
    { node_key: "n4", phase: "Phase 10", originalOrder: 1 },
    { node_key: "n2", phase: "Phase 2", originalOrder: 2 },
    { node_key: "n1", phase: "Phase 1", originalOrder: 3 },
    { node_key: "n3", phase: "Phase 2", originalOrder: 4 },
  ];
  const sorted = sortNodesByPhase(unorderedNodes);
  assert(
    "sortNodesByPhase sorts numerically: Phase 1, Phase 2, Phase 2, Phase 10",
    sorted[0].phase === "Phase 1" &&
      sorted[1].phase === "Phase 2" &&
      sorted[2].phase === "Phase 2" &&
      sorted[3].phase === "Phase 10",
  );
  assert(
    "sortNodesByPhase is stable (tie-broken by original index)",
    sorted[1].originalOrder === 2 && sorted[2].originalOrder === 4,
  );
  assert(
    "sortNodesByPhase does not mutate original array",
    unorderedNodes[0].node_key === "n4",
  );

  // Schema does NOT reject unordered phases
  const unorderedGraph = {
    nodes: [
      { node_key: "02.1", phase: "02", title: "Later phase" },
      { node_key: "01.1", phase: "01", title: "Earlier phase" },
    ],
    edges: [],
  };
  const resUnordered = GraphSchema.safeParse(unorderedGraph);
  assert(
    "GraphSchema does not reject unordered phases",
    resUnordered.success === true,
  );

  // B5: requirementKeyOptionalForTypes
  const optionalTypesIssues: Array<{
    message: string;
    path?: (string | number)[];
  }> = [];
  const optionalTypesCtx = {
    addIssue: (issue: { message: string; path?: (string | number)[] }) => {
      optionalTypesIssues.push(issue);
    },
  };

  checkGraphIntegrity(
    {
      requirements: [{ key: "REQ-1" }],
      nodes: [
        { node_key: "01.1", type: "setup", requirement_key: null },
        { node_key: "02.1", type: "testing", requirement_key: undefined },
        { node_key: "03.1", type: "deployment", requirement_key: "" },
        { node_key: "04.1", type: "backend", requirement_key: "REQ-1" },
      ],
      edges: [],
    },
    optionalTypesCtx as never,
    {
      requireRequirementKey: true,
      requirementKeyOptionalForTypes: ["setup", "testing", "deployment"],
    },
  );
  assert(
    "requirementKeyOptionalForTypes allows setup/testing/deployment nodes without requirement_key",
    optionalTypesIssues.length === 0,
  );

  // Rejects backend/frontend nodes missing requirement_key
  optionalTypesIssues.length = 0;
  checkGraphIntegrity(
    {
      requirements: [{ key: "REQ-1" }],
      nodes: [
        { node_key: "01.1", type: "setup", requirement_key: null },
        { node_key: "02.1", type: "backend", requirement_key: null },
        { node_key: "03.1", type: "frontend", requirement_key: undefined },
      ],
      edges: [],
    },
    optionalTypesCtx as never,
    {
      requireRequirementKey: true,
      requirementKeyOptionalForTypes: ["setup", "testing", "deployment"],
    },
  );
  assert(
    "requirementKeyOptionalForTypes still flags backend/frontend missing requirement_key",
    optionalTypesIssues.some((m) =>
      m.message.includes("Node 02.1 is missing required requirement_key"),
    ) &&
      optionalTypesIssues.some((m) =>
        m.message.includes("Node 03.1 is missing required requirement_key"),
      ),
  );

  // Case-insensitivity check
  optionalTypesIssues.length = 0;
  checkGraphIntegrity(
    {
      requirements: [{ key: "REQ-1" }],
      nodes: [
        { node_key: "01.1", type: "SETUP", requirement_key: null },
        { node_key: "02.1", type: "Testing", requirement_key: null },
      ],
      edges: [],
    },
    optionalTypesCtx as never,
    {
      requireRequirementKey: true,
      requirementKeyOptionalForTypes: ["setup", "testing"],
    },
  );
  assert(
    "requirementKeyOptionalForTypes matches case-insensitively",
    optionalTypesIssues.length === 0,
  );

  // ---------------------------------------------------------------------------
  // 12. Testing analyzeGraphShape
  // ---------------------------------------------------------------------------
  console.log("12. Testing analyzeGraphShape...");

  // Strict chain
  const chainNodes = [
    { node_key: "01.1" },
    { node_key: "02.1" },
    { node_key: "03.1" },
  ];
  const chainEdges = [
    { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
    { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" },
  ];
  const chainShape = analyzeGraphShape(chainNodes, chainEdges);
  assert(
    "analyzeGraphShape on strict chain: isStrictChain is true",
    chainShape.isStrictChain === true &&
      chainShape.longestPathLength === 3 &&
      chainShape.maxParallelWidth === 1 &&
      chainShape.multiPrereqNodes === 0,
  );

  // Diamond: setup (A), B and C depend on setup, D depends on B and C
  const diamondNodes = [
    { node_key: "setup" },
    { node_key: "B" },
    { node_key: "C" },
    { node_key: "D" },
  ];
  const diamondEdges = [
    { from_node: "B", to_node: "setup", type: "DEPENDS_ON" },
    { from_node: "C", to_node: "setup", type: "DEPENDS_ON" },
    { from_node: "D", to_node: "B", type: "DEPENDS_ON" },
    { from_node: "D", to_node: "C", type: "DEPENDS_ON" },
  ];
  const diamondShape = analyzeGraphShape(diamondNodes, diamondEdges);
  assert(
    "analyzeGraphShape on diamond: multiPrereqNodes 1, maxParallelWidth 2",
    diamondShape.multiPrereqNodes === 1 &&
      diamondShape.maxParallelWidth === 2 &&
      diamondShape.isStrictChain === false &&
      diamondShape.longestPathLength === 3,
  );

  // Empty edge list
  const emptyEdgeNodes = [{ node_key: "01.1" }, { node_key: "01.2" }];
  const emptyEdgesShape = analyzeGraphShape(emptyEdgeNodes, []);
  assert(
    "analyzeGraphShape on empty edge list: handles correctly without error",
    emptyEdgesShape.edgeCount === 0 &&
      emptyEdgesShape.dependsOnEdgeCount === 0 &&
      emptyEdgesShape.roots.length === 2 &&
      emptyEdgesShape.multiPrereqNodes === 0 &&
      emptyEdgesShape.maxPrereqs === 0 &&
      emptyEdgesShape.longestPathLength === 1 &&
      emptyEdgesShape.maxParallelWidth === 2 &&
      emptyEdgesShape.isStrictChain === true,
  );

  // Edge with an unknown endpoint (no throw)
  try {
    const unknownEndpointShape = analyzeGraphShape(
      [{ node_key: "01.1" }],
      [{ from_node: "01.1", to_node: "UNKNOWN_NODE", type: "DEPENDS_ON" }],
    );
    assert(
      "analyzeGraphShape on edge with unknown endpoint does not throw and handles gracefully",
      unknownEndpointShape.nodeCount === 1 &&
        unknownEndpointShape.roots.includes("01.1") &&
        unknownEndpointShape.multiPrereqNodes === 0,
    );
  } catch {
    assert(
      "analyzeGraphShape on edge with unknown endpoint threw an error",
      false,
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
