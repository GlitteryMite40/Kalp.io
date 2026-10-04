import { z } from "zod";
import {
  BASE_SYSTEM_GUARD,
  wrapUserInput,
  type PromptMessages,
} from "./shared";

export const CRITERIA_PROMPT_VERSION = "criteria.v1";

export const NodeCriteriaSchema = z.object({
  acceptance: z.array(z.string()).default([]),
  tests: z.array(z.string()).default([]),
});

export const CriteriaMapSchema = z.record(z.string(), NodeCriteriaSchema);

export const CriteriaOutputSchema = z.preprocess((val) => {
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    if (
      obj.criteria &&
      typeof obj.criteria === "object" &&
      !Array.isArray(obj.criteria)
    ) {
      return obj.criteria;
    }
  }
  return val;
}, CriteriaMapSchema);

export type CriteriaOutput = z.infer<typeof CriteriaOutputSchema>;

const CRITERIA_SYSTEM_MESSAGE = `${BASE_SYSTEM_GUARD}

Task: For each graph node provided in <user_input>, generate verifiable acceptance criteria and test specifications.
Output must be keyed by node_key. Do not define new nodes.`;

/**
 * Builds system and user prompt messages for the criteria stage.
 */
export function buildCriteriaMessages(
  input:
    | {
        nodes: Array<{
          node_key: string;
          title: string;
          description?: string | null;
          files?: string[];
        }>;
      }
    | Array<{
        node_key: string;
        title: string;
        description?: string | null;
        files?: string[];
      }>,
): PromptMessages {
  const nodeList = Array.isArray(input) ? input : input.nodes;

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

${wrapUserInput(JSON.stringify(nodeList, null, 2))}`;

  return {
    system: CRITERIA_SYSTEM_MESSAGE,
    prompt,
    version: CRITERIA_PROMPT_VERSION,
  };
}
