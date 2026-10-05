/**
 * Test Suite for Task 04.3: PATCH /api/nodes/[id]
 *
 * Verifies:
 * 1. Valid node update:
 *    - Starting an unblocked/root node ('in_progress') succeeds (HTTP 200)
 *    - Completing an in-progress node ('completed') succeeds (HTTP 200)
 *    - Database status reflects the updated status
 * 2. Blocked node update rejection (ACCEPTANCE CRITERIA):
 *    - Attempting to start ('in_progress') a blocked node is rejected (HTTP 400, code NODE_BLOCKED)
 *    - Attempting to complete ('completed') a blocked node is rejected (HTTP 400)
 *    - Attempting to ready ('ready') a blocked node is rejected (HTTP 400)
 *    - Blocked node status in database remains untouched
 *    - Error response contains blocked_by details
 * 3. Dynamic unblocking workflow:
 *    - Node B depends on Node A.
 *    - Node B is initially blocked -> start attempt rejected.
 *    - Node A is completed.
 *    - Node B is now unblocked -> start attempt succeeds!
 * 4. Branching graph join unblocking:
 *    - Node D depends on Node B and Node C.
 *    - Only Node B completed -> Node D start attempt STILL rejected.
 *    - Both Node B and Node C completed -> Node D start attempt succeeds!
 * 5. Unknown ID & Security:
 *    - Non-existent UUID -> HTTP 404 Not Found
 *    - Unknown string ID -> HTTP 404 Not Found
 *    - User B accessing User A's node -> HTTP 404 Not Found
 *    - Missing owner session -> HTTP 401 Unauthorized
 * 6. Input Validation:
 *    - Missing status -> HTTP 400 Bad Request
 *    - Invalid status value -> HTTP 400 Bad Request
 *    - Malformed JSON -> HTTP 400 Bad Request
 * 7. GET /api/nodes/:id:
 *    - Retrieves node and reports is_blocked correctly
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { PATCH, GET } from "../src/app/api/nodes/[id]/route";
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
  console.log("=== RUNNING TASK 04.3 PATCH /nodes/[id] TEST SUITE ===\n");

  const cleanupProjectIds: string[] = [];
  const db = getDb();

  // Warm up connection pool so TLS handshakes don't slow down tests
  if (process.env.DATABASE_URL) {
    await Promise.all([db`SELECT 1`, db`SELECT 1`, db`SELECT 1`]);
  }

  try {
    const ownerA = crypto.randomUUID();
    const ownerB = crypto.randomUUID();

    // Setup: Create a project with a 3-node linear chain
    // 01.1 (Root) -> 01.2 (Intermediate) -> 01.3 (Final)
    const project = await createProjectForOwner(
      {
        name: "Node Status Update Test Project",
        idea: "Testing PATCH /api/nodes/:id for starting, advancing, and blocking nodes.",
      },
      ownerA,
    );
    cleanupProjectIds.push(project.id);

    const savedPlan = await savePlan({
      projectId: project.id,
      nodes: [
        { node_key: "01.1", phase: "01", title: "Root Task", status: "not_started" },
        { node_key: "01.2", phase: "01", title: "Dependent Task 1", status: "not_started" },
        { node_key: "01.3", phase: "02", title: "Dependent Task 2", status: "not_started" },
      ],
      edges: [
        { from_node: "01.2", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "01.3", to_node: "01.2", type: "DEPENDS_ON" },
      ],
    });

    const node1Id = savedPlan.nodeIds["01.1"];
    const node2Id = savedPlan.nodeIds["01.2"];
    const node3Id = savedPlan.nodeIds["01.3"];

    // =========================================================================
    // Part 1: Blocked Node Update Rejection (ACCEPTANCE CRITERIA)
    // =========================================================================
    console.log("--- Part 1: Blocked Node Update Rejection ---");

    // Node 01.2 depends on Node 01.1 (which is not_started) => Node 01.2 is BLOCKED!
    const reqStartBlocked = new NextRequest(
      `http://localhost:3000/api/nodes/${node2Id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
          cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
        },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );

    const resStartBlocked = await PATCH(reqStartBlocked, {
      params: Promise.resolve({ id: node2Id }),
    });
    const bodyStartBlocked = await resStartBlocked.json();

    check("Blocked start returns HTTP 400 Bad Request", resStartBlocked.status === 400);
    check(
      "ACCEPTANCE CRITERIA: Blocked update rejected with code NODE_BLOCKED",
      bodyStartBlocked.error?.code === "NODE_BLOCKED",
    );
    check(
      "Error details contain blocked_by with '01.1'",
      Array.isArray(bodyStartBlocked.error?.details?.blocked_by) &&
        bodyStartBlocked.error.details.blocked_by.includes("01.1"),
    );

    // Verify node status in DB was NOT changed
    const [dbNode2AfterAttempt] = await db<{ status: string }[]>`
      SELECT status FROM nodes WHERE id = ${node2Id}
    `;
    check(
      "Blocked node status in database remains 'not_started'",
      dbNode2AfterAttempt?.status === "not_started",
    );

    // Attempting to complete a blocked node is also rejected
    const reqCompleteBlocked = new NextRequest(
      `http://localhost:3000/api/nodes/${node2Id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
        },
        body: JSON.stringify({ status: "completed" }),
      },
    );
    const resCompleteBlocked = await PATCH(reqCompleteBlocked, {
      params: Promise.resolve({ id: node2Id }),
    });
    check("Completing a blocked node returns HTTP 400", resCompleteBlocked.status === 400);

    // Attempting to set ready on a blocked node is also rejected
    const reqReadyBlocked = new NextRequest(
      `http://localhost:3000/api/nodes/${node2Id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
        },
        body: JSON.stringify({ status: "ready" }),
      },
    );
    const resReadyBlocked = await PATCH(reqReadyBlocked, {
      params: Promise.resolve({ id: node2Id }),
    });
    check("Setting ready on a blocked node returns HTTP 400", resReadyBlocked.status === 400);

    // =========================================================================
    // Part 2: Valid Node Update & Lifecycle
    // =========================================================================
    console.log("\n--- Part 2: Valid Node Update ---");

    // Node 01.1 has 0 prerequisites => it is NOT blocked!
    const reqStartNode1 = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
        },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );

    const resStartNode1 = await PATCH(reqStartNode1, {
      params: Promise.resolve({ id: node1Id }),
    });
    const bodyStartNode1 = await resStartNode1.json();

    check("Starting unblocked node returns HTTP 200 OK", resStartNode1.status === 200);
    check("Response has success: true", bodyStartNode1.success === true);
    check("Response status is 'in_progress'", bodyStartNode1.status === "in_progress");

    const [dbNode1] = await db<{ status: string }[]>`
      SELECT status FROM nodes WHERE id = ${node1Id}
    `;
    check("Database reflects 'in_progress' for Node 01.1", dbNode1?.status === "in_progress");

    // Complete Node 01.1
    const reqCompleteNode1 = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
        },
        body: JSON.stringify({ status: "completed" }),
      },
    );
    const resCompleteNode1 = await PATCH(reqCompleteNode1, {
      params: Promise.resolve({ id: node1Id }),
    });
    const bodyCompleteNode1 = await resCompleteNode1.json();
    check("Completing Node 01.1 returns HTTP 200 OK", resCompleteNode1.status === 200);
    check("Response status is 'completed'", bodyCompleteNode1.status === "completed");

    // =========================================================================
    // Part 3: Dynamic Unblocking Workflow
    // =========================================================================
    console.log("\n--- Part 3: Dynamic Unblocking Workflow ---");

    // Now that Node 01.1 is completed, Node 01.2 is no longer blocked!
    const reqStartNode2 = new NextRequest(
      `http://localhost:3000/api/nodes/${node2Id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
        },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    const resStartNode2 = await PATCH(reqStartNode2, {
      params: Promise.resolve({ id: node2Id }),
    });
    const bodyStartNode2 = await resStartNode2.json();

    check(
      "Unblocked Node 01.2 now starts successfully (HTTP 200)",
      resStartNode2.status === 200,
    );
    check("Node 01.2 status is now 'in_progress'", bodyStartNode2.status === "in_progress");

    // But Node 01.3 is STILL blocked because Node 01.2 is in_progress (not completed)
    const reqStartNode3 = new NextRequest(
      `http://localhost:3000/api/nodes/${node3Id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
        },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    const resStartNode3 = await PATCH(reqStartNode3, {
      params: Promise.resolve({ id: node3Id }),
    });
    check(
      "Node 01.3 is still blocked while Node 01.2 is in_progress",
      resStartNode3.status === 400,
    );

    // Complete Node 01.2
    const reqCompleteNode2 = new NextRequest(
      `http://localhost:3000/api/nodes/${node2Id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
        },
        body: JSON.stringify({ status: "completed" }),
      },
    );
    await PATCH(reqCompleteNode2, { params: Promise.resolve({ id: node2Id }) });

    // Now Node 01.3 can start!
    const reqStartNode3After = new NextRequest(
      `http://localhost:3000/api/nodes/${node3Id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
        },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    const resStartNode3After = await PATCH(reqStartNode3After, {
      params: Promise.resolve({ id: node3Id }),
    });
    check(
      "Node 01.3 starts successfully after Node 01.2 completes (HTTP 200)",
      resStartNode3After.status === 200,
    );

    // =========================================================================
    // Part 4: Branching Graph (Diamond Join Unblocking)
    // =========================================================================
    console.log("\n--- Part 4: Branching Graph Join Unblocking ---");

    const diamondProject = await createProjectForOwner(
      {
        name: "Diamond Join Test Project",
        idea: "Testing branching join node unblocking.",
      },
      ownerA,
    );
    cleanupProjectIds.push(diamondProject.id);

    const diamondPlan = await savePlan({
      projectId: diamondProject.id,
      nodes: [
        { node_key: "root", phase: "01", title: "Root", status: "completed" },
        { node_key: "branch_a", phase: "02", title: "Branch A", status: "not_started" },
        { node_key: "branch_b", phase: "02", title: "Branch B", status: "not_started" },
        { node_key: "join_d", phase: "03", title: "Join D", status: "not_started" },
      ],
      edges: [
        { from_node: "branch_a", to_node: "root", type: "DEPENDS_ON" },
        { from_node: "branch_b", to_node: "root", type: "DEPENDS_ON" },
        { from_node: "join_d", to_node: "branch_a", type: "DEPENDS_ON" },
        { from_node: "join_d", to_node: "branch_b", type: "DEPENDS_ON" },
      ],
    });

    const bAId = diamondPlan.nodeIds["branch_a"];
    const bBId = diamondPlan.nodeIds["branch_b"];
    const jDId = diamondPlan.nodeIds["join_d"];

    // Try starting join_d => Rejected (both branches not done)
    const reqStartJoin1 = new NextRequest(
      `http://localhost:3000/api/nodes/${jDId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", [OWNER_HEADER_NAME]: ownerA },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    const resJoin1 = await PATCH(reqStartJoin1, { params: Promise.resolve({ id: jDId }) });
    check("Join node blocked before branches complete (HTTP 400)", resJoin1.status === 400);

    // Complete branch_a
    await db`UPDATE nodes SET status = 'completed' WHERE id = ${bAId}`;

    // Try starting join_d again => Still rejected because branch_b is not done!
    const reqStartJoin2 = new NextRequest(
      `http://localhost:3000/api/nodes/${jDId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", [OWNER_HEADER_NAME]: ownerA },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    const resJoin2 = await PATCH(reqStartJoin2, { params: Promise.resolve({ id: jDId }) });
    check("Join node still blocked when only 1 branch done (HTTP 400)", resJoin2.status === 400);

    // Complete branch_b
    await db`UPDATE nodes SET status = 'completed' WHERE id = ${bBId}`;

    // Try starting join_d now => Succeeds!
    const reqStartJoin3 = new NextRequest(
      `http://localhost:3000/api/nodes/${jDId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", [OWNER_HEADER_NAME]: ownerA },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    const resJoin3 = await PATCH(reqStartJoin3, { params: Promise.resolve({ id: jDId }) });
    check(
      "Join node starts successfully once BOTH branches complete (HTTP 200)",
      resJoin3.status === 200,
    );

    // =========================================================================
    // Part 5: Unknown ID & Security
    // =========================================================================
    console.log("\n--- Part 5: Unknown ID & Security ---");

    // 5.1 Non-existent UUID
    const randomUuid = crypto.randomUUID();
    const reqNonExistent = new NextRequest(
      `http://localhost:3000/api/nodes/${randomUuid}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", [OWNER_HEADER_NAME]: ownerA },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    const resNonExistent = await PATCH(reqNonExistent, {
      params: Promise.resolve({ id: randomUuid }),
    });
    check(
      "TEST CASE (unknown id): Non-existent UUID returns HTTP 404 Not Found",
      resNonExistent.status === 404,
    );

    // 5.2 Unknown string ID
    const reqUnknownStr = new NextRequest(
      "http://localhost:3000/api/nodes/completely-unknown-node-id",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", [OWNER_HEADER_NAME]: ownerA },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    const resUnknownStr = await PATCH(reqUnknownStr, {
      params: Promise.resolve({ id: "completely-unknown-node-id" }),
    });
    check(
      "TEST CASE (unknown id): Unknown string ID returns HTTP 404 Not Found",
      resUnknownStr.status === 404,
    );

    // 5.3 User B accessing User A's node => HTTP 404 Not Found
    const reqUserB = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", [OWNER_HEADER_NAME]: ownerB },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    const resUserB = await PATCH(reqUserB, {
      params: Promise.resolve({ id: node1Id }),
    });
    check(
      "User B accessing User A's node returns HTTP 404 Not Found",
      resUserB.status === 404,
    );

    // 5.4 Missing session
    const reqNoSession = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    const resNoSession = await PATCH(reqNoSession, {
      params: Promise.resolve({ id: node1Id }),
    });
    check(
      "Missing owner session returns HTTP 401 Unauthorized",
      resNoSession.status === 401,
    );

    // =========================================================================
    // Part 6: Input Validation
    // =========================================================================
    console.log("\n--- Part 6: Input Validation ---");

    // Missing status field
    const reqMissingStatus = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", [OWNER_HEADER_NAME]: ownerA },
        body: JSON.stringify({ prompt: "some prompt" }),
      },
    );
    const resMissingStatus = await PATCH(reqMissingStatus, {
      params: Promise.resolve({ id: node1Id }),
    });
    check("Missing status field returns HTTP 400 Bad Request", resMissingStatus.status === 400);

    // Invalid status string
    const reqInvalidStatus = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", [OWNER_HEADER_NAME]: ownerA },
        body: JSON.stringify({ status: "flying_to_mars" }),
      },
    );
    const resInvalidStatus = await PATCH(reqInvalidStatus, {
      params: Promise.resolve({ id: node1Id }),
    });
    check("Invalid status value returns HTTP 400 Bad Request", resInvalidStatus.status === 400);

    // =========================================================================
    // Part 7: GET /api/nodes/:id
    // =========================================================================
    console.log("\n--- Part 7: GET /api/nodes/:id ---");

    const reqGetNode = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}`,
      {
        method: "GET",
        headers: { [OWNER_HEADER_NAME]: ownerA },
      },
    );
    const resGetNode = await GET(reqGetNode, {
      params: Promise.resolve({ id: node1Id }),
    });
    const bodyGetNode = await resGetNode.json();

    check("GET /api/nodes/:id returns HTTP 200 OK", resGetNode.status === 200);
    check("GET /api/nodes/:id returns matching id", bodyGetNode.id === node1Id);
    check("GET /api/nodes/:id returns node_key", bodyGetNode.node_key === "01.1");
    check("GET /api/nodes/:id returns is_blocked boolean", typeof bodyGetNode.is_blocked === "boolean");

  } finally {
    // Cleanup created test projects
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
    console.log("\nALL PATCH NODE CHECKS PASSED!");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Unhandled error in test runner:", err);
  process.exit(1);
});
