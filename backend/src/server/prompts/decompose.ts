import { z } from "zod";
import { NodeSchema, EdgeSchema } from "@/lib/schema";
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

export const DECOMPOSE_PROMPT_VERSION = "decompose.v1";

export const DecomposeOutputSchema = z
  .object({
    nodes: z.array(NodeSchema).min(1, "At least one node is required"),
    edges: z.array(EdgeSchema).default([]),
  })
  .superRefine((data, ctx) => {
    const nodeKeys = new Set(data.nodes.map((n) => n.node_key));

    // Reject duplicate node_key
    const seenNodeKeys = new Set<string>();
    for (let i = 0; i < data.nodes.length; i++) {
      const node = data.nodes[i];
      if (seenNodeKeys.has(node.node_key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node_key "${node.node_key}" found in nodes`,
          path: ["nodes", i, "node_key"],
        });
      } else {
        seenNodeKeys.add(node.node_key);
      }
    }

    // Validate edge references against nodes in same output
    for (let i = 0; i < data.edges.length; i++) {
      const edge = data.edges[i];
      if (!nodeKeys.has(edge.from_node)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge from_node "${edge.from_node}" does not exist in nodes`,
          path: ["edges", i, "from_node"],
        });
      }
      if (!nodeKeys.has(edge.to_node)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge to_node "${edge.to_node}" does not exist in nodes`,
          path: ["edges", i, "to_node"],
        });
      }
    }

    // Reject duplicate edges
    const seenEdges = new Set<string>();
    for (let i = 0; i < data.edges.length; i++) {
      const edge = data.edges[i];
      const key = `${edge.from_node}->${edge.to_node}:${edge.type}`;
      if (seenEdges.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate edge (${edge.from_node}, ${edge.to_node}, ${edge.type}) found in edges`,
          path: ["edges", i],
        });
      } else {
        seenEdges.add(key);
      }
    }
  });

export type DecomposeOutput = z.infer<typeof DecomposeOutputSchema>;

const DECOMPOSE_SYSTEM_MESSAGE = `${BASE_SYSTEM_GUARD}

Task: Decompose the requirements and architecture provided in <user_input> into a dependency-aware build graph of actionable nodes and directional edges.
Every node must represent a clear phase of work and map to a requirement_key from the requirements.
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

Field and Identity Rules:
- ${FIELD_NAME_RULES_TEXT}
- ${ALLOWED_STATUSES_TEXT}
- ${ALLOWED_EDGE_TYPES_TEXT}
- ${EDGE_INTEGRITY_RULES_TEXT}

Edge Direction Convention:
- ${DEPENDS_ON_DIRECTION_TEXT}

Requirements Mapping:
- Every node must have a requirement_key that exists in the input requirements (e.g. REQ-1).
- Nodes must be ordered chronologically by phase.

Required JSON output format:
{
  "nodes": [
    {
      "node_key": "01.1",
      "phase": "01",
      "title": "string",
      "type": "task",
      "status": "not_started",
      "requirement_key": "REQ-1",
      "files": ["path/to/file.ts"],
      "explanation": "string",
      "acceptance": ["string"],
      "tests": ["string"]
    }
  ],
  "edges": [
    {
      "from_node": "01.2",
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
