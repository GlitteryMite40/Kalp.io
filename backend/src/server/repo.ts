/**
 * Repository Connection & GitHub Verification Service (Task 06.1)
 *
 * Handles GitHub repo URL normalization, public reachability checking,
 * per-project webhook secret generation, and database association.
 */

import crypto from "node:crypto";
import type postgres from "postgres";
import { getDb } from "@/lib/db";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { assertValidUuid } from "./session";

export interface NormalizedRepo {
  url: string;
  owner: string;
  repo: string;
  fullNameLower: string;
}

export interface ConnectedRepoResult {
  projectId: string;
  repo_url: string;
  repo_full_name: string;
  repo_connected_at: string;
  webhook_secret: string;
}

export interface RepoDetailsResult {
  projectId: string;
  repo_url: string | null;
  repo_full_name: string | null;
  repo_connected_at: string | null;
  webhook_secret: string | null;
}

export interface CandidateProject {
  id: string;
  webhook_secret: string;
}

const GITHUB_OWNER_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO_REGEX = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Normalizes a GitHub repository URL into standard canonical form.
 *
 * Rules:
 * - Trims input
 * - Accepts https://github.com/<owner>/<repo> (with optional www., trailing slash, .git, subpaths /tree/..., query, hash)
 * - Owner matches /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
 * - Repo matches /^[A-Za-z0-9._-]{1,100}$/
 * - Rejects (throws BadRequestError with code INVALID_REPO_URL):
 *   - Other hosts (e.g. gitlab, bitbucket)
 *   - Insecure http://
 *   - SSH formats (git@github.com:...)
 *   - Missing repo segment
 *   - Reserved names "." and ".."
 */
export function normalizeRepoUrl(input: unknown): NormalizedRepo {
  if (typeof input !== "string") {
    throw new BadRequestError(
      "Repository URL must be a string",
      { code: "INVALID_REPO_URL" },
      "INVALID_REPO_URL",
    );
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new BadRequestError(
      "Repository URL cannot be empty",
      { code: "INVALID_REPO_URL" },
      "INVALID_REPO_URL",
    );
  }

  if (trimmed.startsWith("git@")) {
    throw new BadRequestError(
      "SSH repository URLs are not supported. Please use HTTPS (https://github.com/owner/repo)",
      { code: "INVALID_REPO_URL" },
      "INVALID_REPO_URL",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestError(
      "Invalid repository URL format",
      { code: "INVALID_REPO_URL" },
      "INVALID_REPO_URL",
    );
  }

  if (parsed.protocol !== "https:") {
    throw new BadRequestError(
      "Repository URL must use https://",
      { code: "INVALID_REPO_URL" },
      "INVALID_REPO_URL",
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "github.com" && hostname !== "www.github.com") {
    throw new BadRequestError(
      "Only GitHub repositories (github.com) are supported",
      { code: "INVALID_REPO_URL" },
      "INVALID_REPO_URL",
    );
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new BadRequestError(
      "Repository URL must include both owner and repo name (https://github.com/owner/repo)",
      { code: "INVALID_REPO_URL" },
      "INVALID_REPO_URL",
    );
  }

  const rawOwner = segments[0];
  let rawRepo = segments[1];

  if (rawRepo.endsWith(".git")) {
    rawRepo = rawRepo.slice(0, -4);
  }

  if (rawRepo === "." || rawRepo === "..") {
    throw new BadRequestError(
      "Invalid repository name",
      { code: "INVALID_REPO_URL" },
      "INVALID_REPO_URL",
    );
  }

  if (!GITHUB_OWNER_REGEX.test(rawOwner)) {
    throw new BadRequestError(
      `Invalid GitHub owner: "${rawOwner}"`,
      { code: "INVALID_REPO_URL" },
      "INVALID_REPO_URL",
    );
  }

  if (!GITHUB_REPO_REGEX.test(rawRepo)) {
    throw new BadRequestError(
      `Invalid GitHub repository name: "${rawRepo}"`,
      { code: "INVALID_REPO_URL" },
      "INVALID_REPO_URL",
    );
  }

  const url = `https://github.com/${rawOwner}/${rawRepo}`;
  const fullNameLower = `${rawOwner.toLowerCase()}/${rawRepo.toLowerCase()}`;

  return {
    url,
    owner: rawOwner,
    repo: rawRepo,
    fullNameLower,
  };
}

/**
 * Generates a cryptographically secure 64-character hex secret for webhook HMAC verification.
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Verifies public accessibility of a GitHub repository via unauthenticated GitHub API request.
 *
 * Behaviors:
 * - 200 -> 'public'
 * - 404 -> throws BadRequestError (code: REPO_NOT_FOUND_OR_PRIVATE)
 * - other statuses or network timeouts -> 'skipped' (does not block user)
 */
export async function checkRepoPublic(
  owner: string,
  repo: string,
  options?: { fetcher?: typeof fetch; timeoutMs?: number },
): Promise<"public" | "skipped"> {
  const fetcher = options?.fetcher ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 5000;

  try {
    const res = await fetcher(`https://api.github.com/repos/${owner}/${repo}`, {
      method: "GET",
      headers: {
        "User-Agent": "Kalp.io-RepoChecker/1.0",
        Accept: "application/vnd.github.v3+json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status === 200) {
      return "public";
    }

    if (res.status === 404) {
      throw new BadRequestError(
        "GitHub repository not found or is private. Kalp.io currently requires a public GitHub repository.",
        { code: "REPO_NOT_FOUND_OR_PRIVATE" },
        "REPO_NOT_FOUND_OR_PRIVATE",
      );
    }

    // 403 (e.g. GitHub unauthenticated rate limits), 5xx, or unexpected statuses
    return "skipped";
  } catch (err) {
    if (err instanceof BadRequestError) {
      throw err;
    }
    // Network failures, DNS errors, timeout -> do not block user
    return "skipped";
  }
}

/**
 * Associates a GitHub repository with an owner-scoped project.
 * Sets repo_url, repo_full_name, repo_connected_at, and generates a webhook_secret
 * only if the project does not already have one.
 */
export async function connectRepoForOwner(
  projectId: string,
  ownerId: string,
  normalized: { url: string; fullNameLower: string },
  client?: postgres.Sql,
): Promise<ConnectedRepoResult> {
  assertValidUuid(projectId, "Invalid project ID format");
  assertValidUuid(ownerId, "Invalid owner ID format");

  const db = client ?? getDb();

  // 1. Verify project existence and ownership
  const existingRows = await db<
    Array<{ id: string; webhook_secret: string | null }>
  >`
    SELECT id, webhook_secret
    FROM projects
    WHERE id = ${projectId} AND owner_id = ${ownerId}
  `;

  if (existingRows.length === 0) {
    throw new NotFoundError("Project not found");
  }

  const existing = existingRows[0];
  const secret = existing.webhook_secret || generateWebhookSecret();

  // 2. Update project repository metadata
  const updatedRows = await db<
    Array<{
      id: string;
      repo_url: string;
      repo_full_name: string;
      repo_connected_at: Date;
      webhook_secret: string;
    }>
  >`
    UPDATE projects
    SET repo_url = ${normalized.url},
        repo_full_name = ${normalized.fullNameLower},
        repo_connected_at = now(),
        webhook_secret = ${secret},
        updated_at = now()
    WHERE id = ${projectId} AND owner_id = ${ownerId}
    RETURNING id, repo_url, repo_full_name, repo_connected_at, webhook_secret
  `;

  const updated = updatedRows[0];
  return {
    projectId: updated.id,
    repo_url: updated.repo_url,
    repo_full_name: updated.repo_full_name,
    repo_connected_at: updated.repo_connected_at.toISOString(),
    webhook_secret: updated.webhook_secret,
  };
}

/**
 * Retrieves repository connection metadata for an owner-scoped project.
 * Returns not-found (404) for another owner's project.
 */
export async function getRepoForOwner(
  projectId: string,
  ownerId: string,
  client?: postgres.Sql,
): Promise<RepoDetailsResult> {
  assertValidUuid(projectId, "Invalid project ID format");
  assertValidUuid(ownerId, "Invalid owner ID format");

  const db = client ?? getDb();

  const rows = await db<
    Array<{
      id: string;
      repo_url: string | null;
      repo_full_name: string | null;
      repo_connected_at: Date | null;
      webhook_secret: string | null;
    }>
  >`
    SELECT id, repo_url, repo_full_name, repo_connected_at, webhook_secret
    FROM projects
    WHERE id = ${projectId} AND owner_id = ${ownerId}
  `;

  if (rows.length === 0) {
    throw new NotFoundError("Project not found");
  }

  const row = rows[0];
  return {
    projectId: row.id,
    repo_url: row.repo_url,
    repo_full_name: row.repo_full_name,
    repo_connected_at: row.repo_connected_at
      ? row.repo_connected_at.toISOString()
      : null,
    webhook_secret: row.webhook_secret,
  };
}

/**
 * Disconnects a repository from an owner-scoped project.
 * Clears repo_url, repo_full_name, repo_connected_at, and webhook_secret.
 */
export async function disconnectRepoForOwner(
  projectId: string,
  ownerId: string,
  client?: postgres.Sql,
): Promise<{ disconnected: true }> {
  assertValidUuid(projectId, "Invalid project ID format");
  assertValidUuid(ownerId, "Invalid owner ID format");

  const db = client ?? getDb();

  const res = await db`
    UPDATE projects
    SET repo_url = NULL,
        repo_full_name = NULL,
        repo_connected_at = NULL,
        webhook_secret = NULL,
        updated_at = now()
    WHERE id = ${projectId} AND owner_id = ${ownerId}
  `;

  if (res.count === 0) {
    throw new NotFoundError("Project not found");
  }

  return { disconnected: true };
}

/**
 * Finds all active candidate projects associated with a lowercase repository full_name.
 * Only returns projects that have a non-null webhook_secret.
 */
export async function findProjectsByRepoFullName(
  fullNameLower: string,
  client?: postgres.Sql,
): Promise<CandidateProject[]> {
  if (!fullNameLower || typeof fullNameLower !== "string") {
    return [];
  }

  const db = client ?? getDb();
  const rows = await db<Array<{ id: string; webhook_secret: string }>>`
    SELECT id, webhook_secret
    FROM projects
    WHERE repo_full_name = ${fullNameLower.toLowerCase().trim()}
      AND webhook_secret IS NOT NULL
  `;

  return rows.map((r) => ({
    id: r.id,
    webhook_secret: r.webhook_secret,
  }));
}
