import postgres from "postgres";
import { getEnv } from "@/lib/env";

declare global {
  var __kalp_db_client__: postgres.Sql | undefined;
}

let client: postgres.Sql | null = null;

/**
 * Returns a pooled PostgreSQL client connected to Supabase Postgres.
 * The client is instantiated lazily on first access and reused per instance.
 */
export function getDb(): postgres.Sql {
  if (global.__kalp_db_client__) {
    return global.__kalp_db_client__;
  }

  if (!client) {
    const env = getEnv();
    client = postgres(env.DATABASE_URL, {
      // Required for Supabase Transaction Pooler (port 6543)
      prepare: false,
      // Conservative max connections per serverless function instance
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: "require",
    });

    if (process.env.NODE_ENV !== "production") {
      global.__kalp_db_client__ = client;
    }
  }

  return client;
}

/**
 * Checks that the database connection is healthy by running a simple query.
 */
export async function checkDbConnection(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const db = getDb();
    const rows = await db`SELECT 1 as result, NOW() as current_time`;
    const latencyMs = Date.now() - start;
    if (rows && rows.length > 0) {
      return { ok: true, latencyMs };
    }
    return { ok: false, latencyMs, error: "No rows returned from query" };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const message =
      error instanceof Error
        ? error.message
        : "Unknown database connection error";
    return { ok: false, latencyMs, error: message };
  }
}

/**
 * Default export is getDb for functional access.
 */
export default getDb;

// CLI entrypoint for direct connection checking (e.g. npm run db:check)
if (
  typeof process !== "undefined" &&
  process.argv[1]?.replace(/\\/g, "/").endsWith("src/lib/db.ts")
) {
  (async () => {
    if (!process.env.DATABASE_URL) {
      try {
        const fs = await import("fs");
        if (fs.existsSync(".env.local")) {
          process.loadEnvFile(".env.local");
        } else if (fs.existsSync(".env")) {
          process.loadEnvFile(".env");
        }
      } catch {
        // Continue
      }
    }

    console.log("Testing Supabase Postgres connection...");
    const res = await checkDbConnection();
    if (res.ok) {
      console.log(
        `✅ Supabase Postgres connected successfully (${res.latencyMs}ms)`,
      );
      const activeClient = getDb();
      await activeClient.end();
      process.exit(0);
    } else {
      console.error(`❌ Connection failed (${res.latencyMs}ms):`, res.error);
      process.exit(1);
    }
  })();
}
