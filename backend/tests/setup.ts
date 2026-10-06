/**
 * Backend Test Setup (Task 07.4: Test setup)
 *
 * Configures the test environment and mocks the LLM client so that tests
 * never call the real Gemini API.
 */

import { vi } from "vitest";

// Ensure environment has a mock LLM key for any code checking existence
process.env.LLM_API_KEY = process.env.LLM_API_KEY || "test-mock-gemini-key";
Object.assign(process.env, { NODE_ENV: "test" });

// Mock the LLM module completely
vi.mock("@/server/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/llm")>();

  return {
    ...actual,
    getApiKey: vi.fn(() => "test-mock-gemini-key"),
    selectModel: vi.fn(async () => "models/gemini-2.5-flash"),
    listModels: vi.fn(async () => [
      {
        name: "models/gemini-2.5-flash",
        version: 2.5,
        tier: "flash" as const,
        preview: false,
        displayName: "Gemini 2.5 Flash (Mock)",
        description: "Mock model for automated tests",
        supportedGenerationMethods: ["generateContent"],
      },
    ]),
    generateJson: vi.fn(async <T>(): Promise<{ data: T; model: string }> => {
      return {
        data: {
          mocked: true,
          status: "success",
        } as unknown as T,
        model: "models/gemini-2.5-flash",
      };
    }),
    getLlmStatus: vi.fn(async () => ({
      provider: "gemini" as const,
      state: "available" as const,
      selectedModel: "models/gemini-2.5-flash",
      pinned: false,
      modelsListed: 1,
      candidates: [
        {
          name: "models/gemini-2.5-flash",
          version: 2.5,
          tier: "flash" as const,
          preview: false,
          state: "selected" as const,
          reason: "Mock model selected for testing",
        },
      ],
      checkedAt: new Date().toISOString(),
      cached: true,
      nextRefreshAt: null,
    })),
  };
});

// Guardrail: Intercept global fetch to strictly block any real Gemini API calls
const originalFetch = globalThis.fetch;
if (typeof originalFetch === "function") {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url || "";

    if (urlStr.includes("generativelanguage.googleapis.com")) {
      throw new Error(
        `FAILSAFE ERROR: Real Gemini API call was attempted during test execution to: ${urlStr}. LLM client must be mocked!`,
      );
    }

    return originalFetch(input, init);
  };
}
