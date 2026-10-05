import { z } from "zod";
import type { Requirement } from "@/lib/schema";
import { BadRequestError } from "@/lib/errors";
import { generateJson } from "./llm";
import {
  buildArchitectureMessages,
  makeArchitectureOutputSchema,
  type ArchitectureOutput,
  type ArchitectureModuleSchema,
  type ArchitectureStackSchema,
  ARCHITECTURE_PROMPT_VERSION,
} from "./prompts/architecture";

export type ArchitectureModule = z.infer<typeof ArchitectureModuleSchema>;
export type RawArchitectureStack = z.infer<typeof ArchitectureStackSchema>;

export interface ArchitectureStack extends RawArchitectureStack {
  db?: string;
  apis?: string[];
}

export interface ProposedArchitecture {
  stack: ArchitectureStack;
  assumptions: string[];
  components: ArchitectureModule[];
  modules: ArchitectureModule[];
  interactions: string[];
  summary?: string;
  model: string;
  version: string;
}

export type RequirementItem = Pick<Requirement, "key" | "title"> & {
  description?: string | null;
  id?: string;
};

export interface ArchitectureInputObject {
  requirements?: RequirementItem[];
  features?: RequirementItem[];
  assumptions?: string[];
  stack_preference?: string;
  stackPreference?: string;
  project_name?: string;
}

export type ArchitectureInput = RequirementItem[] | ArchitectureInputObject;

import type { GenericJsonGenerator } from "./extract";

export type ArchitectureJsonGenerator = (
  prompt: string,
  opts?: {
    system?: string;
    schema?: z.ZodType<ArchitectureOutput>;
    maxOutputTokens?: number;
    timeoutMs?: number;
  },
) => Promise<{ data: ArchitectureOutput; model: string }>;

export type ArchitectureGenerator =
  GenericJsonGenerator | ArchitectureJsonGenerator;

export interface ArchitectureOptions {
  stack_preference?: string;
  stackPreference?: string;
  assumptions?: string[];
  requireCoverage?: boolean;
  maxOutputTokens?: number;
  timeoutMs?: number;
  generator?: ArchitectureGenerator;
}

/**
 * Validates and extracts requirements array from input.
 */
export function extractRequirementsList(input: unknown): RequirementItem[] {
  if (input === null || input === undefined) {
    throw new BadRequestError("Requirements input cannot be empty", {
      code: "REQUIREMENTS_EMPTY",
    });
  }

  let list: unknown[] | undefined;
  if (Array.isArray(input)) {
    list = input;
  } else if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.requirements)) {
      list = obj.requirements;
    } else if (Array.isArray(obj.features)) {
      list = obj.features;
    }
  }

  if (!list || list.length === 0) {
    throw new BadRequestError(
      "At least one requirement is required to propose architecture",
      { code: "REQUIREMENTS_EMPTY" },
    );
  }

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") {
      throw new BadRequestError(`Requirement at index ${i} is invalid`, {
        code: "INVALID_REQUIREMENT",
      });
    }
    const rec = item as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key.trim() : "";
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    if (!key || !title) {
      throw new BadRequestError(
        `Requirement at index ${i} must have non-empty key and title`,
        { code: "INVALID_REQUIREMENT" },
      );
    }
  }

  return list as RequirementItem[];
}

/**
 * Proposes stack and components (frontend, backend, DB, APIs) and lists assumptions explicitly.
 */
export async function proposeArchitecture(
  input: ArchitectureInput,
  options?: ArchitectureOptions,
): Promise<ProposedArchitecture> {
  const requirements = extractRequirementsList(input);
  const reqKeys = requirements.map((r) => r.key);

  let initialAssumptions: string[] = [];
  if (options?.assumptions && Array.isArray(options.assumptions)) {
    initialAssumptions = options.assumptions;
  } else if (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    Array.isArray(input.assumptions)
  ) {
    initialAssumptions = input.assumptions;
  }

  const stackPreference =
    options?.stack_preference ??
    options?.stackPreference ??
    (typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input.stack_preference ?? input.stackPreference)
      : undefined);

  const messages = buildArchitectureMessages({
    requirements,
    ...(initialAssumptions.length > 0
      ? { assumptions: initialAssumptions }
      : {}),
    ...(typeof stackPreference === "string" && stackPreference.trim().length > 0
      ? { stack_preference: stackPreference.trim() }
      : {}),
  });

  const schema = makeArchitectureOutputSchema(reqKeys, {
    requireCoverage: options?.requireCoverage ?? true,
  });

  const generator = options?.generator ?? generateJson;

  const res = await (generator as ArchitectureJsonGenerator)(messages.prompt, {
    system: messages.system,
    schema,
    maxOutputTokens: options?.maxOutputTokens ?? 4096,
    timeoutMs: options?.timeoutMs,
  });

  const data = res.data;

  // Extract modules / components supporting both aliases
  const modulesList =
    data.modules ??
    (data as unknown as { components?: ArchitectureModule[] }).components ??
    [];

  // Extract APIs from 'other' stack entries or integrations if mentioned
  const otherItems = data.stack.other ?? [];
  const apiItems = otherItems.filter((item) =>
    /api|service|endpoint|rest|graphql|grpc|webhook/i.test(item),
  );

  const stack: ArchitectureStack = {
    ...data.stack,
    db: data.stack.database,
    ...(apiItems.length > 0 ? { apis: apiItems } : {}),
  };

  return {
    stack,
    assumptions: data.assumptions,
    components: modulesList,
    modules: modulesList,
    interactions: data.interactions ?? [],
    summary: data.summary,
    model: res.model ?? "unknown",
    version: messages.version ?? ARCHITECTURE_PROMPT_VERSION,
  };
}

// Aliases for convenience
export const architecture = proposeArchitecture;
export const generateArchitecture = proposeArchitecture;
export const planArchitecture = proposeArchitecture;
