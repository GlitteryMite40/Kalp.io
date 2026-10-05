/**
 * Test Suite for Task 04.5: Anonymous owner (backend/src/server/session.ts, backend/src/middleware.ts)
 *
 * Verifies:
 * 1. Missing cookie:
 *    - Middleware issues a random UUID in an httpOnly, Secure, SameSite=Lax cookie on first visit
 *    - Forwards x-owner-id header to downstream route handlers
 * 2. Two cookies:
 *    - User A (cookie A) and User B (cookie B) have completely isolated project namespaces
 *    - User A cannot see User B's projects when listing
 *    - User B cannot see User A's projects when listing
 * 3. Direct ID access:
 *    - User B cannot read User A's project by direct ID (returns null / 404)
 *    - User B cannot update User A's project by direct ID (0 rows affected)
 *    - User B cannot delete User A's project by direct ID (0 rows affected)
 *    - User B cannot read or update User A's nodes by direct ID
 * 4. Request body untrusted:
 *    - Never trusts an owner_id sent in a request body (stripped and ignored)
 * 5. Session extraction and authorization helpers
 */

import fs from "node:fs";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";
import {
  OWNER_COOKIE_NAME,
  OWNER_HEADER_NAME,
  isValidOwnerId,
  extractOwnerId,
  requireOwnerId,
  sanitizeRequestBody,
  createProjectForOwner,
  findProjectById,
  findProjectsByOwner,
  updateProjectForOwner,
  deleteProjectForOwner,
  findProjectNodesForOwner,
  findNodeByIdForOwner,
  updateNodeForOwner,
} from "../src/server/session";
import { getDb } from "../src/lib/db";
import { UnauthorizedError } from "../src/lib/errors";

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

async function runTests() {
  console.log("=== RUNNING TASK 04.5 ANONYMOUS OWNER TEST SUITE ===\n");

  // =========================================================================
  // Part 1: Middleware & Missing Cookie Handling (TEST CASE: missing cookie)
  // =========================================================================
  console.log("--- Part 1: Middleware & Cookie Issuance (Missing Cookie) ---");

  // 1.1 Request with no cookie -> issues cookie with httpOnly, SameSite=Lax, path=/
  const reqNoCookie = new NextRequest("http://localhost:3000/api/projects");
  const resNoCookie = middleware(reqNoCookie);

  const issuedCookie = resNoCookie.cookies.get(OWNER_COOKIE_NAME);
  check(
    "Middleware issues owner cookie on first visit",
    issuedCookie !== undefined,
  );
  check("Issued cookie is a valid UUID", isValidOwnerId(issuedCookie?.value));
  check("Issued cookie has httpOnly: true", issuedCookie?.httpOnly === true);
  check("Issued cookie has sameSite: 'lax'", issuedCookie?.sameSite === "lax");
  check("Issued cookie has path: '/'", issuedCookie?.path === "/");

  // 1.2 Downstream header forwarding
  // Middleware should attach x-owner-id header with the same issued UUID
  const forwardedHeaderId =
    resNoCookie.headers.get("x-middleware-request-x-owner-id") ||
    resNoCookie.headers.get("x-owner-id");
  check(
    "Middleware forwards owner ID in x-owner-id header",
    forwardedHeaderId === issuedCookie?.value,
  );

  // 1.3 Request with existing valid cookie -> retains existing ID
  const existingId = crypto.randomUUID();
  const reqWithCookie = new NextRequest("http://localhost:3000/api/projects", {
    headers: {
      cookie: `${OWNER_COOKIE_NAME}=${existingId}`,
    },
  });
  const resWithCookie = middleware(reqWithCookie);

  const forwardedExisting =
    resWithCookie.headers.get("x-middleware-request-x-owner-id") ||
    resWithCookie.headers.get("x-owner-id");
  check(
    "Existing valid cookie is retained and forwarded in header",
    forwardedExisting === existingId,
  );

  // 1.4 Request with invalid malformed cookie -> issues fresh UUID cookie
  const reqMalformed = new NextRequest("http://localhost:3000/api/projects", {
    headers: {
      cookie: `${OWNER_COOKIE_NAME}=not-a-valid-uuid`,
    },
  });
  const resMalformed = middleware(reqMalformed);
  const reissuedCookie = resMalformed.cookies.get(OWNER_COOKIE_NAME);
  check(
    "Malformed cookie triggers issuance of new valid UUID",
    isValidOwnerId(reissuedCookie?.value) &&
      reissuedCookie?.value !== "not-a-valid-uuid",
  );

  // =========================================================================
  // Part 2: Session Extraction & Authorization
  // =========================================================================
  console.log("\n--- Part 2: Session Extraction & Request Body Untrusted ---");

  // 2.1 Extract from x-owner-id header
  const sampleUuid = crypto.randomUUID();
  const reqHeader = new Request("http://localhost:3000/api/projects", {
    headers: { [OWNER_HEADER_NAME]: sampleUuid },
  });
  check(
    "extractOwnerId reads from header",
    extractOwnerId(reqHeader) === sampleUuid,
  );

  // 2.2 Extract from Cookie header
  const reqCookieStr = new Request("http://localhost:3000/api/projects", {
    headers: { cookie: `${OWNER_COOKIE_NAME}=${sampleUuid}` },
  });
  check(
    "extractOwnerId reads from Cookie header string",
    extractOwnerId(reqCookieStr) === sampleUuid,
  );

  // 2.3 requireOwnerId succeeds with valid session
  check(
    "requireOwnerId returns owner ID",
    requireOwnerId(reqCookieStr) === sampleUuid,
  );

  // 2.4 requireOwnerId throws UnauthorizedError on missing cookie/header
  let threwUnauthorized = false;
  try {
    const emptyReq = new Request("http://localhost:3000/api/projects");
    requireOwnerId(emptyReq);
  } catch (err) {
    threwUnauthorized =
      err instanceof UnauthorizedError && err.statusCode === 401;
  }
  check(
    "requireOwnerId throws 401 Unauthorized on missing cookie",
    threwUnauthorized,
  );

  // 2.5 IMPLEMENTATION REQUIREMENT: Never trust an owner id sent in a request body
  const forgedBody = {
    name: "New Project",
    idea: "An idea",
    owner_id: "00000000-0000-4000-8000-000000000000",
    ownerId: "00000000-0000-4000-8000-000000000001",
  };
  const sanitized = sanitizeRequestBody(forgedBody) as Record<string, unknown>;
  check(
    "sanitizeRequestBody strips owner_id from request body",
    sanitized.owner_id === undefined,
  );
  check(
    "sanitizeRequestBody strips ownerId from request body",
    sanitized.ownerId === undefined,
  );
  check(
    "sanitizeRequestBody preserves legitimate fields",
    sanitized.name === "New Project" && sanitized.idea === "An idea",
  );

  // If no database URL, report and finish unit checks
  if (!process.env.DATABASE_URL) {
    console.log("\nDATABASE_URL not set: skipping database isolation checks.");
    return;
  }

  // =========================================================================
  // Part 3: Database Isolation - Two Cookies & Direct ID Access
  // =========================================================================
  console.log(
    "\n--- Part 3: Database Isolation - Two Cookies & Direct ID Access ---",
  );

  const db = getDb();
  const createdProjectIds: string[] = [];

  try {
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();

    // 3.1 User A creates Project A; User B creates Project B (TEST CASE: two cookies)
    const projectA = await createProjectForOwner(
      { name: "User A Secret Project", idea: "Confidential idea for User A" },
      userA,
    );
    createdProjectIds.push(projectA.id);

    const projectB = await createProjectForOwner(
      { name: "User B Public Project", idea: "Idea for User B" },
      userB,
    );
    createdProjectIds.push(projectB.id);

    check("Project A has owner_id equal to userA", projectA.owner_id === userA);
    check("Project B has owner_id equal to userB", projectB.owner_id === userB);

    // 3.2 Two cookies listing isolation
    const listA = await findProjectsByOwner(userA);
    const listB = await findProjectsByOwner(userB);

    check(
      "TEST CASE (Two cookies): User A list includes Project A",
      listA.some((p) => p.id === projectA.id),
    );
    check(
      "TEST CASE (Two cookies): User A list DOES NOT include Project B",
      !listA.some((p) => p.id === projectB.id),
    );
    check(
      "TEST CASE (Two cookies): User B list includes Project B",
      listB.some((p) => p.id === projectB.id),
    );
    check(
      "TEST CASE (Two cookies): User B list DOES NOT include Project A",
      !listB.some((p) => p.id === projectA.id),
    );

    // 3.3 Direct ID Access - Read (TEST CASE: direct id access)
    // ACCEPTANCE CRITERIA: User A cannot read or change user B's project
    const bReadsA = await findProjectById(projectA.id, userB);
    check(
      "ACCEPTANCE CRITERIA: User B CANNOT read User A's project by direct ID (returns null)",
      bReadsA === null,
    );

    const aReadsB = await findProjectById(projectB.id, userA);
    check(
      "ACCEPTANCE CRITERIA: User A CANNOT read User B's project by direct ID (returns null)",
      aReadsB === null,
    );

    const aReadsA = await findProjectById(projectA.id, userA);
    check(
      "User A can read User A's own project by direct ID",
      aReadsA !== null && aReadsA.id === projectA.id,
    );

    // 3.4 Direct ID Access - Change / Update (TEST CASE: direct id access)
    // ACCEPTANCE CRITERIA: User A cannot read or change user B's project
    const bUpdatesA = await updateProjectForOwner(
      projectA.id,
      { name: "Hacked by User B" },
      userB,
    );
    check(
      "ACCEPTANCE CRITERIA: User B CANNOT change User A's project (update returns null)",
      bUpdatesA === null,
    );

    // Verify Project A's name was not modified in the database
    const [freshA] = await db<{ name: string }[]>`
      SELECT name FROM projects WHERE id = ${projectA.id}
    `;
    check(
      "Project A name in database remains untouched after User B's update attempt",
      freshA.name === "User A Secret Project",
    );

    // 3.5 Direct ID Access - Delete (TEST CASE: direct id access)
    const bDeletesA = await deleteProjectForOwner(projectA.id, userB);
    check(
      "ACCEPTANCE CRITERIA: User B CANNOT delete User A's project (delete returns false)",
      bDeletesA === false,
    );

    const [stillExistsA] = await db<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${projectA.id}
    `;
    check(
      "Project A still exists in database after User B's delete attempt",
      stillExistsA !== undefined,
    );

    // 3.6 Nodes Isolation - Create nodes for Project A and verify User B cannot read or change them
    const [nodeA] = await db<{ id: string }[]>`
      INSERT INTO nodes (project_id, node_key, phase, title, status)
      VALUES (${projectA.id}, '01.1', '01', 'Private Node A', 'not_started')
      RETURNING id
    `;

    const bFindsNodesA = await findProjectNodesForOwner(projectA.id, userB);
    check(
      "User B querying nodes of Project A receives empty list",
      Array.isArray(bFindsNodesA) && bFindsNodesA.length === 0,
    );

    const bReadsNodeA = await findNodeByIdForOwner(nodeA.id, userB);
    check(
      "User B accessing node of Project A directly by node ID receives null",
      bReadsNodeA === null,
    );

    const bUpdatesNodeA = await updateNodeForOwner(
      nodeA.id,
      { status: "completed" },
      userB,
    );
    check(
      "User B updating node of Project A directly by node ID receives null",
      bUpdatesNodeA === null,
    );

    const [freshNodeA] = await db<{ status: string }[]>`
      SELECT status FROM nodes WHERE id = ${nodeA.id}
    `;
    check(
      "Node A status in database remains 'not_started' after User B update attempt",
      freshNodeA.status === "not_started",
    );

    // 3.7 Body owner_id spoofing prevention in createProjectForOwner
    // Even if caller passes owner_id: userA in the body, it must use the authenticated owner (userB)
    const spoofAttempt = await createProjectForOwner(
      {
        name: "Spoof Project",
        idea: "Attempting to assign to userA via body",
        owner_id: userA, // Attacker tries to create on behalf of userA
      },
      userB,
    );
    createdProjectIds.push(spoofAttempt.id);

    check(
      "Body owner_id spoofing ignored: project owner_id is userB (not userA)",
      spoofAttempt.owner_id === userB,
    );
  } finally {
    // Clean up created test projects
    if (createdProjectIds.length > 0) {
      try {
        await db`
          DELETE FROM projects WHERE id IN ${db(createdProjectIds)}
        `;
        console.log(`\nCleaned up ${createdProjectIds.length} test projects.`);
      } catch (cleanupErr) {
        console.error("Cleanup error:", cleanupErr);
      }
    }
    await db.end();
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
    console.log("\nALL ANONYMOUS OWNER CHECKS PASSED!");
  }
}

runTests().catch((err) => {
  console.error("Unhandled error in test-session:", err);
  process.exit(1);
});
