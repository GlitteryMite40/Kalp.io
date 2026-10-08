import { NextRequest } from "next/server";
import { getOwnerId } from "@/server/session";
import { getNodeLearningDetails } from "@/server/learning";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { jsonSuccess, jsonError } from "@/server/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/nodes/[id]/learn
 *
 * Retrieves the learning explanation, check question, and answer state for a node.
 * Scoped to the requesting owner session.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      throw new UnauthorizedError(
        "Missing or invalid anonymous owner session cookie",
        { code: "UNAUTHORIZED_SESSION" },
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const id = (resolvedParams?.id ?? "").trim();
    if (!id) {
      throw new BadRequestError("Node ID is required", {
        code: "MISSING_NODE_ID",
      });
    }

    const details = await getNodeLearningDetails(id, ownerId);

    return jsonSuccess(details, 200);
  } catch (error) {
    return jsonError(error);
  }
}
