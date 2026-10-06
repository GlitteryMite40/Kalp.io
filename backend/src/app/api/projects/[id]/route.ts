import { NextRequest, NextResponse } from "next/server";
import {
  getOwnerId,
  findProjectById,
  deleteProjectForOwner,
} from "@/server/session";
import { isValidUuid } from "@/server/extract";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/errors";
import { jsonError } from "@/server/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/projects/:id
 *
 * Deletes a project only if it belongs to the authenticated owner.
 * All cascading records (nodes, edges, requirements, stages) are automatically deleted.
 *
 * Acceptance Criteria:
 * - Delete own project returns 200 OK and deletes project, nodes, and edges.
 * - Delete another owner's project returns 404 Not Found.
 * - Delete twice returns 404 Not Found on the second attempt.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    // 1. Resolve owner ID from session cookie or header
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      throw new UnauthorizedError(
        "Missing or invalid anonymous owner session",
        { code: "UNAUTHORIZED_SESSION" },
      );
    }

    // 2. Resolve project ID from route params
    const resolvedParams = await Promise.resolve(params);
    const id = (resolvedParams?.id ?? "").trim();

    if (!id || !isValidUuid(id)) {
      throw new BadRequestError(
        "Invalid project ID format. Must be a valid UUID.",
        {
          code: "INVALID_PROJECT_ID",
        },
      );
    }

    // 3. Delete project scoped to owner
    const deleted = await deleteProjectForOwner(id, ownerId);
    if (!deleted) {
      throw new NotFoundError(`Project with id "${id}" not found`);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Project deleted successfully",
        id,
      },
      { status: 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * GET /api/projects/:id
 *
 * Retrieves a single project strictly verifying owner ownership.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      throw new UnauthorizedError(
        "Missing or invalid anonymous owner session",
        { code: "UNAUTHORIZED_SESSION" },
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const id = (resolvedParams?.id ?? "").trim();

    if (!id || !isValidUuid(id)) {
      throw new BadRequestError(
        "Invalid project ID format. Must be a valid UUID.",
        {
          code: "INVALID_PROJECT_ID",
        },
      );
    }

    const project = await findProjectById(id, ownerId);
    if (!project) {
      throw new NotFoundError(`Project with id "${id}" not found`);
    }

    return NextResponse.json(
      {
        success: true,
        data: project,
      },
      { status: 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
