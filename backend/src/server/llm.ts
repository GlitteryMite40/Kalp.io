import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  parseModel,
  rankModels,
  type ApiModel,
  type ModelTier,
} from "./llmModels";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const REFRESH_COOLDOWN_MS = 60 * 1000; // 60 seconds

export type LlmErrorCode =
  | "API_KEY_MISSING"
  | "API_KEY_INVALID"
  | "NO_MODEL_AVAILABLE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "BAD_JSON";

export class LlmError extends Error {
  public readonly code: LlmErrorCode;
  public readonly status?: number;

  constructor(code: LlmErrorCode, message: string, status?: number) {
    const cleanMessage = sanitizeApiKey(message);
    super(cleanMessage);
    this.name = "LlmError";
    this.code = code;
    this.status = status;
  }
}

export type CandidateState = "selected" | "failed" | "untested";

export interface CandidateStatus {
  name: string;
  version: number;
  tier: ModelTier;
  preview: boolean;
  state: CandidateState;
  reason?: string;
}

export interface LlmCache {
  model: string | null;
  probedAt: number;
  modelsListed: number;
  candidates: CandidateStatus[];
  pinned: boolean;
  lastForcedAt?: number;
  state: "available" | "unavailable" | "key_missing" | "key_invalid";
  error?: string;
}

declare global {
  var __kalp_llm_cache__: LlmCache | undefined;
}

/**
 * Removes any trace of the Gemini API key from error messages or logs.
 */
function sanitizeApiKey(text: string): string {
  if (!text) return "";
  const key = process.env.LLM_API_KEY;
  if (key && key.length > 5) {
    return text.split(key).join("[REDACTED_API_KEY]");
  }
  return text;
}

/**
 * Lazily retrieves the API key from environment, never throwing on import.
 */
export function getApiKey(): string {
  let key = process.env.LLM_API_KEY;
  if (!key) {
    try {
      const env = getEnv();
      key = env.LLM_API_KEY;
    } catch {
      // Ignored to allow custom caller error handling
    }
  }
  if (!key || key.trim() === "") {
    throw new LlmError(
      "API_KEY_MISSING",
      "Gemini API key is not configured in LLM_API_KEY",
    );
  }
  return key.trim();
}

/**
 * Returns pinned model if set in LLM_MODEL environment variable.
 */
export function getPinnedModel(): string | null {
  const model = process.env.LLM_MODEL;
  if (model && model.trim() !== "") {
    return model.trim();
  }
  return null;
}

/**
 * Invalidate module-level cache stored on globalThis.
 */
export function invalidateLlmCache(): void {
  globalThis.__kalp_llm_cache__ = undefined;
}

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches available models from Gemini REST API, following pagination.
 */
export async function listModels(): Promise<ApiModel[]> {
  const apiKey = getApiKey();
  const allModels: ApiModel[] = [];
  let pageToken: string | null = null;

  do {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const url = new URL(`${GEMINI_BASE_URL}/models`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "x-goog-api-key": apiKey,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 400 || response.status === 401) {
          throw new LlmError(
            "API_KEY_INVALID",
            "Gemini API key is invalid or unauthorized",
            response.status,
          );
        }
        if (response.status === 429) {
          throw new LlmError(
            "RATE_LIMITED",
            "Gemini API rate limited or quota exceeded",
            response.status,
          );
        }
        throw new LlmError(
          "NO_MODEL_AVAILABLE",
          `Gemini API models list failed with HTTP ${response.status}`,
          response.status,
        );
      }

      const data = await response.json();
      if (Array.isArray(data.models)) {
        allModels.push(...data.models);
      }
      pageToken = data.nextPageToken || null;
    } catch (err) {
      if (err instanceof LlmError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new LlmError(
          "TIMEOUT",
          "Gemini listModels request timed out after 8s",
        );
      }
      throw new LlmError(
        "NO_MODEL_AVAILABLE",
        `Failed to reach Gemini API: ${sanitizeApiKey((err as Error).message)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  } while (pageToken);

  return allModels;
}

/**
 * Probes a candidate model with a tiny generateContent request.
 * Retries 5xx/network errors up to 2 times with backoff (500ms, 1500ms).
 */
async function probeCandidate(
  modelName: string,
  apiKey: string,
): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  isApiKeyError?: boolean;
}> {
  const backoffs = [500, 1500];
  let attempt = 0;

  while (attempt <= 2) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(
        `${GEMINI_BASE_URL}/models/${modelName}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Reply with the single word: ok" }] }],
            generationConfig: { maxOutputTokens: 64 },
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (response.status === 200) {
        return { ok: true, status: 200 };
      }

      if (response.status === 400 || response.status === 401) {
        return {
          ok: false,
          status: response.status,
          isApiKeyError: true,
          error: "Gemini API key is invalid",
        };
      }

      if (response.status === 404 || response.status === 403) {
        return {
          ok: false,
          status: response.status,
          error: `Model unavailable or forbidden (HTTP ${response.status})`,
        };
      }

      if (response.status === 429) {
        return {
          ok: false,
          status: response.status,
          error: "rate limited or no free quota",
        };
      }

      // 5xx status
      if (response.status >= 500 && attempt < 2) {
        await wait(backoffs[attempt]);
        attempt++;
        continue;
      }

      return {
        ok: false,
        status: response.status,
        error: `Server returned HTTP ${response.status}`,
      };
    } catch (err) {
      clearTimeout(timeout);
      if (attempt < 2) {
        await wait(backoffs[attempt]);
        attempt++;
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: sanitizeApiKey(message) };
    }
  }

  return { ok: false, error: "Probe failed after 2 retries" };
}

/**
 * Selects the best available Gemini model with automatic fallback.
 */
export async function selectModel(
  opts: { force?: boolean } = {},
): Promise<string> {
  const pinned = getPinnedModel();
  if (pinned) {
    const parsed = parseModel(pinned) || {
      name: pinned,
      version: 0,
      tier: "flash" as ModelTier,
      preview: false,
    };
    globalThis.__kalp_llm_cache__ = {
      model: pinned,
      probedAt: Date.now(),
      modelsListed: 1,
      pinned: true,
      state: "available",
      candidates: [
        {
          name: parsed.name,
          version: parsed.version,
          tier: parsed.tier,
          preview: parsed.preview,
          state: "selected",
          reason: "Pinned via LLM_MODEL",
        },
      ],
    };
    return pinned;
  }

  const cache = globalThis.__kalp_llm_cache__;
  const isCacheFresh =
    cache &&
    cache.model &&
    cache.state === "available" &&
    Date.now() - cache.probedAt < MODEL_CACHE_TTL_MS;

  if (!opts.force && isCacheFresh && cache.model) {
    return cache.model;
  }

  const apiKey = getApiKey();
  const models = await listModels();
  const ranked = rankModels(models);

  if (ranked.length === 0) {
    globalThis.__kalp_llm_cache__ = {
      model: null,
      probedAt: Date.now(),
      modelsListed: models.length,
      pinned: false,
      state: "unavailable",
      candidates: [],
      error: "No compatible Gemini text generation models found",
    };
    throw new LlmError(
      "NO_MODEL_AVAILABLE",
      "No compatible Gemini models found",
    );
  }

  const probePool = ranked.slice(0, 6);
  const candidates: CandidateStatus[] = ranked.map((r, idx) => ({
    name: r.name,
    version: r.version,
    tier: r.tier,
    preview: r.preview,
    state: (idx < 6 ? "untested" : "untested") as CandidateState,
  }));

  let selectedModel: string | null = null;

  for (let i = 0; i < probePool.length; i++) {
    const candidate = probePool[i];
    const candidateEntry = candidates.find((c) => c.name === candidate.name)!;

    const result = await probeCandidate(candidate.name, apiKey);

    if (result.ok) {
      selectedModel = candidate.name;
      candidateEntry.state = "selected";
      candidateEntry.reason = "Probe succeeded";
      break;
    }

    if (result.isApiKeyError) {
      candidateEntry.state = "failed";
      candidateEntry.reason = result.error;
      globalThis.__kalp_llm_cache__ = {
        model: null,
        probedAt: Date.now(),
        modelsListed: models.length,
        pinned: false,
        state: "key_invalid",
        candidates,
        error: "Gemini API key is invalid",
      };
      throw new LlmError("API_KEY_INVALID", "Gemini API key is invalid");
    }

    candidateEntry.state = "failed";
    candidateEntry.reason = result.error || "Probe failed";
  }

  if (!selectedModel) {
    globalThis.__kalp_llm_cache__ = {
      model: null,
      probedAt: Date.now(),
      modelsListed: models.length,
      pinned: false,
      state: "unavailable",
      candidates,
      error: "All probed Gemini model candidates failed",
    };
    throw new LlmError(
      "NO_MODEL_AVAILABLE",
      "All probed Gemini model candidates failed or rate-limited",
    );
  }

  globalThis.__kalp_llm_cache__ = {
    model: selectedModel,
    probedAt: Date.now(),
    modelsListed: models.length,
    pinned: false,
    state: "available",
    candidates,
    lastForcedAt: opts.force
      ? Date.now()
      : globalThis.__kalp_llm_cache__?.lastForcedAt,
  };

  return selectedModel;
}

/**
 * Execute generation request against chosen Gemini model.
 */
async function callGeminiGenerate(
  model: string,
  apiKey: string,
  prompt: string,
  opts?: { system?: string; maxOutputTokens?: number; timeoutMs?: number },
): Promise<{ ok: boolean; status: number; text?: string; error?: string }> {
  const timeoutMs = opts?.timeoutMs ?? 60000;
  const backoffs = [500, 1500];
  let attempt = 0;

  while (attempt <= 2) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${GEMINI_BASE_URL}/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              ...(opts?.maxOutputTokens
                ? { maxOutputTokens: opts.maxOutputTokens }
                : {}),
            },
            ...(opts?.system
              ? { systemInstruction: { parts: [{ text: opts.system }] } }
              : {}),
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (response.ok) {
        const json = await response.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        return { ok: true, status: response.status, text };
      }

      if (response.status >= 500 && attempt < 2) {
        await wait(backoffs[attempt]);
        attempt++;
        continue;
      }

      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
      };
    } catch (err) {
      clearTimeout(timeout);
      if (attempt < 2) {
        await wait(backoffs[attempt]);
        attempt++;
        continue;
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new LlmError(
          "TIMEOUT",
          `Gemini request timed out after ${timeoutMs}ms`,
        );
      }
      return {
        ok: false,
        status: 0,
        error: sanitizeApiKey((err as Error).message),
      };
    }
  }

  return { ok: false, status: 500, error: "Exhausted retries on 5xx" };
}

/**
 * Generates and parses strongly-typed JSON from Gemini.
 */
export async function generateJson<T>(
  prompt: string,
  opts?: {
    system?: string;
    schema?: z.ZodType<T>;
    maxOutputTokens?: number;
    timeoutMs?: number;
  },
): Promise<{ data: T; model: string }> {
  const apiKey = getApiKey();
  let currentModel = await selectModel();

  let response = await callGeminiGenerate(currentModel, apiKey, prompt, opts);

  // If candidate returns 429, 404, or 403, fallback to next best model once
  if (
    !response.ok &&
    (response.status === 429 ||
      response.status === 404 ||
      response.status === 403)
  ) {
    invalidateLlmCache();
    currentModel = await selectModel({ force: true });
    response = await callGeminiGenerate(currentModel, apiKey, prompt, opts);
  }

  if (!response.ok || !response.text) {
    if (response.status === 429) {
      throw new LlmError(
        "RATE_LIMITED",
        "Gemini API rate limited or quota exceeded",
        429,
      );
    }
    throw new LlmError(
      "NO_MODEL_AVAILABLE",
      `Gemini request failed: ${response.error || "No content returned"}`,
      response.status,
    );
  }

  // Parse JSON with single retry on parse or schema validation error
  const tryParseAndValidate = (
    raw: string,
  ): { success: true; data: T } | { success: false; error: string } => {
    try {
      const parsed = JSON.parse(raw);
      if (opts?.schema) {
        const valRes = opts.schema.safeParse(parsed);
        if (!valRes.success) {
          return { success: false, error: valRes.error.message };
        }
        return { success: true, data: valRes.data };
      }
      return { success: true, data: parsed as T };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  };

  const firstAttempt = tryParseAndValidate(response.text);
  if (firstAttempt.success) {
    return { data: firstAttempt.data, model: currentModel };
  }

  // Retry once with error feedback appended to prompt
  const correctionPrompt = `${prompt}\n\n[Previous response was invalid JSON or failed schema: ${firstAttempt.error}. Output valid JSON only.]`;
  const retryResponse = await callGeminiGenerate(
    currentModel,
    apiKey,
    correctionPrompt,
    opts,
  );

  if (!retryResponse.ok || !retryResponse.text) {
    throw new LlmError(
      "BAD_JSON",
      `Model failed to output valid JSON: ${firstAttempt.error}`,
    );
  }

  const secondAttempt = tryParseAndValidate(retryResponse.text);
  if (secondAttempt.success) {
    return { data: secondAttempt.data, model: currentModel };
  }

  throw new LlmError(
    "BAD_JSON",
    `Failed to parse or validate JSON response after retry: ${secondAttempt.error}`,
  );
}

export interface LlmStatusResponse {
  provider: "gemini";
  state: "available" | "unavailable" | "key_missing" | "key_invalid";
  selectedModel: string | null;
  pinned: boolean;
  modelsListed: number;
  candidates: CandidateStatus[];
  checkedAt: string;
  cached: boolean;
  nextRefreshAt: string | null;
  error?: string;
}

/**
 * Returns LLM status for the /api/llm/status route.
 */
export async function getLlmStatus(
  options: { refresh?: boolean } = {},
): Promise<LlmStatusResponse> {
  try {
    getApiKey();
  } catch {
    return {
      provider: "gemini",
      state: "key_missing",
      selectedModel: null,
      pinned: !!getPinnedModel(),
      modelsListed: 0,
      candidates: [],
      checkedAt: new Date().toISOString(),
      cached: false,
      nextRefreshAt: null,
      error: "LLM_API_KEY is not configured",
    };
  }

  const cache = globalThis.__kalp_llm_cache__;
  const now = Date.now();

  // If refresh requested, enforce 60s cooldown from last forced probe
  if (options.refresh && cache?.lastForcedAt) {
    const elapsed = now - cache.lastForcedAt;
    if (elapsed < REFRESH_COOLDOWN_MS) {
      const nextRefreshAt = new Date(
        cache.lastForcedAt + REFRESH_COOLDOWN_MS,
      ).toISOString();
      return {
        provider: "gemini",
        state: cache.state,
        selectedModel: cache.model,
        pinned: cache.pinned,
        modelsListed: cache.modelsListed,
        candidates: cache.candidates,
        checkedAt: new Date(cache.probedAt).toISOString(),
        cached: true,
        nextRefreshAt,
        error: cache.error,
      };
    }
  }

  // Use cache if not refresh and still fresh
  if (!options.refresh && cache && now - cache.probedAt < MODEL_CACHE_TTL_MS) {
    return {
      provider: "gemini",
      state: cache.state,
      selectedModel: cache.model,
      pinned: cache.pinned,
      modelsListed: cache.modelsListed,
      candidates: cache.candidates,
      checkedAt: new Date(cache.probedAt).toISOString(),
      cached: true,
      nextRefreshAt: null,
      error: cache.error,
    };
  }

  // Perform probe
  try {
    await selectModel({ force: !!options.refresh });
    const freshCache = globalThis.__kalp_llm_cache__!;
    return {
      provider: "gemini",
      state: "available",
      selectedModel: freshCache.model,
      pinned: freshCache.pinned,
      modelsListed: freshCache.modelsListed,
      candidates: freshCache.candidates,
      checkedAt: new Date(freshCache.probedAt).toISOString(),
      cached: false,
      nextRefreshAt: options.refresh
        ? new Date(now + REFRESH_COOLDOWN_MS).toISOString()
        : null,
    };
  } catch (err) {
    const currentCache = globalThis.__kalp_llm_cache__;
    const errorCode = err instanceof LlmError ? err.code : "NO_MODEL_AVAILABLE";
    const state: "key_invalid" | "unavailable" =
      errorCode === "API_KEY_INVALID" ? "key_invalid" : "unavailable";

    return {
      provider: "gemini",
      state,
      selectedModel: null,
      pinned: !!getPinnedModel(),
      modelsListed: currentCache?.modelsListed ?? 0,
      candidates: currentCache?.candidates ?? [],
      checkedAt: new Date().toISOString(),
      cached: false,
      nextRefreshAt: options.refresh
        ? new Date(now + REFRESH_COOLDOWN_MS).toISOString()
        : null,
      error: sanitizeApiKey((err as Error).message),
    };
  }
}
