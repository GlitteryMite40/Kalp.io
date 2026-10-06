import { describe, it, expect, vi } from "vitest";
import { copyToClipboard } from "@/lib/clipboard";
import { generatePlanMarkdown, generatePlanJson } from "@/lib/export";

describe("Frontend Vitest Smoke & Sample Unit Tests", () => {
  it("runs and passes a sample test", () => {
    expect(2 + 2).toBe(4);
  });

  it("verifies clipboard utility works with mocked clipboard API", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    const result = await copyToClipboard("test clipboard prompt", {
      clipboardApi: { writeText: writeTextMock },
    });

    expect(result.success).toBe(true);
    expect(result.method).toBe("clipboard");
    expect(writeTextMock).toHaveBeenCalledWith("test clipboard prompt");
  });

  it("verifies export utilities format plan correctly", () => {
    const mockNodes = [
      {
        id: "node-1",
        node_key: "01.1",
        phase: "Phase 1",
        title: "Setup Node",
        status: "ready" as const,
        files: ["package.json"],
      },
    ];

    const md = generatePlanMarkdown({
      project: { name: "Sample Project" },
      nodes: mockNodes,
    });
    expect(md).toContain("# Sample Project");
    expect(md).toContain("[01.1] Setup Node");

    const json = generatePlanJson({
      project: { name: "Sample Project" },
      nodes: mockNodes,
    });
    const parsed = JSON.parse(json);
    expect(parsed.project.name).toBe("Sample Project");
    expect(parsed.nodes).toHaveLength(1);
  });
});
