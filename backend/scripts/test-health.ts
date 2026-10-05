/**
 * Test Suite for Task 04.7: GET /api/health
 *
 * Verifies:
 * 1. Healthy database returns HTTP 200 and status ok.
 * 2. Database down returns HTTP 503 without leaking raw error details.
 */

import fs from "node:fs";
import { GET, buildHealthResponse } from "../src/app/api/health/route";
import { getDb } from "../src/lib/db";

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
  console.log("=== RUNNING TASK 04.7 HEALTH ROUTE TEST SUITE ===\n");

  if (process.env.DATABASE_URL) {
    const db = getDb();
    await db`SELECT 1`;
  }

  console.log("--- Part 1: Healthy database ---");
  const healthyRes = await GET();
  const healthyBody = (await healthyRes.json()) as {
    status?: string;
    service?: string;
    timestamp?: string;
    database?: { ok?: boolean; latencyMs?: number; error?: string };
  };

  check("Healthy response returns HTTP 200", healthyRes.status === 200, healthyBody);
  check("Healthy response status is ok", healthyBody.status === "ok", healthyBody);
  check("Healthy response database.ok is true", healthyBody.database?.ok === true, healthyBody);
  check(
    "Healthy response includes numeric database latency",
    typeof healthyBody.database?.latencyMs === "number",
    healthyBody,
  );
  check(
    "Healthy response does not expose raw database error",
    !("error" in (healthyBody.database ?? {})),
    healthyBody,
  );

  console.log("\n--- Part 2: Database down ---");
  const downRes = await buildHealthResponse(async () => ({
    ok: false,
    latencyMs: 12,
  }));
  const downBody = (await downRes.json()) as {
    status?: string;
    database?: { ok?: boolean; latencyMs?: number; error?: string };
  };

  check("DB down response returns HTTP 503", downRes.status === 503, downBody);
  check("DB down response status is unavailable", downBody.status === "unavailable", downBody);
  check("DB down response database.ok is false", downBody.database?.ok === false, downBody);
  check(
    "DB down response does not expose raw database error",
    !("error" in (downBody.database ?? {})),
    downBody,
  );

  const thrownRes = await buildHealthResponse(async () => {
    throw new Error("postgres://secret@host:5432/db");
  });
  const thrownBody = (await thrownRes.json()) as {
    status?: string;
    database?: { ok?: boolean; error?: string };
  };
  check("Thrown DB ping response returns HTTP 503", thrownRes.status === 503, thrownBody);
  check(
    "Thrown DB ping response still hides raw error",
    thrownBody.database?.ok === false && !("error" in (thrownBody.database ?? {})),
    thrownBody,
  );

  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log("\nALL HEALTH ROUTE CHECKS PASSED!");
  }
}

run().catch((err) => {
  console.error("Unhandled error in test runner:", err);
  process.exitCode = 1;
});
