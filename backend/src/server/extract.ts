import crypto from "node:crypto";
import { z } from "zod";
import { RequirementSchema, type Requirement } from "@/lib/schema";
import { BadRequestError } from "@/lib/errors";
import { generateJson } from "./llm";
import {
  buildExtractMessages,
  ExtractOutputSchema,
  type ExtractOutput,
  EXTRACT_PROMPT_VERSION,
} from "./prompts/extract";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

export interface ExtractInputObject {
  idea?: string;
  prd?: string;
  text?: string;
  projectId?: string;
  project_id?: string;
}

export type ExtractInput = string | ExtractInputObject;

export type GenericJsonGenerator = <T>(
  prompt: string,
  opts?: {
    system?: string;
    schema?: z.ZodType<T>;
    maxOutputTokens?: number;
    timeoutMs?: number;
  },
) => Promise<{ data: T; model: string }>;

export type ExtractJsonGenerator = (
  prompt: string,
  opts?: {
    system?: string;
    schema?: z.ZodType<ExtractOutput>;
    maxOutputTokens?: number;
    timeoutMs?: number;
  },
) => Promise<{ data: ExtractOutput; model: string }>;

export type JsonGenerator = GenericJsonGenerator | ExtractJsonGenerator;

export interface ExtractOptions {
  projectId?: string;
  project_id?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  generator?: JsonGenerator;
}

export interface ExtractedRequirements {
  project_name: string;
  projectName: string;
  assumptions: string[];
  requirements: Requirement[];
  features: Requirement[];
  users: string[];
  constraints: string[];
  integrations: string[];
  model: string;
  version: string;
}

/**
 * Extracts raw idea or PRD text from various input forms.
 * Throws BadRequestError if input is missing or whitespace-only.
 */
export function extractIdeaText(input: unknown): string {
  if (input === null || input === undefined) {
    throw new BadRequestError("Project idea or PRD text cannot be empty", {
      code: "INPUT_EMPTY",
    });
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new BadRequestError("Project idea or PRD text cannot be empty", {
        code: "INPUT_EMPTY",
      });
    }
    return trimmed;
  }

  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const text = obj.idea ?? obj.prd ?? obj.text;
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new BadRequestError("Project idea or PRD text cannot be empty", {
        code: "INPUT_EMPTY",
      });
    }
    return text.trim();
  }

  throw new BadRequestError(
    "Project idea or PRD text must be a string or object",
    { code: "INVALID_INPUT_TYPE" },
  );
}

/**
 * Turns an idea or PRD text into structured requirements with UUID IDs:
 * features, users, constraints, integrations.
 */
export async function extractRequirements(
  input: ExtractInput,
  options?: ExtractOptions,
): Promise<ExtractedRequirements> {
  const ideaText = extractIdeaText(input);

  const effectiveProjectId =
    options?.project_id ??
    options?.projectId ??
    (typeof input === "object" && input !== null
      ? (input.project_id ?? input.projectId)
      : undefined);

  if (effectiveProjectId !== undefined && !isValidUuid(effectiveProjectId)) {
    throw new BadRequestError(
      `Invalid project_id "${effectiveProjectId}": must be a valid UUID`,
      { code: "INVALID_PROJECT_ID" },
    );
  }

  const messages = buildExtractMessages(ideaText);
  const generator = options?.generator ?? generateJson;

  const res = await (generator as ExtractJsonGenerator)(messages.prompt, {
    system: messages.system,
    schema: ExtractOutputSchema,
    maxOutputTokens: options?.maxOutputTokens ?? 4096,
    timeoutMs: options?.timeoutMs,
  });

  const rawData = res.data;

  // Assign valid UUID IDs and validate each requirement against RequirementSchema
  const requirementsWithIds: Requirement[] = rawData.requirements.map((req) => {
    const requirementId = isValidUuid(req.id) ? req.id : crypto.randomUUID();
    const candidateReq: Record<string, unknown> = {
      ...req,
      id: requirementId,
    };

    if (effectiveProjectId !== undefined) {
      candidateReq.project_id = effectiveProjectId;
    }

    return RequirementSchema.parse(candidateReq);
  });

  return {
    project_name: rawData.project_name,
    projectName: rawData.project_name,
    assumptions: rawData.assumptions ?? [],
    requirements: requirementsWithIds,
    features: requirementsWithIds,
    users: rawData.users ?? [],
    constraints: rawData.constraints ?? [],
    integrations: rawData.integrations ?? [],
    model: res.model ?? "unknown",
    version: messages.version ?? EXTRACT_PROMPT_VERSION,
  };
}

// Aliases for convenience
export const extract = extractRequirements;
export const intakeToRequirements = extractRequirements;
