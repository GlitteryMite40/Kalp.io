import crypto from "node:crypto";
import type { NextResponse } from "next/server";
import type postgres from "postgres";
import { getDb } from "@/lib/db";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { type NodeStatus, toDbNodeStatus } from "@/lib/schema";
import {
  OWNER_COOKIE_NAME,
  FALLBACK_COOKIE_NAME,
  OWNER_HEADER_NAME,
  COOKIE_MAX_AGE,
  isValidOwnerId,
  getOwnerCookieOptions,
} from "./sessionShared";

export {
  OWNER_COOKIE_NAME,
  FALLBACK_COOKIE_NAME,
  OWNER_HEADER_NAME,
  COOKIE_MAX_AGE,
  isValidOwnerId,
  getOwnerCookieOptions,
};

const isValidUuid = isValidOwnerId;

export function assertValidUuid(
  id: unknown,
  message = "Invalid UUID format",
): string {
  if (!isValidUuid(id)) {
    throw new BadRequestError(message, { code: "INVALID_UUID" });
  }
  return (id as string).trim();
}

/**
 * Issues a fresh random owner UUID for a first-time visitor.
 */
export function issueOwnerId(): string {
  return crypto.randomUUID();
}

/**
 * Extracts a cookie value by name from a raw Cookie header string.
 */
function parseCookieHeader(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      const val = trimmed.slice(name.length + 1).trim();
      return decodeURIComponent(val);
    }
  }
  return null;
}

/**
 * Extracts the owner id from:
 * 1. x-owner-id request header (forwarded by middleware)
 * 2. NextRequest cookies / Request Cookie header (kalp_owner_id or owner_id)
 *
 * Validates that the owner ID is a valid UUID. Never trusts an owner ID from request bodies.
 */
export function extractOwnerId(
  input?:
    | Request
    | Headers
    | {
        headers?: Headers | Record<string, string | string[] | undefined>;
        cookies?: {
          get?: (
            name: string,
          ) => { value?: string } | string | undefined | null;
        };
      },
): string | null {
  if (!input) return null;

  // 1. Check if input is a Headers instance
  if (input instanceof Headers) {
    const headerId = input.get(OWNER_HEADER_NAME);
    if (isValidUuid(headerId)) return headerId.trim();

    const cookieHeader = input.get("cookie");
    const cookieVal =
      parseCookieHeader(cookieHeader, OWNER_COOKIE_NAME) ||
      parseCookieHeader(cookieHeader, FALLBACK_COOKIE_NAME);
    if (isValidUuid(cookieVal)) return cookieVal.trim();

    return null;
  }

  // 2. Check headers from Request / NextRequest / custom object
  const headers =
    "headers" in input && input.headers ? input.headers : undefined;
  if (headers) {
    let headerId: string | null = null;
    if (typeof (headers as Headers).get === "function") {
      headerId = (headers as Headers).get(OWNER_HEADER_NAME);
    } else {
      const rec = headers as Record<string, string | string[] | undefined>;
      const val =
        rec[OWNER_HEADER_NAME] || rec[OWNER_HEADER_NAME.toLowerCase()];
      headerId = Array.isArray(val) ? val[0] : (val ?? null);
    }

    if (isValidUuid(headerId)) return headerId.trim();
  }

  // 3. Check cookies collection if NextRequest
  if (
    "cookies" in input &&
    input.cookies &&
    typeof input.cookies.get === "function"
  ) {
    const primary = input.cookies.get(OWNER_COOKIE_NAME);
    const primaryVal = typeof primary === "string" ? primary : primary?.value;
    if (isValidUuid(primaryVal)) return primaryVal.trim();

    const fallback = input.cookies.get(FALLBACK_COOKIE_NAME);
    const fallbackVal =
      typeof fallback === "string" ? fallback : fallback?.value;
    if (isValidUuid(fallbackVal)) return fallbackVal.trim();
  }

  // 4. Fall back to Cookie header
  if (headers) {
    let cookieHeader: string | null = null;
    if (typeof (headers as Headers).get === "function") {
      cookieHeader = (headers as Headers).get("cookie");
    } else {
      const rec = headers as Record<string, string | string[] | undefined>;
      const val = rec.cookie || rec.Cookie;
      cookieHeader = Array.isArray(val) ? val[0] : (val ?? null);
    }

    const cookieVal =
      parseCookieHeader(cookieHeader, OWNER_COOKIE_NAME) ||
      parseCookieHeader(cookieHeader, FALLBACK_COOKIE_NAME);
    if (isValidUuid(cookieVal)) return cookieVal.trim();
  }

  return null;
}

export const getOwnerId = extractOwnerId;

/**
 * Requires an authenticated/anonymous owner session.
 * Throws UnauthorizedError if cookie is missing or invalid.
 */
export function requireOwnerId(
  input?:
    | Request
    | Headers
    | {
        headers?: Headers | Record<string, string | string[] | undefined>;
        cookies?: {
          get?: (
            name: string,
          ) => { value?: string } | string | undefined | null;
        };
      },
): string {
  const ownerId = extractOwnerId(input);
  if (!ownerId) {
    throw new UnauthorizedError(
      "Missing or invalid anonymous owner session cookie",
      { code: "UNAUTHORIZED_SESSION" },
    );
  }
  return ownerId;
}

/**
 * Sets the httpOnly, Secure, SameSite=Lax owner session cookie on a NextResponse.
 */
export function setOwnerCookie(
  response: NextResponse,
  ownerId: string,
  isProduction?: boolean,
): void {
  assertValidUuid(ownerId, "Cannot set invalid UUID owner cookie");
  const options = getOwnerCookieOptions(isProduction);
  response.cookies.set({
    ...options,
    name: OWNER_COOKIE_NAME,
    value: ownerId,
  });
}

/**
 * Strips owner_id / ownerId from user request body.
 * Enforces requirement: "Never trust an owner id sent in a request body."
 */
export function sanitizeRequestBody<T extends Record<string, unknown>>(
  body: T,
): Omit<T, "owner_id" | "ownerId"> {
  if (!body || typeof body !== "object") return body;
  const copy = { ...body };
  delete copy.owner_id;
  delete copy.ownerId;
  return copy;
}

// ---------------------------------------------------------------------------
// Owner-Scoped Database Query Helpers
// "Every query on projects and nodes filters by this owner id."
// ---------------------------------------------------------------------------

export interface ProjectRecord {
  id: string;
  owner_id: string;
  name: string;
  idea: string;
  status: string;
  current_stage: string | null;
  repo_url: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface NodeRecord {
  id: string;
  project_id: string;
  node_key: string;
  phase: string;
  title: string;
  type: string | null;
  status: string;
  requirement_id: string | null;
  files: string[];
  explanation: string | null;
  acceptance: string[];
  tests: string[];
  prompt: string | null;
  created_at: string | Date;
}

/**
 * Retrieves a project by ID strictly scoped to the requesting owner.
 */
export async function findProjectById(
  projectId: string,
  ownerId: string,
  client?: postgres.Sql,
): Promise<ProjectRecord | null> {
  assertValidUuid(projectId, "Invalid project ID format");
  assertValidUuid(ownerId, "Invalid owner ID format");

  const db = client ?? getDb();
  const rows = await db<ProjectRecord[]>`
    SELECT id, owner_id, name, idea, status, current_stage, repo_url, created_at, updated_at
    FROM projects
    WHERE id = ${projectId} AND owner_id = ${ownerId}
  `;

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Lists all projects belonging strictly to the requesting owner.
 */
export async function findProjectsByOwner(
  ownerId: string,
  client?: postgres.Sql,
): Promise<ProjectRecord[]> {
  assertValidUuid(ownerId, "Invalid owner ID format");

  const db = client ?? getDb();
  return await db<ProjectRecord[]>`
    SELECT id, owner_id, name, idea, status, current_stage, repo_url, created_at, updated_at
    FROM projects
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC
  `;
}

/**
 * Creates a project strictly under the verified owner ID.
 * Any owner_id sent in the data body is stripped and discarded.
 */
export async function createProjectForOwner(
  data: {
    name: string;
    idea: string;
    repo_url?: string | null;
    [key: string]: unknown;
  },
  ownerId: string,
  client?: postgres.Sql,
): Promise<ProjectRecord> {
  assertValidUuid(ownerId, "Invalid owner ID format");

  const sanitized = sanitizeRequestBody(data as Record<string, unknown>);
  const name = (sanitized.name ?? "").toString().trim();
  const idea = (sanitized.idea ?? "").toString().trim();
  const repoUrl =
    typeof sanitized.repo_url === "string" ? sanitized.repo_url.trim() : null;

  if (!name) {
    throw new BadRequestError("Project name is required", {
      code: "MISSING_NAME",
    });
  }
  if (!idea) {
    throw new BadRequestError("Project idea is required", {
      code: "MISSING_IDEA",
    });
  }

  const id = crypto.randomUUID();
  const db = client ?? getDb();

  const [project] = await db<ProjectRecord[]>`
    INSERT INTO projects (id, owner_id, name, idea, status, repo_url, created_at, updated_at)
    VALUES (${id}, ${ownerId}, ${name}, ${idea}, 'generating', ${repoUrl}, now(), now())
    RETURNING id, owner_id, name, idea, status, current_stage, repo_url, created_at, updated_at
  `;

  return project;
}

/**
 * Updates a project only if it belongs to the requesting owner.
 */
export async function updateProjectForOwner(
  projectId: string,
  data: {
    name?: string;
    idea?: string;
    status?: string;
    current_stage?: string | null;
    repo_url?: string | null;
  },
  ownerId: string,
  client?: postgres.Sql,
): Promise<ProjectRecord | null> {
  assertValidUuid(projectId, "Invalid project ID format");
  assertValidUuid(ownerId, "Invalid owner ID format");

  const sanitized = sanitizeRequestBody(data as Record<string, unknown>);
  const db = client ?? getDb();

  const updates: Record<string, unknown> = {};
  if (sanitized.name !== undefined)
    updates.name = String(sanitized.name).trim();
  if (sanitized.idea !== undefined)
    updates.idea = String(sanitized.idea).trim();
  if (sanitized.status !== undefined)
    updates.status = String(sanitized.status).trim();
  if (sanitized.current_stage !== undefined)
    updates.current_stage = sanitized.current_stage
      ? String(sanitized.current_stage).trim()
      : null;
  if (sanitized.repo_url !== undefined)
    updates.repo_url = sanitized.repo_url
      ? String(sanitized.repo_url).trim()
      : null;

  if (Object.keys(updates).length === 0) {
    return findProjectById(projectId, ownerId, db);
  }

  const [updated] = await db<ProjectRecord[]>`
    UPDATE projects
    SET ${db(updates)}, updated_at = now()
    WHERE id = ${projectId} AND owner_id = ${ownerId}
    RETURNING id, owner_id, name, idea, status, current_stage, repo_url, created_at, updated_at
  `;

  return updated ?? null;
}

/**
 * Deletes a project only if it belongs to the requesting owner.
 */
export async function deleteProjectForOwner(
  projectId: string,
  ownerId: string,
  client?: postgres.Sql,
): Promise<boolean> {
  assertValidUuid(projectId, "Invalid project ID format");
  assertValidUuid(ownerId, "Invalid owner ID format");

  const db = client ?? getDb();
  const res = await db`
    DELETE FROM projects
    WHERE id = ${projectId} AND owner_id = ${ownerId}
  `;

  return res.count > 0;
}

/**
 * Retrieves nodes for a project strictly verifying owner ownership.
 */
export async function findProjectNodesForOwner(
  projectId: string,
  ownerId: string,
  client?: postgres.Sql,
): Promise<NodeRecord[]> {
  assertValidUuid(projectId, "Invalid project ID format");
  assertValidUuid(ownerId, "Invalid owner ID format");

  const db = client ?? getDb();
  return await db<NodeRecord[]>`
    SELECT n.*
    FROM nodes n
    JOIN projects p ON n.project_id = p.id
    WHERE p.id = ${projectId} AND p.owner_id = ${ownerId}
    ORDER BY n.phase ASC, n.node_key ASC
  `;
}

/**
 * Retrieves a single node by ID strictly verifying owner ownership through project.
 */
export async function findNodeByIdForOwner(
  nodeId: string,
  ownerId: string,
  client?: postgres.Sql,
): Promise<NodeRecord | null> {
  assertValidUuid(nodeId, "Invalid node ID format");
  assertValidUuid(ownerId, "Invalid owner ID format");

  const db = client ?? getDb();
  const rows = await db<NodeRecord[]>`
    SELECT n.*
    FROM nodes n
    JOIN projects p ON n.project_id = p.id
    WHERE n.id = ${nodeId} AND p.owner_id = ${ownerId}
  `;

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Updates a node only if its associated project belongs to the requesting owner.
 */
export async function updateNodeForOwner(
  nodeId: string,
  data: {
    status?: NodeStatus;
    prompt?: string | null;
  },
  ownerId: string,
  client?: postgres.Sql,
): Promise<NodeRecord | null> {
  assertValidUuid(nodeId, "Invalid node ID format");
  assertValidUuid(ownerId, "Invalid owner ID format");

  const db = client ?? getDb();
  const updates: Record<string, unknown> = {};

  if (data.status !== undefined) {
    updates.status = toDbNodeStatus(data.status);
  }
  if (data.prompt !== undefined) {
    updates.prompt = data.prompt ? data.prompt.trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    return findNodeByIdForOwner(nodeId, ownerId, db);
  }

  const [updated] = await db<NodeRecord[]>`
    UPDATE nodes
    SET ${db(updates)}
    WHERE id = ${nodeId}
      AND project_id IN (SELECT id FROM projects WHERE owner_id = ${ownerId})
    RETURNING *
  `;

  return updated ?? null;
}
