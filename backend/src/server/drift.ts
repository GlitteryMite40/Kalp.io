/**
 * Drift Flag Service (Task 06.6: Drift flag)
 *
 * Compares committed files with a graph node's expected files and flags
 * large differences (drift).
 *
 * Handles:
 * - exact: All expected files are committed with no unexpected changes (driftScore = 0, hasDrift = false)
 * - partial: Partial overlap between committed and expected files (driftScore > 0, hasDrift = false for moderate differences, true for big differences)
 * - unrelated: Committed files have no overlap with expected files (driftScore = 1.0, hasDrift = true)
 */

import { getDb } from "@/lib/db";
import { assertValidUuid } from "./session";
import {
  normalizeFilePath,
  areFilesMatching,
  type DbClient,
} from "./fileMatch";

export type DriftClassification = "exact" | "partial" | "unrelated";

/**
 * Default threshold above which difference is considered "large" (drift flagged).
 * Differences > 0.50 are flagged as drift.
 */
export const DEFAULT_DRIFT_THRESHOLD = 0.5;

export interface DriftOptions {
  /**
   * Difference score threshold (0.0 - 1.0) strictly above which drift is flagged.
   * Default: DEFAULT_DRIFT_THRESHOLD (0.50).
   */
  threshold?: number;
}

export interface DriftResult {
  /**
   * Boolean flag indicating whether significant drift was detected.
   * True if driftScore > threshold or classification is 'unrelated'.
   */
  hasDrift: boolean;
  /**
   * Alias for hasDrift for developer convenience.
   */
  drift: boolean;
  /**
   * Difference score between 0.0 (identical) and 1.0 (completely unrelated).
   */
  driftScore: number;
  /**
   * High-level categorization: 'exact', 'partial', or 'unrelated'.
   */
  classification: DriftClassification;
  /**
   * Files from expected list that were matched in committed files.
   */
  matchedFiles: string[];
  /**
   * Files from expected list that were NOT matched in committed files.
   */
  missingFiles: string[];
  /**
   * Files from committed list that were NOT expected.
   */
  unexpectedFiles: string[];
  /**
   * Normalized list of expected files.
   */
  expectedFiles: string[];
  /**
   * Normalized list of committed files.
   */
  committedFiles: string[];
  /**
   * Human-readable explanation of the comparison result.
   */
  reason: string;
}

export interface NodeDriftResult extends DriftResult {
  nodeId: string;
  nodeKey: string;
  nodeTitle: string;
  commitCount: number;
  commitShas: string[];
}

export interface ProjectDriftSummary {
  projectId: string;
  totalNodes: number;
  evaluatedNodes: number;
  driftedNodesCount: number;
  driftedNodes: NodeDriftResult[];
  nodes: NodeDriftResult[];
}

/**
 * Compares a list of committed files against a list of expected files.
 * Flags drift on large differences (e.g. unrelated files or difference score > threshold).
 *
 * Test cases supported:
 * 1. exact: Identical sets of normalized files -> classification 'exact', driftScore 0.0, hasDrift false.
 * 2. partial: Overlapping files -> classification 'partial', driftScore in (0, 1).
 *    hasDrift false for moderate overlap, true if unexpected files cause driftScore > threshold.
 * 3. unrelated: No overlap between committed and expected files -> classification 'unrelated', driftScore 1.0, hasDrift true.
 */
export function compareFiles(
  committedFiles: string[],
  expectedFiles: string[],
  options?: DriftOptions,
): DriftResult {
  const threshold = options?.threshold ?? DEFAULT_DRIFT_THRESHOLD;

  // 1. Normalize and deduplicate inputs
  const normCommitted = Array.from(
    new Set(
      (Array.isArray(committedFiles) ? committedFiles : [])
        .map(normalizeFilePath)
        .filter((f) => f.length > 0),
    ),
  );

  const normExpected = Array.from(
    new Set(
      (Array.isArray(expectedFiles) ? expectedFiles : [])
        .map(normalizeFilePath)
        .filter((f) => f.length > 0),
    ),
  );

  // 2. Both empty: exact match with zero files
  if (normCommitted.length === 0 && normExpected.length === 0) {
    return {
      hasDrift: false,
      drift: false,
      driftScore: 0.0,
      classification: "exact",
      matchedFiles: [],
      missingFiles: [],
      unexpectedFiles: [],
      expectedFiles: [],
      committedFiles: [],
      reason: "Both expected and committed file lists are empty.",
    };
  }

  // 3. Expected non-empty, but committed empty: 100% missing
  if (normCommitted.length === 0 && normExpected.length > 0) {
    return {
      hasDrift: true,
      drift: true,
      driftScore: 1.0,
      classification: "unrelated",
      matchedFiles: [],
      missingFiles: normExpected,
      unexpectedFiles: [],
      expectedFiles: normExpected,
      committedFiles: [],
      reason: `No files were committed for expected files: ${normExpected.join(", ")}.`,
    };
  }

  // 4. Committed non-empty, but expected empty: 100% unexpected
  if (normExpected.length === 0 && normCommitted.length > 0) {
    return {
      hasDrift: true,
      drift: true,
      driftScore: 1.0,
      classification: "unrelated",
      matchedFiles: [],
      missingFiles: [],
      unexpectedFiles: normCommitted,
      expectedFiles: [],
      committedFiles: normCommitted,
      reason: `Files were committed (${normCommitted.join(", ")}) for a node with no expected files.`,
    };
  }

  // 5. Match expected files against committed files
  const matchedExpectedSet = new Set<string>();
  const matchedCommittedSet = new Set<string>();

  for (const exp of normExpected) {
    for (const cmt of normCommitted) {
      if (areFilesMatching(exp, cmt)) {
        matchedExpectedSet.add(exp);
        matchedCommittedSet.add(cmt);
      }
    }
  }

  const matchedFiles = Array.from(matchedExpectedSet);
  const missingFiles = normExpected.filter((f) => !matchedExpectedSet.has(f));
  const unexpectedFiles = normCommitted.filter(
    (f) => !matchedCommittedSet.has(f),
  );

  // 6. Case A: Unrelated (no overlap at all)
  if (matchedFiles.length === 0) {
    return {
      hasDrift: true,
      drift: true,
      driftScore: 1.0,
      classification: "unrelated",
      matchedFiles: [],
      missingFiles,
      unexpectedFiles,
      expectedFiles: normExpected,
      committedFiles: normCommitted,
      reason: `Committed files (${normCommitted.join(", ")}) have no overlap with expected files (${normExpected.join(", ")}).`,
    };
  }

  // 7. Case B: Exact match (all expected matched, zero unexpected)
  if (missingFiles.length === 0 && unexpectedFiles.length === 0) {
    return {
      hasDrift: false,
      drift: false,
      driftScore: 0.0,
      classification: "exact",
      matchedFiles,
      missingFiles: [],
      unexpectedFiles: [],
      expectedFiles: normExpected,
      committedFiles: normCommitted,
      reason:
        "Exact match: all expected files were committed with no unexpected changes.",
    };
  }

  // 8. Case C: Partial match
  // Calculate similarity based on Jaccard metric:
  // union = |normExpected| + |unexpectedFiles|
  const unionSize = normExpected.length + unexpectedFiles.length;
  const similarity = unionSize > 0 ? matchedFiles.length / unionSize : 0;
  const rawDifference = 1.0 - similarity;
  const driftScore = Math.max(
    0.01,
    Math.min(1.0, Math.round(rawDifference * 100) / 100),
  );

  // Flag drift if difference exceeds threshold
  const hasDrift = driftScore > threshold;

  const reason = hasDrift
    ? `Drift flagged: partial match with large differences (drift score ${driftScore.toFixed(2)} exceeds threshold ${threshold.toFixed(2)}). Missing: [${missingFiles.join(", ")}], Unexpected: [${unexpectedFiles.join(", ")}].`
    : `Partial match within acceptable difference threshold (drift score ${driftScore.toFixed(2)} <= threshold ${threshold.toFixed(2)}). Matched: [${matchedFiles.join(", ")}].`;

  return {
    hasDrift,
    drift: hasDrift,
    driftScore,
    classification: "partial",
    matchedFiles,
    missingFiles,
    unexpectedFiles,
    expectedFiles: normExpected,
    committedFiles: normCommitted,
    reason,
  };
}

/**
 * Alias for compareFiles for intuitive readability.
 */
export const detectDrift = compareFiles;

/**
 * Checks drift for a single node in a project against all commits linked to it.
 */
export async function checkNodeDrift(options: {
  projectId: string;
  nodeId: string;
  client?: DbClient;
  threshold?: number;
}): Promise<NodeDriftResult> {
  const { projectId, nodeId, client, threshold } = options;
  assertValidUuid(projectId, "Invalid project ID format");
  assertValidUuid(nodeId, "Invalid node ID format");

  const db = client ?? getDb();

  // 1. Fetch node
  const [node] = await db<
    Array<{
      id: string;
      node_key: string;
      title: string;
      files: string[];
    }>
  >`
    SELECT id, node_key, title, files
    FROM nodes
    WHERE project_id = ${projectId} AND id = ${nodeId}
  `;

  if (!node) {
    throw new Error(
      `Node with id "${nodeId}" not found in project "${projectId}"`,
    );
  }

  // 2. Fetch all commits linked to this node
  const commitRows = await db<
    Array<{
      sha: string;
      files: string[];
    }>
  >`
    SELECT sha, files
    FROM commits
    WHERE project_id = ${projectId} AND node_id = ${nodeId}
    ORDER BY committed_at ASC NULLS LAST, created_at ASC
  `;

  const commitShas = commitRows.map((c) => c.sha);
  const allCommittedFiles: string[] = [];
  for (const c of commitRows) {
    if (Array.isArray(c.files)) {
      allCommittedFiles.push(...c.files);
    }
  }

  // 3. Compare committed files with expected files
  const drift = compareFiles(allCommittedFiles, node.files || [], {
    threshold,
  });

  return {
    ...drift,
    nodeId: node.id,
    nodeKey: node.node_key,
    nodeTitle: node.title,
    commitCount: commitRows.length,
    commitShas,
  };
}

/**
 * Evaluates node drift and persists the result on the `nodes` table.
 */
export async function recordNodeDrift(options: {
  projectId: string;
  nodeId: string;
  client?: DbClient;
  threshold?: number;
}): Promise<NodeDriftResult> {
  const { projectId, nodeId, client } = options;
  const db = client ?? getDb();

  const driftResult = await checkNodeDrift(options);

  await db`
    UPDATE nodes
    SET has_drift = ${driftResult.hasDrift},
        drift_score = ${driftResult.driftScore},
        drift_reason = ${driftResult.reason}
    WHERE id = ${nodeId} AND project_id = ${projectId}
  `;

  return driftResult;
}

/**
 * Scans all committed or active nodes in a project and summarizes drift.
 */
export async function checkProjectDrift(options: {
  projectId: string;
  client?: DbClient;
  threshold?: number;
}): Promise<ProjectDriftSummary> {
  const { projectId, client, threshold } = options;
  assertValidUuid(projectId, "Invalid project ID format");

  const db = client ?? getDb();

  const nodeRows = await db<
    Array<{
      id: string;
      node_key: string;
      title: string;
      files: string[];
    }>
  >`
    SELECT id, node_key, title, files
    FROM nodes
    WHERE project_id = ${projectId}
    ORDER BY node_key ASC
  `;

  const evaluatedNodes: NodeDriftResult[] = [];
  const driftedNodes: NodeDriftResult[] = [];

  for (const n of nodeRows) {
    const res = await checkNodeDrift({
      projectId,
      nodeId: n.id,
      client: db,
      threshold,
    });
    evaluatedNodes.push(res);
    if (res.hasDrift) {
      driftedNodes.push(res);
    }
  }

  return {
    projectId,
    totalNodes: nodeRows.length,
    evaluatedNodes: evaluatedNodes.length,
    driftedNodesCount: driftedNodes.length,
    driftedNodes,
    nodes: evaluatedNodes,
  };
}
