import { NextRequest, NextResponse } from "next/server";
import { getOwnerId, isValidOwnerId } from "@/server/session";
import { findProjectGraphForOwner } from "@/server/graph";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/errors";
import { jsonError } from "@/server/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/projects/:id/graph
 *
 * Returns nodes and edges for the specified project with computed Ready/Blocked status.
 * Strictly scoped to the verified anonymous owner session.
 *
 * Status Determination:
 * - Completed / committed nodes remain completed / committed.
 * - Active states (in_progress, failed, needs_review) are preserved.
 * - Nodes with 0 prerequisites or all prerequisites completed are marked 'ready'.
 * - Nodes with at least one uncompleted prerequisite are marked 'blocked'.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    // 1. Resolve owner ID from cookie or request header (middleware)
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      throw new UnauthorizedError(
        "Missing or invalid anonymous owner session cookie",
        { code: "UNAUTHORIZED_SESSION" },
      );
    }

    // 2. Resolve project ID param (compatible with Next.js 15 Promise params and objects)
    const resolvedParams = await Promise.resolve(params);
    const projectId = (resolvedParams?.id ?? "").trim();

    if (!projectId || !isValidOwnerId(projectId)) {
      throw new BadRequestError(
        `Invalid project ID "${projectId}". Must be a valid UUID.`,
        { code: "INVALID_PROJECT_ID" },
      );
    }

    // 3. Retrieve project graph strictly scoped to owner
    const graphResult = await findProjectGraphForOwner(projectId, ownerId);

    if (!graphResult) {
      throw new NotFoundError(`Project with id "${projectId}" not found`);
    }

    // 4. Return graph with computed Ready/Blocked status
    const { project, nodes, edges, requirements } = graphResult;

    return NextResponse.json(
      {
        success: true,
        project_id: project.id,
        status: project.status,
        nodes,
        edges,
        data: {
          project_id: project.id,
          project,
          nodes,
          edges,
          requirements,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
