import { z } from "zod";
import { RequirementSchema } from "@/lib/schema";
import {
  BASE_SYSTEM_GUARD,
  assertIdeaLength,
  wrapUserInput,
  type PromptMessages,
} from "./shared";

export const EXTRACT_PROMPT_VERSION = "extract.v2";

export const ExtractOutputSchema = z
  .object({
    project_name: z
      .string()
      .trim()
      .min(1, "Project name cannot be empty")
      .max(60, "Project name cannot exceed 60 characters"),
    assumptions: z.array(z.string()).default([]),
    requirements: z
      .array(RequirementSchema)
      .min(1, "At least one requirement is required")
      .max(15, "At most 15 requirements are allowed"),
    users: z.array(z.string()).default([]),
    constraints: z.array(z.string()).default([]),
    integrations: z.array(z.string()).default([]),
  })
  .superRefine((data, ctx) => {
    const seenKeys = new Set<string>();
    for (let i = 0; i < data.requirements.length; i++) {
      const key = data.requirements[i].key;
      if (!/^REQ-\d+$/.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Requirement key "${key}" must match format /^REQ-\\d+$/`,
          path: ["requirements", i, "key"],
        });
      }
      if (seenKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate requirement key "${key}" found`,
          path: ["requirements", i, "key"],
        });
      } else {
        seenKeys.add(key);
      }
    }
  });

export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;

const EXTRACT_SYSTEM_MESSAGE = `${BASE_SYSTEM_GUARD}

Task: Turn the user's project idea or product text into structured requirements.
Extract:
1. project_name: Short, clear, plain project name (at most 60 characters).
2. assumptions: List of reasonable minimal assumptions if the idea is vague.
3. requirements: Array of requirements (3 to 12 when idea allows, max 15). Each item has:
   - key: Unique stable key like REQ-1, REQ-2
   - title: Concise functional title
   - description: Clear functional description
4. users: Target audience, user types, or personas
5. constraints: Technical, architectural, operational, or business constraints
6. integrations: External third-party APIs, services, protocols, or systems`;

/**
 * Builds system and user prompt messages for the extract stage.
 */
export function buildExtractMessages(
  input: string | { idea: string },
): PromptMessages {
  const rawIdea = typeof input === "string" ? input : input.idea;
  const idea = assertIdeaLength(rawIdea);

  const prompt = `Analyze the project idea provided in the delimited block below and extract structured requirements, target users, constraints, and integrations.

Rules:
- project_name is a short plain name (at most 60 characters).
- 3 to 12 requirements when the idea allows; each requirement is one user-visible capability or one necessary constraint and is testable.
- Focus on the MVP and do not invent features beyond the idea except obvious essentials.
- If the idea is vague, make minimal reasonable assumptions and list each one in assumptions.
- Keys must be unique and follow the pattern REQ-1, REQ-2, REQ-3, etc.
- Use keys only, not database identifiers.
- Be specific, comprehensive, and clear.

Required JSON output format:
{
  "project_name": "string",
  "assumptions": ["string"],
  "requirements": [
    {
      "key": "REQ-1",
      "title": "string",
      "description": "string"
    }
  ],
  "users": ["string"],
  "constraints": ["string"],
  "integrations": ["string"]
}

${wrapUserInput(idea)}`;

  return {
    system: EXTRACT_SYSTEM_MESSAGE,
    prompt,
    version: EXTRACT_PROMPT_VERSION,
  };
}
