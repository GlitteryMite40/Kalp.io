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
