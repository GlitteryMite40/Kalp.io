import { z } from "zod";
import { NodeSchema, EdgeSchema, checkGraphIntegrity } from "@/lib/schema";
import {
  BASE_SYSTEM_GUARD,
  DEPENDS_ON_DIRECTION_TEXT,
  ALLOWED_STATUSES_TEXT,
  ALLOWED_EDGE_TYPES_TEXT,
  FIELD_NAME_RULES_TEXT,
  EDGE_INTEGRITY_RULES_TEXT,
  wrapUserInput,
  type PromptMessages,
} from "./shared";

export const DECOMPOSE_PROMPT_VERSION = "decompose.v2";

export const NODE_TYPES = [
  "setup",
  "database",
  "backend",
  "frontend",
  "integration",
  "testing",
  "deployment",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const FOUNDATION_NODE_TYPES = [
  "setup",
  "testing",
  "deployment",
] as const;

export type FoundationNodeType = (typeof FOUNDATION_NODE_TYPES)[number];

function validateDecomposeNodes(
  nodes: Array<{
    node_key: string;
    phase: string;
    type?: string | null;
    requirement_key?: string | null;
  }>,
  ctx: z.RefinementCtx,
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(node.node_key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `node_key "${node.node_key}" must match pattern /^[A-Za-z0-9][A-Za-z0-9._-]*$/`,
        path: ["nodes", i, "node_key"],
      });
    }
    if (
      !node.phase ||
      typeof node.phase !== "string" ||
      node.phase.trim().length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "phase must be a non-empty string",
        path: ["nodes", i, "phase"],
      });
    }

    // Validate type: must be one of NODE_TYPES (trimmed and lowercased)
    const rawType =
      typeof node.type === "string" ? node.type.trim().toLowerCase() : "";
    const isValidType = (NODE_TYPES as readonly string[]).includes(rawType);
    if (!isValidType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `node type "${node.type}" is invalid; must be one of: ${NODE_TYPES.join(", ")}`,
        path: ["nodes", i, "type"],
      });
    }

    // requirement_key is REQUIRED unless node type is in FOUNDATION_NODE_TYPES
    const isFoundationType = (
      FOUNDATION_NODE_TYPES as readonly string[]
    ).includes(rawType);
    if (!isFoundationType) {
      if (!node.requirement_key || node.requirement_key.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Node "${node.node_key}" of type "${node.type}" requires a requirement_key`,
          path: ["nodes", i, "requirement_key"],
        });
      }
    }
  }
}

export const DecomposeOutputSchema = z
  .object({
    nodes: z.array(NodeSchema).min(1, "At least one node is required"),
    edges: z.array(EdgeSchema).default([]),
  })
  .superRefine((data, ctx) => {
    validateDecomposeNodes(data.nodes, ctx);
    checkGraphIntegrity(data, ctx, {
      requireRequirementKey: true,
      requirementKeyOptionalForTypes: [...FOUNDATION_NODE_TYPES],
    });
  });

export function makeDecomposeOutputSchema(
  requirementKeys: string[],
  opts?: { requireCoverage?: boolean },
) {
  const requireCoverage = opts?.requireCoverage ?? true;
  return z
    .object({
      nodes: z.array(NodeSchema).min(1, "At least one node is required"),
      edges: z.array(EdgeSchema).default([]),
    })
    .superRefine((data, ctx) => {
      validateDecomposeNodes(data.nodes, ctx);
      checkGraphIntegrity(data, ctx, {
        knownRequirementKeys: requirementKeys,
        requireRequirementKey: true,
        requirementKeyOptionalForTypes: [...FOUNDATION_NODE_TYPES],
        requireFullCoverage: requireCoverage,
      });
    });
}

export type DecomposeOutput = z.infer<typeof DecomposeOutputSchema>;

const DECOMPOSE_SYSTEM_MESSAGE = `${BASE_SYSTEM_GUARD}

Task: Decompose the requirements and architecture provided in <user_input> into a dependency-aware build graph of actionable nodes and directional edges.
Every node must represent a clear phase of work.
Nodes must be ordered by phase.
All edges must define valid relationships between nodes without cycles among DEPENDS_ON edges.`;

/**
 * Builds system and user prompt messages for the decompose stage.
 */
export function buildDecomposeMessages(input: {
  requirements: unknown[];
  architecture: unknown;
}): PromptMessages {
  const prompt = `From the requirements and architecture provided in the delimited block below, produce nodes and edges in the exact build graph shape.

Phases and Node Structure:
- Phases are two-digit strings "01", "02", ... in build order. The first phase is setup (repository, scaffolding, environment). Data, backend, frontend and integration phases follow the architecture modules. The last two phases are testing, then deployment.
- node_key format is "<phase>.<n>" (for example 03.2), unique across the output.
- One node is one small, independently committable unit of work that one AI coding-agent prompt can finish (typically 1 to 6 files). Aim for 12 to 40 nodes in total, never more than 60.
- type must be one of: ${NODE_TYPES.join(", ")}. Setup, testing and deployment nodes may omit requirement_key; every other node must set a valid one.
- files are realistic relative paths that match the architecture stack; use [] only for non-code steps.
- explanation is 1 to 2 plain sentences a beginner understands: what this step builds and why it comes here.
- Use the architecture stack and modules for naming and file paths.

Field and Identity Rules:
- ${FIELD_NAME_RULES_TEXT}
- Do not output acceptance or tests (acceptance and tests are produced in a later criteria stage).
- ${ALLOWED_STATUSES_TEXT}
- ${ALLOWED_EDGE_TYPES_TEXT}
- ${EDGE_INTEGRITY_RULES_TEXT}

Edge Direction and Dependency Rules:
- ${DEPENDS_ON_DIRECTION_TEXT}
- Every node outside the first phase has at least one outgoing DEPENDS_ON edge to a direct prerequisite. Use direct prerequisites only, no transitive shortcuts.

Requirements Mapping:
- Every known requirement key must be covered by at least one node.
- Nodes must be ordered chronologically by phase.

Required JSON output format:
{
  "nodes": [
    {
      "node_key": "01.1",
      "phase": "01",
      "title": "Project Scaffolding & Setup",
      "type": "setup",
      "status": "not_started",
      "requirement_key": null,
      "files": ["package.json", "tsconfig.json"],
      "explanation": "Initializes the repository and project workspace."
    },
    {
      "node_key": "02.1",
      "phase": "02",
      "title": "Database Schema & Tables",
      "type": "database",
      "status": "not_started",
      "requirement_key": "REQ-1",
      "files": ["supabase/migrations/001_init.sql"],
      "explanation": "Creates core data tables according to requirement specifications."
    }
  ],
  "edges": [
    {
      "from_node": "02.1",
      "to_node": "01.1",
      "type": "DEPENDS_ON"
    }
  ]
}

${wrapUserInput(JSON.stringify(input, null, 2))}`;

  return {
    system: DECOMPOSE_SYSTEM_MESSAGE,
    prompt,
    version: DECOMPOSE_PROMPT_VERSION,
  };
}
