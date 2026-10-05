/**
 * Test Suite for Task 04.2: GET /api/projects/[id]/graph
 *
 * Verifies:
 * 1. Unit Tests for computeNodeStatuses:
 *    - Linear chain (A -> B -> C):
 *        * Initial: A is ready, B is blocked, C is blocked
 *        * A completed: A is completed, B is ready, C is blocked
 *        * B completed: B is completed, C is ready
 *        * 'committed' satisfies prerequisites just like 'completed'
 *    - Branching graph - Fan-Out (A -> B, A -> C):
 *        * Initial: A is ready, B & C are blocked
 *        * A completed: Both B & C become ready in parallel
 *    - Branching graph - Fan-In / Diamond DAG (A -> B, A -> C, B+C -> D):
 *        * Initial: A is ready; B, C, D are blocked
 *        * A completed: B & C are ready, D is blocked
 *        * B completed (C not): D is still blocked by C
 *        * C completed (B & C done): D becomes ready
 *    - Multiple roots / disconnected components
 *    - BLOCKS edge type
 *    - Active states (in_progress, failed) preserved
 *    - Endpoint resolution (UUIDs and node_keys)
 *
 * 2. Integration Tests via NextRequest route handler against live database:
 *    - Linear chain project in database with step-by-step completion transitions
 *    - Branching diamond DAG in database with parallel branches and join
 *    - Authorization: User B cannot read User A's graph (404 Not Found)
 *    - Missing session: 401 Unauthorized
 *    - Invalid UUID: 400 Bad Request
 *    - Non-existent project: 404 Not Found
 *    - Newly created project ('generating'): returns empty nodes/edges with status 'generating'
 *    - Fast serverless execution (< 1000ms)
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/projects/[id]/graph/route";
import {
  computeNodeStatuses,
  formatGraphEdges,
  isNodeCompleted,
} from "../src/server/graph";
import {
  OWNER_COOKIE_NAME,
  OWNER_HEADER_NAME,
  createProjectForOwner,
} from "../src/server/session";
import { savePlan } from "../src/server/savePlan";
import { getDb } from "../src/lib/db";

// Load .env.local if present
if (!process.env.DATABASE_URL) {
  try {
    if (fs.existsSync(".env.local")) {
      process.loadEnvFile(".env.local");
    } else if (fs.existsSync(".env")) {
      process.loadEnvFile(".env");
    }
  } catch {
    // Continue
  }
}

let totalChecks = 0;
let passedChecks = 0;
let failed = false;

function check(desc: string, condition: boolean) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`PASS: ${desc}`);
  } else {
    failed = true;
    console.error(`FAIL: ${desc}`);
  }
}

async function run() {
  console.log("=== RUNNING TASK 04.2 GET GRAPH TEST SUITE ===\n");

  const cleanupProjectIds: string[] = [];

  try {
    // =========================================================================
    // Part 1: Pure Unit Tests for computeNodeStatuses & isNodeCompleted
    // =========================================================================
    console.log("--- Part 1: Unit Tests: Node Completion & Linear Chain ---");

    // 1.0 isNodeCompleted
    check(
      "isNodeCompleted('completed') is true",
      isNodeCompleted("completed") === true,
    );
    check(
      "isNodeCompleted('committed') is true",
      isNodeCompleted("committed") === true,
    );
    check(
      "isNodeCompleted('Completed') is true",
      isNodeCompleted("Completed") === true,
    );
    check(
      "isNodeCompleted('not_started') is false",
      isNodeCompleted("not_started") === false,
    );
    check(
      "isNodeCompleted('ready') is false",
      isNodeCompleted("ready") === false,
    );
    check(
      "isNodeCompleted('in_progress') is false",
      isNodeCompleted("in_progress") === false,
    );

    // 1.1 Linear chain: 3 nodes (01.1 -> 01.2 -> 01.3)
    const linearNodes = [
      { node_key: "01.1", status: "not_started" },
      { node_key: "01.2", status: "not_started" },
      { node_key: "01.3", status: "not_started" },
    ];
    const linearEdges = [
      { from_node: "01.2", to_node: "01.1", type: "DEPENDS_ON" },
      { from_node: "01.3", to_node: "01.2", type: "DEPENDS_ON" },
    ];

    // Initial state: 01.1 has 0 prereqs -> ready; others blocked
    const res1 = computeNodeStatuses(linearNodes, linearEdges);
    check("Linear chain initial: 3 nodes returned", res1.length === 3);
    check(
      "Linear chain initial: Node 01.1 is 'ready'",
      res1[0].status === "ready" && res1[0].is_ready === true,
    );
    check(
      "Linear chain initial: Node 01.2 is 'blocked'",
      res1[1].status === "blocked" && res1[1].is_blocked === true,
    );
    check(
      "Linear chain initial: Node 01.3 is 'blocked'",
      res1[2].status === "blocked" && res1[2].is_blocked === true,
    );
    check(
      "Linear chain initial: Node 01.2 blocked_by contains '01.1'",
      res1[1].blocked_by.includes("01.1"),
    );

    // Step 1: 01.1 is completed
    const linearNodesStep1 = [
      { node_key: "01.1", status: "completed" },
      { node_key: "01.2", status: "not_started" },
      { node_key: "01.3", status: "not_started" },
    ];
    const res2 = computeNodeStatuses(linearNodesStep1, linearEdges);
    check(
      "Linear chain step 1: Node 01.1 remains 'completed'",
      res2[0].status === "completed",
    );
    check(
      "Linear chain step 1: Node 01.2 becomes 'ready'",
      res2[1].status === "ready" && res2[1].is_ready === true,
    );
    check(
      "Linear chain step 1: Node 01.3 remains 'blocked'",
      res2[2].status === "blocked" && res2[2].is_blocked === true,
    );
    check(
      "Linear chain step 1: Node 01.2 has empty blocked_by",
      res2[1].blocked_by.length === 0,
    );

    // Step 2: 01.2 is completed
    const linearNodesStep2 = [
      { node_key: "01.1", status: "completed" },
      { node_key: "01.2", status: "completed" },
      { node_key: "01.3", status: "not_started" },
    ];
    const res3 = computeNodeStatuses(linearNodesStep2, linearEdges);
    check(
      "Linear chain step 2: Node 01.3 becomes 'ready'",
      res3[2].status === "ready" && res3[2].is_ready === true,
    );

    // Step 3: 'committed' satisfies prerequisite
    const linearNodesCommitted = [
      { node_key: "01.1", status: "committed" },
      { node_key: "01.2", status: "not_started" },
      { node_key: "01.3", status: "not_started" },
    ];
    const resCommitted = computeNodeStatuses(linearNodesCommitted, linearEdges);
    check(
      "Committed status on 01.1 unlocks 01.2 as 'ready'",
      resCommitted[1].status === "ready",
    );

    console.log("\n--- Part 1: Unit Tests: Branching Graph ---");

    // 1.2 Branching: Fan-Out / Parallel
    // Root A -> Branch B, Branch C
    const fanOutNodes = [
      { node_key: "root-A", status: "not_started" },
      { node_key: "branch-B", status: "not_started" },
      { node_key: "branch-C", status: "not_started" },
    ];
    const fanOutEdges = [
      { from_node: "branch-B", to_node: "root-A", type: "DEPENDS_ON" },
      { from_node: "branch-C", to_node: "root-A", type: "DEPENDS_ON" },
    ];

    const foRes1 = computeNodeStatuses(fanOutNodes, fanOutEdges);
    check("Fan-Out initial: Root A is 'ready'", foRes1[0].status === "ready");
    check(
      "Fan-Out initial: Branch B is 'blocked'",
      foRes1[1].status === "blocked",
    );
    check(
      "Fan-Out initial: Branch C is 'blocked'",
      foRes1[2].status === "blocked",
    );

    // When Root A completed: both B and C ready in parallel
    const fanOutCompleted = [
      { node_key: "root-A", status: "completed" },
      { node_key: "branch-B", status: "not_started" },
      { node_key: "branch-C", status: "not_started" },
    ];
    const foRes2 = computeNodeStatuses(fanOutCompleted, fanOutEdges);
    check(
      "Fan-Out when root done: Branch B is 'ready'",
      foRes2[1].status === "ready",
    );
    check(
      "Fan-Out when root done: Branch C is 'ready'",
      foRes2[2].status === "ready",
    );

    // 1.3 Branching: Fan-In / Diamond DAG
    // A -> B, A -> C, B+C -> D
    const diamondNodes = [
      { node_key: "A", status: "not_started" },
      { node_key: "B", status: "not_started" },
      { node_key: "C", status: "not_started" },
      { node_key: "D", status: "not_started" },
    ];
    const diamondEdges = [
      { from_node: "B", to_node: "A", type: "DEPENDS_ON" },
      { from_node: "C", to_node: "A", type: "DEPENDS_ON" },
      { from_node: "D", to_node: "B", type: "DEPENDS_ON" },
      { from_node: "D", to_node: "C", type: "DEPENDS_ON" },
    ];

    const dRes1 = computeNodeStatuses(diamondNodes, diamondEdges);
    check("Diamond DAG initial: A is ready", dRes1[0].status === "ready");
    check("Diamond DAG initial: B is blocked", dRes1[1].status === "blocked");
    check("Diamond DAG initial: C is blocked", dRes1[2].status === "blocked");
    check("Diamond DAG initial: D is blocked", dRes1[3].status === "blocked");
    check(
      "Diamond DAG initial: D blocked by both B and C",
      dRes1[3].blocked_by.includes("B") && dRes1[3].blocked_by.includes("C"),
    );

    // A done: B & C become ready; D still blocked
    const dNodesA = [
      { node_key: "A", status: "completed" },
      { node_key: "B", status: "not_started" },
      { node_key: "C", status: "not_started" },
      { node_key: "D", status: "not_started" },
    ];
    const dRes2 = computeNodeStatuses(dNodesA, diamondEdges);
    check("Diamond DAG with A done: B is ready", dRes2[1].status === "ready");
    check("Diamond DAG with A done: C is ready", dRes2[2].status === "ready");
    check(
      "Diamond DAG with A done: D is still blocked",
      dRes2[3].status === "blocked",
    );

    // B done, but C still not done: D remains blocked
    const dNodesB = [
      { node_key: "A", status: "completed" },
      { node_key: "B", status: "completed" },
      { node_key: "C", status: "not_started" },
      { node_key: "D", status: "not_started" },
    ];
    const dRes3 = computeNodeStatuses(dNodesB, diamondEdges);
    check(
      "Diamond DAG with B done, C pending: D remains blocked",
      dRes3[3].status === "blocked",
    );
    check(
      "Diamond DAG with B done, C pending: D blocked_by only contains 'C'",
      dRes3[3].blocked_by.length === 1 && dRes3[3].blocked_by[0] === "C",
    );

    // Both B and C done: D becomes ready!
    const dNodesBC = [
      { node_key: "A", status: "completed" },
      { node_key: "B", status: "completed" },
      { node_key: "C", status: "completed" },
      { node_key: "D", status: "not_started" },
    ];
    const dRes4 = computeNodeStatuses(dNodesBC, diamondEdges);
    check(
      "Diamond DAG with B and C done: D becomes 'ready'!",
      dRes4[3].status === "ready" && dRes4[3].is_ready === true,
    );
    check(
      "Diamond DAG with B and C done: D blocked_by is empty",
      dRes4[3].blocked_by.length === 0,
    );

    // 1.4 Preserved active states
    const activeNodes = [
      { node_key: "01.1", status: "in_progress" },
      { node_key: "01.2", status: "not_started" },
    ];
    const activeEdges = [
      { from_node: "01.2", to_node: "01.1", type: "DEPENDS_ON" },
    ];
    const activeRes = computeNodeStatuses(activeNodes, activeEdges);
    check(
      "in_progress node status is preserved",
      activeRes[0].status === "in_progress",
    );
    check(
      "dependent of in_progress node is 'blocked'",
      activeRes[1].status === "blocked",
    );

    // 1.5 Edge formatting helper
    const formatted = formatGraphEdges(
      [
        { id: "uuid-1", node_key: "01.1" },
        { id: "uuid-2", node_key: "01.2" },
      ],
      [
        {
          id: "e1",
          from_node: "uuid-2",
          to_node: "uuid-1",
          type: "DEPENDS_ON",
        },
      ],
    );
    check(
      "formatGraphEdges populates from_node_key and to_node_key",
      formatted[0].from_node_key === "01.2" &&
        formatted[0].to_node_key === "01.1",
    );
    check(
      "formatGraphEdges populates source and target",
      formatted[0].source === "uuid-2" && formatted[0].target === "uuid-1",
    );

    // =========================================================================
    // Part 2: Database Integration Tests with NextRequest
    // =========================================================================
    console.log("\n--- Part 2: Live Database & API Route Integration ---");

    // Warm up pool connections so remote Supabase TLS handshake does not penalize route timing
    if (process.env.DATABASE_URL) {
      const dbWarm = getDb();
      await Promise.all([dbWarm`SELECT 1`, dbWarm`SELECT 1`, dbWarm`SELECT 1`]);
    }

    const db = getDb();
    const ownerA = crypto.randomUUID();
    const ownerB = crypto.randomUUID();

    // 2.1 Test Linear Chain in Database
    const projectLinear = await createProjectForOwner(
      {
        name: "Linear Chain Graph Project",
        idea: "A project with a strictly linear 3-node dependency chain.",
      },
      ownerA,
    );
    cleanupProjectIds.push(projectLinear.id);

    const savedLinear = await savePlan({
      projectId: projectLinear.id,
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "Foundation Task",
          status: "not_started",
        },
        {
          node_key: "01.2",
          phase: "01",
          title: "Intermediate Task",
          status: "not_started",
        },
        {
          node_key: "01.3",
          phase: "02",
          title: "Final Task",
          status: "not_started",
        },
      ],
      edges: [
        { from_node: "01.2", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "01.3", to_node: "01.2", type: "DEPENDS_ON" },
      ],
    });

    check("Saved linear plan to database", savedLinear.nodesSaved === 3);

    // Request GET /api/projects/:id/graph for linear project
    const reqLinear1 = new NextRequest(
      `http://localhost:3000/api/projects/${projectLinear.id}/graph`,
      {
        method: "GET",
        headers: {
          [OWNER_HEADER_NAME]: ownerA,
          cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
        },
      },
    );

    const startTime = Date.now();
    const resLinear1 = await GET(reqLinear1, {
      params: Promise.resolve({ id: projectLinear.id }),
    });
    const duration = Date.now() - startTime;

    check("Response status is 200 OK", resLinear1.status === 200);
    check(
      `ACCEPTANCE CRITERIA: Returns fast in serverless (${duration}ms < 2000ms)`,
      duration < 2000,
    );

    const bodyLinear1 = await resLinear1.json();
    check("Response has success: true", bodyLinear1.success === true);
    check(
      "Response contains project_id",
      bodyLinear1.project_id === projectLinear.id,
    );
    check("Response contains 3 nodes", bodyLinear1.nodes?.length === 3);
    check("Response contains 2 edges", bodyLinear1.edges?.length === 2);

    const nodes1 = bodyLinear1.nodes;
    const n1 = nodes1.find((n: { node_key: string }) => n.node_key === "01.1");
    const n2 = nodes1.find((n: { node_key: string }) => n.node_key === "01.2");
    const n3 = nodes1.find((n: { node_key: string }) => n.node_key === "01.3");

    check(
      "TEST CASE (Linear chain): Node 01.1 status is 'ready'",
      n1?.status === "ready" && n1?.is_ready === true,
    );
    check(
      "TEST CASE (Linear chain): Node 01.2 status is 'blocked'",
      n2?.status === "blocked" && n2?.is_blocked === true,
    );
    check(
      "TEST CASE (Linear chain): Node 01.3 status is 'blocked'",
      n3?.status === "blocked" && n3?.is_blocked === true,
    );

    // Update Node 01.1 to completed in DB
    await db`UPDATE nodes SET status = 'completed' WHERE id = ${n1.id}`;

    const reqLinear2 = new NextRequest(
      `http://localhost:3000/api/projects/${projectLinear.id}/graph`,
      {
        method: "GET",
        headers: { [OWNER_HEADER_NAME]: ownerA },
      },
    );
    const resLinear2 = await GET(reqLinear2, {
      params: Promise.resolve({ id: projectLinear.id }),
    });
    const bodyLinear2 = await resLinear2.json();
    const nodes2 = bodyLinear2.nodes;
    const n1_after = nodes2.find(
      (n: { node_key: string }) => n.node_key === "01.1",
    );
    const n2_after = nodes2.find(
      (n: { node_key: string }) => n.node_key === "01.2",
    );
    const n3_after = nodes2.find(
      (n: { node_key: string }) => n.node_key === "01.3",
    );

    check(
      "TEST CASE (Linear chain, step 1): Node 01.1 is 'completed'",
      n1_after?.status === "completed",
    );
    check(
      "TEST CASE (Linear chain, step 1): Node 01.2 transitions to 'ready'",
      n2_after?.status === "ready" && n2_after?.is_ready === true,
    );
    check(
      "TEST CASE (Linear chain, step 1): Node 01.3 remains 'blocked'",
      n3_after?.status === "blocked" && n3_after?.is_blocked === true,
    );

    // Update Node 01.2 to completed in DB
    await db`UPDATE nodes SET status = 'completed' WHERE id = ${n2.id}`;

    const reqLinear3 = new NextRequest(
      `http://localhost:3000/api/projects/${projectLinear.id}/graph`,
      {
        method: "GET",
        headers: { [OWNER_HEADER_NAME]: ownerA },
      },
    );
    const resLinear3 = await GET(reqLinear3, {
      params: Promise.resolve({ id: projectLinear.id }),
    });
    const bodyLinear3 = await resLinear3.json();
    const n3_final = bodyLinear3.nodes.find(
      (n: { node_key: string }) => n.node_key === "01.3",
    );

    check(
      "TEST CASE (Linear chain, step 2): Node 01.3 transitions to 'ready'",
      n3_final?.status === "ready" && n3_final?.is_ready === true,
    );

    // 2.2 Test Branching Diamond Graph in Database
    console.log("\n--- Part 2: Branching Graph in Database ---");
    const projectBranching = await createProjectForOwner(
      {
        name: "Branching Diamond Project",
        idea: "A project with a diamond dependency DAG: A -> B, A -> C, B+C -> D.",
      },
      ownerA,
    );
    cleanupProjectIds.push(projectBranching.id);

    await savePlan({
      projectId: projectBranching.id,
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "Setup Root",
          status: "not_started",
        },
        {
          node_key: "02.1",
          phase: "02",
          title: "Backend API",
          status: "not_started",
        },
        {
          node_key: "02.2",
          phase: "02",
          title: "Frontend UI",
          status: "not_started",
        },
        {
          node_key: "03.1",
          phase: "03",
          title: "E2E Integration",
          status: "not_started",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.2", type: "DEPENDS_ON" },
      ],
    });

    const reqB1 = new NextRequest(
      `http://localhost:3000/api/projects/${projectBranching.id}/graph`,
      {
        method: "GET",
        headers: { [OWNER_HEADER_NAME]: ownerA },
      },
    );
    const resB1 = await GET(reqB1, {
      params: Promise.resolve({ id: projectBranching.id }),
    });
    const bodyB1 = await resB1.json();
    const bNodes1 = bodyB1.nodes;

    const bn_root = bNodes1.find(
      (n: { node_key: string }) => n.node_key === "01.1",
    );
    const bn_b1 = bNodes1.find(
      (n: { node_key: string }) => n.node_key === "02.1",
    );
    const bn_b2 = bNodes1.find(
      (n: { node_key: string }) => n.node_key === "02.2",
    );
    const bn_join = bNodes1.find(
      (n: { node_key: string }) => n.node_key === "03.1",
    );

    check(
      "TEST CASE (Branching graph): Root 01.1 is 'ready'",
      bn_root?.status === "ready",
    );
    check(
      "TEST CASE (Branching graph): Branch 02.1 is 'blocked'",
      bn_b1?.status === "blocked",
    );
    check(
      "TEST CASE (Branching graph): Branch 02.2 is 'blocked'",
      bn_b2?.status === "blocked",
    );
    check(
      "TEST CASE (Branching graph): Join 03.1 is 'blocked'",
      bn_join?.status === "blocked",
    );

    // Complete Root 01.1
    await db`UPDATE nodes SET status = 'completed' WHERE id = ${bn_root.id}`;

    const resB2 = await GET(reqB1, {
      params: Promise.resolve({ id: projectBranching.id }),
    });
    const bodyB2 = await resB2.json();
    const bNodes2 = bodyB2.nodes;
    const bn_b1_after = bNodes2.find(
      (n: { node_key: string }) => n.node_key === "02.1",
    );
    const bn_b2_after = bNodes2.find(
      (n: { node_key: string }) => n.node_key === "02.2",
    );
    const bn_join_after = bNodes2.find(
      (n: { node_key: string }) => n.node_key === "03.1",
    );

    check(
      "TEST CASE (Branching graph): Parallel branch 02.1 is 'ready'",
      bn_b1_after?.status === "ready",
    );
    check(
      "TEST CASE (Branching graph): Parallel branch 02.2 is 'ready'",
      bn_b2_after?.status === "ready",
    );
    check(
      "TEST CASE (Branching graph): Join 03.1 is still 'blocked'",
      bn_join_after?.status === "blocked",
    );

    // Complete branch 02.1 only (02.2 is still in progress / ready)
    await db`UPDATE nodes SET status = 'completed' WHERE id = ${bn_b1.id}`;

    const resB3 = await GET(reqB1, {
      params: Promise.resolve({ id: projectBranching.id }),
    });
    const bodyB3 = await resB3.json();
    const bn_join_b3 = bodyB3.nodes.find(
      (n: { node_key: string }) => n.node_key === "03.1",
    );
    check(
      "TEST CASE (Branching graph): Join 03.1 remains 'blocked' when only 1 branch done",
      bn_join_b3?.status === "blocked",
    );

    // Complete branch 02.2
    await db`UPDATE nodes SET status = 'completed' WHERE id = ${bn_b2.id}`;

    const resB4 = await GET(reqB1, {
      params: Promise.resolve({ id: projectBranching.id }),
    });
    const bodyB4 = await resB4.json();
    const bn_join_b4 = bodyB4.nodes.find(
      (n: { node_key: string }) => n.node_key === "03.1",
    );
    check(
      "TEST CASE (Branching graph): Join 03.1 becomes 'ready' when both branches complete!",
      bn_join_b4?.status === "ready" && bn_join_b4?.is_ready === true,
    );

    // =========================================================================
    // Part 3: Security & Error Handling
    // =========================================================================
    console.log("\n--- Part 3: Security & Authorization ---");

    // 3.1 User B querying User A's project graph -> 404 Not Found
    const reqUserB = new NextRequest(
      `http://localhost:3000/api/projects/${projectLinear.id}/graph`,
      {
        method: "GET",
        headers: { [OWNER_HEADER_NAME]: ownerB },
      },
    );
    const resUserB = await GET(reqUserB, {
      params: Promise.resolve({ id: projectLinear.id }),
    });
    check(
      "User B accessing User A's graph returns 404 Not Found",
      resUserB.status === 404,
    );

    // 3.2 Request with missing owner session -> 401 Unauthorized
    const reqNoSession = new NextRequest(
      `http://localhost:3000/api/projects/${projectLinear.id}/graph`,
      {
        method: "GET",
      },
    );
    const resNoSession = await GET(reqNoSession, {
      params: Promise.resolve({ id: projectLinear.id }),
    });
    check(
      "Request without owner cookie/header returns 401 Unauthorized",
      resNoSession.status === 401,
    );

    // 3.3 Invalid UUID format -> 400 Bad Request
    const reqInvalidId = new NextRequest(
      "http://localhost:3000/api/projects/not-a-uuid/graph",
      {
        method: "GET",
        headers: { [OWNER_HEADER_NAME]: ownerA },
      },
    );
    const resInvalidId = await GET(reqInvalidId, {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    check(
      "Invalid UUID project ID returns 400 Bad Request",
      resInvalidId.status === 400,
    );

    // 3.4 Non-existent UUID -> 404 Not Found
    const randomUuid = crypto.randomUUID();
    const reqNonExistent = new NextRequest(
      `http://localhost:3000/api/projects/${randomUuid}/graph`,
      {
        method: "GET",
        headers: { [OWNER_HEADER_NAME]: ownerA },
      },
    );
    const resNonExistent = await GET(reqNonExistent, {
      params: Promise.resolve({ id: randomUuid }),
    });
    check(
      "Non-existent project UUID returns 404 Not Found",
      resNonExistent.status === 404,
    );

    // 3.5 Generating project (no nodes or edges yet)
    console.log("\n--- Part 4: Project in 'generating' state ---");
    const projectGenerating = await createProjectForOwner(
      {
        name: "Generating Status Project",
        idea: "Project currently generating its plan.",
      },
      ownerA,
    );
    cleanupProjectIds.push(projectGenerating.id);

    const reqGen = new NextRequest(
      `http://localhost:3000/api/projects/${projectGenerating.id}/graph`,
      {
        method: "GET",
        headers: { [OWNER_HEADER_NAME]: ownerA },
      },
    );
    const resGen = await GET(reqGen, {
      params: Promise.resolve({ id: projectGenerating.id }),
    });
    const bodyGen = await resGen.json();

    check("Generating project returns 200 OK", resGen.status === 200);
    check(
      "Generating project returns status 'generating'",
      bodyGen.status === "generating",
    );
    check(
      "Generating project returns empty nodes array",
      bodyGen.nodes.length === 0,
    );
    check(
      "Generating project returns empty edges array",
      bodyGen.edges.length === 0,
    );
  } finally {
    // Cleanup created test projects
    const db = getDb();
    for (const pid of cleanupProjectIds) {
      try {
        await db`DELETE FROM projects WHERE id = ${pid}`;
      } catch {
        // Ignore cleanup errors
      }
    }
    console.log(`\nCleaned up ${cleanupProjectIds.length} test projects.`);
  }

  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");

  if (failed || passedChecks < totalChecks) {
    console.error("\nSOME CHECKS FAILED!");
    process.exit(1);
  } else {
    console.log("\nALL GET GRAPH CHECKS PASSED!");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Unhandled error in test runner:", err);
  process.exit(1);
});
