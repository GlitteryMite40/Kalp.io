/**
 * File Fallback Matching Service (Task 06.5: File fallback)
 *
 * When an incoming commit has no explicit node ID in its message or title,
 * this service matches the commit's changed files against each graph node's expected files.
 * Calculates match confidence scores and persists suggestions into the database.
 */

import type postgres from "postgres";
import { getDb } from "@/lib/db";
import { assertValidUuid } from "./session";

export type DbClient = postgres.Sql | postgres.TransactionSql;

export interface FileMatchSuggestion {
  nodeId: string;
  nodeKey: string;
  confidence: number;
  matchedFiles: string[];
  totalExpectedFiles: number;
  totalChangedFiles: number;
}

export interface StoredCommitSuggestion {
  id: string;
  commitId: string;
  nodeId: string;
  nodeKey: string;
  nodeTitle?: string;
  confidence: number;
  matchedFiles: string[];
  createdAt: string;
}

export interface MatchFilesOptions {
  projectId: string;
  changedFiles: string[];
  client?: DbClient;
  minConfidence?: number;
}

/**
 * Normalizes a file path for consistent cross-platform comparison:
 * - Trims whitespace
 * - Converts backslashes to forward slashes
 * - Collapses redundant consecutive slashes
 * - Strips leading "./" and "/"
 * - Strips trailing "/"
 */
export function normalizeFilePath(filePath: string): string {
  if (typeof filePath !== "string") return "";
  let clean = filePath.trim().replace(/\\/g, "/");
  clean = clean.replace(/\/+/g, "/");
  if (clean.startsWith("./")) {
    clean = clean.slice(2);
  }
  if (clean.startsWith("/")) {
    clean = clean.slice(1);
  }
  if (clean.endsWith("/")) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

/**
 * Checks whether two normalized file paths refer to the same logical file.
 * Handles:
 * 1. Exact case-insensitive path match (e.g. "src/auth.ts" === "src/auth.ts")
 * 2. Repository subdirectory prefix differences (e.g. "backend/src/auth.ts" matches "src/auth.ts")
 */
export function areFilesMatching(fileA: string, fileB: string): boolean {
  const a = normalizeFilePath(fileA).toLowerCase();
  const b = normalizeFilePath(fileB).toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith("/" + b) || b.endsWith("/" + a)) return true;
  return false;
}

/**
 * Calculates the match confidence between a set of changed files and a node's expected files.
 *
 * Metric: Jaccard Similarity on file intersection
 * Confidence = |Intersection| / |Union|
 * Range: [0.0, 1.0] rounded to 2 decimal places.
 */
export function calculateFileMatchConfidence(
  changedFiles: string[],
  expectedFiles: string[],
): {
  confidence: number;
  matchedFiles: string[];
} {
  const normChanged = (Array.isArray(changedFiles) ? changedFiles : [])
    .map(normalizeFilePath)
    .filter((f) => f.length > 0);
  const normExpected = (Array.isArray(expectedFiles) ? expectedFiles : [])
    .map(normalizeFilePath)
    .filter((f) => f.length > 0);

  if (normChanged.length === 0 || normExpected.length === 0) {
    return { confidence: 0, matchedFiles: [] };
  }

  const matchedSet = new Set<string>();

  for (const exp of normExpected) {
    for (const chg of normChanged) {
      if (areFilesMatching(exp, chg)) {
        matchedSet.add(exp);
        break;
      }
    }
  }

  if (matchedSet.size === 0) {
    return { confidence: 0, matchedFiles: [] };
  }

  const intersectionSize = matchedSet.size;
  const unionSize = normExpected.length + normChanged.length - intersectionSize;
  const rawConfidence = unionSize > 0 ? intersectionSize / unionSize : 0;

  // Round to 2 decimal places, with minimum 0.01 for any non-empty match
  const confidence = Math.max(0.01, Math.round(rawConfidence * 100) / 100);

  return {
    confidence,
    matchedFiles: Array.from(matchedSet),
  };
}

/**
 * Pure in-memory helper to match changed files against a list of nodes.
 * Filters nodes with confidence > 0 and sorts descending by confidence,
 * breaking ties deterministically by node_key ascending.
 */
export function matchFilesToNodesInMemory(
  nodes: Array<{ id: string; node_key: string; files?: string[] | null }>,
  changedFiles: string[],
): FileMatchSuggestion[] {
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(changedFiles) ||
    changedFiles.length === 0
  ) {
    return [];
  }

  const suggestions: FileMatchSuggestion[] = [];

  for (const node of nodes) {
    const expectedFiles = Array.isArray(node.files) ? node.files : [];
    if (expectedFiles.length === 0) continue;

    const { confidence, matchedFiles } = calculateFileMatchConfidence(
      changedFiles,
      expectedFiles,
    );

    if (confidence > 0) {
      suggestions.push({
        nodeId: node.id,
        nodeKey: node.node_key,
        confidence,
        matchedFiles,
        totalExpectedFiles: expectedFiles.length,
        totalChangedFiles: changedFiles.length,
      });
    }
  }

  // Sort descending by confidence, tie-break by nodeKey ascending
  suggestions.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return a.nodeKey.localeCompare(b.nodeKey);
  });

  return suggestions;
}

/**
 * Queries project nodes from the database and matches them against changed files.
 */
export async function matchFilesToNodes(
  options: MatchFilesOptions,
): Promise<FileMatchSuggestion[]> {
  const { projectId, changedFiles, client, minConfidence = 0.0 } = options;
  assertValidUuid(projectId, "Invalid project ID format");

  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return [];
  }

  const db = client ?? getDb();

  const nodeRows = await db<
    Array<{
      id: string;
      node_key: string;
      files: string[];
    }>
  >`
    SELECT id, node_key, files
    FROM nodes
    WHERE project_id = ${projectId}
  `;

  const allSuggestions = matchFilesToNodesInMemory(nodeRows, changedFiles);
  return allSuggestions.filter((s) => s.confidence >= minConfidence);
}

/**
 * Persists suggestions for a commit:
 * - Upserts suggestions into `commit_suggestions` table.
 * - Sets `suggested_node_id`, `confidence`, and `matched_by = 'files'` on `commits` table.
 * - If suggestions is empty: clears `suggested_node_id` and `confidence` on `commits`.
 */
export async function storeCommitSuggestions(
  commitId: string,
  suggestions: FileMatchSuggestion[],
  client?: DbClient,
): Promise<void> {
  assertValidUuid(commitId, "Invalid commit ID format");
  const db = client ?? getDb();

  const runInsideTx = async (tx: DbClient) => {
    // 1. Delete prior suggestions for this commit to maintain idempotent state
    await tx`
      DELETE FROM commit_suggestions
      WHERE commit_id = ${commitId}
    `;

    if (suggestions.length === 0) {
      await tx`
        UPDATE commits
        SET suggested_node_id = NULL,
            confidence = NULL
        WHERE id = ${commitId}
      `;
      return;
    }

    // 2. Insert new suggestions
    for (const s of suggestions) {
      await tx`
        INSERT INTO commit_suggestions (
          commit_id,
          node_id,
          confidence,
          matched_files
        ) VALUES (
          ${commitId},
          ${s.nodeId},
          ${s.confidence},
          ${s.matchedFiles}
        )
        ON CONFLICT (commit_id, node_id) DO UPDATE
        SET confidence = EXCLUDED.confidence,
            matched_files = EXCLUDED.matched_files
      `;
    }

    // 3. Update primary suggested match on the commit row
    const top = suggestions[0];
    await tx`
      UPDATE commits
      SET suggested_node_id = ${top.nodeId},
          confidence = ${top.confidence},
          matched_by = 'files'
      WHERE id = ${commitId}
    `;
  };

  if ("begin" in db && typeof db.begin === "function") {
    await db.begin(async (tx) => runInsideTx(tx));
  } else {
    await runInsideTx(db);
  }
}

/**
 * Fetches stored suggestions for a commit, sorted by confidence descending.
 */
export async function getCommitSuggestions(
  commitId: string,
  client?: DbClient,
): Promise<StoredCommitSuggestion[]> {
  assertValidUuid(commitId, "Invalid commit ID format");
  const db = client ?? getDb();

  const rows = await db<
    Array<{
      id: string;
      commit_id: string;
      node_id: string;
      node_key: string;
      title: string;
      confidence: number;
      matched_files: string[];
      created_at: Date;
    }>
  >`
    SELECT cs.id,
           cs.commit_id,
           cs.node_id,
           n.node_key,
           n.title,
           cs.confidence,
           cs.matched_files,
           cs.created_at
    FROM commit_suggestions cs
    JOIN nodes n ON cs.node_id = n.id
    WHERE cs.commit_id = ${commitId}
    ORDER BY cs.confidence DESC, n.node_key ASC
  `;

  return rows.map((r) => ({
    id: r.id,
    commitId: r.commit_id,
    nodeId: r.node_id,
    nodeKey: r.node_key,
    nodeTitle: r.title,
    confidence: Number(r.confidence),
    matchedFiles: r.matched_files,
    createdAt: r.created_at.toISOString(),
  }));
}
