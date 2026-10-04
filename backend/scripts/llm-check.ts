import { z } from "zod";
import { rankModels } from "../src/server/llmModels";
import {
  selectModel,
  generateJson,
  getLlmStatus,
  LlmError,
  type LlmCache,
} from "../src/server/llm";

function getLlmCache(): LlmCache | undefined {
  return globalThis.__kalp_llm_cache__;
}

async function runLlmCheck() {
  console.log("--- PART A: Pure Model Ranking (no network) ---");

  const sample = [
    {
      name: "models/gemini-2.5-flash",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-3.1-flash-lite",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-3.5-flash-image",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-embedding-001",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-3.5-flash",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-2.5-pro",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-3.1-pro-preview",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-3.8-flash",
      supportedGenerationMethods: ["generateContent"],
    },
  ];

  const expected = [
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ];

  const ranked = rankModels(sample);
  const rankedNames = ranked.map((m) => m.name);

  const partAPassed =
    rankedNames.length === expected.length &&
    rankedNames.every((name, i) => name === expected[i]);

  if (partAPassed) {
    console.log("PASS: Part A model ranking order");
  } else {
    console.error("FAIL: Part A model ranking order mismatch");
    console.error("  Got:     ", rankedNames);
    console.error("  Expected:", expected);
    process.exit(1);
  }

  console.log("\n--- PART B: Gemini Network & JSON Generation ---");

  try {
    const selectedModel = await selectModel({ force: true });
    console.log(`Chosen model: ${selectedModel}`);

    const cache = globalThis.__kalp_llm_cache__;
    if (cache?.candidates) {
      console.log("Candidate states:");
      for (const c of cache.candidates.slice(0, 8)) {
        const previewTag = c.preview ? " (preview)" : "";
        const reasonTag = c.reason ? ` - ${c.reason}` : "";
        console.log(
          `  • ${c.name} [v${c.version} ${c.tier}${previewTag}]: ${c.state}${reasonTag}`,
        );
      }
    }

    const testSchema = z.object({
      answer: z.string(),
    });

    const result = await generateJson(
      "Reply with a JSON object containing the field 'answer' set to 'ok'",
      { schema: testSchema },
    );

    if (result.data && typeof result.data.answer === "string") {
      console.log("PASS: Part B model selection and generateJson");
      console.log(
        `  Output: ${JSON.stringify(result.data)} via ${result.model}`,
      );
    } else {
      console.error(
        "FAIL: Part B returned invalid schema structure:",
        result.data,
      );
      process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FAIL: Part B: ${message.replace(/\r?\n/g, " ")}`);
    process.exit(1);
  }

  console.log("\n--- PART C: Mocked Robustness Tests (no network) ---");

  const originalFetch = globalThis.fetch;
  const originalKey = process.env.LLM_API_KEY;
  const originalModel = process.env.LLM_MODEL;

  const MOCK_KEY = originalKey || "mock-secret-key-safe";
  process.env.LLM_API_KEY = MOCK_KEY;
  delete process.env.LLM_MODEL;

  const mockListModelsData = {
    models: [
      {
        name: "models/gemini-3.0-pro",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-2.5-flash",
        supportedGenerationMethods: ["generateContent"],
      },
    ],
  };

  try {
    // -------------------------------------------------------------
    // Case a: top candidate returns 404, next candidate succeeds, so selection falls back
    // -------------------------------------------------------------
    globalThis.__kalp_llm_cache__ = undefined;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/models?") || url.endsWith("/models")) {
        return new Response(JSON.stringify(mockListModelsData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("gemini-3.0-pro:generateContent")) {
        return new Response("Not found", { status: 404 });
      }
      if (url.includes("gemini-2.5-flash:generateContent")) {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "ok" }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not matched", { status: 500 });
    };

    const chosenA = await selectModel({ force: true });
    const cacheA = getLlmCache();
    const topCandidateA = cacheA?.candidates.find(
      (c) => c.name === "gemini-3.0-pro",
    );
    const nextCandidateA = cacheA?.candidates.find(
      (c) => c.name === "gemini-2.5-flash",
    );

    if (
      chosenA === "gemini-2.5-flash" &&
      topCandidateA?.state === "failed" &&
      nextCandidateA?.state === "selected"
    ) {
      console.log(
        "PASS: Case (a) - Top candidate 404 falls back to next candidate",
      );
    } else {
      console.error(
        "FAIL: Case (a) - Top candidate 404 did not fall back as expected",
      );
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case b: top candidate returns 429, fallback works and the failed reason is recorded
    // -------------------------------------------------------------
    globalThis.__kalp_llm_cache__ = undefined;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/models?") || url.endsWith("/models")) {
        return new Response(JSON.stringify(mockListModelsData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("gemini-3.0-pro:generateContent")) {
        return new Response("Quota exceeded", { status: 429 });
      }
      if (url.includes("gemini-2.5-flash:generateContent")) {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "ok" }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not matched", { status: 500 });
    };

    const chosenB = await selectModel({ force: true });
    const cacheB = getLlmCache();
    const topCandidateB = cacheB?.candidates.find(
      (c) => c.name === "gemini-3.0-pro",
    );
    const nextCandidateB = cacheB?.candidates.find(
      (c) => c.name === "gemini-2.5-flash",
    );

    if (
      chosenB === "gemini-2.5-flash" &&
      topCandidateB?.state === "failed" &&
      topCandidateB?.reason === "rate limited or no free quota" &&
      nextCandidateB?.state === "selected"
    ) {
      console.log(
        "PASS: Case (b) - Top candidate 429 records rate limit reason and falls back",
      );
    } else {
      console.error(
        "FAIL: Case (b) - Top candidate 429 did not record reason or fall back as expected",
      );
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case c: every candidate fails, giving NO_MODEL_AVAILABLE
    // -------------------------------------------------------------
    globalThis.__kalp_llm_cache__ = undefined;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/models?") || url.endsWith("/models")) {
        return new Response(JSON.stringify(mockListModelsData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    let errorC: unknown = null;
    try {
      await selectModel({ force: true });
    } catch (err) {
      errorC = err;
    }

    if (errorC instanceof LlmError && errorC.code === "NO_MODEL_AVAILABLE") {
      console.log(
        "PASS: Case (c) - Every candidate failing gives NO_MODEL_AVAILABLE",
      );
    } else {
      console.error(
        "FAIL: Case (c) - Expected NO_MODEL_AVAILABLE when all candidates fail",
        errorC,
      );
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case d: 400 with an API key error body gives API_KEY_INVALID; 400 with another body does not
    // -------------------------------------------------------------
    // Sub-case d1: 400 with API key error body
    globalThis.__kalp_llm_cache__ = undefined;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/models?") || url.endsWith("/models")) {
        return new Response(JSON.stringify(mockListModelsData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          error: { message: "API key not valid. Please pass a valid API key." },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    };

    let errorD1: unknown = null;
    try {
      await selectModel({ force: true });
    } catch (err) {
      errorD1 = err;
    }

    const d1Passed =
      errorD1 instanceof LlmError && errorD1.code === "API_KEY_INVALID";

    // Sub-case d2: 400 with generic bad request body
    globalThis.__kalp_llm_cache__ = undefined;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/models?") || url.endsWith("/models")) {
        return new Response(JSON.stringify(mockListModelsData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("gemini-3.0-pro:generateContent")) {
        return new Response(
          JSON.stringify({
            error: { message: "Invalid argument: field foo is invalid" },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("gemini-2.5-flash:generateContent")) {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "ok" }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not matched", { status: 500 });
    };

    const chosenD2 = await selectModel({ force: true });
    const cacheD2 = getLlmCache();
    const topCandidateD2 = cacheD2?.candidates.find(
      (c) => c.name === "gemini-3.0-pro",
    );

    const d2Passed =
      chosenD2 === "gemini-2.5-flash" &&
      topCandidateD2?.state === "failed" &&
      topCandidateD2?.reason === "bad request";

    if (d1Passed && d2Passed) {
      console.log(
        "PASS: Case (d) - 400 with API key error gives API_KEY_INVALID; 400 with other body marks bad request",
      );
    } else {
      console.error(
        "FAIL: Case (d) - 400 differentiation failed:",
        `d1Passed=${d1Passed}, d2Passed=${d2Passed}`,
      );
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case e: malformed JSON on the first generate call, valid JSON on the retry, so generateJson succeeds
    // -------------------------------------------------------------
    globalThis.__kalp_llm_cache__ = {
      model: "gemini-2.5-flash",
      probedAt: Date.now(),
      modelsListed: 1,
      pinned: false,
      state: "available",
      candidates: [
        {
          name: "gemini-2.5-flash",
          version: 2.5,
          tier: "flash",
          preview: false,
          state: "selected",
        },
      ],
    };

    let generateCallsE = 0;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("generateContent")) {
        generateCallsE++;
        if (generateCallsE === 1) {
          return new Response(
            JSON.stringify({
              candidates: [
                { content: { parts: [{ text: "{ bad json not closed" }] } },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: '{"answer": "retry-succeeded"}' }] },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not matched", { status: 500 });
    };

    const schemaE = z.object({ answer: z.string() });
    const resultE = await generateJson("test prompt", { schema: schemaE });

    if (generateCallsE === 2 && resultE.data.answer === "retry-succeeded") {
      console.log(
        "PASS: Case (e) - Malformed JSON retried once and succeeds on valid JSON",
      );
    } else {
      console.error(
        `FAIL: Case (e) - Malformed JSON retry failed: calls=${generateCallsE}, answer=${resultE?.data?.answer}`,
      );
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case f: a timed-out generate call throws TIMEOUT and is not retried
    // -------------------------------------------------------------
    globalThis.__kalp_llm_cache__ = {
      model: "gemini-2.5-flash",
      probedAt: Date.now(),
      modelsListed: 1,
      pinned: false,
      state: "available",
      candidates: [
        {
          name: "gemini-2.5-flash",
          version: 2.5,
          tier: "flash",
          preview: false,
          state: "selected",
        },
      ],
    };

    let generateCallsF = 0;
    globalThis.fetch = async () => {
      generateCallsF++;
      const abortErr = new Error("The operation was aborted due to timeout");
      abortErr.name = "AbortError";
      throw abortErr;
    };

    let errorF: unknown = null;
    try {
      await generateJson("test prompt");
    } catch (err) {
      errorF = err;
    }

    if (
      generateCallsF === 1 &&
      errorF instanceof LlmError &&
      errorF.code === "TIMEOUT"
    ) {
      console.log(
        "PASS: Case (f) - Timed-out generate call throws TIMEOUT and is not retried",
      );
    } else {
      console.error(
        `FAIL: Case (f) - Expected single attempt with TIMEOUT, got calls=${generateCallsF}`,
        errorF,
      );
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case g: refresh within 60 seconds returns cached: true with nextRefreshAt set, for both a successful and a failed previous probe
    // -------------------------------------------------------------
    // Sub-case g1: previous successful probe
    const forcedAtSuccess = Date.now() - 15000; // 15s ago
    globalThis.__kalp_llm_cache__ = {
      model: "gemini-3.8-flash",
      probedAt: forcedAtSuccess,
      modelsListed: 2,
      pinned: false,
      state: "available",
      lastForcedAt: forcedAtSuccess,
      candidates: [
        {
          name: "gemini-3.8-flash",
          version: 3.8,
          tier: "flash",
          preview: false,
          state: "selected",
        },
      ],
    };

    let fetchCalledG1 = false;
    globalThis.fetch = async () => {
      fetchCalledG1 = true;
      throw new Error("fetch should not be called during cooldown");
    };

    const statusG1 = await getLlmStatus({ refresh: true });
    const g1Passed =
      !fetchCalledG1 &&
      statusG1.cached === true &&
      statusG1.state === "available" &&
      typeof statusG1.nextRefreshAt === "string" &&
      new Date(statusG1.nextRefreshAt).getTime() > Date.now();

    // Sub-case g2: previous failed probe
    const forcedAtFailed = Date.now() - 20000; // 20s ago
    globalThis.__kalp_llm_cache__ = {
      model: null,
      probedAt: forcedAtFailed,
      modelsListed: 2,
      pinned: false,
      state: "unavailable",
      lastForcedAt: forcedAtFailed,
      candidates: [],
      error: "All probed Gemini model candidates failed",
    };

    let fetchCalledG2 = false;
    globalThis.fetch = async () => {
      fetchCalledG2 = true;
      throw new Error("fetch should not be called during cooldown");
    };

    const statusG2 = await getLlmStatus({ refresh: true });
    const g2Passed =
      !fetchCalledG2 &&
      statusG2.cached === true &&
      statusG2.state === "unavailable" &&
      typeof statusG2.nextRefreshAt === "string" &&
      new Date(statusG2.nextRefreshAt).getTime() > Date.now();

    if (g1Passed && g2Passed) {
      console.log(
        "PASS: Case (g) - Refresh within 60s returns cached: true with nextRefreshAt for both success and failure",
      );
    } else {
      console.error(
        "FAIL: Case (g) - Refresh cooldown failed:",
        `g1Passed=${g1Passed}, g2Passed=${g2Passed}`,
      );
      process.exit(1);
    }

    console.log("\nAll LLM checks (Parts A, B, and C) passed successfully.");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.LLM_API_KEY = originalKey;
    if (originalModel !== undefined) {
      process.env.LLM_MODEL = originalModel;
    } else {
      delete process.env.LLM_MODEL;
    }
    globalThis.__kalp_llm_cache__ = undefined;
  }
}

runLlmCheck();
