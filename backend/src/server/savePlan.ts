import crypto from "node:crypto";
import type postgres from "postgres";
import {
  toDbNodeStatus,
  type Node,
  type Edge,
  type Requirement,
  type NodeStatus,
} from "@/lib/schema";
import { getDb } from "@/lib/db";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { assertValidGraph, type GraphLike } from "./validate";

export const PIPELINE_STAGES = [
  "requirements",
  "architecture",
  "decomposition",
  "criteria",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_STATUSES = ["pending", "running", "done", "failed"] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];

export interface ProjectStageRecord {
  project_id: string;
  stage: PipelineStage;
  status: StageStatus;
  output: unknown;
  error: string | null;
  updated_at: string | Date;
}

export interface PipelineResumeState {
  projectId: string;
  stages: Record<
    PipelineStage,
    { status: StageStatus; output: unknown; error?: string | null }
  >;
  completedStages: PipelineStage[];
  lastCompletedStage: PipelineStage | null;
  nextStage: PipelineStage | null;
  canResume: boolean;
}

export interface SavePlanInput {
  projectId?: string;
  project_id?: string;
  nodes: Node[] | Array<Record<string, unknown>>;
  edges: Edge[] | Array<Record<string, unknown>>;
  requirements?: Requirement[] | Array<Record<string, unknown>>;
  prompts?: Record<string, string>;
  projectStatus?: "ready" | "generating" | "failed";
}

export interface SavePlanOptions {
  db?: postgres.Sql;
  validate?: boolean;
  markProjectReady?: boolean;
  beforeCommitHook?: (tx: postgres.TransactionSql) => Promise<void>;
}

export interface SavedPlanResult {
  projectId: string;
  requirementsSaved: number;
  nodesSaved: number;
  edgesSaved: number;
  nodeIds: Record<string, string>;
  requirementIds: Record<string, string>;
  status: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

/**
 * Persists an intermediate or completed pipeline stage output for a project.
 * Allows interrupted, failed, or timed-out pipelines to resume from the last successful stage.
 */
export async function saveStageOutput(
  projectId: string,
  stage: PipelineStage,
  output: unknown,
  status: StageStatus = "done",
  error?: string | null,
  client?: postgres.Sql,
): Promise<ProjectStageRecord> {
  if (!isValidUuid(projectId)) {
    throw new BadRequestError(
      `Invalid project ID "${projectId}". Must be a valid UUID.`,
      { code: "INVALID_PROJECT_ID" },
    );
  }

  if (!PIPELINE_STAGES.includes(stage)) {
    throw new BadRequestError(`Invalid pipeline stage "${stage}".`, {
      code: "INVALID_STAGE",
    });
  }

  const db = client ?? getDb();
  const outputParam =
    output !== undefined && output !== null
      ? db.json(output as postgres.JSONValue)
      : null;
  const errorText = error ?? null;

  const [record] = await db<ProjectStageRecord[]>`
    INSERT INTO project_stages (project_id, stage, status, output, error, updated_at)
    VALUES (${projectId}, ${stage}, ${status}, ${outputParam}, ${errorText}, now())
    ON CONFLICT (project_id, stage)
    DO UPDATE SET
      status = EXCLUDED.status,
      output = EXCLUDED.output,
      error = EXCLUDED.error,
      updated_at = now()
    RETURNING project_id, stage, status, output, error, updated_at
  `;

  // Also record current stage on project
  await db`
    UPDATE projects
    SET current_stage = ${stage},
        updated_at = now()
    WHERE id = ${projectId}
  `;

  let out = record.output;
  if (typeof out === "string") {
    try {
      out = JSON.parse(out);
    } catch {
      // keep
    }
  }

  return { ...record, output: out };
}

/**
 * Marks a pipeline stage as running.
 */
export async function saveStageRunning(
  projectId: string,
  stage: PipelineStage,
  client?: postgres.Sql,
): Promise<ProjectStageRecord> {
  return saveStageOutput(projectId, stage, null, "running", null, client);
}

/**
 * Marks a pipeline stage as failed with an error message.
 */
export async function saveStageFailed(
  projectId: string,
  stage: PipelineStage,
  error: string,
  client?: postgres.Sql,
): Promise<ProjectStageRecord> {
  return saveStageOutput(projectId, stage, null, "failed", error, client);
}

/**
 * Retrieves the output of a specific pipeline stage for a project.
 */
export async function getStageOutput(
  projectId: string,
  stage: PipelineStage,
  client?: postgres.Sql,
): Promise<unknown | null> {
  if (!isValidUuid(projectId)) {
    throw new BadRequestError(
      `Invalid project ID "${projectId}". Must be a valid UUID.`,
      { code: "INVALID_PROJECT_ID" },
    );
  }

  const db = client ?? getDb();
  const rows = await db<{ output: unknown; status: StageStatus }[]>`
    SELECT output, status
    FROM project_stages
    WHERE project_id = ${projectId} AND stage = ${stage}
  `;

  if (rows.length === 0) {
    return null;
  }

  let raw = rows[0].output;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      // keep
    }
  }

  return raw;
}

/**
 * Retrieves all stage records for a project to determine resume state.
 */
export async function getProjectStages(
  projectId: string,
  client?: postgres.Sql,
): Promise<ProjectStageRecord[]> {
  if (!isValidUuid(projectId)) {
    throw new BadRequestError(
      `Invalid project ID "${projectId}". Must be a valid UUID.`,
      { code: "INVALID_PROJECT_ID" },
    );
  }

  const db = client ?? getDb();
  const rows = await db<ProjectStageRecord[]>`
    SELECT project_id, stage, status, output, error, updated_at
    FROM project_stages
    WHERE project_id = ${projectId}
    ORDER BY updated_at ASC
  `;

  return rows.map((r) => {
    let out = r.output;
    if (typeof out === "string") {
      try {
        out = JSON.parse(out);
      } catch {
        // keep
      }
    }
    return { ...r, output: out };
  });
}

/**
 * Inspects recorded stages and computes pipeline resume state.
 */
export async function getPipelineResumeState(
  projectId: string,
  client?: postgres.Sql,
): Promise<PipelineResumeState> {
  const records = await getProjectStages(projectId, client);

  const stageMap: Record<
    PipelineStage,
    { status: StageStatus; output: unknown; error?: string | null }
  > = {
    requirements: { status: "pending", output: null },
    architecture: { status: "pending", output: null },
    decomposition: { status: "pending", output: null },
    criteria: { status: "pending", output: null },
  };

  for (const r of records) {
    if (r.stage in stageMap) {
      stageMap[r.stage] = {
        status: r.status,
        output: r.output,
        error: r.error,
      };
    }
  }

  const completedStages: PipelineStage[] = [];
  for (const stage of PIPELINE_STAGES) {
    if (stageMap[stage].status === "done" && stageMap[stage].output !== null) {
      completedStages.push(stage);
    } else {
      break;
    }
  }

  const lastCompletedStage =
    completedStages.length > 0
      ? completedStages[completedStages.length - 1]
      : null;

  const nextIndex = completedStages.length;
  const nextStage =
    nextIndex < PIPELINE_STAGES.length ? PIPELINE_STAGES[nextIndex] : null;

  return {
    projectId,
    stages: stageMap,
    completedStages,
    lastCompletedStage,
    nextStage,
    canResume: completedStages.length > 0 && nextStage !== null,
  };
}

/**
 * Saves final nodes and edges (plus requirements) in ONE atomic transaction.
 *
 * Ensures:
 * 1. Graph validation runs before saving (invalid graphs are never saved).
 * 2. Nodes, requirements, and edges are saved together in a single transaction.
 * 3. Any error or constraint violation triggers full rollback.
 * 4. Updates project status to 'ready' upon successful commit.
 */
export async function savePlan(
  input: SavePlanInput,
  options?: SavePlanOptions,
): Promise<SavedPlanResult> {
  if (!input) {
    throw new BadRequestError("Input to savePlan cannot be empty", {
      code: "INVALID_INPUT",
    });
  }

  const projectId = (input.projectId ?? input.project_id ?? "").trim();
  if (!isValidUuid(projectId)) {
    throw new BadRequestError(
      `Invalid or missing project ID "${projectId}". Must be a valid UUID.`,
      { code: "INVALID_PROJECT_ID" },
    );
  }

  if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
    throw new BadRequestError("Graph must contain at least one node to save", {
      code: "NODES_EMPTY",
    });
  }

  // Step 1: Pre-validation of graph integrity (unless explicitly skipped)
  if (options?.validate !== false) {
    assertValidGraph({
      nodes: input.nodes as GraphLike["nodes"],
      edges: (input.edges ?? []) as GraphLike["edges"],
      requirements: (input.requirements ?? []) as GraphLike["requirements"],
    });
  }

  const db = options?.db ?? getDb();

  // Step 2: Atomic transaction for all graph components
  return await db.begin(async (tx) => {
    // 2.1 Verify target project exists
    const [project] = await tx<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${projectId}
    `;

    if (!project) {
      throw new NotFoundError(`Project with id "${projectId}" not found`);
    }

    // 2.2 Process requirements
    const requirementIds: Record<string, string> = {};

    // Load any existing requirements for this project to preserve IDs
    const existingReqs = await tx<{ id: string; key: string }[]>`
      SELECT id, key FROM requirements WHERE project_id = ${projectId}
    `;
    for (const r of existingReqs) {
      requirementIds[r.key] = r.id;
    }

    const reqsToSave = input.requirements ?? [];
    for (const r of reqsToSave) {
      const key = (r.key ?? "").toString().trim();
      if (!key) continue;
      const title = (r.title ?? key).toString().trim();
      const desc =
        typeof r.description === "string" ? r.description.trim() : null;
      const reqId = isValidUuid(r.id)
        ? r.id
        : (requirementIds[key] ?? crypto.randomUUID());

      const [savedReq] = await tx<{ id: string; key: string }[]>`
        INSERT INTO requirements (id, project_id, key, title, description, created_at)
        VALUES (${reqId}, ${projectId}, ${key}, ${title}, ${desc}, now())
        ON CONFLICT (project_id, key)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description
        RETURNING id, key
      `;
      requirementIds[savedReq.key] = savedReq.id;
    }

    // 2.3 Process nodes
    const nodeIds: Record<string, string> = {};

    // Load any existing nodes for this project to preserve IDs
    const existingNodes = await tx<{ id: string; node_key: string }[]>`
      SELECT id, node_key FROM nodes WHERE project_id = ${projectId}
    `;
    for (const n of existingNodes) {
      nodeIds[n.node_key] = n.id;
    }

    for (let i = 0; i < input.nodes.length; i++) {
      const n = input.nodes[i] as Record<string, unknown>;
      const key = (n.node_key ?? n.key ?? "").toString().trim();
      if (!key) {
        throw new BadRequestError(`Node at index ${i} is missing node_key`, {
          code: "INVALID_NODE",
        });
      }

      const phase = (n.phase ?? "01").toString().trim();
      const title = (n.title ?? key).toString().trim();
      const type = n.type ? n.type.toString().trim() : null;
      const status = toDbNodeStatus((n.status as NodeStatus) ?? "not_started");
      const files = Array.isArray(n.files) ? (n.files as string[]) : [];
      const explanation =
        typeof n.explanation === "string" ? n.explanation : null;
      const acceptance = Array.isArray(n.acceptance)
        ? (n.acceptance as string[])
        : [];
      const tests = Array.isArray(n.tests) ? (n.tests as string[]) : [];
      const prompt =
        typeof n.prompt === "string"
          ? n.prompt
          : (input.prompts?.[key] ?? null);

      const reqKey = (n.requirement_key ?? "").toString().trim();
      const reqId = isValidUuid(n.requirement_id)
        ? (n.requirement_id as string)
        : reqKey && requirementIds[reqKey]
          ? requirementIds[reqKey]
          : null;

      const nodeId = isValidUuid(n.id)
        ? (n.id as string)
        : (nodeIds[key] ?? crypto.randomUUID());

      const [savedNode] = await tx<{ id: string; node_key: string }[]>`
        INSERT INTO nodes (
          id, project_id, node_key, phase, title, type, status,
          requirement_id, files, explanation, acceptance, tests, prompt, created_at
        )
        VALUES (
          ${nodeId}, ${projectId}, ${key}, ${phase}, ${title}, ${type},
          ${status}, ${reqId}, ${files}, ${explanation}, ${acceptance}, ${tests}, ${prompt}, now()
        )
        ON CONFLICT (project_id, node_key)
        DO UPDATE SET
          phase = EXCLUDED.phase,
          title = EXCLUDED.title,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          requirement_id = EXCLUDED.requirement_id,
          files = EXCLUDED.files,
          explanation = EXCLUDED.explanation,
          acceptance = EXCLUDED.acceptance,
          tests = EXCLUDED.tests,
          prompt = EXCLUDED.prompt
        RETURNING id, node_key
      `;
      nodeIds[savedNode.node_key] = savedNode.id;
    }

    // 2.4 Process edges (replace previous edge set for clean graph sync)
    await tx`DELETE FROM edges WHERE project_id = ${projectId}`;

    const edgesToSave = input.edges ?? [];
    let edgesCount = 0;

    for (const rawEdge of edgesToSave) {
      const e = rawEdge as Record<string, unknown>;
      const fromRaw = (e.from_node ?? e.from ?? "").toString().trim();
      const toRaw = (e.to_node ?? e.to ?? "").toString().trim();
      const edgeType = (e.type ?? "DEPENDS_ON").toString().trim();

      const fromUuid =
        nodeIds[fromRaw] ?? (isValidUuid(fromRaw) ? fromRaw : null);
      const toUuid = nodeIds[toRaw] ?? (isValidUuid(toRaw) ? toRaw : null);

      if (!fromUuid || !toUuid) {
        throw new BadRequestError(
          `Cannot resolve edge endpoints to valid node UUIDs: from "${fromRaw}" -> to "${toRaw}"`,
          { code: "INVALID_EDGE" },
        );
      }

      if (fromUuid === toUuid) {
        throw new BadRequestError(
          `Self-edge is not allowed: from_node and to_node cannot be the same node ("${fromRaw}")`,
          { code: "SELF_EDGE" },
        );
      }

      const edgeId = isValidUuid(e.id) ? e.id : crypto.randomUUID();

      await tx`
        INSERT INTO edges (id, project_id, from_node, to_node, type)
        VALUES (${edgeId}, ${projectId}, ${fromUuid}, ${toUuid}, ${edgeType})
      `;
      edgesCount++;
    }

    // 2.5 Update project status
    const markReady = options?.markProjectReady ?? true;
    const projectStatus =
      input.projectStatus ?? (markReady ? "ready" : "generating");

    await tx`
      UPDATE projects
      SET status = ${projectStatus},
          current_stage = 'criteria',
          updated_at = now()
      WHERE id = ${projectId}
    `;

    // 2.6 Execute optional beforeCommitHook (for transaction-level testing & validation)
    if (options?.beforeCommitHook) {
      await options.beforeCommitHook(tx);
    }

    return {
      projectId,
      requirementsSaved: Object.keys(requirementIds).length,
      nodesSaved: Object.keys(nodeIds).length,
      edgesSaved: edgesCount,
      nodeIds,
      requirementIds,
      status: projectStatus,
    };
  });
}

// Aliases
export const savePlanGraph = savePlan;
export const persistPlan = savePlan;
