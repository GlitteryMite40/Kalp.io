/**
 * =============================================================================
 * Kalp.io Graph Schemas (Task 03.2)
 * =============================================================================
 * Backend source of truth for all graph data shapes:
 * - Requirement: key, title, description, id, project_id, created_at
 * - Node: node_key, phase, title, status, requirement_key, requirement_id,
 *   files, explanation, acceptance, tests, prompt
 * - Edge: from_node, to_node, type (DEPENDS_ON, IMPLEMENTS, TESTS, PRODUCES, MODIFIES, BLOCKS)
 * - Statuses: Not Started, Ready, In Progress, Committed, Completed, Blocked, Failed, Needs Review
 * - Graph: composed graph with comprehensive integrity validation (cycles, self-edges, duplicates, coverage)
 * =============================================================================
 */

import { z } from "zod";

/**
 * -----------------------------------------------------------------------------
 * Node Statuses
 * -----------------------------------------------------------------------------
 * Canonical database representation uses snake_case, matching the check
 * constraint in supabase/migrations/001_init.sql:
 * ('not_started', 'ready', 'in_progress', 'committed', 'completed', 'blocked', 'failed', 'needs_review')
 *
 * Title Case variants are also accepted for display and plan generation flexibility:
 * ('Not Started', 'Ready', 'In Progress', 'Committed', 'Completed', 'Blocked', 'Failed', 'Needs Review')
 */

export const DB_NODE_STATUSES = [
  "not_started",
  "ready",
  "in_progress",
  "committed",
  "completed",
  "blocked",
  "failed",
  "needs_review",
] as const;

export const DISPLAY_NODE_STATUSES = [
  "Not Started",
  "Ready",
  "In Progress",
  "Committed",
  "Completed",
  "Blocked",
  "Failed",
  "Needs Review",
] as const;

export const ALL_NODE_STATUSES = [
  ...DB_NODE_STATUSES,
  ...DISPLAY_NODE_STATUSES,
] as const;

export const DbNodeStatusSchema = z.enum(DB_NODE_STATUSES);
export type DbNodeStatus = z.infer<typeof DbNodeStatusSchema>;

export const DisplayNodeStatusSchema = z.enum(DISPLAY_NODE_STATUSES);
export type DisplayNodeStatus = z.infer<typeof DisplayNodeStatusSchema>;

export const NodeStatusSchema = z.enum(ALL_NODE_STATUSES);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const NODE_STATUSES = ALL_NODE_STATUSES;

// Alias StatusSchema to NodeStatusSchema
export const StatusSchema = NodeStatusSchema;
export type Status = NodeStatus;
export const STATUSES = ALL_NODE_STATUSES;

export const STATUS_MAP: Record<
  NodeStatus,
  { db: DbNodeStatus; display: DisplayNodeStatus }
> = {
  not_started: { db: "not_started", display: "Not Started" },
  "Not Started": { db: "not_started", display: "Not Started" },
  ready: { db: "ready", display: "Ready" },
  Ready: { db: "ready", display: "Ready" },
  in_progress: { db: "in_progress", display: "In Progress" },
  "In Progress": { db: "in_progress", display: "In Progress" },
  committed: { db: "committed", display: "Committed" },
  Committed: { db: "committed", display: "Committed" },
  completed: { db: "completed", display: "Completed" },
  Completed: { db: "completed", display: "Completed" },
  blocked: { db: "blocked", display: "Blocked" },
  Blocked: { db: "blocked", display: "Blocked" },
  failed: { db: "failed", display: "Failed" },
  Failed: { db: "failed", display: "Failed" },
  needs_review: { db: "needs_review", display: "Needs Review" },
  "Needs Review": { db: "needs_review", display: "Needs Review" },
};

/**
 * Normalizes any valid node status (DB or Display) to canonical DB snake_case.
 */
export function toDbNodeStatus(status: NodeStatus): DbNodeStatus {
  return (
    STATUS_MAP[status]?.db ??
    (status.toLowerCase().replace(/\s+/g, "_") as DbNodeStatus)
  );
}

/**
 * Converts any valid node status to human-friendly Title Case display label.
 */
export function toDisplayNodeStatus(status: NodeStatus): DisplayNodeStatus {
  return STATUS_MAP[status]?.display ?? (status as DisplayNodeStatus);
}

/**
 * Preprocessing schema that normalizes any accepted status to the canonical DB snake_case enum.
 */
export const CanonicalNodeStatusSchema = z.preprocess((val) => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed in STATUS_MAP) {
      return STATUS_MAP[trimmed as NodeStatus].db;
    }
  }
  return val;
}, DbNodeStatusSchema);

/**
 * -----------------------------------------------------------------------------
 * Input Alias Normalizer
 * -----------------------------------------------------------------------------
 * Collapses camelCase and alternative field aliases into a single canonical
 * snake_case shape matching the database schema.
 */
export function normalizeAliases(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }
  const obj = input as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...obj };

  // Project ID alias (projectId -> project_id)
  if (
    normalized.projectId !== undefined &&
    normalized.project_id === undefined
  ) {
    normalized.project_id = normalized.projectId;
  }
  delete normalized.projectId;

  // Requirement ID alias (requirementId -> requirement_id)
  if (
    normalized.requirementId !== undefined &&
    normalized.requirement_id === undefined
  ) {
    normalized.requirement_id = normalized.requirementId;
  }
  delete normalized.requirementId;

  // Requirement Key alias (requirementKey -> requirement_key)
  if (
    normalized.requirementKey !== undefined &&
    normalized.requirement_key === undefined
  ) {
    normalized.requirement_key = normalized.requirementKey;
  }
  delete normalized.requirementKey;

  // Timestamp aliases (createdAt -> created_at)
  if (
    normalized.createdAt !== undefined &&
    normalized.created_at === undefined
  ) {
    normalized.created_at = normalized.createdAt;
  }
  delete normalized.createdAt;

  // Node key aliases: nodeKey or key -> node_key
  const hasNodeKey =
    typeof normalized.node_key === "string" &&
    normalized.node_key.trim().length > 0;
  if (!hasNodeKey) {
    if (
      typeof normalized.nodeKey === "string" &&
      normalized.nodeKey.trim().length > 0
    ) {
      normalized.node_key = normalized.nodeKey;
    } else if (
      typeof normalized.key === "string" &&
      normalized.key.trim().length > 0 &&
      ("phase" in normalized ||
        "files" in normalized ||
        "acceptance" in normalized ||
        "tests" in normalized)
    ) {
      normalized.node_key = normalized.key;
      delete normalized.key;
    }
  }
  delete normalized.nodeKey;

  // Edge source aliases: fromNode, from, source -> from_node
  const hasFromNode =
    typeof normalized.from_node === "string" &&
    normalized.from_node.trim().length > 0;
  if (!hasFromNode) {
    if (
      typeof normalized.fromNode === "string" &&
      normalized.fromNode.trim().length > 0
    ) {
      normalized.from_node = normalized.fromNode;
    } else if (
      typeof normalized.from === "string" &&
      normalized.from.trim().length > 0
    ) {
      normalized.from_node = normalized.from;
    } else if (
      typeof normalized.source === "string" &&
      normalized.source.trim().length > 0
    ) {
      normalized.from_node = normalized.source;
    }
  }
  delete normalized.fromNode;
  if ("from" in normalized && "from_node" in normalized) delete normalized.from;
  delete normalized.source;

  // Edge target aliases: toNode, to, target -> to_node
  const hasToNode =
    typeof normalized.to_node === "string" &&
    normalized.to_node.trim().length > 0;
  if (!hasToNode) {
    if (
      typeof normalized.toNode === "string" &&
      normalized.toNode.trim().length > 0
    ) {
      normalized.to_node = normalized.toNode;
    } else if (
      typeof normalized.to === "string" &&
      normalized.to.trim().length > 0
    ) {
      normalized.to_node = normalized.to;
    } else if (
      typeof normalized.target === "string" &&
      normalized.target.trim().length > 0
    ) {
      normalized.to_node = normalized.target;
    }
  }
  delete normalized.toNode;
  if ("to" in normalized && "to_node" in normalized) delete normalized.to;
  delete normalized.target;

  return normalized;
}

/**
 * -----------------------------------------------------------------------------
 * Edge Types & Direction Convention
 * -----------------------------------------------------------------------------
 * Edge Direction Convention:
 * For `DEPENDS_ON`: `from_node` DEPENDS ON `to_node`.
 * That is, `to_node` is the prerequisite/dependency that must complete
 * before `from_node` can start or become ready.
 * (Execution / topological flow: to_node -> from_node).
 *
 * Other relationship types:
 * - IMPLEMENTS: from_node implements to_node (e.g. requirement or specification)
 * - TESTS: from_node tests functionality of to_node
 * - PRODUCES: from_node generates or produces to_node (artifact/resource)
 * - MODIFIES: from_node alters or extends to_node
 * - BLOCKS: from_node actively prevents to_node from proceeding
 */
export const EDGE_TYPES = [
  "DEPENDS_ON",
  "IMPLEMENTS",
  "TESTS",
  "PRODUCES",
  "MODIFIES",
  "BLOCKS",
] as const;

export const EdgeTypeSchema = z.enum(EDGE_TYPES);
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

/**
 * -----------------------------------------------------------------------------
 * Requirement Schema
 * -----------------------------------------------------------------------------
 * Canonical snake_case shape matching database table `requirements`.
 * DB-facing IDs strictly require UUIDs.
 */
export const BaseRequirementSchema = z.object({
  id: z.string().uuid("Requirement id must be a valid UUID").optional(),
  project_id: z.string().uuid("project_id must be a valid UUID").optional(),
  key: z.string().trim().min(1, "Requirement key cannot be empty"),
  title: z.string().trim().min(1, "Requirement title cannot be empty"),
  description: z.string().nullable().optional(),
  created_at: z.union([z.string(), z.date()]).optional(),
});

export const RequirementSchema = z.preprocess(
  normalizeAliases,
  BaseRequirementSchema,
);
export type Requirement = z.infer<typeof BaseRequirementSchema>;

/**
 * -----------------------------------------------------------------------------
 * Node Schema
 * -----------------------------------------------------------------------------
 * LLM-facing output uses node_key, requirement_key, from_node, to_node (keys
 * only, never UUIDs); UUID fields are filled by the persistence step.
 *
 * Canonical snake_case shape matching database table `nodes`.
 * DB-facing IDs strictly require UUIDs.
 * `status` automatically normalizes to canonical DB snake_case via CanonicalNodeStatusSchema.
 */
export const BaseNodeSchema = z.object({
  id: z.string().uuid("Node id must be a valid UUID").optional(),
  project_id: z.string().uuid("project_id must be a valid UUID").optional(),
  node_key: z.string().trim().min(1, "node_key is required"),
  phase: z.string().trim().min(1, "Phase is required"),
  title: z.string().trim().min(1, "Title is required"),
  type: z.string().nullable().optional(),
  status: CanonicalNodeStatusSchema.default("not_started"),
  requirement_id: z
    .string()
    .uuid("requirement_id must be a valid UUID")
    .nullable()
    .optional(),
  requirement_key: z
    .string()
    .trim()
    .min(1, "requirement_key cannot be empty")
    .nullable()
    .optional(),
  files: z.array(z.string()).default([]),
  explanation: z.string().nullable().optional(),
  acceptance: z.array(z.string()).default([]),
  tests: z.array(z.string()).default([]),
  prompt: z.string().nullable().optional(),
  created_at: z.union([z.string(), z.date()]).optional(),
});

export const NodeSchema = z.preprocess(normalizeAliases, BaseNodeSchema);
export type Node = z.infer<typeof BaseNodeSchema>;

/**
 * -----------------------------------------------------------------------------
 * Edge Schema
 * -----------------------------------------------------------------------------
 * Canonical snake_case shape matching database table `edges`.
 * Rejects self-edges (from_node === to_node) per database constraint.
 */
export const BaseEdgeSchema = z
  .object({
    id: z.string().uuid("Edge id must be a valid UUID").optional(),
    project_id: z.string().uuid("project_id must be a valid UUID").optional(),
    from_node: z.string().trim().min(1, "from_node is required"),
    to_node: z.string().trim().min(1, "to_node is required"),
    type: EdgeTypeSchema,
  })
  .refine((data) => data.from_node !== data.to_node, {
    message: "Self-edge is not allowed: from_node and to_node must be distinct",
    path: ["to_node"],
  });

export const EdgeSchema = z.preprocess(normalizeAliases, BaseEdgeSchema);
export type Edge = z.infer<typeof BaseEdgeSchema>;

/**
 * -----------------------------------------------------------------------------
 * Graph Schema
 * -----------------------------------------------------------------------------
 * Composed build graph holding requirements, nodes, and edges.
 * Performs superRefine checks for:
 * 1. Duplicate requirement keys in requirements
 * 2. Duplicate node_key values among nodes
 * 3. Nodes referencing unknown requirement_key
 * 4. Edges referencing unknown nodes (neither node_key nor id exists)
 * 5. Duplicate edges (resolving endpoints to canonical node_key when node has both)
 */
/**
 * -----------------------------------------------------------------------------
 * Graph Integrity & Cycle Detection
 * -----------------------------------------------------------------------------
 */

export interface GraphIntegrityOptions {
  knownRequirementKeys?: string[];
  requireRequirementKey?: boolean;
  requireFullCoverage?: boolean;
}

/**
 * Returns requirement keys that no node references via requirement_key.
 */
export function findUncoveredRequirements(
  requirementKeys: string[],
  nodes: Array<{ requirement_key?: string | null }>,
): string[] {
  const coveredKeys = new Set<string>();
  for (const node of nodes) {
    if (node.requirement_key && node.requirement_key.trim().length > 0) {
      coveredKeys.add(node.requirement_key.trim());
    }
  }
  return requirementKeys.filter((key) => !coveredKeys.has(key.trim()));
}

/**
 * Sorts nodes by phase using numeric-aware string comparison (localeCompare with numeric: true).
 * Stable sort, tie-broken by original index. Does not reject or mutate input.
 */
export function sortNodesByPhase<T extends { phase: string }>(nodes: T[]): T[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => {
      const cmp = a.node.phase.localeCompare(b.node.phase, undefined, {
        numeric: true,
      });
      if (cmp !== 0) return cmp;
      return a.index - b.index;
    })
    .map((item) => item.node);
}

/**
 * Detects cycles among DEPENDS_ON edges only.
 * Returns the cycle as an ordered list of node_keys (e.g. ["01.1", "01.2", "01.1"]) or null.
 * Works iteratively and safely on graphs of a few hundred nodes.
 */
export function findDependsOnCycle(
  nodes: Array<{ node_key: string; id?: string }>,
  edges: Array<{ from_node: string; to_node: string; type: string }>,
): string[] | null {
  const idOrKeyToNodeKey = new Map<string, string>();
  for (const n of nodes) {
    idOrKeyToNodeKey.set(n.node_key, n.node_key);
    if (n.id) {
      idOrKeyToNodeKey.set(n.id, n.node_key);
    }
  }

  // Build adjacency map for DEPENDS_ON edges only
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    if (!adj.has(n.node_key)) {
      adj.set(n.node_key, []);
    }
  }

  for (const edge of edges) {
    if (edge.type === "DEPENDS_ON") {
      const fromKey = idOrKeyToNodeKey.get(edge.from_node) ?? edge.from_node;
      const toKey = idOrKeyToNodeKey.get(edge.to_node) ?? edge.to_node;
      if (fromKey === toKey) {
        return [fromKey, toKey];
      }
      if (!adj.has(fromKey)) {
        adj.set(fromKey, []);
      }
      adj.get(fromKey)!.push(toKey);
    }
  }

  // 0: unvisited, 1: visiting (in current DFS path), 2: visited
  const state = new Map<string, number>();

  for (const startNode of adj.keys()) {
    if ((state.get(startNode) ?? 0) !== 0) continue;

    const stack: Array<{ node: string; neighborIdx: number }> = [
      { node: startNode, neighborIdx: 0 },
    ];
    state.set(startNode, 1);

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const u = top.node;
      const neighbors = adj.get(u) ?? [];

      if (top.neighborIdx < neighbors.length) {
        const v = neighbors[top.neighborIdx];
        top.neighborIdx++;

        const vState = state.get(v) ?? 0;
        if (vState === 1) {
          // Cycle detected: reconstruct path from v to u, ending with v
          const cycle: string[] = [v];
          for (let i = stack.length - 1; i >= 0; i--) {
            cycle.unshift(stack[i].node);
            if (stack[i].node === v) {
              break;
            }
          }
          return cycle;
        }

        if (vState === 0) {
          state.set(v, 1);
          stack.push({ node: v, neighborIdx: 0 });
        }
      } else {
        state.set(u, 2);
        stack.pop();
      }
    }
  }

  return null;
}

/**
 * Shared graph integrity check used by GraphSchema and decompose schemas.
 *
 * Requirements checking precedence:
 * - If options.knownRequirementKeys is provided, it takes precedence over input.requirements
 *   for unknown-requirement_key validation and coverage checks.
 * - Otherwise input.requirements is used if present.
 * - Otherwise requirement validation is skipped.
 *
 * If options.requireFullCoverage is true, validates that every requirement key is referenced
 * by at least one node.
 *
 * If a node has both requirement_id and requirement_key and input.requirements contains an entry
 * with that id, verifies that the requirement's key matches the node's requirement_key.
 */
export function checkGraphIntegrity(
  input: {
    requirements?: Array<{ id?: string; key: string }>;
    nodes: Array<{
      node_key: string;
      id?: string;
      requirement_id?: string | null;
      requirement_key?: string | null;
    }>;
    edges: Array<{
      from_node: string;
      to_node: string;
      type: string;
    }>;
  },
  ctx: z.RefinementCtx,
  options?: GraphIntegrityOptions,
): void {
  // 1. Reject duplicate requirement keys
  if (input.requirements) {
    const seenReqKeys = new Set<string>();
    for (let i = 0; i < input.requirements.length; i++) {
      const req = input.requirements[i];
      if (seenReqKeys.has(req.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate requirement key "${req.key}" found in graph`,
          path: ["requirements", i, "key"],
        });
      } else {
        seenReqKeys.add(req.key);
      }
    }
  }

  // Precedence: options.knownRequirementKeys takes precedence over input.requirements
  const effectiveReqKeys =
    options?.knownRequirementKeys !== undefined
      ? options.knownRequirementKeys
      : input.requirements
        ? input.requirements.map((r) => r.key)
        : null;
  const knownReqKeys = effectiveReqKeys ? new Set(effectiveReqKeys) : null;

  // Build requirement id -> key lookup map for consistency checks
  const reqIdToKey = new Map<string, string>();
  if (input.requirements) {
    for (const r of input.requirements) {
      if (r.id) {
        reqIdToKey.set(r.id, r.key);
      }
    }
  }

  // 2. Reject duplicate node_key and validate requirement_key references and id-key consistency
  const seenNodeKeys = new Set<string>();

  for (let i = 0; i < input.nodes.length; i++) {
    const node = input.nodes[i];
    if (seenNodeKeys.has(node.node_key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate node_key "${node.node_key}" found in graph`,
        path: ["nodes", i, "node_key"],
      });
    } else {
      seenNodeKeys.add(node.node_key);
    }

    if (options?.requireRequirementKey) {
      if (!node.requirement_key || node.requirement_key.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Node ${node.node_key} is missing required requirement_key`,
          path: ["nodes", i, "requirement_key"],
        });
      }
    }

    if (
      knownReqKeys &&
      node.requirement_key &&
      !knownReqKeys.has(node.requirement_key)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Node ${node.node_key} references unknown requirement_key ${node.requirement_key}`,
        path: ["nodes", i, "requirement_key"],
      });
    }

    // B3: Check requirement_id vs requirement_key consistency
    if (
      node.requirement_id &&
      node.requirement_key &&
      reqIdToKey.has(node.requirement_id)
    ) {
      const expectedKey = reqIdToKey.get(node.requirement_id)!;
      if (expectedKey !== node.requirement_key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Node ${node.node_key} requirement_id "${node.requirement_id}" (maps to "${expectedKey}") does not match requirement_key "${node.requirement_key}"`,
          path: ["nodes", i, "requirement_key"],
        });
      }
    }
  }

  // B1: Check requirement full coverage if requested
  if (options?.requireFullCoverage && effectiveReqKeys) {
    const uncovered = findUncoveredRequirements(effectiveReqKeys, input.nodes);
    for (const uncoveredKey of uncovered) {
      const reqIndex = input.requirements
        ? input.requirements.findIndex((r) => r.key === uncoveredKey)
        : -1;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Requirement ${uncoveredKey} is not covered by any node`,
        path: reqIndex >= 0 ? ["requirements", reqIndex] : ["nodes"],
      });
    }
  }

  // Build lookup map from both node_key and id -> canonical node_key
  const idOrKeyToNodeKey = new Map<string, string>();
  for (const node of input.nodes) {
    idOrKeyToNodeKey.set(node.node_key, node.node_key);
    if (node.id) {
      idOrKeyToNodeKey.set(node.id, node.node_key);
    }
  }

  // 3. Check edges referencing unknown nodes
  for (let i = 0; i < input.edges.length; i++) {
    const edge = input.edges[i];
    if (!idOrKeyToNodeKey.has(edge.from_node)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Edge from_node "${edge.from_node}" does not exist in graph nodes`,
        path: ["edges", i, "from_node"],
      });
    }
    if (!idOrKeyToNodeKey.has(edge.to_node)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Edge to_node "${edge.to_node}" does not exist in graph nodes`,
        path: ["edges", i, "to_node"],
      });
    }
  }

  // 4. Check for self-edges after resolving endpoints to node_key
  for (let i = 0; i < input.edges.length; i++) {
    const edge = input.edges[i];
    const fromKey = idOrKeyToNodeKey.get(edge.from_node);
    const toKey = idOrKeyToNodeKey.get(edge.to_node);
    if (fromKey && toKey && fromKey === toKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Self-edge is not allowed: from_node and to_node refer to the same node "${fromKey}"`,
        path: ["edges", i, "to_node"],
      });
    }
  }

  // 5. Check for duplicate edges (resolving endpoints to canonical node_key)
  const seenEdges = new Set<string>();
  for (let i = 0; i < input.edges.length; i++) {
    const edge = input.edges[i];
    const fromKey = idOrKeyToNodeKey.get(edge.from_node) ?? edge.from_node;
    const toKey = idOrKeyToNodeKey.get(edge.to_node) ?? edge.to_node;
    const edgeIdentifier = `${fromKey}->${toKey}:${edge.type}`;
    if (seenEdges.has(edgeIdentifier)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate edge (${edge.from_node}, ${edge.to_node}, ${edge.type}) found in graph`,
        path: ["edges", i],
      });
    } else {
      seenEdges.add(edgeIdentifier);
    }
  }

  // 6. Check for cycles among DEPENDS_ON edges only
  const cycle = findDependsOnCycle(input.nodes, input.edges);
  if (cycle) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `DEPENDS_ON cycle detected: ${cycle.join(" -> ")}`,
      path: ["edges"],
    });
  }
}

export const BaseGraphSchema = z
  .object({
    project_id: z.string().uuid("project_id must be a valid UUID").optional(),
    requirements: z.array(RequirementSchema).default([]),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema).default([]),
  })
  .superRefine((graph, ctx) => {
    checkGraphIntegrity(graph, ctx);
  });

export const GraphSchema = z.preprocess(normalizeAliases, BaseGraphSchema);
export type Graph = z.infer<typeof BaseGraphSchema>;

// Provide value exports mirroring types for dual use (e.g. Requirement.parse)
export const Requirement = RequirementSchema;
export const Node = NodeSchema;
export const Edge = EdgeSchema;
export const EdgeType = EdgeTypeSchema;
export const NodeStatus = NodeStatusSchema;
export const Status = NodeStatusSchema;
export const Graph = GraphSchema;
