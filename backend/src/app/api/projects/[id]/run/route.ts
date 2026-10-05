import { NextRequest, NextResponse } from "next/server";
import { type Requirement, type Node, type Edge } from "@/lib/schema";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@/lib/errors";
import { jsonError } from "@/server/response";
import { extractRequirements, type ExtractedRequirements } from "@/server/extract";
import {
  proposeArchitecture,
  type ProposedArchitecture,
  type RequirementItem,
} from "@/server/architecture";
import { decomposeToNodes, type DecomposedGraph } from "@/server/decompose";
import {
  generateCriteriaAndTests,
  type EnrichedGraphWithCriteria,
} from "@/server/criteria";
import {
  getPipelineResumeState,
  savePlan,
  saveStageFailed,
  saveStageOutput,
  saveStageRunning,
  type PipelineStage,
} from "@/server/savePlan";
import {
  findProjectById,
  getOwnerId,
  updateProjectForOwner,
  type ProjectRecord,
} from "@/server/session";
import { STAGE_LLM_TOKEN_LIMITS } from "@/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export interface RunStageDependencies {
  extractRequirementsStage?: (
    project: ProjectRecord,
  ) => Promise<ExtractedRequirements>;
  architectureStage?: (
    requirements: RequirementItem[],
    requirementsOutput: ExtractedRequirements,
  ) => Promise<ProposedArchitecture>;
  decompositionStage?: (
    requirements: RequirementItem[],
    architecture: ProposedArchitecture,
    projectId: string,
  ) => Promise<DecomposedGraph>;
  criteriaStage?: (
    graph: {
      nodes: Node[];
      edges: Edge[];
      requirements: Requirement[];
    },
  ) => Promise<EnrichedGraphWithCriteria>;
}

export interface RunStageResult {
  stage: PipelineStage | null;
  done: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asObject(value: unknown, stage: PipelineStage): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestError(`Stored output for stage "${stage}" is invalid`, {
      code: "INVALID_STAGE_OUTPUT",
    });
  }
  return value as Record<string, unknown>;
}

function getRequirements(output: unknown, stage: PipelineStage): RequirementItem[] {
  const obj = asObject(output, stage);
  if (!Array.isArray(obj.requirements)) {
    throw new BadRequestError(
      `Stored output for stage "${stage}" is missing requirements`,
      { code: "INVALID_STAGE_OUTPUT" },
    );
  }
  return obj.requirements as RequirementItem[];
}

function getArchitecture(output: unknown): ProposedArchitecture {
  return asObject(output, "architecture") as unknown as ProposedArchitecture;
}

function getDecomposedGraph(output: unknown): {
  nodes: Node[];
  edges: Edge[];
  requirements: Requirement[];
} {
  const obj = asObject(output, "decomposition");
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) {
    throw new BadRequestError(
      'Stored output for stage "decomposition" is missing nodes or edges',
      { code: "INVALID_STAGE_OUTPUT" },
    );
  }
  return {
    nodes: obj.nodes as Node[],
    edges: obj.edges as Edge[],
    requirements: Array.isArray(obj.requirements)
      ? (obj.requirements as Requirement[])
      : [],
  };
}

async function runStage(
  project: ProjectRecord,
  stage: PipelineStage,
  stages: Awaited<ReturnType<typeof getPipelineResumeState>>["stages"],
  deps: RunStageDependencies,
): Promise<unknown> {
  if (stage === "requirements") {
    if (deps.extractRequirementsStage) {
      return deps.extractRequirementsStage(project);
    }
    return extractRequirements(
      { idea: project.idea, project_id: project.id },
      {
        project_id: project.id,
        maxOutputTokens: STAGE_LLM_TOKEN_LIMITS.requirements,
        timeoutMs: 240_000,
      },
    );
  }

  if (stage === "architecture") {
    const requirementsOutput =
      stages.requirements.output as ExtractedRequirements;
    const requirements = getRequirements(
      requirementsOutput,
      "requirements",
    );
    if (deps.architectureStage) {
      return deps.architectureStage(requirements, requirementsOutput);
    }
    return proposeArchitecture(
      {
        requirements,
        assumptions: requirementsOutput.assumptions,
      },
      {
        maxOutputTokens: STAGE_LLM_TOKEN_LIMITS.architecture,
        timeoutMs: 240_000,
      },
    );
  }

  if (stage === "decomposition") {
    const requirements = getRequirements(
      stages.requirements.output,
      "requirements",
    );
    const architecture = getArchitecture(stages.architecture.output);
    if (deps.decompositionStage) {
      return deps.decompositionStage(requirements, architecture, project.id);
    }
    return decomposeToNodes(
      { requirements, architecture, project_id: project.id },
      {
        project_id: project.id,
        maxOutputTokens: STAGE_LLM_TOKEN_LIMITS.decomposition,
        timeoutMs: 240_000,
      },
    );
  }

  const graph = getDecomposedGraph(stages.decomposition.output);
  if (deps.criteriaStage) {
    return deps.criteriaStage(graph);
  }
  return generateCriteriaAndTests(graph, {
    maxOutputTokens: STAGE_LLM_TOKEN_LIMITS.criteria,
    timeoutMs: 240_000,
  });
}

export async function runNextProjectStage(
  projectId: string,
  ownerId: string,
  deps: RunStageDependencies = {},
): Promise<RunStageResult> {
  const project = await findProjectById(projectId, ownerId);
  if (!project) {
    throw new NotFoundError(`Project with id "${projectId}" not found`);
  }

  const resume = await getPipelineResumeState(project.id);
  const stage = resume.nextStage;

  if (!stage) {
    await updateProjectForOwner(
      project.id,
      { status: "ready", current_stage: "criteria" },
      ownerId,
    );
    return { stage: null, done: true };
  }

  await saveStageRunning(project.id, stage);

  try {
    const output = await runStage(project, stage, resume.stages, deps);

    if (stage === "criteria") {
      const criteriaOutput = output as EnrichedGraphWithCriteria;
      await savePlan({
        projectId: project.id,
        requirements: criteriaOutput.requirements ?? [],
        nodes: criteriaOutput.nodes,
        edges: criteriaOutput.edges,
        projectStatus: "ready",
      });
      await saveStageOutput(project.id, stage, criteriaOutput);
      return { stage, done: true };
    }

    await saveStageOutput(project.id, stage, output);
    await updateProjectForOwner(
      project.id,
      { status: "generating", current_stage: stage },
      ownerId,
    );
    return { stage, done: false };
  } catch (error) {
    await saveStageFailed(project.id, stage, errorMessage(error));
    await updateProjectForOwner(
      project.id,
      { status: "failed", current_stage: stage },
      ownerId,
    );
    throw error;
  }
}

/**
 * POST /api/projects/:id/run
 *
 * Runs exactly one pending pipeline stage per request:
 * requirements -> architecture -> decomposition -> criteria.
 */
export async function POST(
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
    const projectId = (resolvedParams?.id ?? "").trim();
    if (!projectId) {
      throw new BadRequestError("Project ID is required", {
        code: "MISSING_PROJECT_ID",
      });
    }

    const result = await runNextProjectStage(projectId, ownerId);
    return NextResponse.json(
      { success: true, stage: result.stage, done: result.done, data: result },
      { status: 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
