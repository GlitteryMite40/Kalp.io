import { z } from "zod";
import type { Requirement } from "@/lib/schema";
import {
  BASE_SYSTEM_GUARD,
  wrapUserInput,
  type PromptMessages,
} from "./shared";

export const ARCHITECTURE_PROMPT_VERSION = "architecture.v1";

export const ArchitectureModuleSchema = z.object({
  name: z.string().trim().min(1, "Module/component name is required"),
  responsibility: z.string().trim().min(1, "Responsibility is required"),
  requirement_keys: z.array(z.string()).default([]),
});

export const ArchitectureOutputSchema = z.preprocess(
  (val) => {
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      if (!obj.modules && obj.components) {
        return { ...obj, modules: obj.components };
      }
    }
    return val;
  },
  z.object({
    modules: z
      .array(ArchitectureModuleSchema)
      .min(1, "At least one module/component is required"),
    interactions: z.array(z.string()).default([]),
    summary: z.string().optional(),
  }),
);

export type ArchitectureOutput = z.infer<typeof ArchitectureOutputSchema>;

const ARCHITECTURE_SYSTEM_MESSAGE = `${BASE_SYSTEM_GUARD}

Task: From the structured requirements provided in <user_input>, describe the high-level architecture: functional modules/components and how they interact.
Keep it descriptive; do not define graph nodes or edges.`;

/**
 * Builds system and user prompt messages for the architecture stage.
 */
export function buildArchitectureMessages(
  input:
    | {
        requirements: Array<
          Pick<Requirement, "key" | "title"> & { description?: string | null }
        >;
      }
    | Array<
        Pick<Requirement, "key" | "title"> & { description?: string | null }
      >,
): PromptMessages {
  const reqList = Array.isArray(input) ? input : input.requirements;

  const prompt = `Based on the requirements provided in the delimited block below, design the architecture.
Describe the core modules/components, their primary responsibilities, the related requirement_keys they fulfill, and the interactions between them.

Rules:
- Keep it descriptive; do not create build nodes or graph edges here.
- Reference requirements using requirement_keys (e.g. REQ-1).
- Use keys only, not database identifiers.

Required JSON output format:
{
  "modules": [
    {
      "name": "string",
      "responsibility": "string",
      "requirement_keys": ["REQ-1"]
    }
  ],
  "interactions": [
    "string describing how components or modules interact"
  ]
}

${wrapUserInput(JSON.stringify(reqList, null, 2))}`;

  return {
    system: ARCHITECTURE_SYSTEM_MESSAGE,
    prompt,
    version: ARCHITECTURE_PROMPT_VERSION,
  };
}
