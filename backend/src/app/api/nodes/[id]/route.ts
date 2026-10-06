import { NextRequest, NextResponse } from "next/server";
import { getOwnerId, updateNodeForOwner } from "@/server/session";
import { getNodeBlockedState } from "@/server/graph";
import {
  ALL_NODE_STATUSES,
  DB_NODE_STATUSES,
  type NodeStatus,
  toDbNodeStatus,
} from "@/lib/schema";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/errors";
import { jsonError } from "@/server/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/nodes/:id
 *
 * Updates a node's status, strictly rejecting attempts to start or progress a blocked node.
 * Scoped to the requesting anonymous owner session.
 *
 * Requirements:
 * - Update node status.
 * - Reject starting a blocked node.
 *
 * Acceptance Criteria:
 * - Blocked update rejected (returns 400 Bad Request with code NODE_BLOCKED).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    // 1. Resolve owner ID from session cookie or header
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      throw new UnauthorizedError(
        "Missing or invalid anonymous owner session cookie",
        { code: "UNAUTHORIZED_SESSION" },
      );
    }

    // 2. Resolve node ID from route params
    const resolvedParams = await Promise.resolve(params);
    const id = (resolvedParams?.id ?? "").trim();
    if (!id) {
      throw new BadRequestError("Node ID is required", {
        code: "MISSING_NODE_ID",
      });
    }

    // 3. Parse and validate JSON request body
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new BadRequestError("Invalid JSON request body", {
        code: "INVALID_JSON",
      });
    }

    if (!body || typeof body !== "object") {
      throw new BadRequestError("Request body must be a valid JSON object", {
        code: "INVALID_BODY",
      });
    }

    const rawStatus = body.status;
    if (typeof rawStatus !== "string" || !rawStatus.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_STATUS",
            message: "Missing required field 'status' in request body",
          },
        },
        { status: 400 },
      );
    }

    const trimmedStatus = rawStatus.trim();
    if (!ALL_NODE_STATUSES.includes(trimmedStatus as NodeStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_STATUS",
            message: `Invalid node status "${trimmedStatus}". Must be one of: ${DB_NODE_STATUSES.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    const targetStatus = toDbNodeStatus(trimmedStatus as NodeStatus);

    // 4. Retrieve node and evaluate its current blocked state in the project DAG
    const state = await getNodeBlockedState(id, ownerId);
    if (!state) {
      throw new NotFoundError(`Node with id "${id}" not found`);
    }

    const { node, isBlocked, blockedBy } = state;

    // 5. Reject starting or advancing a blocked node
    // "Reject starting a blocked node. ACCEPTANCE CRITERIA: Blocked update rejected"
    if (isBlocked) {
      if (
        targetStatus === "in_progress" ||
        targetStatus === "completed" ||
        targetStatus === "committed" ||
        targetStatus === "ready"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NODE_BLOCKED",
              message: `Cannot start blocked node "${node.node_key}". Prerequisites not completed: ${blockedBy.join(", ")}`,
              details: {
                node_id: node.id,
                node_key: node.node_key,
                blocked_by: blockedBy,
              },
            },
          },
          { status: 400 },
        );
      }
    }

    // 6. Update node in database
    const updated = await updateNodeForOwner(
      node.id,
      {
        status: targetStatus,
        prompt: typeof body.prompt === "string" ? body.prompt : undefined,
      },
      ownerId,
    );

    if (!updated) {
      throw new NotFoundError(`Node with id "${id}" not found`);
    }

    return NextResponse.json(
      {
        success: true,
        id: updated.id,
        node_key: updated.node_key,
        status: updated.status,
        data: updated,
      },
      { status: 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * GET /api/nodes/:id
 *
 * Retrieves a single node by ID or key, including its computed blocked state.
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

    const state = await getNodeBlockedState(id, ownerId);
    if (!state) {
      throw new NotFoundError(`Node with id "${id}" not found`);
    }

    return NextResponse.json(
      {
        success: true,
        id: state.node.id,
        node_key: state.node.node_key,
        status: state.node.status,
        is_blocked: state.isBlocked,
        blocked_by: state.blockedBy,
        dependencies: state.dependencies,
        data: state.node,
      },
      { status: 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
