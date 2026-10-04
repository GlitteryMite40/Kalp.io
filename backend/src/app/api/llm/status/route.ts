import { NextRequest, NextResponse } from "next/server";
import { getLlmStatus } from "@/server/llm";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "1";

    const status = await getLlmStatus({ refresh });

    return NextResponse.json(status, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal status check failure";
    return NextResponse.json(
      {
        provider: "gemini",
        state: "unavailable",
        selectedModel: null,
        pinned: false,
        modelsListed: 0,
        candidates: [],
        checkedAt: new Date().toISOString(),
        cached: false,
        nextRefreshAt: null,
        error: message,
      },
      { status: 200 },
    );
  }
}
