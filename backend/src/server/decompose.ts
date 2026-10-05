import crypto from "node:crypto";
import { z } from "zod";
import {
  NodeSchema,
  EdgeSchema,
  GraphSchema,
  sortNodesByPhase,
  analyzeGraphShape,
  type Node,
  type Edge,
  type GraphShapeAnalysis,
} from "@/lib/schema";
import { BadRequestError } from "@/lib/errors";
import { generateJson } from "./llm";
import { type GenericJsonGenerator } from "./extract";
import {
  buildDecomposeMessages,
  makeDecomposeOutputSchema,
  type DecomposeOutput,
  DECOMPOSE_PROMPT_VERSION,
} from "./prompts/decompose";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

import type { RequirementItem } from "./architecture";

export interface DecomposeInputObject {
  requirements?: RequirementItem[];
  features?: RequirementItem[];
  architecture?: unknown;
  projectId?: string;
  project_id?: string;
}

export type DecomposeJsonGenerator = (
  prompt: string,
  opts?: {
    system?: string;
    schema?: z.ZodType<DecomposeOutput>;
    maxOutputTokens?: number;
    timeoutMs?: number;
  },
) => Promise<{ data: DecomposeOutput; model: string }>;

export type DecomposeGenerator = GenericJsonGenerator | DecomposeJsonGenerator;

export interface DecomposeOptions {
  projectId?: string;
  project_id?: string;
  requireCoverage?: boolean;
  maxOutputTokens?: number;
  timeoutMs?: number;
  generator?: DecomposeGenerator;
}

export interface DecomposedGraph {
  nodes: Node[];
  edges: Edge[];
  requirements?: RequirementItem[];
  parentsMap: Record<string, string[]>;
  shape: GraphShapeAnalysis;
  model: string;
  version: string;
}

/**
 * Normalizes input requirements and architecture from flexible arguments.
 */
function resolveDecomposeInputs(
  inputOrRequirements: DecomposeInputObject | RequirementItem[],
  architectureOrOptions?: unknown,
  maybeOptions?: DecomposeOptions,
): {
  requirements: RequirementItem[];
  architecture: unknown;
  options?: DecomposeOptions;
} {
  let requirements: RequirementItem[] | undefined;
  let architecture: unknown;
  let options: DecomposeOptions | undefined;

  if (Array.isArray(inputOrRequirements)) {
    requirements = inputOrRequirements;
    architecture = architectureOrOptions;
    options = maybeOptions;
  } else if (
    typeof inputOrRequirements === "object" &&
    inputOrRequirements !== null
  ) {
    requirements =
      inputOrRequirements.requirements ?? inputOrRequirements.features;
    architecture =
      inputOrRequirements.architecture ??
      (typeof architectureOrOptions === "object" &&
      architectureOrOptions !== null &&
      !("generator" in architectureOrOptions)
        ? architectureOrOptions
        : undefined);

    options =
      maybeOptions ??
      (typeof architectureOrOptions === "object" &&
      architectureOrOptions !== null &&
      ("generator" in architectureOrOptions ||
        "requireCoverage" in architectureOrOptions ||
        "projectId" in architectureOrOptions ||
        "project_id" in architectureOrOptions)
        ? (architectureOrOptions as DecomposeOptions)
        : undefined);
  }

  if (
    !requirements ||
    !Array.isArray(requirements) ||
    requirements.length === 0
  ) {
    throw new BadRequestError(
      "Requirements cannot be empty for plan decomposition",
      { code: "REQUIREMENTS_EMPTY" },
    );
  }

  if (!architecture) {
    throw new BadRequestError(
      "Architecture must be provided for plan decomposition",
      { code: "ARCHITECTURE_EMPTY" },
    );
  }

  // Validate requirement items
  for (let i = 0; i < requirements.length; i++) {
    const r = requirements[i];
    if (!r || typeof r !== "object" || !r.key || !r.title) {
      throw new BadRequestError(
        `Requirement at index ${i} must have non-empty key and title`,
        { code: "INVALID_REQUIREMENT" },
      );
    }
  }

  return { requirements, architecture, options };
}

/**
 * Breaks features into nodes and DEPENDS_ON edges starting with setup phases.
 * Ensures every node has a requirement and every node (outside the initial setup root) has a parent.
 */
export async function decomposeToNodes(
  inputOrRequirements: DecomposeInputObject | RequirementItem[],
  architectureOrOptions?: unknown,
  maybeOptions?: DecomposeOptions,
): Promise<DecomposedGraph> {
  const { requirements, architecture, options } = resolveDecomposeInputs(
    inputOrRequirements,
    architectureOrOptions,
    maybeOptions,
  );

  const effectiveProjectId =
    options?.project_id ??
    options?.projectId ??
    (typeof inputOrRequirements === "object" &&
    !Array.isArray(inputOrRequirements)
      ? (inputOrRequirements.project_id ?? inputOrRequirements.projectId)
      : undefined);

  if (effectiveProjectId !== undefined && !isValidUuid(effectiveProjectId)) {
    throw new BadRequestError(
      `Invalid project_id "${effectiveProjectId}": must be a valid UUID`,
      { code: "INVALID_PROJECT_ID" },
    );
  }

  const reqKeys = requirements.map((r) => r.key);
  const defaultReqKey = reqKeys[0] ?? "REQ-1";

  // Build lookup map for requirement IDs if available
  const reqIdMap = new Map<string, string>();
  for (const r of requirements) {
    if (r.id && isValidUuid(r.id)) {
      reqIdMap.set(r.key, r.id);
    }
  }

  const messages = buildDecomposeMessages({ requirements, architecture });
  const schema = makeDecomposeOutputSchema(reqKeys, {
    requireCoverage: options?.requireCoverage ?? true,
  });

  const generator = options?.generator ?? generateJson;

  const res = await (generator as DecomposeJsonGenerator)(messages.prompt, {
    system: messages.system,
    schema,
    maxOutputTokens: options?.maxOutputTokens ?? 16384,
    timeoutMs: options?.timeoutMs,
  });

  const rawNodes = [...res.data.nodes];
  const rawEdges = [...(res.data.edges ?? [])];

  // 1. Sort nodes chronologically by phase
  const sortedNodes = sortNodesByPhase(rawNodes);

  // 2. Identify initial root node (e.g. "01.1")
  const rootNode = sortedNodes[0];
  const rootNodeKey = rootNode ? rootNode.node_key : "01.1";

  // 3. Track existing DEPENDS_ON edges
  const outgoingDependsOn = new Set<string>();
  for (const edge of rawEdges) {
    if (edge.type === "DEPENDS_ON") {
      outgoingDependsOn.add(edge.from_node);
    }
  }

  // 4. Acceptance Criteria: Every node has a parent and a requirement
  // Ensure every node after the root node has at least one prerequisite (parent)
  for (let i = 1; i < sortedNodes.length; i++) {
    const node = sortedNodes[i];
    if (!outgoingDependsOn.has(node.node_key)) {
      rawEdges.push({
        from_node: node.node_key,
        to_node: rootNodeKey,
        type: "DEPENDS_ON",
      });
      outgoingDependsOn.add(node.node_key);
    }
  }

  // 5. Ensure every node links to a requirement
  const processedNodes: Node[] = sortedNodes.map((n) => {
    const assignedReqKey =
      n.requirement_key && n.requirement_key.trim().length > 0
        ? n.requirement_key.trim()
        : defaultReqKey;

    const assignedReqId =
      n.requirement_id && isValidUuid(n.requirement_id)
        ? n.requirement_id
        : reqIdMap.get(assignedReqKey);

    const candidateNode: Record<string, unknown> = {
      ...n,
      id: isValidUuid(n.id) ? n.id : crypto.randomUUID(),
      requirement_key: assignedReqKey,
    };

    if (assignedReqId !== undefined) {
      candidateNode.requirement_id = assignedReqId;
    }
    if (effectiveProjectId !== undefined) {
      candidateNode.project_id = effectiveProjectId;
    }

    return NodeSchema.parse(candidateNode);
  });

  // 6. Ensure valid edges with UUIDs
  const processedEdges: Edge[] = rawEdges.map((e) => {
    const candidateEdge: Record<string, unknown> = {
      ...e,
      id: isValidUuid(e.id) ? e.id : crypto.randomUUID(),
    };
    if (effectiveProjectId !== undefined) {
      candidateEdge.project_id = effectiveProjectId;
    }
    return EdgeSchema.parse(candidateEdge);
  });

  // 7. Validate whole graph with GraphSchema to enforce full structural integrity
  GraphSchema.parse({
    project_id: effectiveProjectId,
    requirements: requirements.map((r) => ({
      key: r.key,
      title: r.title,
      description: r.description ?? null,
      id: r.id && isValidUuid(r.id) ? r.id : undefined,
    })),
    nodes: processedNodes,
    edges: processedEdges,
  });

  // 8. Compute parents map (prerequisites for each node)
  const parentsMap: Record<string, string[]> = {};
  for (const n of processedNodes) {
    parentsMap[n.node_key] = processedEdges
      .filter((e) => e.from_node === n.node_key && e.type === "DEPENDS_ON")
      .map((e) => e.to_node);
  }

  const shape = analyzeGraphShape(processedNodes, processedEdges);

  return {
    nodes: processedNodes,
    edges: processedEdges,
    requirements,
    parentsMap,
    shape,
    model: res.model ?? "unknown",
    version: messages.version ?? DECOMPOSE_PROMPT_VERSION,
  };
}

// Aliases for convenience
export const decompose = decomposeToNodes;
export const decomposeFeatures = decomposeToNodes;
export const decomposePlan = decomposeToNodes;
