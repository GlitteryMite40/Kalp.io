/**
 * GitHub Webhook Processing Engine (Task 06.2)
 *
 * Verifies HMAC-SHA256 signatures per project and processes webhook payloads.
 * Pure and testable module with zero direct database or network dependencies.
 */

import crypto from "node:crypto";
import { parseNodeKeys } from "./commitParser";
import type { CandidateProject } from "./repo";

export interface ProcessWebhookOptions {
  rawBody: string;
  headers: Headers | Record<string, string | string[] | undefined>;
  findProjectsByRepoFullName: (
    fullNameLower: string,
  ) => Promise<CandidateProject[]> | CandidateProject[];
}

export interface ProcessWebhookResult {
  status: number;
  body: Record<string, unknown>;
}

export interface ParsedWebhookCommit {
  sha: string;
  node_keys: string[];
  files: string[];
}

/**
 * Case-insensitively retrieves a header value from Headers instance or plain Record.
 */
function getHeader(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") {
    const val = (headers as Headers).get(name);
    return val !== null ? val : undefined;
  }
  const target = name.toLowerCase();
  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      if (Array.isArray(val)) return val[0];
      return val;
    }
  }
  return undefined;
}

/**
 * Verifies that the GitHub payload HMAC matches the provided secret.
 *
 * Requirements:
 * - Header must match "sha256=<64 hex>".
 * - Computes HMAC-SHA256 over exact raw body string.
 * - Compares with crypto.timingSafeEqual after checking buffer lengths.
 * - Never throws on length mismatch or malformed headers; returns false.
 */
export function verifySignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null | undefined,
): boolean {
  if (
    typeof secret !== "string" ||
    !secret ||
    typeof rawBody !== "string" ||
    typeof signatureHeader !== "string" ||
    !signatureHeader
  ) {
    return false;
  }

  // Header must begin with "sha256="
  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const providedHex = signatureHeader.slice(7).trim();
  if (providedHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(providedHex)) {
    return false;
  }

  try {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(rawBody, "utf8");
    const expectedHex = hmac.digest("hex");

    const providedBuf = Buffer.from(providedHex, "hex");
    const expectedBuf = Buffer.from(expectedHex, "hex");

    if (providedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Processes an incoming GitHub webhook payload.
 *
 * Sequence of evaluations:
 * 1. Body length > 1,000,000 characters -> 413
 * 2. Missing x-hub-signature-256 header -> 401
 * 3. Invalid JSON payload -> 400
 * 4. Missing repository.full_name -> 400
 * 5. Candidate projects lookup and HMAC verification:
 *    - If none verify (unknown repo OR bad signature) -> 401 with identical body ({ ok: false, error: 'invalid signature' })
 * 6. Event routing:
 *    - 'ping' -> 200 { ok: true, event: 'ping' }
 *    - 'push' -> if ref is not default branch or no commits -> 200 { ok: true, event: 'push', ignored: true }
 *             -> else 200 { ok: true, event: 'push', projects: <count>, commits: [...] }
 *    - any other event -> 200 { ok: true, ignored: true }
 *
 * No database writes are performed.
 */
export async function processWebhook({
  rawBody,
  headers,
  findProjectsByRepoFullName,
}: ProcessWebhookOptions): Promise<ProcessWebhookResult> {
  // 1. Length check: max 1,000,000 chars
  if (typeof rawBody !== "string" || rawBody.length > 1_000_000) {
    return {
      status: 413,
      body: { ok: false, error: "payload too large" },
    };
  }

  // 2. Signature header existence check
  const signatureHeader = getHeader(headers, "x-hub-signature-256");
  if (!signatureHeader) {
    return {
      status: 401,
      body: { ok: false, error: "missing signature" },
    };
  }

  // 3. JSON parse check
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {
        status: 400,
        body: { ok: false, error: "invalid json" },
      };
    }
  } catch {
    return {
      status: 400,
      body: { ok: false, error: "invalid json" },
    };
  }

  // 4. Repository full_name existence check
  const repository = payload.repository as Record<string, unknown> | undefined;
  const rawFullName = repository?.full_name;
  if (!rawFullName || typeof rawFullName !== "string") {
    return {
      status: 400,
      body: { ok: false, error: "missing repository.full_name" },
    };
  }

  const fullNameLower = rawFullName.toLowerCase().trim();

  // 5. Look up candidate projects
  const candidates = await findProjectsByRepoFullName(fullNameLower);

  // Keep only those whose webhook_secret verifies the HMAC signature
  const verifiedProjects = candidates.filter((candidate) =>
    verifySignature(candidate.webhook_secret, rawBody, signatureHeader),
  );

  // If none verify (unknown repo OR bad signature) -> 401 with identical body
  if (verifiedProjects.length === 0) {
    return {
      status: 401,
      body: { ok: false, error: "invalid signature" },
    };
  }

  // 6. Switch on x-github-event
  const eventHeader = (getHeader(headers, "x-github-event") ?? "")
    .toLowerCase()
    .trim();

  if (eventHeader === "ping") {
    return {
      status: 200,
      body: { ok: true, event: "ping" },
    };
  }

  if (eventHeader === "push") {
    const ref = payload.ref;
    const defaultBranch = repository?.default_branch;
    const expectedRef = defaultBranch ? `refs/heads/${defaultBranch}` : null;
    const commits = payload.commits;

    // Check branch and commits array presence
    if (!expectedRef || ref !== expectedRef || !Array.isArray(commits)) {
      return {
        status: 200,
        body: { ok: true, event: "push", ignored: true },
      };
    }

    const parsedCommits: ParsedWebhookCommit[] = commits.map((c: unknown) => {
      const commitObj = (c && typeof c === "object" ? c : {}) as Record<
        string,
        unknown
      >;
      const message =
        typeof commitObj.message === "string" ? commitObj.message : "";
      const sha = String(commitObj.id || commitObj.sha || "");
      const nodeKeys = parseNodeKeys(message);

      const added = Array.isArray(commitObj.added)
        ? commitObj.added.map(String)
        : [];
      const modified = Array.isArray(commitObj.modified)
        ? commitObj.modified.map(String)
        : [];
      const removed = Array.isArray(commitObj.removed)
        ? commitObj.removed.map(String)
        : [];

      return {
        sha,
        node_keys: nodeKeys,
        files: [...added, ...modified, ...removed],
      };
    });

    return {
      status: 200,
      body: {
        ok: true,
        event: "push",
        projects: verifiedProjects.length,
        commits: parsedCommits,
      },
    };
  }

  // Any other GitHub event (e.g. issues, pull_request, star)
  return {
    status: 200,
    body: { ok: true, ignored: true },
  };
}
