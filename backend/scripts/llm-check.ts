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

  const isOffline = process.argv.includes("--offline");

  if (isOffline) {
    console.log(
      "\n--- PART B: Gemini Network & JSON Generation (SKIPPED in offline mode) ---",
    );
  } else {
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

    // -------------------------------------------------------------
    // Case h: generateJson top model returns 429 on real call, model list & next model succeed,
    // result.model is next model, top model appears as "failed" with excluded reason, lastForcedAt unchanged
    // -------------------------------------------------------------
    const initialForcedAt = Date.now() - 5000;
    globalThis.__kalp_llm_cache__ = {
      model: "gemini-3.0-pro",
      probedAt: initialForcedAt,
      modelsListed: 2,
      pinned: false,
      state: "available",
      lastForcedAt: initialForcedAt,
      candidates: [
        {
          name: "gemini-3.0-pro",
          version: 3,
          tier: "pro",
          preview: false,
          state: "selected",
        },
        {
          name: "gemini-2.5-flash",
          version: 2.5,
          tier: "flash",
          preview: false,
          state: "untested",
        },
      ],
    };

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/models?") || url.endsWith("/models")) {
        return new Response(JSON.stringify(mockListModelsData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("gemini-3.0-pro:generateContent")) {
        return new Response("Rate limited", { status: 429 });
      }
      if (url.includes("gemini-2.5-flash:generateContent")) {
        return new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: '{"answer": "ok"}' }] } },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not matched", { status: 500 });
    };

    const resH = await generateJson<{ answer: string }>("test prompt");
    const cacheH = getLlmCache();
    const topCandidateH = cacheH?.candidates.find(
      (c) => c.name === "gemini-3.0-pro",
    );
    const hPassed =
      resH.model === "gemini-2.5-flash" &&
      cacheH?.lastForcedAt === initialForcedAt &&
      topCandidateH?.state === "failed" &&
      topCandidateH?.reason === "excluded after runtime failure (HTTP 429)";

    if (hPassed) {
      console.log(
        "PASS: Case (h) - generateJson 429 fallback excludes top model, selects next model, and preserves lastForcedAt",
      );
    } else {
      console.error("FAIL: Case (h) - 429 fallback failed:", { resH, cacheH });
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case i: pinned model returns 404 on the probe: error names the model, state unavailable, no other model is tried
    // -------------------------------------------------------------
    globalThis.__kalp_llm_cache__ = undefined;
    process.env.LLM_MODEL = "gemini-pinned-404";

    let fetchCallsI = 0;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      fetchCallsI++;
      const url = String(input);
      if (url.includes("gemini-pinned-404:generateContent")) {
        return new Response("Not found", { status: 404 });
      }
      return new Response("Other", { status: 200 });
    };

    let errorI: unknown = null;
    try {
      await selectModel();
    } catch (err) {
      errorI = err;
    }

    const cacheI = getLlmCache();
    const iPassed =
      fetchCallsI === 1 &&
      errorI instanceof LlmError &&
      errorI.code === "NO_MODEL_AVAILABLE" &&
      errorI.message.includes("gemini-pinned-404") &&
      cacheI?.state === "unavailable" &&
      cacheI?.candidates[0]?.state === "failed";

    delete process.env.LLM_MODEL;

    if (iPassed) {
      console.log(
        "PASS: Case (i) - Pinned model 404 throws NO_MODEL_AVAILABLE naming model, state unavailable, no other model tried",
      );
    } else {
      console.error("FAIL: Case (i) - Pinned model 404 handling failed:", {
        errorI,
        fetchCallsI,
        cacheI,
      });
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case j: pinned model works: probed once, cached, second selectModel call does not probe again
    // -------------------------------------------------------------
    globalThis.__kalp_llm_cache__ = undefined;
    process.env.LLM_MODEL = "gemini-pinned-ok";

    let fetchCallsJ = 0;
    globalThis.fetch = async () => {
      fetchCallsJ++;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "ok" }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const firstJ = await selectModel();
    const callsAfterFirstJ = fetchCallsJ;
    const secondJ = await selectModel();
    const callsAfterSecondJ = fetchCallsJ;
    const cacheJ = getLlmCache();

    delete process.env.LLM_MODEL;

    const jPassed =
      firstJ === "gemini-pinned-ok" &&
      secondJ === "gemini-pinned-ok" &&
      callsAfterFirstJ === 1 &&
      callsAfterSecondJ === 1 &&
      cacheJ?.state === "available" &&
      cacheJ?.candidates[0]?.reason === "Pinned via LLM_MODEL";

    if (jPassed) {
      console.log(
        "PASS: Case (j) - Pinned model probed once, cached, and second call does not re-probe",
      );
    } else {
      console.error("FAIL: Case (j) - Pinned model caching failed:", {
        callsAfterFirstJ,
        callsAfterSecondJ,
        cacheJ,
      });
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case k: finishReason MAX_TOKENS throws OUTPUT_TRUNCATED and makes exactly one generate call
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

    let generateCallsK = 0;
    globalThis.fetch = async () => {
      generateCallsK++;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "MAX_TOKENS",
              content: { parts: [{ text: '{"truncated": true' }] },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    let errorK: unknown = null;
    try {
      await generateJson("test prompt");
    } catch (err) {
      errorK = err;
    }

    const kPassed =
      generateCallsK === 1 &&
      errorK instanceof LlmError &&
      errorK.code === "OUTPUT_TRUNCATED" &&
      errorK.message.toLowerCase().includes("maxoutputtokens");

    if (kPassed) {
      console.log(
        "PASS: Case (k) - finishReason MAX_TOKENS throws OUTPUT_TRUNCATED with exactly one call",
      );
    } else {
      console.error("FAIL: Case (k) - MAX_TOKENS handling failed:", {
        generateCallsK,
        errorK,
      });
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case l: multi-part response with a thought part: only the non-thought text is used
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

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    thought: true,
                    text: "Let me think about this step by step...",
                  },
                  { text: '{"answer": ' },
                  { text: '"clean-output"}' },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const resL = await generateJson<{ answer: string }>("test prompt");
    const lPassed = resL.data?.answer === "clean-output";

    if (lPassed) {
      console.log(
        "PASS: Case (l) - Multi-part response skips thought parts and joins non-thought text",
      );
    } else {
      console.error(
        "FAIL: Case (l) - Thought parts not filtered correctly:",
        resL,
      );
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case m: selection stops after the time budget (use an injectable or mockable clock; do not wait in real time)
    // -------------------------------------------------------------
    globalThis.__kalp_llm_cache__ = undefined;
    let simulatedClock = 1000;
    const mockClock = () => simulatedClock;

    let probesAttemptedM = 0;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/models?") || url.endsWith("/models")) {
        return new Response(JSON.stringify(mockListModelsData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      probesAttemptedM++;
      // Advance simulated clock past SELECTION_BUDGET_MS (45000)
      simulatedClock += 50000;
      return new Response("Busy", { status: 500 });
    };

    let errorM: unknown = null;
    try {
      await selectModel({ force: true, now: mockClock });
    } catch (err) {
      errorM = err;
    }

    const cacheM = getLlmCache();
    const untestedCandidateM = cacheM?.candidates.find(
      (c) => c.state === "untested",
    );
    const mPassed =
      probesAttemptedM === 1 &&
      errorM instanceof LlmError &&
      errorM.code === "NO_MODEL_AVAILABLE" &&
      untestedCandidateM !== undefined &&
      untestedCandidateM.reason === "selection time budget reached";

    if (mPassed) {
      console.log(
        "PASS: Case (m) - Selection stops after time budget and marks untested candidates",
      );
    } else {
      console.error("FAIL: Case (m) - Selection budget handling failed:", {
        probesAttemptedM,
        errorM,
        cacheM,
      });
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Case n: default maxOutputTokens 8192 is sent when the caller passes none
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

    let capturedMaxTokens: number | undefined = undefined;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body) {
        try {
          const parsedBody = JSON.parse(String(init.body));
          capturedMaxTokens = parsedBody.generationConfig?.maxOutputTokens;
        } catch {
          // ignore
        }
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"answer": "ok"}' }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await generateJson<{ answer: string }>("test prompt");
    const nPassed = capturedMaxTokens === 8192;

    if (nPassed) {
      console.log(
        "PASS: Case (n) - Default maxOutputTokens 8192 is sent when none passed",
      );
    } else {
      console.error(
        `FAIL: Case (n) - Expected maxOutputTokens 8192, got ${capturedMaxTokens}`,
      );
      process.exit(1);
    }

    console.log("\nAll LLM checks (Parts A, B, and C) passed successfully.");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) {
      process.env.LLM_API_KEY = originalKey;
    } else {
      delete process.env.LLM_API_KEY;
    }
    if (originalModel !== undefined) {
      process.env.LLM_MODEL = originalModel;
    } else {
      delete process.env.LLM_MODEL;
    }
    globalThis.__kalp_llm_cache__ = undefined;
  }
}

runLlmCheck();
