export * from "./shared";
export * from "./extract";
export * from "./architecture";
export * from "./decompose";
export * from "./criteria";
export * from "./learn";

import { EXTRACT_PROMPT_VERSION } from "./extract";
import { ARCHITECTURE_PROMPT_VERSION } from "./architecture";
import { DECOMPOSE_PROMPT_VERSION } from "./decompose";
import { CRITERIA_PROMPT_VERSION } from "./criteria";
import { LEARN_PROMPT_VERSION } from "./learn";

export type PromptStage =
  "extract" | "architecture" | "decompose" | "criteria" | "learn";

export const PROMPT_VERSIONS = {
  extract: EXTRACT_PROMPT_VERSION,
  architecture: ARCHITECTURE_PROMPT_VERSION,
  decompose: DECOMPOSE_PROMPT_VERSION,
  criteria: CRITERIA_PROMPT_VERSION,
  learn: LEARN_PROMPT_VERSION,
} as const;

export function stageMeta(
  stage: PromptStage,
  model: string,
): { prompt_version: string; model: string } {
  return {
    prompt_version: PROMPT_VERSIONS[stage],
    model,
  };
}
