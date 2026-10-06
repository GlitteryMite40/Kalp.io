import { describe, it, expect, vi } from "vitest";
import {
  validateGraph,
  assertValidGraph,
  validateAndSaveGraph,
  validateWithRegeneration,
  InvalidGraphError,
  formatValidationFeedback,
  type GraphLike,
} from "@/server/validate";

const BASE_VALID_GRAPH: GraphLike = {
  requirements: [
    {
      key: "REQ-1",
      title: "Core Infrastructure",
      id: "10000000-0000-4000-8000-000000000001",
    },
    {
      key: "REQ-2",
      title: "User Management",
      id: "10000000-0000-4000-8000-000000000002",
    },
  ],
  nodes: [
    {
      node_key: "01.1",
      phase: "01",
      title: "Initial Setup",
      type: "setup",
      status: "ready",
      requirement_key: "REQ-1",
      files: ["package.json"],
      id: "a0000000-0000-4000-8000-000000000001",
    },
    {
      node_key: "02.1",
      phase: "02",
      title: "Database Schema",
      type: "database",
      status: "not_started",
      requirement_key: "REQ-1",
      files: ["src/lib/db.ts"],
      id: "a0000000-0000-4000-8000-000000000002",
    },
    {
      node_key: "02.2",
      phase: "02",
      title: "Auth Route",
      type: "backend",
      status: "not_started",
      requirement_key: "REQ-2",
      files: ["src/app/api/auth/route.ts"],
      id: "a0000000-0000-4000-8000-000000000003",
    },
    {
      node_key: "03.1",
      phase: "03",
      title: "Integration Tests",
      type: "testing",
      status: "not_started",
      requirement_key: "REQ-2",
      files: ["tests/integration.test.ts"],
      id: "a0000000-0000-4000-8000-000000000004",
    },
  ],
  edges: [
    {
      from_node: "02.1",
      to_node: "01.1",
      type: "DEPENDS_ON",
    },
    {
      from_node: "02.2",
      to_node: "02.1",
      type: "DEPENDS_ON",
    },
    {
      from_node: "03.1",
      to_node: "02.2",
      type: "DEPENDS_ON",
    },
  ],
};

describe("Graph Validator Unit Tests (Task 03.6)", () => {
  describe("Valid graph scenarios", () => {
    it("validates a healthy graph without errors", () => {
      const result = validateGraph(BASE_VALID_GRAPH);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.cycle).toBeNull();
      expect(result.orphans).toHaveLength(0);
    });

    it("assertValidGraph passes without throwing on a valid graph", () => {
      expect(() => assertValidGraph(BASE_VALID_GRAPH)).not.toThrow();
    });

    it("resolves edge endpoint aliases (from/to, fromNode/toNode, from_node/to_node)", () => {
      const aliasGraph: GraphLike = {
        nodes: [
          { node_key: "01.1", phase: "01", title: "Setup" },
          { node_key: "02.1", phase: "02", title: "Feature" },
        ],
        edges: [
          {
            from: "02.1",
            to: "01.1",
            type: "DEPENDS_ON",
          },
        ],
      };
      const result = validateGraph(aliasGraph);
      expect(result.valid).toBe(true);
    });
  });

  describe("Cycle detection (CYCLE_DETECTED)", () => {
    it("detects direct 2-node cycle (A -> B -> A)", () => {
      const cycleGraph: GraphLike = {
        nodes: [
          { node_key: "01.1", phase: "01", title: "Node 1" },
          { node_key: "01.2", phase: "01", title: "Node 2" },
        ],
        edges: [
          { from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" },
          { from_node: "01.2", to_node: "01.1", type: "DEPENDS_ON" },
        ],
      };
      const result = validateGraph(cycleGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "CYCLE_DETECTED")).toBe(true);
      expect(result.cycle).not.toBeNull();
    });

    it("detects 3-node cycle (A -> B -> C -> A)", () => {
      const cycleGraph: GraphLike = {
        nodes: [
          { node_key: "01.1", phase: "01", title: "Node A" },
          { node_key: "02.1", phase: "02", title: "Node B" },
          { node_key: "03.1", phase: "03", title: "Node C" },
        ],
        edges: [
          { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
          { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" },
          { from_node: "01.1", to_node: "03.1", type: "DEPENDS_ON" },
        ],
      };
      const result = validateGraph(cycleGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "CYCLE_DETECTED")).toBe(true);
    });

    it("detects self-edge cycle (from === to)", () => {
      const selfEdgeGraph: GraphLike = {
        nodes: [{ node_key: "01.1", phase: "01", title: "Self Ref" }],
        edges: [{ from_node: "01.1", to_node: "01.1", type: "DEPENDS_ON" }],
      };
      const result = validateGraph(selfEdgeGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "CYCLE_DETECTED")).toBe(true);
    });
  });

  describe("Orphan node detection (ORPHAN_NODE)", () => {
    it("flags disconnected nodes in later phases as orphans", () => {
      const orphanGraph: GraphLike = {
        nodes: [
          { node_key: "01.1", phase: "01", title: "Root Setup" },
          {
            node_key: "03.5",
            phase: "03",
            title: "Disconnected Island Node",
          },
        ],
        edges: [],
      };
      const result = validateGraph(orphanGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "ORPHAN_NODE")).toBe(true);
      expect(result.orphans).toContain("03.5");
    });
  });

  describe("Duplicate detection (DUPLICATE_NODE_KEY, DUPLICATE_ID, DUPLICATE_EDGE)", () => {
    it("flags duplicate node keys", () => {
      const dupKeyGraph: GraphLike = {
        nodes: [
          { node_key: "01.1", phase: "01", title: "First 01.1" },
          { node_key: "01.1", phase: "01", title: "Duplicate 01.1" },
        ],
      };
      const result = validateGraph(dupKeyGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "DUPLICATE_NODE_KEY")).toBe(
        true,
      );
      expect(result.duplicates.nodeKeys).toContain("01.1");
    });

    it("flags duplicate node IDs (UUIDs)", () => {
      const dupIdGraph: GraphLike = {
        nodes: [
          {
            node_key: "01.1",
            phase: "01",
            title: "Node 1",
            id: "11111111-1111-1111-1111-111111111111",
          },
          {
            node_key: "01.2",
            phase: "01",
            title: "Node 2",
            id: "11111111-1111-1111-1111-111111111111",
          },
        ],
      };
      const result = validateGraph(dupIdGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "DUPLICATE_ID")).toBe(true);
    });

    it("flags duplicate edges between the same endpoints and type", () => {
      const dupEdgeGraph: GraphLike = {
        nodes: [
          { node_key: "01.1", phase: "01", title: "Root" },
          { node_key: "02.1", phase: "02", title: "Child" },
        ],
        edges: [
          { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
          { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        ],
      };
      const result = validateGraph(dupEdgeGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "DUPLICATE_EDGE")).toBe(true);
    });
  });

  describe("Missing dependencies (MISSING_DEPENDENCY)", () => {
    it("flags edges pointing to non-existent target nodes", () => {
      const missingEdgeGraph: GraphLike = {
        nodes: [{ node_key: "01.1", phase: "01", title: "Only Node" }],
        edges: [{ from_node: "01.1", to_node: "99.9", type: "DEPENDS_ON" }],
      };
      const result = validateGraph(missingEdgeGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "MISSING_DEPENDENCY")).toBe(
        true,
      );
      expect(result.missingDependencies.unknownEdgeNodes.includes("99.9")).toBe(
        true,
      );
    });

    it("flags unknown requirement keys when required", () => {
      const unknownReqGraph: GraphLike = {
        requirements: [{ key: "REQ-1", title: "Valid Req" }],
        nodes: [
          {
            node_key: "01.1",
            phase: "01",
            title: "Setup",
            requirement_key: "REQ-UNKNOWN",
          },
        ],
      };
      const result = validateGraph(unknownReqGraph, {
        requireRequirementKey: true,
      });
      expect(result.valid).toBe(false);
      expect(
        result.missingDependencies.unknownRequirementKeys.includes(
          "REQ-UNKNOWN",
        ),
      ).toBe(true);
    });
  });

  describe("Schema errors (SCHEMA_ERROR)", () => {
    it("rejects non-object or null graph inputs", () => {
      expect(validateGraph(null).valid).toBe(false);
      expect(validateGraph("invalid string").valid).toBe(false);
    });

    it("rejects graph with empty nodes array", () => {
      const res = validateGraph({ nodes: [] });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.code === "SCHEMA_ERROR")).toBe(true);
    });
  });

  describe("formatValidationFeedback helper", () => {
    it("formats errors into structured instructions for regeneration", () => {
      const feedback = formatValidationFeedback([
        { code: "CYCLE_DETECTED", message: "Cycle between 01.1 and 01.2" },
        { code: "ORPHAN_NODE", message: "Node 03.1 is disconnected" },
      ]);
      expect(feedback).toContain("[CYCLE_DETECTED]");
      expect(feedback).toContain("[ORPHAN_NODE]");
      expect(feedback).toContain("NO cycles");
    });
  });

  describe("validateAndSaveGraph & Acceptance Criteria", () => {
    it("immediately saves a valid graph on the first attempt without regeneration", async () => {
      const saveFn = vi.fn().mockResolvedValue({ id: "saved-proj-1" });
      const regenerateFn = vi.fn();

      const { result, regenerated } = await validateAndSaveGraph(
        BASE_VALID_GRAPH,
        saveFn,
        regenerateFn,
      );

      expect(result).toEqual({ id: "saved-proj-1" });
      expect(regenerated).toBe(false);
      expect(saveFn).toHaveBeenCalledTimes(1);
      expect(regenerateFn).not.toHaveBeenCalled();
    });

    it("heals an invalid graph on single regeneration attempt and saves it", async () => {
      const invalidGraph: GraphLike = {
        nodes: [{ node_key: "01.1", phase: "01", title: "Cycle Node" }],
        edges: [{ from_node: "01.1", to_node: "01.1", type: "DEPENDS_ON" }],
      };

      const saveFn = vi.fn().mockResolvedValue({ id: "saved-healed-1" });
      const regenerateFn = vi.fn().mockResolvedValue(BASE_VALID_GRAPH);

      const { result, regenerated } = await validateAndSaveGraph(
        invalidGraph,
        saveFn,
        regenerateFn,
      );

      expect(result).toEqual({ id: "saved-healed-1" });
      expect(regenerated).toBe(true);
      expect(regenerateFn).toHaveBeenCalledTimes(1);
      expect(saveFn).toHaveBeenCalledTimes(1);
    });

    it("ACCEPTANCE CRITERIA: Invalid graphs are NEVER saved if regeneration fails", async () => {
      const invalidGraph: GraphLike = {
        nodes: [{ node_key: "01.1", phase: "01", title: "Bad Node" }],
        edges: [{ from_node: "01.1", to_node: "01.1", type: "DEPENDS_ON" }],
      };

      const saveFn = vi.fn().mockResolvedValue({ id: "should-not-be-called" });
      const regenerateFn = vi.fn().mockResolvedValue(invalidGraph);

      await expect(
        validateAndSaveGraph(invalidGraph, saveFn, regenerateFn),
      ).rejects.toThrow(InvalidGraphError);

      // Crucial: saveFn is never called when graph remains invalid
      expect(saveFn).not.toHaveBeenCalled();
    });

    it("ACCEPTANCE CRITERIA: Rejects invalid graph without calling saveFn when no regenerateFn provided", async () => {
      const invalidGraph: GraphLike = {
        nodes: [{ node_key: "01.1", phase: "01", title: "Bad Node" }],
        edges: [{ from_node: "01.1", to_node: "01.1", type: "DEPENDS_ON" }],
      };

      const saveFn = vi.fn();
      await expect(validateAndSaveGraph(invalidGraph, saveFn)).rejects.toThrow(
        InvalidGraphError,
      );

      expect(saveFn).not.toHaveBeenCalled();
    });
  });

  describe("validateWithRegeneration helper", () => {
    it("returns graph immediately if first generation passes", async () => {
      const generator = vi.fn().mockResolvedValue(BASE_VALID_GRAPH);
      const res = await validateWithRegeneration(generator);

      expect(res.regenerated).toBe(false);
      expect(res.graph).toEqual(BASE_VALID_GRAPH);
      expect(generator).toHaveBeenCalledTimes(1);
    });

    it("regenerates once with feedback and returns healed graph", async () => {
      const invalidGraph: GraphLike = {
        nodes: [{ node_key: "01.1", phase: "01", title: "Broken" }],
        edges: [{ from_node: "01.1", to_node: "01.1", type: "DEPENDS_ON" }],
      };

      const generator = vi
        .fn()
        .mockResolvedValueOnce(invalidGraph)
        .mockResolvedValueOnce(BASE_VALID_GRAPH);

      const res = await validateWithRegeneration(generator);
      expect(res.regenerated).toBe(true);
      expect(res.graph).toEqual(BASE_VALID_GRAPH);
      expect(generator).toHaveBeenCalledTimes(2);
    });
  });
});
