import { z } from "zod";
import {
  BASE_SYSTEM_GUARD,
  PromptInputError,
  wrapUserInput,
  type PromptMessages,
} from "./shared";

export const CRITERIA_PROMPT_VERSION = "criteria.v2";

export const MAX_NODES_PER_CRITERIA_CALL = 8;

/**
 * Splits an array of nodes into chunks suitable for criteria generation.
 */
export function chunkNodes<T>(
  nodes: T[],
  size = MAX_NODES_PER_CRITERIA_CALL,
): T[][] {
  if (!nodes || nodes.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < nodes.length; i += size) {
    chunks.push(nodes.slice(i, i + size));
  }
  return chunks;
}

/**
 * Merges multiple CriteriaOutput dictionary batches into a single CriteriaOutput object.
 * Throws an Error if a duplicate node_key is detected across batches.
 */
export function mergeCriteria(parts: CriteriaOutput[]): CriteriaOutput {
  const merged: CriteriaOutput = {};
  for (const part of parts) {
    if (!part) continue;
    for (const [key, val] of Object.entries(part)) {
      if (key in merged) {
        throw new Error(
          `Duplicate node_key "${key}" found across criteria batches`,
        );
      }
      merged[key] = val;
    }
  }
  return merged;
}

export const StrictNodeCriteriaSchema = z.object({
  acceptance: z
    .array(z.string().trim().min(1, "Acceptance criterion cannot be empty"))
    .min(2, "At least two acceptance criteria are required"),
  tests: z
    .array(z.string().trim().min(1, "Test specification cannot be empty"))
    .min(3, "At least three test specifications are required"),
});

export const NodeCriteriaSchema = StrictNodeCriteriaSchema;

export function unwrapCriteria(
  val: unknown,
  expectedKeys?: Set<string> | string[],
): unknown {
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    const keys = Object.keys(val);
    if (keys.length === 1 && keys[0] === "criteria") {
      const expectedSet = Array.isArray(expectedKeys)
        ? new Set(expectedKeys)
        : expectedKeys;
      if (!expectedSet || !expectedSet.has("criteria")) {
        const obj = val as Record<string, unknown>;
        if (
          obj.criteria &&
          typeof obj.criteria === "object" &&
          !Array.isArray(obj.criteria)
        ) {
          return obj.criteria;
        }
      }
    }
  }
  return val;
}

export const CriteriaMapSchema = z
  .record(z.string(), StrictNodeCriteriaSchema)
  .refine((data) => Object.keys(data).length > 0, {
    message: "Criteria output cannot be empty",
  });

export const CriteriaOutputSchema = z.preprocess(
  (val) => unwrapCriteria(val),
  CriteriaMapSchema,
);

export type CriteriaOutput = z.infer<typeof CriteriaOutputSchema>;

/**
 * Creates a schema enforcing that output contains exactly the provided node keys,
 * no extra keys, no missing keys, and no empty object.
 */
export function makeCriteriaSchema(nodeKeys: string[]) {
  const expectedKeys = new Set(nodeKeys);

  return z.preprocess(
    (val) => unwrapCriteria(val, expectedKeys),
    z.record(z.string(), StrictNodeCriteriaSchema).superRefine((data, ctx) => {
      const dataKeys = Object.keys(data);
      if (dataKeys.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Criteria output cannot be empty",
        });
        return;
      }

      // Must contain every input key
      for (const key of expectedKeys) {
        if (!(key in data)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Missing required node_key "${key}" in criteria output`,
            path: [key],
          });
        }
      }

      // No extra keys
      for (const key of dataKeys) {
        if (!expectedKeys.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unexpected extra node_key "${key}" in criteria output`,
            path: [key],
          });
        }
      }
    }),
  );
}

const CRITERIA_SYSTEM_MESSAGE = `${BASE_SYSTEM_GUARD}

Task: For each graph node provided in <user_input>, generate verifiable acceptance criteria and test specifications.
Output must be keyed by node_key. Do not define new nodes.`;

export type CriteriaInputNode = {
  node_key: string;
  title: string;
  description?: string | null;
  explanation?: string | null;
  requirement_key?: string | null;
  requirement_title?: string | null;
  depends_on?: string[];
  files?: string[];
};

export type CriteriaInput =
  | {
      nodes: CriteriaInputNode[];
    }
  | CriteriaInputNode[];

/**
 * Builds system and user prompt messages for the criteria stage.
 */
export function buildCriteriaMessages(input: CriteriaInput): PromptMessages {
  const nodeList = Array.isArray(input) ? input : input.nodes;

  if (nodeList.length > MAX_NODES_PER_CRITERIA_CALL) {
    throw new PromptInputError(
      `Cannot process more than ${MAX_NODES_PER_CRITERIA_CALL} nodes per criteria call (got ${nodeList.length}). Callers must batch nodes.`,
      "TOO_MANY_NODES",
    );
  }

  const serializedNodes = nodeList.map((n) => ({
    node_key: n.node_key,
    title: n.title,
    description: n.description ?? n.explanation ?? null,
    ...(n.requirement_key !== undefined
      ? { requirement_key: n.requirement_key }
      : {}),
    ...(n.requirement_title !== undefined
      ? { requirement_title: n.requirement_title }
      : {}),
    ...(n.depends_on !== undefined ? { depends_on: n.depends_on } : {}),
    files: n.files ?? [],
  }));

  const prompt = `For each node provided in the delimited block below, define:
1. acceptance: Array of at least 2 concrete, verifiable acceptance criteria strings.
2. tests: Array of at least 3 specific test cases, commands, or assertions.

Rules:
- Output must be a JSON dictionary keyed by node_key (e.g. "01.1").
- Acceptance items are observable outcomes (no vague wording such as "works well").
- Tests are runnable checks and cover the happy path, an error or edge case, and a command or regression check.
- One sentence per item.
- Do not create new nodes.
- Use keys only, not database identifiers.

Required JSON output format:
{
  "<node_key>": {
    "acceptance": [
      "Observable outcome criterion 1",
      "Observable outcome criterion 2"
    ],
    "tests": [
      "Happy path runnable test check",
      "Edge case or error handling check",
      "Command execution or regression check"
    ]
  }
}

${wrapUserInput(JSON.stringify(serializedNodes, null, 2))}`;

  return {
    system: CRITERIA_SYSTEM_MESSAGE,
    prompt,
    version: CRITERIA_PROMPT_VERSION,
  };
}
