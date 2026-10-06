import { NextRequest } from "next/server";
import { z } from "zod";
import { getOwnerId } from "@/server/session";
import { isValidUuid } from "@/server/extract";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { jsonSuccess, jsonError } from "@/server/response";
import {
  normalizeRepoUrl,
  checkRepoPublic,
  connectRepoForOwner,
  getRepoForOwner,
  disconnectRepoForOwner,
} from "@/server/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const connectRepoSchema = z.object({
  repo_url: z
    .string({ error: "repo_url is required" })
    .min(1, "repo_url cannot be empty"),
});

interface RouteParams {
  params: Promise<{ id: string }> | { id: string };
}

async function resolveProjectId(
  params: RouteParams["params"],
): Promise<string> {
  const resolved = await Promise.resolve(params);
  const id = (resolved?.id ?? "").trim();
  if (!id || !isValidUuid(id)) {
    throw new BadRequestError(
      "Invalid project ID format. Must be a valid UUID.",
      { code: "INVALID_PROJECT_ID" },
    );
  }
  return id;
}

/**
 * POST /api/projects/:id/repo
 *
 * Connects a GitHub repository to the owner's project.
 * Verifies public accessibility, stores normalized URL and repo_full_name,
 * and provisions a dedicated webhook secret.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      throw new UnauthorizedError(
        "Missing or invalid anonymous owner session",
        { code: "UNAUTHORIZED_SESSION" },
      );
    }

    const projectId = await resolveProjectId(params);

    let bodyJson: unknown;
    try {
      bodyJson = await request.json();
    } catch {
      throw new BadRequestError("Invalid JSON body", { code: "INVALID_JSON" });
    }

    const parseResult = connectRepoSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      const msg = parseResult.error.issues.map((i) => i.message).join(", ");
      throw new BadRequestError(msg, { code: "INVALID_REQUEST_BODY" });
    }

    const { repo_url } = parseResult.data;
    const normalized = normalizeRepoUrl(repo_url);
    const publicCheck = await checkRepoPublic(
      normalized.owner,
      normalized.repo,
    );
    const connected = await connectRepoForOwner(projectId, ownerId, normalized);

    return jsonSuccess({
      repo_url: connected.repo_url,
      repo_full_name: connected.repo_full_name,
      public_check: publicCheck,
      webhook_path: "/api/webhook/github",
      webhook_secret: connected.webhook_secret,
    });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * GET /api/projects/:id/repo
 *
 * Retrieves connected repository metadata and webhook configuration for the owner's project.
 * Returns { repo_url: null } if no repository is currently connected.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      throw new UnauthorizedError(
        "Missing or invalid anonymous owner session",
        { code: "UNAUTHORIZED_SESSION" },
      );
    }

    const projectId = await resolveProjectId(params);
    const repoInfo = await getRepoForOwner(projectId, ownerId);

    if (!repoInfo.repo_url) {
      return jsonSuccess({
        repo_url: null,
      });
    }

    return jsonSuccess({
      repo_url: repoInfo.repo_url,
      repo_full_name: repoInfo.repo_full_name,
      repo_connected_at: repoInfo.repo_connected_at,
      webhook_path: "/api/webhook/github",
      webhook_secret: repoInfo.webhook_secret,
    });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * DELETE /api/projects/:id/repo
 *
 * Disconnects the repository from the owner's project.
 * Clears repo_url, repo_full_name, repo_connected_at, and webhook_secret.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      throw new UnauthorizedError(
        "Missing or invalid anonymous owner session",
        { code: "UNAUTHORIZED_SESSION" },
      );
    }

    const projectId = await resolveProjectId(params);
    await disconnectRepoForOwner(projectId, ownerId);

    return jsonSuccess({
      disconnected: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
