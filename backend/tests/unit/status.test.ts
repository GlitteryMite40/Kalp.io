import { describe, it, expect } from "vitest";
import { computeNodeStatuses, formatGraphEdges } from "@/server/graph";

describe("Status Logic Unit Tests (Task 04.3 / 05.5)", () => {
  describe("Basic & Empty Graph Scenarios", () => {
    it("returns empty array when nodes array is empty", () => {
      const result = computeNodeStatuses([]);
      expect(result).toEqual([]);
    });

    it("evaluates a single independent node as ready", () => {
      const nodes = [
        {
          id: "node-1",
          node_key: "01.1",
          title: "Root setup",
          status: "not_started",
        },
      ];
      const result = computeNodeStatuses(nodes, []);

      expect(result).toHaveLength(1);
      expect(result[0].computed_status).toBe("ready");
      expect(result[0].status).toBe("ready");
      expect(result[0].is_ready).toBe(true);
      expect(result[0].is_blocked).toBe(false);
      expect(result[0].dependencies).toEqual([]);
      expect(result[0].blocked_by).toEqual([]);
    });
  });

  describe("Ready vs Blocked Determination with DEPENDS_ON", () => {
    const nodes = [
      {
        id: "id-1",
        node_key: "01.1",
        title: "Setup Node",
        status: "not_started",
      },
      {
        id: "id-2",
        node_key: "02.1",
        title: "Feature Node",
        status: "not_started",
      },
    ];

    const edges = [
      {
        from_node: "02.1",
        to_node: "01.1",
        type: "DEPENDS_ON" as const,
      },
    ];

    it("blocks dependent node when prerequisite is not_started", () => {
      const result = computeNodeStatuses(nodes, edges);

      const n1 = result.find((n) => n.node_key === "01.1")!;
      const n2 = result.find((n) => n.node_key === "02.1")!;

      expect(n1.status).toBe("ready");
      expect(n1.is_ready).toBe(true);

      expect(n2.status).toBe("blocked");
      expect(n2.is_blocked).toBe(true);
      expect(n2.blocked_by).toEqual(["01.1"]);
    });

    it("keeps dependent node blocked when prerequisite is in_progress", () => {
      const nodesInProgress = [
        { ...nodes[0], status: "in_progress" },
        { ...nodes[1], status: "not_started" },
      ];
      const result = computeNodeStatuses(nodesInProgress, edges);
      const n2 = result.find((n) => n.node_key === "02.1")!;

      expect(n2.status).toBe("blocked");
      expect(n2.is_blocked).toBe(true);
      expect(n2.blocked_by).toEqual(["01.1"]);
    });

    it("unblocks dependent node to ready when prerequisite is completed", () => {
      const nodesCompleted = [
        { ...nodes[0], status: "completed" },
        { ...nodes[1], status: "not_started" },
      ];
      const result = computeNodeStatuses(nodesCompleted, edges);
      const n2 = result.find((n) => n.node_key === "02.1")!;

      expect(n2.status).toBe("ready");
      expect(n2.is_ready).toBe(true);
      expect(n2.is_blocked).toBe(false);
      expect(n2.blocked_by).toEqual([]);
    });

    it("unblocks dependent node to ready when prerequisite is committed", () => {
      const nodesCommitted = [
        { ...nodes[0], status: "committed" },
        { ...nodes[1], status: "not_started" },
      ];
      const result = computeNodeStatuses(nodesCommitted, edges);
      const n2 = result.find((n) => n.node_key === "02.1")!;

      expect(n2.status).toBe("ready");
      expect(n2.is_ready).toBe(true);
      expect(n2.is_blocked).toBe(false);
    });
  });

  describe("BLOCKS edge semantics", () => {
    it("handles BLOCKS edge where from_node actively blocks to_node", () => {
      const nodes = [
        { node_key: "01.1", status: "not_started" },
        { node_key: "02.1", status: "not_started" },
      ];
      const blocksEdge = [
        {
          from_node: "01.1",
          to_node: "02.1",
          type: "BLOCKS" as const,
        },
      ];

      // 01.1 is not complete, so 02.1 is blocked
      const res1 = computeNodeStatuses(nodes, blocksEdge);
      expect(res1.find((n) => n.node_key === "02.1")!.status).toBe("blocked");

      // 01.1 completes, so 02.1 becomes ready
      const res2 = computeNodeStatuses(
        [{ ...nodes[0], status: "completed" }, nodes[1]],
        blocksEdge,
      );
      expect(res2.find((n) => n.node_key === "02.1")!.status).toBe("ready");
    });
  });

  describe("Preservation of active execution states", () => {
    it("preserves in_progress status regardless of prerequisites", () => {
      const nodes = [
        { node_key: "01.1", status: "not_started" },
        { node_key: "02.1", status: "in_progress" },
      ];
      const edges = [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" as const },
      ];

      const result = computeNodeStatuses(nodes, edges);
      const n2 = result.find((n) => n.node_key === "02.1")!;
      expect(n2.status).toBe("in_progress");
      expect(n2.computed_status).toBe("in_progress");
    });

    it("preserves failed status", () => {
      const nodes = [{ node_key: "01.1", status: "failed" }];
      const result = computeNodeStatuses(nodes, []);
      expect(result[0].status).toBe("failed");
    });

    it("preserves needs_review status", () => {
      const nodes = [{ node_key: "01.1", status: "needs_review" }];
      const result = computeNodeStatuses(nodes, []);
      expect(result[0].status).toBe("needs_review");
    });

    it("preserves completed and committed terminal statuses", () => {
      const nodes = [
        { node_key: "01.1", status: "completed" },
        { node_key: "01.2", status: "committed" },
      ];
      const result = computeNodeStatuses(nodes, []);
      expect(result[0].status).toBe("completed");
      expect(result[1].status).toBe("committed");
    });
  });

  describe("Multi-prerequisite fan-in and dependency chains", () => {
    it("evaluates fan-in node requiring multiple prerequisites (A and B -> C)", () => {
      const nodes = [
        { node_key: "01.1", status: "completed" },
        { node_key: "01.2", status: "not_started" },
        { node_key: "02.1", status: "not_started" },
      ];
      const edges = [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" as const },
        { from_node: "02.1", to_node: "01.2", type: "DEPENDS_ON" as const },
      ];

      // 01.1 is completed, but 01.2 is still not_started
      const res1 = computeNodeStatuses(nodes, edges);
      const c1 = res1.find((n) => n.node_key === "02.1")!;
      expect(c1.status).toBe("blocked");
      expect(c1.blocked_by).toEqual(["01.2"]);

      // Complete 01.2 -> 02.1 unblocks
      const nodesAllDone = [
        nodes[0],
        { ...nodes[1], status: "completed" },
        nodes[2],
      ];
      const res2 = computeNodeStatuses(nodesAllDone, edges);
      const c2 = res2.find((n) => n.node_key === "02.1")!;
      expect(c2.status).toBe("ready");
      expect(c2.blocked_by).toEqual([]);
    });

    it("propagates readiness down a 3-step chain (A -> B -> C)", () => {
      const nodes = [
        { node_key: "01.1", status: "not_started" },
        { node_key: "02.1", status: "not_started" },
        { node_key: "03.1", status: "not_started" },
      ];
      const edges = [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" as const },
        { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" as const },
      ];

      // Step 1: Initial state
      const s1 = computeNodeStatuses(nodes, edges);
      expect(s1.find((n) => n.node_key === "01.1")!.status).toBe("ready");
      expect(s1.find((n) => n.node_key === "02.1")!.status).toBe("blocked");
      expect(s1.find((n) => n.node_key === "03.1")!.status).toBe("blocked");

      // Step 2: Complete 01.1
      const s2 = computeNodeStatuses(
        [{ ...nodes[0], status: "completed" }, nodes[1], nodes[2]],
        edges,
      );
      expect(s2.find((n) => n.node_key === "02.1")!.status).toBe("ready");
      expect(s2.find((n) => n.node_key === "03.1")!.status).toBe("blocked");

      // Step 3: Complete 02.1
      const s3 = computeNodeStatuses(
        [
          { ...nodes[0], status: "completed" },
          { ...nodes[1], status: "completed" },
          nodes[2],
        ],
        edges,
      );
      expect(s3.find((n) => n.node_key === "03.1")!.status).toBe("ready");
    });
  });

  describe("Resolution by UUID and node_key", () => {
    it("resolves edges defined with node UUIDs", () => {
      const nodes = [
        {
          id: "u1111111-0000-0000-0000-000000000001",
          node_key: "01.1",
          status: "not_started",
        },
        {
          id: "u2222222-0000-0000-0000-000000000002",
          node_key: "02.1",
          status: "not_started",
        },
      ];
      const edges = [
        {
          from_node: "u2222222-0000-0000-0000-000000000002",
          to_node: "u1111111-0000-0000-0000-000000000001",
          type: "DEPENDS_ON" as const,
        },
      ];

      const result = computeNodeStatuses(nodes, edges);
      const n2 = result.find((n) => n.node_key === "02.1")!;
      expect(n2.status).toBe("blocked");
      expect(n2.blocked_by).toEqual(["01.1"]);
    });
  });

  describe("Cycle safety & resilience", () => {
    it("terminates without infinite loop or crash when edges contain a cycle", () => {
      const nodes = [
        { node_key: "01.1", status: "not_started" },
        { node_key: "01.2", status: "not_started" },
      ];
      const cycleEdges = [
        { from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" as const },
        { from_node: "01.2", to_node: "01.1", type: "DEPENDS_ON" as const },
      ];

      const result = computeNodeStatuses(nodes, cycleEdges);
      expect(result).toHaveLength(2);
      expect(result[0].status).toBe("blocked");
      expect(result[1].status).toBe("blocked");
    });
  });

  describe("formatGraphEdges helper", () => {
    it("formats edge endpoints with canonical node keys and UUIDs", () => {
      const nodes = [
        { id: "uuid-1", node_key: "01.1" },
        { id: "uuid-2", node_key: "02.1" },
      ];
      const edges = [
        {
          from_node: "uuid-2",
          to_node: "uuid-1",
          type: "DEPENDS_ON",
        },
      ];

      const formatted = formatGraphEdges(nodes, edges);
      expect(formatted).toHaveLength(1);
      expect(formatted[0].from_node_key).toBe("02.1");
      expect(formatted[0].to_node_key).toBe("01.1");
      expect(formatted[0].type).toBe("DEPENDS_ON");
    });
  });
});
