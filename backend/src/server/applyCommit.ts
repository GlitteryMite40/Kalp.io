/**
 * Apply Commit & Mark Committed Service (Task 06.4: Mark Committed)
 *
 * Stores incoming git commits and transitions matched graph nodes to 'committed'.
 * Idempotent: Handles GitHub redeliveries and duplicate pushes cleanly via ON CONFLICT.
 */

import { getDb } from "@/lib/db";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { assertValidUuid } from "./session";
import { parseNodeKeys } from "./commitParser";
import type { NodeRecord } from "./session";
import {
  matchFilesToNodes,
  storeCommitSuggestions,
  type FileMatchSuggestion,
  type DbClient,
} from "./fileMatch";

export interface ApplyCommitInput {
  projectId: string;
  sha: string;
  message?: string | null;
  files?: string[];
  nodeKeys?: string[];
  matchedBy?: "message" | "files" | null;
  committedAt?: Date | string | null;
}

export interface CommitRecord {
  id: string;
  project_id: string;
  node_id: string | null;
  suggested_node_id?: string | null;
  confidence?: number | null;
  sha: string;
  message: string | null;
  files: string[];
  matched_by: "message" | "files" | null;
  committed_at: Date | null;
  created_at: Date;
}

export interface ApplyCommitResult {
  commitId: string;
  projectId: string;
  sha: string;
  matchedNodeId: string | null;
  matchedNodeKey: string | null;
  matchedNodeKeys: string[];
  nodeUpdated: boolean;
  duplicate: boolean;
  suggestedNodeId?: string | null;
  suggestedNodeKey?: string | null;
  confidence?: number | null;
  suggestions?: FileMatchSuggestion[];
}

/**
 * Stores a git commit and marks any matched nodes as 'committed'.
 *
 * Behaviors:
 * 1. Validates projectId UUID and commit SHA.
 * 2. Parses node IDs from the commit message first line (if nodeKeys not passed).
 * 3. Looks up corresponding nodes in the project.
 *    - If matched: marks node status as 'committed' in database.
 *    - If unknown ID: no node status is changed (test case: unknown ID).
 * 4. Inserts into `commits` table with `ON CONFLICT (project_id, sha)`:
 *    - Prevents duplicates on redelivery (test case: duplicate push).
 *    - Fully idempotent.
 */
export async function applyCommit(
  input: ApplyCommitInput,
  client?: DbClient,
): Promise<ApplyCommitResult> {
  const { projectId, sha, message, files = [], committedAt } = input;

  assertValidUuid(projectId, "Invalid project ID format");

  if (!sha || typeof sha !== "string" || !sha.trim()) {
    throw new BadRequestError("Commit SHA is required", {
      code: "INVALID_COMMIT_SHA",
    });
  }

  const cleanSha = sha.trim();
  const cleanMessage = typeof message === "string" ? message.trim() : null;

  // 1. Determine node keys (passed explicitly or parsed from commit message)
  const nodeKeys =
    Array.isArray(input.nodeKeys) && input.nodeKeys.length > 0
      ? input.nodeKeys
      : cleanMessage
        ? parseNodeKeys(cleanMessage)
        : [];

  const db = client ?? getDb();

  // Run in transaction to guarantee atomicity between node update, commit insert, and suggestions
  const runTransaction = async (tx: DbClient): Promise<ApplyCommitResult> => {
    // Check project exists
    const projRows = await tx<Array<{ id: string }>>`
      SELECT id FROM projects WHERE id = ${projectId}
    `;
    if (projRows.length === 0) {
      throw new NotFoundError(`Project with id "${projectId}" not found`);
    }

    // 2. Check if this commit already exists (idempotency check)
    const existingCommitRows = await tx<
      Array<{
        id: string;
        node_id: string | null;
      }>
    >`
      SELECT id, node_id
      FROM commits
      WHERE project_id = ${projectId} AND sha = ${cleanSha}
    `;
    const isDuplicate = existingCommitRows.length > 0;

    // 3. Find matching nodes in project
    let matchedNodeId: string | null = null;
    let matchedNodeKey: string | null = null;
    let nodeUpdated = false;

    if (nodeKeys.length > 0) {
      const matchingNodes = await tx<NodeRecord[]>`
        SELECT *
        FROM nodes
        WHERE project_id = ${projectId}
          AND node_key = ANY(${nodeKeys})
      `;

      if (matchingNodes.length > 0) {
        matchedNodeId = matchingNodes[0].id;
        matchedNodeKey = matchingNodes[0].node_key;

        const matchingIds = matchingNodes.map((n) => n.id);

        // Update all matched nodes to 'committed'
        const updatedRows = await tx<Array<{ id: string }>>`
          UPDATE nodes
          SET status = 'committed'
          WHERE project_id = ${projectId}
            AND id = ANY(${matchingIds}::uuid[])
          RETURNING id
        `;

        nodeUpdated = updatedRows.length > 0;
      }
    }

    // 4. File fallback matching: if no node ID matched and files changed
    let suggestions: FileMatchSuggestion[] = [];
    let suggestedNodeId: string | null = null;
    let suggestedNodeKey: string | null = null;
    let confidence: number | null = null;

    if (!matchedNodeId && files.length > 0) {
      suggestions = await matchFilesToNodes({
        projectId,
        changedFiles: files,
        client: tx,
      });

      if (suggestions.length > 0) {
        suggestedNodeId = suggestions[0].nodeId;
        suggestedNodeKey = suggestions[0].nodeKey;
        confidence = suggestions[0].confidence;
      }
    }

    // 5. Parse committed_at timestamp
    let parsedCommittedAt: Date | null = null;
    if (committedAt) {
      const d = new Date(committedAt);
      if (!isNaN(d.getTime())) {
        parsedCommittedAt = d;
      }
    }

    const matchedBy =
      input.matchedBy !== undefined
        ? input.matchedBy
        : matchedNodeId
          ? "message"
          : suggestions.length > 0
            ? "files"
            : null;

    // 6. Store the commit in `commits` table (idempotent with ON CONFLICT)
    const [inserted] = await tx<Array<{ id: string }>>`
      INSERT INTO commits (
        project_id,
        node_id,
        suggested_node_id,
        confidence,
        sha,
        message,
        files,
        matched_by,
        committed_at
      ) VALUES (
        ${projectId},
        ${matchedNodeId},
        ${suggestedNodeId},
        ${confidence},
        ${cleanSha},
        ${cleanMessage},
        ${files},
        ${matchedBy},
        ${parsedCommittedAt}
      )
      ON CONFLICT (project_id, sha) DO UPDATE
      SET node_id = COALESCE(EXCLUDED.node_id, commits.node_id),
          suggested_node_id = COALESCE(EXCLUDED.suggested_node_id, commits.suggested_node_id),
          confidence = COALESCE(EXCLUDED.confidence, commits.confidence),
          message = COALESCE(EXCLUDED.message, commits.message),
          files = CASE
            WHEN EXCLUDED.files IS NOT NULL AND array_length(EXCLUDED.files, 1) > 0 THEN EXCLUDED.files
            ELSE commits.files
          END,
          matched_by = COALESCE(EXCLUDED.matched_by, commits.matched_by),
          committed_at = COALESCE(EXCLUDED.committed_at, commits.committed_at)
      RETURNING id
    `;

    // 7. Store detailed commit suggestions (handles multiple matches)
    if (suggestions.length > 0) {
      await storeCommitSuggestions(inserted.id, suggestions, tx);
    }

    return {
      commitId: inserted.id,
      projectId,
      sha: cleanSha,
      matchedNodeId,
      matchedNodeKey,
      matchedNodeKeys: nodeKeys,
      nodeUpdated,
      duplicate: isDuplicate,
      suggestedNodeId,
      suggestedNodeKey,
      confidence,
      suggestions,
    };
  };

  if ("begin" in db && typeof db.begin === "function") {
    return await db.begin(async (tx) => runTransaction(tx));
  } else {
    return await runTransaction(db);
  }
}

/**
 * Applies multiple commits in sequence for a project.
 */
export async function applyCommits(
  projectId: string,
  commits: ApplyCommitInput[],
  client?: DbClient,
): Promise<ApplyCommitResult[]> {
  const results: ApplyCommitResult[] = [];
  for (const c of commits) {
    const res = await applyCommit({ ...c, projectId }, client);
    results.push(res);
  }
  return results;
}
