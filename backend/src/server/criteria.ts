import { z } from "zod";
import {
  NodeSchema,
  type Node,
  type Edge,
  type Requirement,
} from "@/lib/schema";
import { BadRequestError } from "@/lib/errors";
import { generateJson } from "./llm";
import { type GenericJsonGenerator } from "./extract";
import {
  buildCriteriaMessages,
  makeCriteriaSchema,
  chunkNodes,
  mergeCriteria,
  MAX_NODES_PER_CRITERIA_CALL,
  CRITERIA_PROMPT_VERSION,
  type CriteriaOutput,
  type CriteriaInputNode,
} from "./prompts/criteria";

export type CriteriaBatchJsonGenerator = (
  prompt: string,
  opts?: {
    system?: string;
    schema?: z.ZodType<CriteriaOutput>;
    maxOutputTokens?: number;
    timeoutMs?: number;
  },
) => Promise<{ data: CriteriaOutput; model: string }>;

export type CriteriaGenerator =
  GenericJsonGenerator | CriteriaBatchJsonGenerator;

export interface CriteriaOptions {
  batchSize?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  generator?: CriteriaGenerator;
}

export interface CriteriaGraphInput {
  nodes: Node[] | Array<Record<string, unknown>>;
  edges?: Edge[] | Array<Record<string, unknown>>;
  requirements?: Requirement[] | Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export type CriteriaInputData =
  CriteriaGraphInput | Node[] | Array<Record<string, unknown>>;

export interface EnrichedGraphWithCriteria {
  nodes: Node[];
  edges: Edge[];
  requirements?: Requirement[];
  criteria: CriteriaOutput;
  criteriaMap: CriteriaOutput;
  model: string;
  version: string;
}

/**
 * Normalizes graph input components (nodes, edges, requirements).
 */
function resolveGraphInput(input: CriteriaInputData): {
  rawNodes: Array<Record<string, unknown>>;
  rawEdges: Array<Record<string, unknown>>;
  rawRequirements: Array<Record<string, unknown>>;
} {
  if (!input) {
    throw new BadRequestError("Input graph or nodes cannot be empty", {
      code: "NODES_EMPTY",
    });
  }

  let rawNodes: Array<Record<string, unknown>> = [];
  let rawEdges: Array<Record<string, unknown>> = [];
  let rawRequirements: Array<Record<string, unknown>> = [];

  if (Array.isArray(input)) {
    rawNodes = input as Array<Record<string, unknown>>;
  } else if (typeof input === "object") {
    const obj = input as CriteriaGraphInput;
    if (Array.isArray(obj.nodes)) {
      rawNodes = obj.nodes as Array<Record<string, unknown>>;
    }
    if (Array.isArray(obj.edges)) {
      rawEdges = obj.edges as Array<Record<string, unknown>>;
    }
    if (Array.isArray(obj.requirements)) {
      rawRequirements = obj.requirements as Array<Record<string, unknown>>;
    }
  }

  if (rawNodes.length === 0) {
    throw new BadRequestError("Graph must contain at least one node", {
      code: "NODES_EMPTY",
    });
  }

  for (let i = 0; i < rawNodes.length; i++) {
    const n = rawNodes[i];
    const key = (n.node_key ?? n.key ?? "").toString().trim();
    if (!key) {
      throw new BadRequestError(`Node at index ${i} is missing node_key`, {
        code: "INVALID_NODE",
      });
    }
  }

  return { rawNodes, rawEdges, rawRequirements };
}

/**
 * Generates acceptance criteria (at least 2) and test specifications (at least 3)
 * for each actionable node in the graph, batching calls in chunks of up to 8 nodes.
 */
export async function generateCriteriaAndTests(
  input: CriteriaInputData,
  options?: CriteriaOptions,
): Promise<EnrichedGraphWithCriteria> {
  const { rawNodes, rawEdges, rawRequirements } = resolveGraphInput(input);

  // Build lookups for prerequisite and requirement titles
  const nodeTitleMap = new Map<string, string>();
  for (const n of rawNodes) {
    const key = (n.node_key ?? n.key ?? "").toString().trim();
    const title = (n.title ?? "").toString().trim();
    if (key && title) {
      nodeTitleMap.set(key, title);
    }
  }

  const reqTitleMap = new Map<string, string>();
  for (const r of rawRequirements) {
    const key = (r.key ?? "").toString().trim();
    const title = (r.title ?? "").toString().trim();
    if (key && title) {
      reqTitleMap.set(key, title);
    }
  }

  // Enrich each node with prerequisite titles and requirement context
  const enrichedNodes: CriteriaInputNode[] = rawNodes.map((n) => {
    const nodeKey = (n.node_key ?? n.key ?? "").toString().trim();
    const title = (n.title ?? "").toString().trim();
    const explanation =
      typeof n.explanation === "string" ? n.explanation : null;
    const reqKey =
      typeof n.requirement_key === "string" ? n.requirement_key : null;
    const files = Array.isArray(n.files) ? (n.files as string[]) : [];

    // Find prerequisite titles from DEPENDS_ON edges
    const prereqKeys = rawEdges
      .filter((e) => {
        const from = (e.from_node ?? e.from ?? "").toString().trim();
        const type = (e.type ?? "DEPENDS_ON").toString().trim();
        return from === nodeKey && type === "DEPENDS_ON";
      })
      .map((e) => (e.to_node ?? e.to ?? "").toString().trim());

    const depends_on = prereqKeys
      .map((k) => nodeTitleMap.get(k))
      .filter((t): t is string => Boolean(t));

    return {
      node_key: nodeKey,
      title,
      explanation,
      files,
      requirement_key: reqKey,
      requirement_title: reqKey ? reqTitleMap.get(reqKey) : undefined,
      depends_on: depends_on.length > 0 ? depends_on : undefined,
    };
  });

  const batchSize = options?.batchSize ?? MAX_NODES_PER_CRITERIA_CALL;
  const batches = chunkNodes(enrichedNodes, batchSize);

  const generator = options?.generator ?? generateJson;
  const criteriaBatches: CriteriaOutput[] = [];
  let lastModel = "unknown";

  // Process each batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNodeKeys = batch.map((n) => n.node_key);
    const messages = buildCriteriaMessages(batch);
    const schema = makeCriteriaSchema(batchNodeKeys);

    const res = await (generator as CriteriaBatchJsonGenerator)(
      messages.prompt,
      {
        system: messages.system,
        schema,
        maxOutputTokens: options?.maxOutputTokens ?? 4096,
        timeoutMs: options?.timeoutMs,
      },
    );

    criteriaBatches.push(res.data);
    if (res.model) {
      lastModel = res.model;
    }
  }

  const mergedCriteria = mergeCriteria(criteriaBatches);

  // Attach acceptance and tests to each node and enforce Acceptance Criteria
  // (at least 2 criteria and 3 tests per actionable node)
  const finalNodes: Node[] = rawNodes.map((n) => {
    const nodeKey = (n.node_key ?? n.key ?? "").toString().trim();
    const nodeCriteria = mergedCriteria[nodeKey];

    if (!nodeCriteria) {
      throw new Error(
        `Criteria generation failed to produce output for node "${nodeKey}"`,
      );
    }

    const acceptance = nodeCriteria.acceptance ?? [];
    const tests = nodeCriteria.tests ?? [];

    if (acceptance.length < 2) {
      throw new Error(
        `Node "${nodeKey}" must have at least 2 acceptance criteria (got ${acceptance.length})`,
      );
    }

    if (tests.length < 3) {
      throw new Error(
        `Node "${nodeKey}" must have at least 3 test specifications (got ${tests.length})`,
      );
    }

    const candidateNode = {
      ...n,
      acceptance,
      tests,
    };

    return NodeSchema.parse(candidateNode);
  });

  return {
    nodes: finalNodes,
    edges: rawEdges as Edge[],
    requirements: rawRequirements as Requirement[],
    criteria: mergedCriteria,
    criteriaMap: mergedCriteria,
    model: lastModel,
    version: CRITERIA_PROMPT_VERSION,
  };
}

// Aliases for convenience
export const generateCriteria = generateCriteriaAndTests;
export const attachCriteriaAndTests = generateCriteriaAndTests;
export const criteria = generateCriteriaAndTests;
