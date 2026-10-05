/**
 * Test Suite for Task 04.6: Rate limit and cost guard
 *
 * Verifies:
 * 1. Under, at, and over the daily owner limit.
 * 2. Next-day reset creates a fresh allowance.
 * 3. POST /api/projects returns a readable 429 with reset time.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/projects/route";
import { getDb } from "../src/lib/db";
import {
  checkAndIncrementPlanGenerationUsage,
  PLAN_GENERATION_DAILY_LIMIT,
} from "../src/server/rateLimit";
import { OWNER_COOKIE_NAME } from "../src/server/session";

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

function usageDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

async function run() {
  console.log("=== RUNNING TASK 04.6 RATE LIMIT TEST SUITE ===\n");

  const db = getDb();
  const ownerId = crypto.randomUUID();
  const routeOwnerId = crypto.randomUUID();
  const now = new Date("2026-10-05T12:00:00.000Z");
  const tomorrow = new Date("2026-10-06T12:00:00.000Z");
  const today = usageDay(now);
  const tomorrowDay = usageDay(tomorrow);
  const cleanupOwnerIds = [ownerId, routeOwnerId];
  const cleanupProjectIds: string[] = [];

  if (process.env.DATABASE_URL) {
    await db`SELECT 1`;
  }

  try {
    console.log("--- Part 1: Under, at, and over limit ---");
    const first = await checkAndIncrementPlanGenerationUsage(ownerId, {
      limit: 2,
      now,
    });
    check("Under limit increments usage to 1", first.count === 1, first);

    const second = await checkAndIncrementPlanGenerationUsage(ownerId, {
      limit: 2,
      now,
    });
    check("At limit increments usage to 2", second.count === 2, second);

    try {
      await checkAndIncrementPlanGenerationUsage(ownerId, { limit: 2, now });
      check("Over limit throws", false);
    } catch (error) {
      const err = error as {
        statusCode?: number;
        code?: string;
        message?: string;
        details?: { reset_at?: string };
      };
      check("Over limit throws HTTP 429 error", err.statusCode === 429, err);
      check("Over limit error code is readable", err.code === "RATE_LIMIT_EXCEEDED", err);
      check(
        "Over limit message says when it resets",
        Boolean(err.message?.includes("Try again after") && err.details?.reset_at),
        err,
      );
    }

    const [usageAfterOver] = await db<{ count: number }[]>`
      SELECT count FROM usage WHERE owner_id = ${ownerId} AND day = ${today}
    `;
    check(
      "Over-limit attempt does not increment stored count",
      usageAfterOver?.count === 2,
      usageAfterOver,
    );

    console.log("\n--- Part 2: Next-day reset ---");
    const nextDay = await checkAndIncrementPlanGenerationUsage(ownerId, {
      limit: 2,
      now: tomorrow,
    });
    check("Next day starts a fresh count at 1", nextDay.count === 1, nextDay);

    const [nextDayUsage] = await db<{ count: number }[]>`
      SELECT count FROM usage
      WHERE owner_id = ${ownerId} AND day = ${tomorrowDay}
    `;
    check("Next-day usage row is separate", nextDayUsage?.count === 1, nextDayUsage);

    console.log("\n--- Part 3: POST /api/projects 429 response ---");
    const routeDay = usageDay(new Date());
    await db`
      INSERT INTO usage (owner_id, day, count)
      VALUES (${routeOwnerId}, ${routeDay}, ${PLAN_GENERATION_DAILY_LIMIT})
      ON CONFLICT (owner_id, day)
      DO UPDATE SET count = ${PLAN_GENERATION_DAILY_LIMIT}
    `;

    const req = new NextRequest("http://localhost:3000/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${OWNER_COOKIE_NAME}=${routeOwnerId}`,
      },
      body: JSON.stringify({
        idea: "Build a rate limited project generation flow with clear quota errors.",
      }),
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      success: boolean;
      error?: {
        code: string;
        message: string;
        details?: { reset_at?: string; limit?: number; count?: number };
      };
      id?: string;
    };
    if (body.id) {
      cleanupProjectIds.push(body.id);
    }

    check("ACCEPTANCE CRITERIA: over-limit request gets HTTP 429", res.status === 429, body);
    check("429 response has RATE_LIMIT_EXCEEDED code", body.error?.code === "RATE_LIMIT_EXCEEDED", body);
    check(
      "429 response message is readable and says when it resets",
      Boolean(body.error?.message.includes("Try again after") && body.error.details?.reset_at),
      body,
    );

    const [routeProjectCount] = await db<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM projects
      WHERE owner_id = ${routeOwnerId}
    `;
    check(
      "Over-limit POST does not create a project",
      routeProjectCount?.count === 0,
      routeProjectCount,
    );
  } finally {
    for (const projectId of cleanupProjectIds) {
      await db`DELETE FROM projects WHERE id = ${projectId}`;
    }
    for (const id of cleanupOwnerIds) {
      await db`DELETE FROM usage WHERE owner_id = ${id}`;
    }
    console.log(`\nCleaned up usage rows for ${cleanupOwnerIds.length} owner(s).`);
  }

  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log("\nALL RATE LIMIT CHECKS PASSED!");
  }
}

run().catch((err) => {
  console.error("Unhandled error in test runner:", err);
  process.exitCode = 1;
});
