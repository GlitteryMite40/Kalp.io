import { z } from "zod";
import { rankModels } from "../src/server/llmModels";
import { selectModel, generateJson } from "../src/server/llm";

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
      process.exit(0);
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

runLlmCheck();
