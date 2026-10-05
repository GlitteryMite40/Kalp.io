import { NextResponse } from "next/server";
import { checkDbConnection } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface DatabasePingResult {
  ok: boolean;
  latencyMs: number;
}

export interface HealthResponseBody {
  status: "ok" | "unavailable";
  service: "kalp-io-backend";
  timestamp: string;
  database: DatabasePingResult;
}

type PingDatabase = () => Promise<DatabasePingResult>;

function publicDatabasePing(result: DatabasePingResult): DatabasePingResult {
  return {
    ok: result.ok === true,
    latencyMs: Number.isFinite(result.latencyMs) ? result.latencyMs : 0,
  };
}

export async function buildHealthResponse(
  pingDatabase: PingDatabase = checkDbConnection,
) {
  let database: DatabasePingResult;

  try {
    database = publicDatabasePing(await pingDatabase());
  } catch {
    database = { ok: false, latencyMs: 0 };
  }

  const body: HealthResponseBody = {
    status: database.ok ? "ok" : "unavailable",
    service: "kalp-io-backend",
    timestamp: new Date().toISOString(),
    database,
  };

  return NextResponse.json(body, { status: database.ok ? 200 : 503 });
}

/**
 * GET /api/health
 *
 * Reports backend health and whether the database ping is reachable.
 * Does not return secrets or raw connection errors.
 */
export async function GET() {
  return buildHealthResponse();
}
