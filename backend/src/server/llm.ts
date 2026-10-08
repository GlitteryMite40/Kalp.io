import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  parseModel,
  rankModels,
  type ApiModel,
  type ModelTier,
} from "./llmModels";
import { MAX_LLM_OUTPUT_TOKENS } from "./rateLimit";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const REFRESH_COOLDOWN_MS = 60 * 1000; // 60 seconds
export const SELECTION_BUDGET_MS = 45000;

export type LlmErrorCode =
  | "API_KEY_MISSING"
  | "API_KEY_INVALID"
  | "NO_MODEL_AVAILABLE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "BAD_JSON"
  | "OUTPUT_TRUNCATED";

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

export interface SelectModelOptions {
  force?: boolean;
  exclude?: string[];
  internal?: boolean;
  runtimeFailureStatus?: number;
  now?: () => number;
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
 * Checks if response body indicates an API key problem (case-insensitive).
 * Never logged or returned.
 */
function isApiKeyErrorBody(bodyText: string): boolean {
  if (!bodyText) return false;
  const lower = bodyText.toLowerCase();
  return (
    lower.includes("api key not valid") ||
    lower.includes("api_key_invalid") ||
    lower.includes("api key expired") ||
    lower.includes("api_key_expired") ||
    lower.includes("invalid api key")
  );
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
        if (response.status === 401) {
          throw new LlmError(
            "API_KEY_INVALID",
            "Gemini API key is invalid or unauthorized",
            401,
          );
        }
        if (response.status === 400) {
          let bodyText = "";
          try {
            bodyText = await response.text();
          } catch {
            // ignore
          }
          if (isApiKeyErrorBody(bodyText)) {
            throw new LlmError(
              "API_KEY_INVALID",
              "Gemini API key is invalid or unauthorized",
              400,
            );
          }
          throw new LlmError(
            "NO_MODEL_AVAILABLE",
            "Gemini models request failed with bad request (HTTP 400)",
            400,
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
 * Retries 5xx/non-abort network errors up to 2 times with backoff (500ms, 1500ms).
 * An AbortError from timeout is NOT retried.
 */
async function probeCandidate(
  modelName: string,
  apiKey: string,
  opts?: {
    now?: () => number;
    startTime?: number;
    budgetMs?: number;
  },
): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  isApiKeyError?: boolean;
}> {
  const backoffs = [500, 1500];
  let attempt = 0;

  while (attempt <= 2) {
    if (opts?.now && opts?.startTime !== undefined) {
      if (
        opts.now() - opts.startTime >=
        (opts.budgetMs ?? SELECTION_BUDGET_MS)
      ) {
        return { ok: false, error: "selection time budget reached" };
      }
    }

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

      if (response.status === 401) {
        return {
          ok: false,
          status: 401,
          isApiKeyError: true,
          error: "Gemini API key is invalid or unauthorized",
        };
      }

      if (response.status === 400) {
        let bodyText = "";
        try {
          bodyText = await response.text();
        } catch {
          // ignore
        }
        if (isApiKeyErrorBody(bodyText)) {
          return {
            ok: false,
            status: 400,
            isApiKeyError: true,
            error: "Gemini API key is invalid or unauthorized",
          };
        }
        return {
          ok: false,
          status: 400,
          isApiKeyError: false,
          error: "bad request",
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

      if (response.status === 503) {
        return {
          ok: false,
          status: 503,
          error: "model overloaded or high demand (HTTP 503)",
        };
      }

      // 5xx status
      if (response.status >= 500 && attempt < 2) {
        if (opts?.now && opts?.startTime !== undefined) {
          if (
            opts.now() - opts.startTime >=
            (opts.budgetMs ?? SELECTION_BUDGET_MS)
          ) {
            return { ok: false, error: "selection time budget reached" };
          }
        }
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
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: "timed out" };
      }
      if (attempt < 2) {
        if (opts?.now && opts?.startTime !== undefined) {
          if (
            opts.now() - opts.startTime >=
            (opts.budgetMs ?? SELECTION_BUDGET_MS)
          ) {
            return { ok: false, error: "selection time budget reached" };
          }
        }
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
  opts: SelectModelOptions = {},
): Promise<string> {
  const now = opts.now ?? (() => Date.now());
  const startTime = now();
  const prevCache = globalThis.__kalp_llm_cache__;
  const lastForcedAt =
    opts.force && !opts.internal ? now() : prevCache?.lastForcedAt;

  const pinned = getPinnedModel();
  if (pinned) {
    const isCached =
      !opts.force &&
      prevCache &&
      prevCache.pinned &&
      prevCache.model === pinned &&
      prevCache.state === "available" &&
      now() - prevCache.probedAt < MODEL_CACHE_TTL_MS;

    if (isCached) {
      return pinned;
    }

    const parsed = parseModel(pinned) || {
      name: pinned,
      version: 0,
      tier: "flash" as ModelTier,
      preview: false,
    };

    const candidateEntry: CandidateStatus = {
      name: parsed.name,
      version: parsed.version,
      tier: parsed.tier,
      preview: parsed.preview,
      state: "untested",
    };

    const apiKey = getApiKey();
    const result = await probeCandidate(pinned, apiKey, {
      now,
      startTime,
      budgetMs: SELECTION_BUDGET_MS,
    });

    if (result.ok) {
      candidateEntry.state = "selected";
      candidateEntry.reason = "Pinned via LLM_MODEL";
      globalThis.__kalp_llm_cache__ = {
        model: pinned,
        probedAt: now(),
        modelsListed: 1,
        pinned: true,
        state: "available",
        lastForcedAt,
        candidates: [candidateEntry],
      };
      return pinned;
    }

    if (result.isApiKeyError) {
      candidateEntry.state = "failed";
      candidateEntry.reason = result.error;
      globalThis.__kalp_llm_cache__ = {
        model: null,
        probedAt: now(),
        modelsListed: 1,
        pinned: true,
        state: "key_invalid",
        candidates: [candidateEntry],
        lastForcedAt,
        error: result.error || "Gemini API key is invalid",
      };
      throw new LlmError(
        "API_KEY_INVALID",
        result.error || "Gemini API key is invalid",
        result.status,
      );
    }

    candidateEntry.state = "failed";
    candidateEntry.reason = result.error || "Probe failed";
    globalThis.__kalp_llm_cache__ = {
      model: null,
      probedAt: now(),
      modelsListed: 1,
      pinned: true,
      state: "unavailable",
      candidates: [candidateEntry],
      lastForcedAt,
      error: `Pinned model '${pinned}' is unavailable: ${result.error}`,
    };

    if (result.status === 429) {
      throw new LlmError(
        "RATE_LIMITED",
        `Pinned model '${pinned}' is rate-limited or quota exceeded. Fix or unset LLM_MODEL in environment.`,
        429,
      );
    }

    throw new LlmError(
      "NO_MODEL_AVAILABLE",
      `Pinned model '${pinned}' is unavailable (${result.error || "probe failed"}). Fix or unset LLM_MODEL in environment.`,
      result.status,
    );
  }

  const cache = globalThis.__kalp_llm_cache__;
  const isCacheFresh =
    cache &&
    !cache.pinned &&
    cache.model &&
    cache.state === "available" &&
    now() - cache.probedAt < MODEL_CACHE_TTL_MS;

  if (!opts.force && isCacheFresh && cache.model) {
    if (!opts.exclude || !opts.exclude.includes(cache.model)) {
      return cache.model;
    }
  }

  const apiKey = getApiKey();
  let models: ApiModel[];
  try {
    models = await listModels();
  } catch (err) {
    const isKeyInvalid =
      err instanceof LlmError && err.code === "API_KEY_INVALID";
    const state = isKeyInvalid ? "key_invalid" : "unavailable";
    globalThis.__kalp_llm_cache__ = {
      model: null,
      probedAt: now(),
      modelsListed: 0,
      pinned: false,
      state,
      candidates: [],
      lastForcedAt,
      error: sanitizeApiKey((err as Error).message),
    };
    throw err;
  }
  const fullRanked = rankModels(models);

  // Build candidates list from full ranked list before applying exclude
  const candidates: CandidateStatus[] = fullRanked.map((r) => {
    if (opts.exclude && opts.exclude.includes(r.name)) {
      const statusReason = opts.runtimeFailureStatus
        ? `HTTP ${opts.runtimeFailureStatus}`
        : "HTTP 429";
      return {
        name: r.name,
        version: r.version,
        tier: r.tier,
        preview: r.preview,
        state: "failed" as CandidateState,
        reason: `excluded after runtime failure (${statusReason})`,
      };
    }
    return {
      name: r.name,
      version: r.version,
      tier: r.tier,
      preview: r.preview,
      state: "untested" as CandidateState,
    };
  });

  const ranked =
    opts.exclude && opts.exclude.length > 0
      ? fullRanked.filter((m) => !opts.exclude!.includes(m.name))
      : fullRanked;

  if (ranked.length === 0) {
    globalThis.__kalp_llm_cache__ = {
      model: null,
      probedAt: now(),
      modelsListed: models.length,
      pinned: false,
      state: "unavailable",
      candidates,
      lastForcedAt,
      error: "No compatible Gemini text generation models found",
    };
    throw new LlmError(
      "NO_MODEL_AVAILABLE",
      "No compatible Gemini models found",
    );
  }

  const probePool = ranked.slice(0, 10);
  let selectedModel: string | null = null;

  for (let i = 0; i < probePool.length; i++) {
    const candidate = probePool[i];
    const candidateEntry = candidates.find((c) => c.name === candidate.name)!;

    // Check budget before probe
    if (now() - startTime >= SELECTION_BUDGET_MS) {
      break;
    }

    const result = await probeCandidate(candidate.name, apiKey, {
      now,
      startTime,
      budgetMs: SELECTION_BUDGET_MS,
    });

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
        probedAt: now(),
        modelsListed: models.length,
        pinned: false,
        state: "key_invalid",
        candidates,
        lastForcedAt,
        error: "Gemini API key is invalid",
      };
      throw new LlmError("API_KEY_INVALID", "Gemini API key is invalid");
    }

    candidateEntry.state = "failed";
    candidateEntry.reason = result.error || "Probe failed";
  }

  if (now() - startTime >= SELECTION_BUDGET_MS) {
    for (const c of candidates) {
      if (c.state === "untested") {
        c.reason = "selection time budget reached";
      }
    }
  }

  if (!selectedModel) {
    globalThis.__kalp_llm_cache__ = {
      model: null,
      probedAt: now(),
      modelsListed: models.length,
      pinned: false,
      state: "unavailable",
      candidates,
      lastForcedAt,
      error: "All probed Gemini model candidates failed or budget reached",
    };
    throw new LlmError(
      "NO_MODEL_AVAILABLE",
      "All probed Gemini model candidates failed or rate-limited",
    );
  }

  globalThis.__kalp_llm_cache__ = {
    model: selectedModel,
    probedAt: now(),
    modelsListed: models.length,
    pinned: false,
    state: "available",
    candidates,
    lastForcedAt,
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
): Promise<{
  ok: boolean;
  status: number;
  text?: string;
  finishReason?: string;
  error?: string;
}> {
  const timeoutMs = opts?.timeoutMs ?? 60000;
  const maxOutputTokens = Math.min(
    opts?.maxOutputTokens ?? 8192,
    MAX_LLM_OUTPUT_TOKENS,
  );
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
              maxOutputTokens,
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
        const candidate = json.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const parts = candidate?.content?.parts;
        let text: string | undefined = undefined;
        if (Array.isArray(parts)) {
          const nonThoughtParts: string[] = [];
          for (const p of parts) {
            if (!p.thought && typeof p.text === "string") {
              nonThoughtParts.push(p.text);
            }
          }
          if (nonThoughtParts.length > 0) {
            text = nonThoughtParts.join("");
          }
        }
        return { ok: true, status: response.status, text, finishReason };
      }

      if (response.status === 401) {
        throw new LlmError(
          "API_KEY_INVALID",
          "Gemini API key is invalid or unauthorized",
          401,
        );
      }

      if (response.status === 400) {
        let bodyText = "";
        try {
          bodyText = await response.text();
        } catch {
          // ignore
        }
        if (isApiKeyErrorBody(bodyText)) {
          throw new LlmError(
            "API_KEY_INVALID",
            "Gemini API key is invalid or unauthorized",
            400,
          );
        }
        return {
          ok: false,
          status: 400,
          error: "HTTP 400: bad request",
        };
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
      if (err instanceof LlmError) {
        throw err;
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new LlmError(
          "TIMEOUT",
          `Gemini request timed out after ${timeoutMs}ms`,
        );
      }
      if (attempt < 2) {
        await wait(backoffs[attempt]);
        attempt++;
        continue;
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
  const pinned = getPinnedModel();
  const excludedModels: string[] = [];
  const maxOutputTokens = Math.min(
    opts?.maxOutputTokens ?? 8192,
    MAX_LLM_OUTPUT_TOKENS,
  );
  const generateOpts = { ...opts, maxOutputTokens };

  let currentModel = await selectModel();
  let response: Awaited<ReturnType<typeof callGeminiGenerate>>;

  while (true) {
    response = await callGeminiGenerate(
      currentModel,
      apiKey,
      prompt,
      generateOpts,
    );

    // If finishReason is MAX_TOKENS, throw OUTPUT_TRUNCATED immediately without retry
    if (response.finishReason === "MAX_TOKENS") {
      throw new LlmError(
        "OUTPUT_TRUNCATED",
        "Model output was truncated because it reached maxOutputTokens limit. Raise maxOutputTokens to allow longer output.",
      );
    }

    if (response.ok && response.text) {
      break;
    }

    // Candidate failed. If pinned, do not fallback to other models.
    if (pinned) {
      if (response.status === 429) {
        throw new LlmError(
          "RATE_LIMITED",
          `Pinned model '${currentModel}' is rate-limited or quota exceeded. Fix or unset LLM_MODEL in environment.`,
          429,
        );
      }
      throw new LlmError(
        "NO_MODEL_AVAILABLE",
        `Pinned model '${currentModel}' returned HTTP ${response.status}. Fix or unset LLM_MODEL in environment.`,
        response.status,
      );
    }

    if (response.status === 401) {
      throw new LlmError(
        "API_KEY_INVALID",
        "Gemini API key is invalid or unauthorized",
        401,
      );
    }

    excludedModels.push(currentModel);

    try {
      currentModel = await selectModel({
        force: true,
        internal: true,
        exclude: excludedModels,
        runtimeFailureStatus: response.status,
      });
    } catch {
      // Fallback selection failed or exhausted all available models
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
    generateOpts,
  );

  if (retryResponse.finishReason === "MAX_TOKENS") {
    throw new LlmError(
      "OUTPUT_TRUNCATED",
      "Model output was truncated because it reached maxOutputTokens limit. Raise maxOutputTokens to allow longer output.",
    );
  }

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
  const cache = globalThis.__kalp_llm_cache__;
  const now = Date.now();

  const getCooldownNextRefreshAt = (
    forcedAt?: number,
    forcedNow?: boolean,
  ): string | null => {
    if (forcedNow) {
      return new Date(now + REFRESH_COOLDOWN_MS).toISOString();
    }
    if (forcedAt && now - forcedAt < REFRESH_COOLDOWN_MS) {
      return new Date(forcedAt + REFRESH_COOLDOWN_MS).toISOString();
    }
    return null;
  };

  try {
    getApiKey();
  } catch {
    const nextRefreshAt = getCooldownNextRefreshAt(cache?.lastForcedAt);
    return {
      provider: "gemini",
      state: "key_missing",
      selectedModel: null,
      pinned: !!getPinnedModel(),
      modelsListed: 0,
      candidates: [],
      checkedAt: new Date().toISOString(),
      cached: false,
      nextRefreshAt,
      error: "LLM_API_KEY is not configured",
    };
  }

  // If refresh requested, enforce 60s cooldown from last forced probe across ALL states
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
    const nextRefreshAt = getCooldownNextRefreshAt(cache.lastForcedAt);
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

  // Perform probe
  try {
    await selectModel({ force: !!options.refresh });
    const freshCache = globalThis.__kalp_llm_cache__!;
    const nextRefreshAt = getCooldownNextRefreshAt(
      freshCache.lastForcedAt,
      !!options.refresh,
    );
    return {
      provider: "gemini",
      state: "available",
      selectedModel: freshCache.model,
      pinned: freshCache.pinned,
      modelsListed: freshCache.modelsListed,
      candidates: freshCache.candidates,
      checkedAt: new Date(freshCache.probedAt).toISOString(),
      cached: false,
      nextRefreshAt,
    };
  } catch (err) {
    const currentCache = globalThis.__kalp_llm_cache__;
    const errorCode = err instanceof LlmError ? err.code : "NO_MODEL_AVAILABLE";
    const state: "key_invalid" | "unavailable" =
      errorCode === "API_KEY_INVALID" ? "key_invalid" : "unavailable";

    const nextRefreshAt = getCooldownNextRefreshAt(
      currentCache?.lastForcedAt,
      !!options.refresh,
    );

    return {
      provider: "gemini",
      state,
      selectedModel: null,
      pinned: !!getPinnedModel(),
      modelsListed: currentCache?.modelsListed ?? 0,
      candidates: currentCache?.candidates ?? [],
      checkedAt: new Date(currentCache?.probedAt ?? now).toISOString(),
      cached: false,
      nextRefreshAt,
      error: sanitizeApiKey((err as Error).message),
    };
  }
}
