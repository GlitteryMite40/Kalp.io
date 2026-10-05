/**
 * Test Suite for Task 04.1: POST /api/projects (backend/src/app/api/projects/route.ts)
 *
 * Verifies:
 * 1. Acceptance Criteria:
 *    - Returns id fast with status 'generating'
 *    - Does NOT execute the AI pipeline inside the request
 * 2. Test Cases:
 *    - Valid input (with cookie, without cookie, with explicit name, without name)
 *    - Empty input (empty string, whitespace, missing field, < 5 chars, malformed JSON)
 *    - Too-long input (> 20,000 characters)
 * 3. Security:
 *    - Never trusts owner_id sent in request body
 *    - Sets owner cookie on first visit
 */

import fs from "node:fs";
import { NextRequest } from "next/server";
import { POST, GET } from "../src/app/api/projects/route";
import { OWNER_COOKIE_NAME, isValidOwnerId } from "../src/server/session";
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
  console.log("=== RUNNING TASK 04.1 POST /projects TEST SUITE ===\n");

  const createdProjectIds: string[] = [];

  // Warm up connection so TCP/TLS handshake latency to remote Supabase does not penalize route timing
  if (process.env.DATABASE_URL) {
    const db = getDb();
    await db`SELECT 1`;
  }

  // =========================================================================
  // Part 1: Valid Input (ACCEPTANCE CRITERIA: Returns id fast with status generating)
  // =========================================================================
  console.log("--- Part 1: Valid Input & Fast Response ---");

  const testOwnerId = crypto.randomUUID();
  const validIdea =
    "Build a dependency-aware project management tool that breaks user ideas into DAG build graphs.";

  const req1 = new NextRequest("http://localhost:3000/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${OWNER_COOKIE_NAME}=${testOwnerId}`,
    },
    body: JSON.stringify({
      idea: validIdea,
      name: "Kalp Graph Engine",
    }),
  });

  const startTime = Date.now();
  const res1 = await POST(req1);
  const durationMs = Date.now() - startTime;

  check("Response status is 201 Created", res1.status === 201);
  check(
    `ACCEPTANCE CRITERIA: Response returns fast (${durationMs}ms < 1000ms)`,
    durationMs < 1000,
  );

  const json1 = (await res1.json()) as {
    success: boolean;
    id: string;
    status: string;
    data?: {
      id: string;
      status: string;
      name: string;
      idea: string;
      owner_id: string;
    };
  };

  check("Response returns valid UUID id", isValidOwnerId(json1.id));
  check(
    "ACCEPTANCE CRITERIA: Returns status 'generating'",
    json1.status === "generating",
  );
  check("Response data contains matching id", json1.data?.id === json1.id);
  check(
    "Response data contains status 'generating'",
    json1.data?.status === "generating",
  );
  check(
    "Response data contains project name",
    json1.data?.name === "Kalp Graph Engine",
  );
  check(
    "Response data contains owner_id matching cookie session",
    json1.data?.owner_id === testOwnerId,
  );

  if (json1.id) {
    createdProjectIds.push(json1.id);
  }

  // 1.2 Valid Input without explicit name (derives name from idea)
  const req2 = new NextRequest("http://localhost:3000/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${OWNER_COOKIE_NAME}=${testOwnerId}`,
    },
    body: JSON.stringify({
      idea: "Personal habit tracking system with consecutive streak counters.",
    }),
  });

  const res2 = await POST(req2);
  check("POST without name returns 201", res2.status === 201);

  const json2 = (await res2.json()) as {
    id: string;
    status: string;
    data?: { name: string };
  };
  check(
    "Derives sensible project name from idea",
    Boolean(json2.data?.name && json2.data.name.length > 0),
  );
  if (json2.id) {
    createdProjectIds.push(json2.id);
  }

  // 1.3 Valid Input without existing cookie (issues cookie on response)
  const req3 = new NextRequest("http://localhost:3000/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      idea: "First visit anonymous user building an automated CRM tool.",
    }),
  });

  const res3 = await POST(req3);
  check("POST without cookie returns 201", res3.status === 201);
  const issuedCookie = res3.cookies.get(OWNER_COOKIE_NAME);
  check(
    "POST without cookie sets owner cookie on response",
    issuedCookie !== undefined,
  );
  check(
    "Issued owner cookie is valid UUID",
    isValidOwnerId(issuedCookie?.value),
  );

  const json3 = (await res3.json()) as {
    id: string;
    data?: { owner_id: string };
  };
  check(
    "Project owner_id matches issued cookie value",
    json3.data?.owner_id === issuedCookie?.value,
  );
  if (json3.id) {
    createdProjectIds.push(json3.id);
  }

  // 1.4 Security: Request body owner_id is ignored
  const attackerOwnerId = crypto.randomUUID();
  const req4 = new NextRequest("http://localhost:3000/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${OWNER_COOKIE_NAME}=${testOwnerId}`,
    },
    body: JSON.stringify({
      idea: "Security verification test project.",
      owner_id: attackerOwnerId, // Attacker tries to set owner in body
    }),
  });

  const res4 = await POST(req4);
  const json4 = (await res4.json()) as {
    id: string;
    data?: { owner_id: string };
  };
  check(
    "Never trusts owner_id in body: owner_id matches cookie (not body)",
    json4.data?.owner_id === testOwnerId &&
      json4.data?.owner_id !== attackerOwnerId,
  );
  if (json4.id) {
    createdProjectIds.push(json4.id);
  }

  // =========================================================================
  // Part 2: Empty Input (TEST CASES: empty input)
  // =========================================================================
  console.log("\n--- Part 2: Empty Input ---");

  // 2.1 Empty string idea
  const reqEmpty = new NextRequest("http://localhost:3000/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idea: "" }),
  });
  const resEmpty = await POST(reqEmpty);
  check(
    "Empty idea string returns HTTP 400 Bad Request",
    resEmpty.status === 400,
  );

  const jsonEmpty = (await resEmpty.json()) as {
    error?: { code: string; message: string };
  };
  check(
    "Empty idea error code is MISSING_IDEA",
    jsonEmpty.error?.code === "MISSING_IDEA",
  );

  // 2.2 Whitespace only idea
  const reqSpaces = new NextRequest("http://localhost:3000/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idea: "    \n\t   " }),
  });
  const resSpaces = await POST(reqSpaces);
  check(
    "Whitespace-only idea returns HTTP 400 Bad Request",
    resSpaces.status === 400,
  );

  // 2.3 Missing idea field entirely ({})
  const reqMissing = new NextRequest("http://localhost:3000/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Project Without Idea" }),
  });
  const resMissing = await POST(reqMissing);
  check(
    "Missing idea field returns HTTP 400 Bad Request",
    resMissing.status === 400,
  );

  // 2.4 Too short idea (< 5 characters)
  const reqShort = new NextRequest("http://localhost:3000/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idea: "abc" }),
  });
  const resShort = await POST(reqShort);
  check(
    "Idea shorter than 5 chars returns HTTP 400 Bad Request",
    resShort.status === 400,
  );

  // 2.5 Malformed JSON body
  const reqMalformed = new NextRequest("http://localhost:3000/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "This is not JSON",
  });
  const resMalformed = await POST(reqMalformed);
  check(
    "Malformed JSON returns HTTP 400 Bad Request",
    resMalformed.status === 400,
  );

  // =========================================================================
  // Part 3: Too-Long Input (TEST CASES: too-long input)
  // =========================================================================
  console.log("\n--- Part 3: Too-Long Input ---");

  // Max input is 20,000 characters. Generate 20,500 characters
  const tooLongIdea = "Build a project ".repeat(1300); // ~20,800 chars
  check(
    "Generated test idea exceeds 20000 characters",
    tooLongIdea.length > 20000,
  );

  const reqTooLong = new NextRequest("http://localhost:3000/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idea: tooLongIdea }),
  });

  const resTooLong = await POST(reqTooLong);
  check(
    "Too-long idea returns HTTP 400 Bad Request",
    resTooLong.status === 400,
  );

  const jsonTooLong = (await resTooLong.json()) as {
    error?: { code: string; message: string };
  };
  check(
    "Too-long error code is INPUT_TOO_LONG",
    jsonTooLong.error?.code === "INPUT_TOO_LONG",
  );
  check(
    "Too-long error message explains 20000 char maximum",
    Boolean(jsonTooLong.error?.message.includes("20000")),
  );

  // =========================================================================
  // Part 4: GET /api/projects Listing
  // =========================================================================
  console.log("\n--- Part 4: GET /api/projects Listing ---");

  const reqGet = new NextRequest("http://localhost:3000/api/projects", {
    method: "GET",
    headers: {
      cookie: `${OWNER_COOKIE_NAME}=${testOwnerId}`,
    },
  });

  const resGet = await GET(reqGet);
  check("GET /api/projects returns HTTP 200", resGet.status === 200);

  const jsonGet = (await resGet.json()) as {
    success: boolean;
    data: Array<{ id: string }>;
  };
  check(
    "GET /api/projects returns user's created projects",
    Array.isArray(jsonGet.data) && jsonGet.data.some((p) => p.id === json1.id),
  );

  // =========================================================================
  // Cleanup
  // =========================================================================
  if (process.env.DATABASE_URL && createdProjectIds.length > 0) {
    try {
      const db = getDb();
      await db`
        DELETE FROM projects WHERE id IN ${db(createdProjectIds)}
      `;
      console.log(`\nCleaned up ${createdProjectIds.length} test projects.`);
      await db.end();
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
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
    console.log("\nALL POST /projects CHECKS PASSED!");
  }
}

runTests().catch((err) => {
  console.error("Unhandled error in test-post-projects:", err);
  process.exit(1);
});
