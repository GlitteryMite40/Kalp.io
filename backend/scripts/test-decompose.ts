/**
 * Test Suite for Task 03.5: Decompose to nodes (backend/src/server/decompose.ts)
 *
 * Verifies:
 * 1. Empty and invalid inputs error cases
 * 2. 5 sample ideas:
 *    - Starts with setup phase (Phase "01", type "setup")
 *    - Acceptance criteria: Every node has a parent and a requirement
 *    - Every node links to a requirement
 *    - Full requirement coverage
 *    - Graph schema validity (no cycles, self-edges, duplicate edges, valid endpoints)
 *    - Graph shape analysis (roots, path length, parallelism)
 * 3. Project ID propagation
 * 4. Flexible calling signatures (object vs 2-argument)
 * 5. Aliases (decompose, decomposeFeatures, decomposePlan)
 * 6. Optional live Gemini API execution when --live is passed
 */

import {
  decomposeToNodes,
  decompose,
  decomposeFeatures,
  decomposePlan,
  type DecomposeJsonGenerator,
  type DecomposedGraph,
} from "../src/server/decompose";
import { GraphSchema } from "../src/lib/schema";
import { BadRequestError } from "../src/lib/errors";
import { type DecomposeOutput } from "../src/server/prompts/decompose";

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
// 5 Sample Ideas Fixtures
// ---------------------------------------------------------------------------
const SAMPLE_IDEAS = [
  // 1. Habit Tracker
  {
    name: "Habit Tracker for College Students",
    requirements: [
      {
        key: "REQ-1",
        title: "User Auth & Profile",
        id: "10000000-0000-4000-8000-000000000001",
      },
      {
        key: "REQ-2",
        title: "Habit Tracking & Streaks",
        id: "10000000-0000-4000-8000-000000000002",
      },
      {
        key: "REQ-3",
        title: "Study Group Accountability",
        id: "10000000-0000-4000-8000-000000000003",
      },
    ],
    architecture: {
      stack: {
        frontend: "Next.js",
        backend: "Next.js API",
        database: "Supabase",
      },
      modules: [
        { name: "Auth Module", requirement_keys: ["REQ-1"] },
        { name: "Habits Module", requirement_keys: ["REQ-2"] },
        { name: "Social Module", requirement_keys: ["REQ-3"] },
      ],
    },
    mockOutput: {
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "Project Scaffolding & Setup",
          type: "setup",
          status: "not_started",
          requirement_key: null,
          files: ["package.json"],
          explanation: "Initial workspace scaffolding.",
        },
        {
          node_key: "02.1",
          phase: "02",
          title: "User Auth & Supabase Schema",
          type: "database",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["src/lib/db.ts"],
          explanation: "Sets up user tables.",
        },
        {
          node_key: "02.2",
          phase: "02",
          title: "Habit Data Models",
          type: "database",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/lib/habits.ts"],
          explanation: "Habit schema and migrations.",
        },
        {
          node_key: "03.1",
          phase: "03",
          title: "Habit UI & Streak Counter",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/app/habits/page.tsx"],
          explanation: "Renders habits with streak counter.",
        },
        {
          node_key: "03.2",
          phase: "03",
          title: "Study Circle Group Sharing",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-3",
          files: ["src/app/groups/page.tsx"],
          explanation: "Group social sharing screen.",
        },
        {
          node_key: "04.1",
          phase: "04",
          title: "End-to-End Habit Flow Tests",
          type: "testing",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["tests/habits.spec.ts"],
          explanation: "Validates habit tracking flow.",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.2", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.2", type: "DEPENDS_ON" },
      ],
    },
  },
  // 2. AI Recipe Planner
  {
    name: "AI Recipe Planner & Smart Pantry",
    requirements: [
      {
        key: "REQ-1",
        title: "Pantry Inventory",
        id: "20000000-0000-4000-8000-000000000001",
      },
      {
        key: "REQ-2",
        title: "AI Recipe Generator",
        id: "20000000-0000-4000-8000-000000000002",
      },
      {
        key: "REQ-3",
        title: "Grocery Checklist",
        id: "20000000-0000-4000-8000-000000000003",
      },
    ],
    architecture: {
      stack: { frontend: "React", backend: "FastAPI", database: "PostgreSQL" },
      modules: [{ name: "Pantry" }, { name: "RecipeEngine" }],
    },
    mockOutput: {
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "FastAPI and React Monorepo Setup",
          type: "setup",
          status: "not_started",
          requirement_key: null,
          files: ["docker-compose.yml"],
          explanation: "Configures full-stack monorepo.",
        },
        {
          node_key: "02.1",
          phase: "02",
          title: "Pantry Database Schema",
          type: "database",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["alembic/versions/001.py"],
          explanation: "Creates pantry tables.",
        },
        {
          node_key: "02.2",
          phase: "02",
          title: "Gemini Recipe Client Service",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["app/services/llm.py"],
          explanation: "Gemini integration service.",
        },
        {
          node_key: "03.1",
          phase: "03",
          title: "Interactive Pantry Grid View",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["src/components/PantryGrid.tsx"],
          explanation: "Renders pantry inventory.",
        },
        {
          node_key: "03.2",
          phase: "03",
          title: "Smart Grocery Shopping Cart",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-3",
          files: ["src/components/ShoppingList.tsx"],
          explanation: "Displays missing ingredients.",
        },
        {
          node_key: "04.1",
          phase: "04",
          title: "Recipe Pipeline Integration Tests",
          type: "testing",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["tests/test_recipe.py"],
          explanation: "Tests recipe generation with pantry data.",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "02.2", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.2", type: "DEPENDS_ON" },
      ],
    },
  },
  // 3. Developer Kubernetes CLI Dashboard
  {
    name: "Developer Kubernetes CLI Dashboard",
    requirements: [
      {
        key: "REQ-1",
        title: "Kubeconfig Context Discovery",
        id: "30000000-0000-4000-8000-000000000001",
      },
      {
        key: "REQ-2",
        title: "Pod Monitoring & Metrics",
        id: "30000000-0000-4000-8000-000000000002",
      },
      {
        key: "REQ-3",
        title: "Container Log Streaming",
        id: "30000000-0000-4000-8000-000000000003",
      },
    ],
    architecture: {
      stack: {
        frontend: "Bubbletea TUI",
        backend: "Go 1.22",
        database: "Local Cache",
      },
      modules: [{ name: "Discovery" }, { name: "Watcher" }],
    },
    mockOutput: {
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "Go Module & CLI Scaffolding",
          type: "setup",
          status: "not_started",
          requirement_key: null,
          files: ["go.mod", "main.go"],
          explanation: "Initializes Go CLI application.",
        },
        {
          node_key: "02.1",
          phase: "02",
          title: "K8s Client & Context Discovery",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["pkg/k8s/client.go"],
          explanation: "Loads cluster kubeconfig.",
        },
        {
          node_key: "02.2",
          phase: "02",
          title: "Pod Informer & Metrics Poller",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["pkg/k8s/informer.go"],
          explanation: "Watches pod events and resource metrics.",
        },
        {
          node_key: "03.1",
          phase: "03",
          title: "Live Container Log Streamer",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-3",
          files: ["pkg/k8s/logs.go"],
          explanation: "Streams logs from active pod containers.",
        },
        {
          node_key: "03.2",
          phase: "03",
          title: "Bubbletea TUI Dashboard Layout",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["pkg/tui/app.go"],
          explanation: "Interactive terminal UI dashboard.",
        },
        {
          node_key: "04.1",
          phase: "04",
          title: "CLI Binary Packaging & Smoke Tests",
          type: "deployment",
          status: "not_started",
          requirement_key: null,
          files: ["Makefile", "goreleaser.yml"],
          explanation: "Cross-compiles binary distributions.",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "02.2", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "03.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.2", type: "DEPENDS_ON" },
      ],
    },
  },
  // 4. E-Commerce Multi-Vendor Marketplace
  {
    name: "E-Commerce Multi-Vendor Marketplace",
    requirements: [
      {
        key: "REQ-1",
        title: "Vendor Storefront & Catalog",
        id: "40000000-0000-4000-8000-000000000001",
      },
      {
        key: "REQ-2",
        title: "Shopping Cart & Checkout",
        id: "40000000-0000-4000-8000-000000000002",
      },
      {
        key: "REQ-3",
        title: "Stripe Split Payments",
        id: "40000000-0000-4000-8000-000000000003",
      },
    ],
    architecture: {
      stack: {
        frontend: "Next.js",
        backend: "Next.js API",
        database: "PostgreSQL",
      },
      modules: [{ name: "Catalog" }, { name: "Payments" }],
    },
    mockOutput: {
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "Marketplace Monorepo & DB Setup",
          type: "setup",
          status: "not_started",
          requirement_key: null,
          files: ["package.json", "prisma/schema.prisma"],
          explanation: "Sets up marketplace database and dependencies.",
        },
        {
          node_key: "02.1",
          phase: "02",
          title: "Vendor Product Catalog Tables",
          type: "database",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["prisma/migrations/001_catalog.sql"],
          explanation: "Product schema with vendor ownership.",
        },
        {
          node_key: "02.2",
          phase: "02",
          title: "Cart & Order Management API",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/app/api/cart/route.ts"],
          explanation: "Session-based cart and order endpoints.",
        },
        {
          node_key: "03.1",
          phase: "03",
          title: "Stripe Connect Payment Webhooks",
          type: "integration",
          status: "not_started",
          requirement_key: "REQ-3",
          files: ["src/app/api/webhooks/stripe/route.ts"],
          explanation: "Processes marketplace payouts.",
        },
        {
          node_key: "03.2",
          phase: "03",
          title: "Product Browsing & Checkout UI",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/app/checkout/page.tsx"],
          explanation: "Customer shopping cart and payment screen.",
        },
        {
          node_key: "04.1",
          phase: "04",
          title: "Marketplace Checkout E2E Tests",
          type: "testing",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["cypress/e2e/checkout.cy.ts"],
          explanation: "E2E checkout and payment test suite.",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.2", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "03.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.2", type: "DEPENDS_ON" },
      ],
    },
  },
  // 5. Telehealth Patient Video Consultation Platform
  {
    name: "Telehealth Patient Video Consultation Platform",
    requirements: [
      {
        key: "REQ-1",
        title: "Patient & Doctor Appointments",
        id: "50000000-0000-4000-8000-000000000001",
      },
      {
        key: "REQ-2",
        title: "WebRTC Video Consultation Room",
        id: "50000000-0000-4000-8000-000000000002",
      },
      {
        key: "REQ-3",
        title: "E-Prescription & Medical Records",
        id: "50000000-0000-4000-8000-000000000003",
      },
    ],
    architecture: {
      stack: {
        frontend: "Next.js",
        backend: "Node.js WebSocket",
        database: "Postgres",
      },
      modules: [{ name: "Appointment" }, { name: "WebRTC" }],
    },
    mockOutput: {
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "HIPAA-Compliant Workspace Scaffolding",
          type: "setup",
          status: "not_started",
          requirement_key: null,
          files: ["package.json", ".env.example"],
          explanation: "Workspace setup with security headers.",
        },
        {
          node_key: "02.1",
          phase: "02",
          title: "Appointment Booking Service",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["src/server/appointments.ts"],
          explanation: "Doctor schedule management and slot booking.",
        },
        {
          node_key: "02.2",
          phase: "02",
          title: "WebRTC Signaling Server",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/server/webrtc.ts"],
          explanation: "WebSocket signaling for peer connection.",
        },
        {
          node_key: "03.1",
          phase: "03",
          title: "Doctor-Patient Video Room UI",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/app/consultation/[id]/page.tsx"],
          explanation: "Secure video streaming interface.",
        },
        {
          node_key: "03.2",
          phase: "03",
          title: "Encrypted Medical Records & Prescriptions",
          type: "database",
          status: "not_started",
          requirement_key: "REQ-3",
          files: ["src/lib/records.ts"],
          explanation: "E-prescription generation and document vault.",
        },
        {
          node_key: "04.1",
          phase: "04",
          title: "Video Call Quality & Security Verification",
          type: "testing",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["tests/webrtc.test.ts"],
          explanation: "Verifies peer connectivity and audio/video sync.",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.2", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.1", type: "DEPENDS_ON" },
      ],
    },
  },
];

async function runTests() {
  console.log("=== RUNNING TASK 03.5 DECOMPOSE TO NODES TEST SUITE ===\n");

  // =========================================================================
  // Part 1: Empty and Invalid Input Error Cases
  // =========================================================================
  console.log("--- Part 1: Empty and Invalid Input Error Cases ---");

  // 1.1 Empty requirements array
  try {
    await decomposeToNodes([], { stack: {} });
    check("Empty requirements array throws error", false);
  } catch (err) {
    check(
      "Empty requirements array throws BadRequestError",
      err instanceof BadRequestError &&
        err.message.includes("Requirements cannot be empty"),
    );
  }

  // 1.2 Missing architecture
  try {
    await decomposeToNodes(SAMPLE_IDEAS[0].requirements, null);
    check("Missing architecture throws error", false);
  } catch (err) {
    check(
      "Missing architecture throws BadRequestError",
      err instanceof BadRequestError &&
        err.message.includes("Architecture must be provided"),
    );
  }

  // 1.3 Invalid requirement item
  try {
    await decomposeToNodes(
      [
        { key: "", title: "Valid" } as unknown as {
          key: string;
          title: string;
        },
      ],
      { stack: {} },
    );
    check("Empty requirement key throws error", false);
  } catch (err) {
    check(
      "Empty requirement key throws BadRequestError",
      err instanceof BadRequestError &&
        err.message.includes("must have non-empty key and title"),
    );
  }

  // 1.4 Invalid project_id format
  try {
    await decomposeToNodes(
      SAMPLE_IDEAS[0].requirements,
      SAMPLE_IDEAS[0].architecture,
      { projectId: "not-a-valid-uuid" },
    );
    check("Invalid projectId throws error", false);
  } catch (err) {
    check(
      "Invalid projectId throws BadRequestError",
      err instanceof BadRequestError &&
        err.message.includes("must be a valid UUID"),
    );
  }

  // =========================================================================
  // Part 2: 5 Sample Ideas (Decompose to Nodes)
  // =========================================================================
  console.log("\n--- Part 2: 5 Sample Ideas Decompose Verification ---");

  for (let idx = 0; idx < SAMPLE_IDEAS.length; idx++) {
    const sample = SAMPLE_IDEAS[idx];
    console.log(`\nTesting Sample Idea ${idx + 1}: ${sample.name}`);

    const mockGenerator: DecomposeJsonGenerator = async () => ({
      data: sample.mockOutput as DecomposeOutput,
      model: "gemini-2.5-flash-mock",
    });

    const result: DecomposedGraph = await decomposeToNodes(
      sample.requirements,
      sample.architecture,
      { generator: mockGenerator },
    );

    // Check 1: Nodes returned and non-empty
    check(
      `Sample ${idx + 1}: nodes returned (${result.nodes.length} nodes)`,
      Array.isArray(result.nodes) && result.nodes.length >= 6,
    );

    // Check 2: Starts with setup phase (Phase "01", type "setup")
    const firstNode = result.nodes[0];
    check(
      `Sample ${idx + 1}: starts with setup phase (${firstNode.phase} ${firstNode.type})`,
      firstNode.phase === "01" && firstNode.type === "setup",
    );

    // Check 3: ACCEPTANCE CRITERIA: Every node links to a requirement
    const allHaveRequirement = result.nodes.every(
      (n) =>
        typeof n.requirement_key === "string" &&
        n.requirement_key.trim().length > 0,
    );
    check(
      `Sample ${idx + 1}: ACCEPTANCE CRITERIA - Every node links to a requirement`,
      allHaveRequirement,
    );

    // Check 4: ACCEPTANCE CRITERIA: Every node (outside root setup) has a parent
    // In Kalp.io DEPENDS_ON: from_node DEPENDS ON to_node (to_node is the prerequisite/parent)
    const nonRootNodes = result.nodes.slice(1);
    const allNonRootHaveParent = nonRootNodes.every((n) => {
      const parents = result.parentsMap[n.node_key];
      return Array.isArray(parents) && parents.length > 0;
    });
    check(
      `Sample ${idx + 1}: ACCEPTANCE CRITERIA - Every node has a parent`,
      allNonRootHaveParent,
    );

    // Check 5: Every node and edge has valid UUID id
    const allNodesHaveUuid = result.nodes.every(
      (n) =>
        typeof n.id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          n.id,
        ),
    );
    const allEdgesHaveUuid = result.edges.every(
      (e) =>
        typeof e.id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          e.id,
        ),
    );
    check(
      `Sample ${idx + 1}: all nodes and edges have valid UUID IDs`,
      allNodesHaveUuid && allEdgesHaveUuid,
    );

    // Check 6: Requirement IDs properly mapped from input requirements
    const reqIdMap = new Map(sample.requirements.map((r) => [r.key, r.id]));
    const requirementIdsConsistent = result.nodes.every((n) => {
      if (!n.requirement_key) return true;
      const expectedId = reqIdMap.get(n.requirement_key);
      return !expectedId || n.requirement_id === expectedId;
    });
    check(
      `Sample ${idx + 1}: requirement_id consistently matches requirement_key`,
      requirementIdsConsistent,
    );

    // Check 7: Full requirement coverage
    const coveredReqKeys = new Set(
      result.nodes.map((n) => n.requirement_key).filter(Boolean),
    );
    const allReqsCovered = sample.requirements.every((r) =>
      coveredReqKeys.has(r.key),
    );
    check(
      `Sample ${idx + 1}: 100% of input requirements covered by graph nodes`,
      allReqsCovered,
    );

    // Check 8: GraphSchema validation passes cleanly (no cycles, no duplicate edges, no invalid endpoints)
    const graphValidation = GraphSchema.safeParse({
      requirements: sample.requirements,
      nodes: result.nodes,
      edges: result.edges,
    });
    check(
      `Sample ${idx + 1}: full graph passes GraphSchema superRefine integrity checks`,
      graphValidation.success,
    );

    // Check 9: Graph shape analysis
    check(
      `Sample ${idx + 1}: shape analysis reports single root setup node`,
      result.shape.roots.length === 1 &&
        result.shape.roots[0] === firstNode.node_key,
    );
    check(
      `Sample ${idx + 1}: shape analysis reports valid path length (> 1)`,
      result.shape.longestPathLength >= 2,
    );
  }

  // =========================================================================
  // Part 3: Project ID Propagation & Flexible Signatures
  // =========================================================================
  console.log("\n--- Part 3: Project ID & Calling Signatures ---");

  const testProjectId = "b0000000-0000-4000-8000-000000000001";
  const sample1 = SAMPLE_IDEAS[0];

  // 3.1 Via options.projectId
  const resWithOptionProj = await decomposeToNodes(
    sample1.requirements,
    sample1.architecture,
    {
      projectId: testProjectId,
      generator: async () => ({
        data: sample1.mockOutput as DecomposeOutput,
        model: "mock-model",
      }),
    },
  );
  check(
    "options.projectId attaches project_id to all nodes and edges",
    resWithOptionProj.nodes.every((n) => n.project_id === testProjectId) &&
      resWithOptionProj.edges.every((e) => e.project_id === testProjectId),
  );

  // 3.2 Via single input object { requirements, architecture, projectId }
  const resWithObjectInput = await decomposeToNodes(
    {
      requirements: sample1.requirements,
      architecture: sample1.architecture,
      projectId: testProjectId,
    },
    undefined,
    {
      generator: async () => ({
        data: sample1.mockOutput as DecomposeOutput,
        model: "mock-model",
      }),
    },
  );
  check(
    "single input object attaches project_id and decomposes correctly",
    resWithObjectInput.nodes.length === sample1.mockOutput.nodes.length &&
      resWithObjectInput.nodes.every((n) => n.project_id === testProjectId),
  );

  // 3.3 Auto-healing orphan node in later phase
  const mockWithOrphanLaterNode = {
    nodes: [
      {
        node_key: "01.1",
        phase: "01",
        title: "Setup",
        type: "setup",
        status: "not_started",
        files: [],
        explanation: "Setup.",
      },
      {
        node_key: "02.1",
        phase: "02",
        title: "Backend API",
        type: "backend",
        status: "not_started",
        files: [],
        explanation: "Backend API.",
      },
    ],
    edges: [], // 02.1 has no edge
  };

  const resAutoHealed = await decomposeToNodes(
    sample1.requirements,
    sample1.architecture,
    {
      generator: async () => ({
        data: mockWithOrphanLaterNode as unknown as DecomposeOutput,
        model: "mock-model",
      }),
    },
  );

  check(
    "Auto-heals node lacking parent by attaching DEPENDS_ON to root setup",
    resAutoHealed.parentsMap["02.1"]?.includes("01.1") &&
      resAutoHealed.edges.some(
        (e) =>
          e.from_node === "02.1" &&
          e.to_node === "01.1" &&
          e.type === "DEPENDS_ON",
      ),
  );

  // 3.4 Function Aliases
  const resAlias1 = await decompose(
    sample1.requirements,
    sample1.architecture,
    {
      generator: async () => ({
        data: sample1.mockOutput as DecomposeOutput,
        model: "mock-model",
      }),
    },
  );
  const resAlias2 = await decomposeFeatures(
    sample1.requirements,
    sample1.architecture,
    {
      generator: async () => ({
        data: sample1.mockOutput as DecomposeOutput,
        model: "mock-model",
      }),
    },
  );
  const resAlias3 = await decomposePlan(
    sample1.requirements,
    sample1.architecture,
    {
      generator: async () => ({
        data: sample1.mockOutput as DecomposeOutput,
        model: "mock-model",
      }),
    },
  );

  check(
    "Alias `decompose` works",
    resAlias1.nodes.length === sample1.mockOutput.nodes.length,
  );
  check(
    "Alias `decomposeFeatures` works",
    resAlias2.nodes.length === sample1.mockOutput.nodes.length,
  );
  check(
    "Alias `decomposePlan` works",
    resAlias3.nodes.length === sample1.mockOutput.nodes.length,
  );

  // =========================================================================
  // Part 4: Optional Live Gemini LLM Execution
  // =========================================================================
  const isLive = process.argv.includes("--live");
  if (isLive) {
    console.log("\n--- Part 4: Live Gemini LLM Execution ---");
    if (!process.env.LLM_API_KEY) {
      console.warn("  Skipping live test: LLM_API_KEY is not set.");
    } else {
      try {
        console.log(
          "  Running live decomposeToNodes with real Gemini model...",
        );
        const liveRes = await decomposeToNodes(
          sample1.requirements,
          sample1.architecture,
        );
        check(
          "Live decompose: nodes returned",
          Array.isArray(liveRes.nodes) && liveRes.nodes.length >= 10,
        );
        check(
          "Live decompose: starts with setup phase",
          liveRes.nodes[0].phase === "01" && liveRes.nodes[0].type === "setup",
        );
        check(
          "Live decompose: every node links to a requirement",
          liveRes.nodes.every(
            (n) => n.requirement_key && n.requirement_key.length > 0,
          ),
        );
        check(
          "Live decompose: every non-root node has a parent",
          liveRes.nodes.slice(1).every((n) => {
            const parents = liveRes.parentsMap[n.node_key];
            return Array.isArray(parents) && parents.length > 0;
          }),
        );
        console.log(`  Live model: ${liveRes.model}`);
        console.log(`  Live node count: ${liveRes.nodes.length}`);
        console.log(`  Live edge count: ${liveRes.edges.length}`);
      } catch (liveErr) {
        console.error("  Live decompose failed:", liveErr);
        check("Live decompose passed", false, liveErr);
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
    console.log("\nALL DECOMPOSE CHECKS PASSED!");
  }
}

runTests().catch((err) => {
  console.error("Unhandled error in test-decompose:", err);
  process.exit(1);
});
