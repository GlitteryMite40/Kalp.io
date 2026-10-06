/**
 * Test Suite for Task 05.7: DELETE /api/projects/[id]
 *
 * Verifies:
 * 1. ACCEPTANCE CRITERIA:
 *    - "Only own projects are listed" (isolation verified in session/projects API)
 *    - "delete removes nodes and edges" (cascading cleanup)
 * 2. TEST CASES:
 *    - "delete own": Deleting own project succeeds with HTTP 200 OK
 *    - "delete another owner's": Deleting another user's project rejected with HTTP 404
 *    - "delete twice": Second delete on already deleted project returns HTTP 404
 * 3. Security & Validation:
 *    - Missing owner cookie/session -> HTTP 401 Unauthorized
 *    - Invalid non-UUID format -> HTTP 400 Bad Request
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { DELETE, GET } from "../src/app/api/projects/[id]/route";
import {
  OWNER_COOKIE_NAME,
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

function check(desc: string, condition: boolean, details?: unknown) {
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

async function run() {
  console.log("=== RUNNING TASK 05.7 DELETE /projects/[id] TEST SUITE ===\n");

  const cleanupProjectIds: string[] = [];
  const db = getDb();

  // Warm up connection pool
  if (process.env.DATABASE_URL) {
    await Promise.all([db`SELECT 1`, db`SELECT 1`]);
  }

  try {
    const ownerA = crypto.randomUUID();
    const ownerB = crypto.randomUUID();

    // 1. Setup: Create Project A for Owner A with full Plan (requirements, nodes, edges)
    console.log("--- Setup: Creating Project A with Nodes & Edges ---");
    const projectA = await createProjectForOwner(
      {
        name: "Project A to Delete",
        idea: "A project intended to test full deletion cascade of nodes and edges.",
      },
      ownerA,
    );
    cleanupProjectIds.push(projectA.id);

    await savePlan(
      {
        projectId: projectA.id,
        requirements: [
          {
            key: "REQ-01",
            title: "Database layer",
            description: "Store persistent records",
          },
        ],
        nodes: [
          {
            node_key: "01.1",
            phase: "01",
            title: "Database migration",
            requirement_key: "REQ-01",
            files: ["schema.sql"],
            acceptance: ["Tables created"],
            tests: ["db:smoke"],
          },
          {
            node_key: "02.1",
            phase: "02",
            title: "API endpoint",
            requirement_key: "REQ-01",
            files: ["api.ts"],
            acceptance: ["Endpoint returns 200"],
            tests: ["api:test"],
          },
        ],
        edges: [
          {
            from_node: "02.1",
            to_node: "01.1",
            type: "DEPENDS_ON",
          },
        ],
      },
    );

    // Verify Project A has rows in database
    const [nodeCountBefore] = await db<{ count: string }[]>`
      SELECT count(*) as count FROM nodes WHERE project_id = ${projectA.id}
    `;
    const [edgeCountBefore] = await db<{ count: string }[]>`
      SELECT count(*) as count FROM edges WHERE project_id = ${projectA.id}
    `;
    const [reqCountBefore] = await db<{ count: string }[]>`
      SELECT count(*) as count FROM requirements WHERE project_id = ${projectA.id}
    `;

    check(
      "Project A has 2 nodes before deletion",
      Number(nodeCountBefore.count) === 2,
    );
    check(
      "Project A has 1 edge before deletion",
      Number(edgeCountBefore.count) === 1,
    );
    check(
      "Project A has 1 requirement before deletion",
      Number(reqCountBefore.count) === 1,
    );

    // Setup: Create Project B for Owner B
    const projectB = await createProjectForOwner(
      {
        name: "Project B Owner B",
        idea: "Project owned by user B.",
      },
      ownerB,
    );
    cleanupProjectIds.push(projectB.id);

    // =========================================================================
    // Part 1: TEST CASE: "delete another owner's"
    // =========================================================================
    console.log("\n--- Part 1: TEST CASE - Delete Another Owner's Project ---");

    // Owner B attempts to DELETE Project A
    const reqDeleteOther = new NextRequest(
      `http://localhost:3000/api/projects/${projectA.id}`,
      {
        method: "DELETE",
        headers: {
          cookie: `${OWNER_COOKIE_NAME}=${ownerB}`,
        },
      },
    );

    const resDeleteOther = await DELETE(reqDeleteOther, {
      params: Promise.resolve({ id: projectA.id }),
    });

    check(
      "TEST CASE (delete another owner's): Request returns HTTP 404 Not Found",
      resDeleteOther.status === 404,
      { status: resDeleteOther.status },
    );

    const otherBody = await resDeleteOther.json();
    check(
      "TEST CASE (delete another owner's): Response error code indicates NOT_FOUND",
      otherBody.success === false &&
        (otherBody.error?.code === "NOT_FOUND" ||
          otherBody.error?.code === "PROJECT_NOT_FOUND"),
      otherBody,
    );

    // Verify Project A still exists untouched in DB
    const [stillExistsA] = await db<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${projectA.id}
    `;
    check(
      "Project A still exists in DB after unauthorized deletion attempt",
      stillExistsA !== undefined,
    );

    const [nodeCountStill] = await db<{ count: string }[]>`
      SELECT count(*) as count FROM nodes WHERE project_id = ${projectA.id}
    `;
    check(
      "Project A nodes still exist untouched",
      Number(nodeCountStill.count) === 2,
    );

    // =========================================================================
    // Part 2: TEST CASE: "delete own" & ACCEPTANCE CRITERIA: "removes nodes and edges"
    // =========================================================================
    console.log(
      "\n--- Part 2: TEST CASE - Delete Own & Removes Nodes and Edges ---",
    );

    // Owner A deletes Project A
    const reqDeleteOwn = new NextRequest(
      `http://localhost:3000/api/projects/${projectA.id}`,
      {
        method: "DELETE",
        headers: {
          cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
        },
      },
    );

    const resDeleteOwn = await DELETE(reqDeleteOwn, {
      params: Promise.resolve({ id: projectA.id }),
    });

    check(
      "TEST CASE (delete own): Deleting own project returns HTTP 200 OK",
      resDeleteOwn.status === 200,
      { status: resDeleteOwn.status },
    );

    const ownBody = await resDeleteOwn.json();
    check(
      "TEST CASE (delete own): Response indicates success: true",
      ownBody.success === true && ownBody.id === projectA.id,
      ownBody,
    );

    // ACCEPTANCE CRITERIA: verify project is deleted from DB
    const [projectAfter] = await db<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${projectA.id}
    `;
    check(
      "ACCEPTANCE CRITERIA: Project row is removed from projects table",
      projectAfter === undefined,
    );

    // ACCEPTANCE CRITERIA: verify cascading deletion of nodes and edges
    const [nodeCountAfter] = await db<{ count: string }[]>`
      SELECT count(*) as count FROM nodes WHERE project_id = ${projectA.id}
    `;
    check(
      "ACCEPTANCE CRITERIA: All nodes for deleted project are removed (count = 0)",
      Number(nodeCountAfter.count) === 0,
      { count: nodeCountAfter.count },
    );

    const [edgeCountAfter] = await db<{ count: string }[]>`
      SELECT count(*) as count FROM edges WHERE project_id = ${projectA.id}
    `;
    check(
      "ACCEPTANCE CRITERIA: All edges for deleted project are removed (count = 0)",
      Number(edgeCountAfter.count) === 0,
      { count: edgeCountAfter.count },
    );

    const [reqCountAfter] = await db<{ count: string }[]>`
      SELECT count(*) as count FROM requirements WHERE project_id = ${projectA.id}
    `;
    check(
      "ACCEPTANCE CRITERIA: All requirements for deleted project are removed (count = 0)",
      Number(reqCountAfter.count) === 0,
    );

    // =========================================================================
    // Part 3: TEST CASE: "delete twice"
    // =========================================================================
    console.log("\n--- Part 3: TEST CASE - Delete Twice ---");

    // Owner A attempts to delete Project A a second time
    const reqDeleteTwice = new NextRequest(
      `http://localhost:3000/api/projects/${projectA.id}`,
      {
        method: "DELETE",
        headers: {
          cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
        },
      },
    );

    const resDeleteTwice = await DELETE(reqDeleteTwice, {
      params: Promise.resolve({ id: projectA.id }),
    });

    check(
      "TEST CASE (delete twice): Second delete returns HTTP 404 Not Found",
      resDeleteTwice.status === 404,
      { status: resDeleteTwice.status },
    );

    const twiceBody = await resDeleteTwice.json();
    check(
      "TEST CASE (delete twice): Response error indicates NOT_FOUND",
      twiceBody.success === false,
      twiceBody,
    );

    // Also test deleting project B once -> 200, twice -> 404
    const reqDeleteB1 = new NextRequest(
      `http://localhost:3000/api/projects/${projectB.id}`,
      {
        method: "DELETE",
        headers: {
          cookie: `${OWNER_COOKIE_NAME}=${ownerB}`,
        },
      },
    );
    const resDeleteB1 = await DELETE(reqDeleteB1, {
      params: Promise.resolve({ id: projectB.id }),
    });
    check(
      "First delete on Project B returns 200 OK",
      resDeleteB1.status === 200,
    );

    const reqDeleteB2 = new NextRequest(
      `http://localhost:3000/api/projects/${projectB.id}`,
      {
        method: "DELETE",
        headers: {
          cookie: `${OWNER_COOKIE_NAME}=${ownerB}`,
        },
      },
    );
    const resDeleteB2 = await DELETE(reqDeleteB2, {
      params: Promise.resolve({ id: projectB.id }),
    });
    check(
      "Second delete on Project B returns 404 Not Found",
      resDeleteB2.status === 404,
    );

    // =========================================================================
    // Part 4: Security & Validation Edge Cases
    // =========================================================================
    console.log("\n--- Part 4: Security & Validation Edge Cases ---");

    // 4.1 Missing owner session cookie
    const reqNoSession = new NextRequest(
      `http://localhost:3000/api/projects/${crypto.randomUUID()}`,
      { method: "DELETE" },
    );
    const resNoSession = await DELETE(reqNoSession, {
      params: Promise.resolve({ id: crypto.randomUUID() }),
    });
    check(
      "Missing owner cookie returns HTTP 401 Unauthorized",
      resNoSession.status === 401,
    );

    // 4.2 Malformed non-UUID project ID
    const reqInvalidId = new NextRequest(
      "http://localhost:3000/api/projects/not-a-valid-uuid",
      {
        method: "DELETE",
        headers: { cookie: `${OWNER_COOKIE_NAME}=${ownerA}` },
      },
    );
    const resInvalidId = await DELETE(reqInvalidId, {
      params: Promise.resolve({ id: "not-a-valid-uuid" }),
    });
    check(
      "Malformed project ID returns HTTP 400 Bad Request",
      resInvalidId.status === 400,
    );

    // 4.3 GET /api/projects/:id endpoint
    const projectC = await createProjectForOwner(
      {
        name: "Project C for GET",
        idea: "Testing GET single project endpoint.",
      },
      ownerA,
    );
    cleanupProjectIds.push(projectC.id);

    const reqGetC = new NextRequest(
      `http://localhost:3000/api/projects/${projectC.id}`,
      {
        method: "GET",
        headers: { cookie: `${OWNER_COOKIE_NAME}=${ownerA}` },
      },
    );
    const resGetC = await GET(reqGetC, {
      params: Promise.resolve({ id: projectC.id }),
    });
    check("GET /api/projects/:id returns HTTP 200 OK", resGetC.status === 200);
    const bodyGetC = await resGetC.json();
    check(
      "GET /api/projects/:id returns project record",
      bodyGetC.data?.name === "Project C for GET",
    );
  } finally {
    // Cleanup any lingering test projects
    if (cleanupProjectIds.length > 0) {
      for (const id of cleanupProjectIds) {
        try {
          await db`DELETE FROM projects WHERE id = ${id}`;
        } catch {
          // Ignore
        }
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
  console.log("==========================================");

  if (failed) {
    console.error("\nTEST SUITE FAILED!");
    process.exit(1);
  } else {
    console.log("\nALL DELETE PROJECT CHECKS PASSED!");
  }
}

run().catch((err) => {
  console.error("Unhandled error in test-delete-project:", err);
  process.exit(1);
});
