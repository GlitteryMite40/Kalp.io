import { describe, it, expect } from "vitest";
import { generateJson, getLlmStatus, getApiKey } from "@/server/llm";
import { compareFiles } from "@/server/drift";

describe("Backend Test Setup & Vitest Smoke Test", () => {
  it("runs and passes a sample test in Vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("verifies the LLM client is mocked so real API calls are never made", async () => {
    const key = getApiKey();
    expect(key).toBe("test-mock-gemini-key");

    const status = await getLlmStatus();
    expect(status.provider).toBe("gemini");
    expect(status.state).toBe("available");
    expect(status.selectedModel).toBe("models/gemini-2.5-flash");

    const result = await generateJson<{ mocked: boolean }>("dummy prompt");
    expect(result.data.mocked).toBe(true);
    expect(result.model).toBe("models/gemini-2.5-flash");
  });

  it("verifies module path alias resolution and drift detection logic", () => {
    const res = compareFiles(["src/auth.ts"], ["src/auth.ts"]);
    expect(res.hasDrift).toBe(false);
    expect(res.classification).toBe("exact");
  });
});
