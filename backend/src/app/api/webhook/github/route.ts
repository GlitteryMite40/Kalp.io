import { NextRequest, NextResponse } from "next/server";
import { processWebhook } from "@/server/webhook";
import { findProjectsByRepoFullName } from "@/server/repo";
import { applyCommit } from "@/server/applyCommit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhook/github
 *
 * Incoming webhook endpoint for GitHub events (ping, push).
 * Verifies payload HMAC against project-specific secrets and processes commit metadata.
 * Stores commits and marks matched nodes as 'committed' (Task 06.4).
 *
 * Constraints:
 * - Read raw body with await request.text() BEFORE any parsing.
 * - No owner session or rate limits applied to incoming webhooks.
 * - Respond quickly without long-running database or background tasks.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const result = await processWebhook({
      rawBody,
      headers: request.headers,
      findProjectsByRepoFullName,
      onCommit: async (commitInput) => {
        await applyCommit(commitInput);
      },
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("Unhandled error in GitHub webhook handler:", err);
    return NextResponse.json(
      { ok: false, error: "internal server error" },
      { status: 500 },
    );
  }
}
