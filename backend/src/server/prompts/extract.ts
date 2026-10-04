import { z } from "zod";
import { RequirementSchema } from "@/lib/schema";
import {
  BASE_SYSTEM_GUARD,
  wrapUserInput,
  type PromptMessages,
} from "./shared";

export const EXTRACT_PROMPT_VERSION = "extract.v1";

export const ExtractOutputSchema = z
  .object({
    requirements: z
      .array(RequirementSchema)
      .min(1, "At least one requirement is required"),
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
1. requirements: Array of requirements. Each item has:
   - key: Unique stable key like REQ-1, REQ-2
   - title: Concise functional title
   - description: Clear functional description
2. users: Target audience, user types, or personas
3. constraints: Technical, architectural, operational, or business constraints
4. integrations: External third-party APIs, services, protocols, or systems`;

/**
 * Builds system and user prompt messages for the extract stage.
 */
export function buildExtractMessages(
  input: string | { idea: string },
): PromptMessages {
  const idea = typeof input === "string" ? input : input.idea;

  const prompt = `Analyze the project idea provided in the delimited block below and extract structured requirements, target users, constraints, and integrations.

Rules:
- Keys must be unique and follow the pattern REQ-1, REQ-2, REQ-3, etc.
- Use keys only, not database identifiers.
- Be specific, comprehensive, and clear.

Required JSON output format:
{
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
