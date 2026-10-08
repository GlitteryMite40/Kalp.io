/**
 * Learning Layer Service (Task 09.1)
 *
 * Implements:
 * - Option shuffling with index tracking
 * - Answer grading with 2-strike reveal logic
 * - Daily generation rate limit (60 items / day / owner)
 * - Owner-scoped database queries for learning, answers, and node completion
 */

import crypto from "node:crypto";
import type postgres from "postgres";
import { getDb } from "@/lib/db";
import { NotFoundError, TooManyRequestsError } from "@/lib/errors";
import { assertValidUuid } from "./session";

export const DAILY_LEARNING_CAP = 60;

export type DiffSource = "patch" | "files_only" | "plan_only";
export type AnswerResult = "correct" | "wrong" | "skipped";

export interface StoredQuestion {
  prompt: string;
  options: string[];
  explanation: string;
  hint: string;
}

export interface NodeLearningRecord {
  node_id: string;
  project_id: string;
  diff_explanation: string | null;
  diff_source: DiffSource | null;
  commit_sha: string | null;
  question: StoredQuestion;
  correct_index: number;
  prompt_version: string;
  generated_at: string | Date;
}

export interface NodeAnswerRecord {
  id: string;
  node_id: string;
  project_id: string;
  selected_index: number | null;
  result: AnswerResult;
  created_at: string | Date;
}

export interface ClientQuestion {
  prompt: string;
  options: string[];
}

export interface ClientLearning {
  diff_explanation: string | null;
  diff_source: DiffSource | null;
  commit_sha: string | null;
  stale: boolean;
  question: ClientQuestion;
}

export interface ClientAnswerState {
  wrong_count: number;
  resolved: boolean;
  result: "correct" | "skipped" | null;
  reveal: {
    correct_index: number;
    explanation: string;
  } | null;
  hint?: string | null;
}

export interface NodeLearnResponse {
  explanation: string | null;
  has_commit: boolean;
  commit_sha: string | null;
  learning: ClientLearning | null;
  answer_state: ClientAnswerState;
}

export interface CommitSummary {
  sha: string;
  message: string | null;
  files: string[];
  committed_at: string | Date | null;
}

export interface NodeWithProjectSummary {
  id: string;
  project_id: string;
  node_key: string;
  title: string;
  explanation: string | null;
  acceptance: string[];
  files: string[];
  status: string;
  requirement_id: string | null;
  requirement_title: string | null;
  repo_url: string | null;
  repo_full_name: string | null;
}

/**
 * Shuffles multiple-choice options while tracking the new correct answer index.
 * Uses Fisher-Yates shuffle with randomInt.
 */
export function shuffleOptions(
  options: string[],
  correctIndex: number,
  rng: (a: number, b?: number) => number = crypto.randomInt,
): { options: string[]; correctIndex: number } {
  if (!Array.isArray(options) || options.length === 0) {
    return { options: [], correctIndex: 0 };
  }

  const items = options.map((opt, i) => ({ opt, originalIndex: i }));

  for (let i = items.length - 1; i > 0; i--) {
    let j: number;
    if (rng.length === 1) {
      j = rng(i + 1);
    } else {
      j = rng(0, i + 1);
    }

    const temp = items[i];
    items[i] = items[j];
    items[j] = temp;
  }

  const newOptions = items.map((item) => item.opt);
  const newCorrectIndex = items.findIndex(
    (item) => item.originalIndex === correctIndex,
  );

  return {
    options: newOptions,
    correctIndex: newCorrectIndex >= 0 ? newCorrectIndex : 0,
  };
}

/**
 * Grades an answer selection against the correct index and prior wrong attempts.
 * Reveal is true once priorWrongCount + this wrong attempt >= 2.
 */
export function gradeAnswer(params: {
  selectedIndex: number;
  correctIndex: number;
  priorWrongCount: number;
}): { result: "correct" | "wrong"; reveal: boolean } {
  const { selectedIndex, correctIndex, priorWrongCount } = params;

  if (selectedIndex === correctIndex) {
    return {
      result: "correct",
      reveal: false,
    };
  }

  const newWrongCount = priorWrongCount + 1;
  return {
    result: "wrong",
    reveal: newWrongCount >= 2,
  };
}

/**
 * Counts how many node_learning rows have been generated today (UTC) for projects owned by ownerId.
 */
export async function countDailyGenerationsForOwner(
  ownerId: string,
  client?: postgres.Sql,
): Promise<number> {
  assertValidUuid(ownerId, "Invalid owner ID");
  const db = client ?? getDb();

  const rows = await db<Array<{ count: string | number }>>`
    SELECT count(*)::int as count
    FROM node_learning nl
    JOIN projects p ON nl.project_id = p.id
    WHERE p.owner_id = ${ownerId}
      AND nl.generated_at >= (now() at time zone 'UTC')::date
  `;

  return Number(rows[0]?.count ?? 0);
}

/**
 * Enforces the 60 items / day rate limit for a learner.
 * Throws TooManyRequestsError (HTTP 429) if exceeded.
 */
export async function assertDailyGenerationCap(
  ownerId: string,
  client?: postgres.Sql,
): Promise<void> {
  const count = await countDailyGenerationsForOwner(ownerId, client);
  if (count >= DAILY_LEARNING_CAP) {
    throw new TooManyRequestsError(
      `Daily learning generation limit of ${DAILY_LEARNING_CAP} items reached. Please take existing checks or try again tomorrow.`,
      { limit: DAILY_LEARNING_CAP, current: count },
    );
  }
}

/**
 * Retrieves a node along with its project and requirement details, scoped to the requesting owner.
 */
export async function getNodeWithProjectForOwner(
  nodeId: string,
  ownerId: string,
  client?: postgres.Sql,
): Promise<NodeWithProjectSummary> {
  assertValidUuid(nodeId, "Invalid node ID");
  assertValidUuid(ownerId, "Invalid owner ID");
  const db = client ?? getDb();

  const rows = await db<
    Array<{
      id: string;
      project_id: string;
      node_key: string;
      title: string;
      explanation: string | null;
      acceptance: string[] | null;
      files: string[] | null;
      status: string;
      requirement_id: string | null;
      requirement_title: string | null;
      repo_url: string | null;
      repo_full_name: string | null;
    }>
  >`
    SELECT
      n.id,
      n.project_id,
      n.node_key,
      n.title,
      n.explanation,
      n.acceptance,
      n.files,
      n.status,
      n.requirement_id,
      r.title as requirement_title,
      p.repo_url,
      p.repo_full_name
    FROM nodes n
    JOIN projects p ON n.project_id = p.id
    LEFT JOIN requirements r ON n.requirement_id = r.id
    WHERE n.id = ${nodeId} AND p.owner_id = ${ownerId}
  `;

  if (rows.length === 0) {
    throw new NotFoundError(`Node with id "${nodeId}" not found`);
  }

  const row = rows[0];
  return {
    ...row,
    acceptance: Array.isArray(row.acceptance) ? row.acceptance : [],
    files: Array.isArray(row.files) ? row.files : [],
  };
}

/**
 * Retrieves the latest commit associated with a node.
 */
export async function getLatestCommitForNode(
  nodeId: string,
  client?: postgres.Sql,
): Promise<CommitSummary | null> {
  assertValidUuid(nodeId, "Invalid node ID");
  const db = client ?? getDb();

  const rows = await db<
    Array<{
      sha: string;
      message: string | null;
      files: string[] | null;
      committed_at: Date | string | null;
    }>
  >`
    SELECT sha, message, files, committed_at
    FROM commits
    WHERE node_id = ${nodeId}
    ORDER BY committed_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;

  if (rows.length === 0) {
    return null;
  }

  const r = rows[0];
  return {
    sha: r.sha,
    message: r.message,
    files: Array.isArray(r.files) ? r.files : [],
    committed_at: r.committed_at,
  };
}

function parseQuestion(raw: unknown): StoredQuestion {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as StoredQuestion;
    } catch {
      // ignore
    }
  }
  if (raw && typeof raw === "object") {
    return raw as StoredQuestion;
  }
  return {
    prompt: "",
    options: ["", "", "", ""],
    explanation: "",
    hint: "",
  };
}

function normalizeLearningRow(
  row: Record<string, unknown>,
): NodeLearningRecord {
  return {
    node_id: row.node_id as string,
    project_id: row.project_id as string,
    diff_explanation: row.diff_explanation as string | null,
    diff_source: row.diff_source as DiffSource,
    commit_sha: row.commit_sha as string | null,
    question: parseQuestion(row.question),
    correct_index: Number(row.correct_index),
    prompt_version: row.prompt_version as string,
    generated_at: row.generated_at as Date | string,
  };
}

/**
 * Retrieves the stored node_learning record for a node.
 */
export async function getNodeLearningRecord(
  nodeId: string,
  client?: postgres.Sql,
): Promise<NodeLearningRecord | null> {
  assertValidUuid(nodeId, "Invalid node ID");
  const db = client ?? getDb();

  const rows = await db<Array<Record<string, unknown>>>`
    SELECT *
    FROM node_learning
    WHERE node_id = ${nodeId}
  `;

  return rows.length > 0 ? normalizeLearningRow(rows[0]) : null;
}

/**
 * Upserts a node_learning row.
 */
export async function upsertNodeLearning(
  data: {
    nodeId: string;
    projectId: string;
    diffExplanation: string;
    diffSource: DiffSource;
    commitSha: string;
    question: StoredQuestion;
    correctIndex: number;
    promptVersion: string;
  },
  client?: postgres.Sql,
): Promise<NodeLearningRecord> {
  const db = client ?? getDb();

  const rows = await db<Array<Record<string, unknown>>>`
    INSERT INTO node_learning (
      node_id,
      project_id,
      diff_explanation,
      diff_source,
      commit_sha,
      question,
      correct_index,
      prompt_version,
      generated_at
    ) VALUES (
      ${data.nodeId},
      ${data.projectId},
      ${data.diffExplanation},
      ${data.diffSource},
      ${data.commitSha},
      ${JSON.stringify(data.question)},
      ${data.correctIndex},
      ${data.promptVersion},
      now()
    )
    ON CONFLICT (node_id) DO UPDATE SET
      diff_explanation = EXCLUDED.diff_explanation,
      diff_source = EXCLUDED.diff_source,
      commit_sha = EXCLUDED.commit_sha,
      question = EXCLUDED.question,
      correct_index = EXCLUDED.correct_index,
      prompt_version = EXCLUDED.prompt_version,
      generated_at = now()
    RETURNING *
  `;

  return normalizeLearningRow(rows[0]);
}

/**
 * Retrieves answer attempt statistics for a node.
 */
export async function getNodeAnswerStats(
  nodeId: string,
  client?: postgres.Sql,
): Promise<{
  wrongCount: number;
  resolved: boolean;
  result: "correct" | "skipped" | null;
}> {
  assertValidUuid(nodeId, "Invalid node ID");
  const db = client ?? getDb();

  const rows = await db<
    Array<{
      result: AnswerResult;
      created_at: Date;
    }>
  >`
    SELECT result, created_at
    FROM node_answers
    WHERE node_id = ${nodeId}
    ORDER BY created_at ASC
  `;

  let wrongCount = 0;
  let resolved = false;
  let finalResult: "correct" | "skipped" | null = null;

  for (const r of rows) {
    if (r.result === "wrong") {
      wrongCount++;
    } else if (r.result === "correct" || r.result === "skipped") {
      resolved = true;
      finalResult = r.result;
    }
  }

  return {
    wrongCount,
    resolved,
    result: finalResult,
  };
}

/**
 * Records an answer attempt in node_answers.
 */
export async function recordNodeAnswer(
  data: {
    nodeId: string;
    projectId: string;
    selectedIndex: number | null;
    result: AnswerResult;
  },
  client?: postgres.Sql,
): Promise<NodeAnswerRecord> {
  const db = client ?? getDb();

  const rows = await db<NodeAnswerRecord[]>`
    INSERT INTO node_answers (
      node_id,
      project_id,
      selected_index,
      result,
      created_at
    ) VALUES (
      ${data.nodeId},
      ${data.projectId},
      ${data.selectedIndex},
      ${data.result},
      now()
    )
    RETURNING *
  `;

  return rows[0];
}

/**
 * Transitions node status to 'completed' if currently in an actionable state:
 * 'committed', 'needs_review', or 'in_progress'.
 * Never downgrades or alters an already 'completed' node.
 */
export async function completeNodeStatusIfEligible(
  nodeId: string,
  client?: postgres.Sql,
): Promise<boolean> {
  assertValidUuid(nodeId, "Invalid node ID");
  const db = client ?? getDb();

  const res = await db`
    UPDATE nodes
    SET status = 'completed'
    WHERE id = ${nodeId}
      AND status IN ('committed', 'needs_review', 'in_progress')
  `;

  return res.count > 0;
}

/**
 * Builds the complete client response for GET /api/nodes/[id]/learn.
 * Enforces security rule: NEVER includes correct_index or question explanation
 * before reveal or a correct answer.
 */
export async function getNodeLearningDetails(
  nodeId: string,
  ownerId: string,
  client?: postgres.Sql,
): Promise<NodeLearnResponse> {
  const node = await getNodeWithProjectForOwner(nodeId, ownerId, client);
  const latestCommit = await getLatestCommitForNode(nodeId, client);
  const storedLearning = await getNodeLearningRecord(nodeId, client);
  const answerStats = await getNodeAnswerStats(nodeId, client);

  const hasCommit = latestCommit !== null;
  const latestCommitSha = latestCommit?.sha ?? null;

  let clientLearning: ClientLearning | null = null;

  if (storedLearning) {
    const isStale = Boolean(
      latestCommitSha && storedLearning.commit_sha !== latestCommitSha,
    );

    clientLearning = {
      diff_explanation: storedLearning.diff_explanation,
      diff_source: storedLearning.diff_source,
      commit_sha: storedLearning.commit_sha,
      stale: isStale,
      question: {
        prompt: storedLearning.question.prompt,
        options: storedLearning.question.options,
      },
    };
  }

  // Evaluate reveal: true if resolved OR learner has made >= 2 wrong attempts
  const isRevealed = answerStats.resolved || answerStats.wrongCount >= 2;

  let revealData: { correct_index: number; explanation: string } | null = null;
  let hintData: string | null = null;

  if (storedLearning) {
    if (isRevealed) {
      revealData = {
        correct_index: storedLearning.correct_index,
        explanation: storedLearning.question.explanation,
      };
    } else if (answerStats.wrongCount > 0) {
      // Provide hint after at least one wrong attempt, before full reveal
      hintData = storedLearning.question.hint;
    }
  }

  return {
    explanation: node.explanation,
    has_commit: hasCommit,
    commit_sha: latestCommitSha,
    learning: clientLearning,
    answer_state: {
      wrong_count: answerStats.wrongCount,
      resolved: answerStats.resolved,
      result: answerStats.result,
      reveal: revealData,
      hint: hintData,
    },
  };
}
