import type postgres from "postgres";
import { ApiError, BadRequestError } from "@/lib/errors";
import { getDb } from "@/lib/db";
import { isValidOwnerId } from "./sessionShared";

export const PLAN_GENERATION_DAILY_LIMIT = 10;
export const PLAN_INPUT_CHAR_LIMIT = 20_000;
export const MAX_LLM_OUTPUT_TOKENS = 16_384;

export const STAGE_LLM_TOKEN_LIMITS = {
  requirements: 4_096,
  architecture: 4_096,
  decomposition: MAX_LLM_OUTPUT_TOKENS,
  criteria: 4_096,
} as const;

export interface UsageRecord {
  owner_id: string;
  day: string | Date;
  count: number;
}

export interface RateLimitResult {
  ownerId: string;
  day: string;
  count: number;
  limit: number;
  resetAt: string;
}

export class RateLimitExceededError extends ApiError {
  constructor(result: Omit<RateLimitResult, "count"> & { count: number }) {
    super(
      `Daily plan generation limit reached (${result.count}/${result.limit}). Try again after ${result.resetAt}.`,
      429,
      "RATE_LIMIT_EXCEEDED",
      {
        owner_id: result.ownerId,
        day: result.day,
        count: result.count,
        limit: result.limit,
        reset_at: result.resetAt,
      },
    );
  }
}

function usageDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function nextUtcMidnight(now: Date): string {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  ).toISOString();
}

/**
 * Atomically counts a plan generation against the owner's daily allowance.
 */
export async function checkAndIncrementPlanGenerationUsage(
  ownerId: string,
  options?: {
    limit?: number;
    now?: Date;
    db?: postgres.Sql;
  },
): Promise<RateLimitResult> {
  if (!isValidOwnerId(ownerId)) {
    throw new BadRequestError("Invalid owner ID format", {
      code: "INVALID_OWNER_ID",
    });
  }

  const limit = options?.limit ?? PLAN_GENERATION_DAILY_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new BadRequestError("Rate limit must be a positive integer", {
      code: "INVALID_RATE_LIMIT",
    });
  }

  const now = options?.now ?? new Date();
  const day = usageDay(now);
  const resetAt = nextUtcMidnight(now);
  const db = options?.db ?? getDb();

  const [updated] = await db<UsageRecord[]>`
    INSERT INTO usage (owner_id, day, count)
    VALUES (${ownerId}, ${day}, 1)
    ON CONFLICT (owner_id, day)
    DO UPDATE SET count = usage.count + 1
    WHERE usage.count < ${limit}
    RETURNING owner_id, day, count
  `;

  if (updated) {
    return {
      ownerId,
      day,
      count: updated.count,
      limit,
      resetAt,
    };
  }

  const [current] = await db<UsageRecord[]>`
    SELECT owner_id, day, count
    FROM usage
    WHERE owner_id = ${ownerId} AND day = ${day}
  `;

  throw new RateLimitExceededError({
    ownerId,
    day,
    count: current?.count ?? limit,
    limit,
    resetAt,
  });
}

export const consumePlanGenerationQuota = checkAndIncrementPlanGenerationUsage;
