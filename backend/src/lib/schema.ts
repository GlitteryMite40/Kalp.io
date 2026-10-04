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
 * 1. Duplicate node_key values among nodes
 * 2. Edges referencing unknown nodes (neither node_key nor id exists)
 * 3. Duplicate edges (identical from_node, to_node, and type)
 */
export const BaseGraphSchema = z
  .object({
    project_id: z.string().uuid("project_id must be a valid UUID").optional(),
    requirements: z.array(RequirementSchema).default([]),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema).default([]),
  })
  .superRefine((graph, ctx) => {
    // 1. Check for duplicate node_key
    const seenNodeKeys = new Set<string>();
    for (let i = 0; i < graph.nodes.length; i++) {
      const node = graph.nodes[i];
      if (seenNodeKeys.has(node.node_key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node_key "${node.node_key}" found in graph`,
          path: ["nodes", i, "node_key"],
        });
      } else {
        seenNodeKeys.add(node.node_key);
      }
    }

    // Build lookup set of valid node identifiers (both node_key and id)
    const validNodeIdentifiers = new Set<string>();
    for (const node of graph.nodes) {
      validNodeIdentifiers.add(node.node_key);
      if (node.id) {
        validNodeIdentifiers.add(node.id);
      }
    }

    // 2. Check edges referencing unknown nodes
    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i];
      if (!validNodeIdentifiers.has(edge.from_node)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge from_node "${edge.from_node}" does not exist in graph nodes`,
          path: ["edges", i, "from_node"],
        });
      }
      if (!validNodeIdentifiers.has(edge.to_node)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge to_node "${edge.to_node}" does not exist in graph nodes`,
          path: ["edges", i, "to_node"],
        });
      }
    }

    // 3. Check for duplicate edges (from_node, to_node, type)
    const seenEdges = new Set<string>();
    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i];
      const edgeIdentifier = `${edge.from_node}->${edge.to_node}:${edge.type}`;
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
