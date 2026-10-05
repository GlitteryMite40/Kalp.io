import { z } from "zod";
import type { Requirement } from "@/lib/schema";
import {
  BASE_SYSTEM_GUARD,
  wrapUserInput,
  type PromptMessages,
} from "./shared";

export const ARCHITECTURE_PROMPT_VERSION = "architecture.v2";

export const ArchitectureModuleSchema = z.object({
  name: z.string().trim().min(1, "Module/component name is required"),
  responsibility: z.string().trim().min(1, "Responsibility is required"),
  requirement_keys: z.array(z.string()).default([]),
});

export const ArchitectureStackSchema = z.object({
  frontend: z.string().trim().min(1, "Frontend stack is required"),
  backend: z.string().trim().min(1, "Backend stack is required"),
  database: z.string().trim().min(1, "Database stack is required"),
  hosting: z.string().default(""),
  other: z.array(z.string()).default([]),
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
    stack: ArchitectureStackSchema,
    assumptions: z
      .array(z.string())
      .min(2, "At least 2 assumptions are required"),
    modules: z
      .array(ArchitectureModuleSchema)
      .min(1, "At least one module/component is required"),
    interactions: z.array(z.string()).default([]),
    summary: z.string().optional(),
  }),
);

export type ArchitectureOutput = z.infer<typeof ArchitectureOutputSchema>;

/**
 * Creates an architecture output schema that rejects any requirement_keys entry not in requirementKeys,
 * and by default (or when opts.requireCoverage is true) rejects if any requirementKey is not referenced by at least one module.
 */
export function makeArchitectureOutputSchema(
  requirementKeys: string[],
  opts?: { requireCoverage?: boolean },
) {
  const validKeys = new Set(requirementKeys);
  const requireCoverage = opts?.requireCoverage ?? true;

  return ArchitectureOutputSchema.superRefine((data, ctx) => {
    const coveredKeys = new Set<string>();

    for (let i = 0; i < data.modules.length; i++) {
      const mod = data.modules[i];
      for (let j = 0; j < mod.requirement_keys.length; j++) {
        const reqKey = mod.requirement_keys[j];
        if (!validKeys.has(reqKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Module "${mod.name}" references unknown requirement_key "${reqKey}"`,
            path: ["modules", i, "requirement_keys", j],
          });
        } else {
          coveredKeys.add(reqKey);
        }
      }
    }

    if (requireCoverage) {
      for (const reqKey of requirementKeys) {
        if (!coveredKeys.has(reqKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Requirement "${reqKey}" is not referenced by any architecture module`,
            path: ["modules"],
          });
        }
      }
    }
  });
}

const ARCHITECTURE_SYSTEM_MESSAGE = `${BASE_SYSTEM_GUARD}

Task: From the structured requirements provided in <user_input>, describe the high-level architecture: functional modules/components and how they interact.
Keep it descriptive; do not define graph nodes or edges.`;

export type ArchitectureInput =
  | {
      requirements: Array<
        Pick<Requirement, "key" | "title"> & { description?: string | null }
      >;
      assumptions?: string[];
      stack_preference?: string;
    }
  | Array<Pick<Requirement, "key" | "title"> & { description?: string | null }>;

/**
 * Builds system and user prompt messages for the architecture stage.
 */
export function buildArchitectureMessages(
  input: ArchitectureInput,
): PromptMessages {
  const payload = Array.isArray(input)
    ? input
    : {
        requirements: input.requirements,
        ...(input.assumptions && input.assumptions.length > 0
          ? { assumptions: input.assumptions }
          : {}),
        ...(input.stack_preference
          ? { stack_preference: input.stack_preference }
          : {}),
      };

  const prompt = `Based on the requirements provided in the delimited block below, design the architecture.
Select a practical technology stack, list at least 2 architectural assumptions, describe the core modules/components, their primary responsibilities, the related requirement_keys they fulfill, and the interactions between them.

Rules:
- If stack_preference or the requirements name a technology, respect it; otherwise choose a simple, widely used, beginner-friendly, free-tier-friendly stack with as few languages as possible.
- List at least 2 assumptions.
- Keep it descriptive; do not create build nodes or graph edges here.
- Reference requirements using requirement_keys (e.g. REQ-1).
- Use keys only, not database identifiers.

Required JSON output format:
{
  "stack": {
    "frontend": "string (e.g. Next.js React)",
    "backend": "string (e.g. Next.js API Routes / Node.js)",
    "database": "string (e.g. Supabase Postgres)",
    "hosting": "string (e.g. Vercel)",
    "other": ["string"]
  },
  "assumptions": [
    "string assumption 1",
    "string assumption 2"
  ],
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

${wrapUserInput(JSON.stringify(payload, null, 2))}`;

  return {
    system: ARCHITECTURE_SYSTEM_MESSAGE,
    prompt,
    version: ARCHITECTURE_PROMPT_VERSION,
  };
}
