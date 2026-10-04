import { z } from "zod";
import {
  BASE_SYSTEM_GUARD,
  wrapUserInput,
  type PromptMessages,
} from "./shared";

export const CRITERIA_PROMPT_VERSION = "criteria.v1";

export const StrictNodeCriteriaSchema = z.object({
  acceptance: z
    .array(z.string().trim().min(1, "Acceptance criterion cannot be empty"))
    .min(1, "At least one acceptance criterion is required"),
  tests: z
    .array(z.string().trim().min(1, "Test specification cannot be empty"))
    .min(1, "At least one test specification is required"),
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
  const serializedNodes = nodeList.map((n) => ({
    node_key: n.node_key,
    title: n.title,
    description: n.description ?? n.explanation ?? null,
    files: n.files ?? [],
  }));

  const prompt = `For each node provided in the delimited block below, define:
1. acceptance: Array of concrete, verifiable acceptance criteria strings.
2. tests: Array of specific test cases, commands, or assertions.

Rules:
- Output must be a JSON dictionary keyed by node_key (e.g. "01.1").
- Do not create new nodes.
- Use keys only, not database identifiers.

Required JSON output format:
{
  "<node_key>": {
    "acceptance": [
      "string criterion"
    ],
    "tests": [
      "string test specification"
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
