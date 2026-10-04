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
 * Edge Types
 * -----------------------------------------------------------------------------
 * Supported edge relationship types:
 * - DEPENDS_ON: Target node must complete before source can begin (DAG dependency)
 * - IMPLEMENTS: Node implements a requirement or spec
 * - TESTS: Node tests functionality of target node
 * - PRODUCES: Node produces an artifact or resource
 * - MODIFIES: Node alters existing code or resource
 * - BLOCKS: Node actively prevents target from progressing
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
 */
export const RequirementSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  project_id: z.string().optional(),
  key: z.string().trim().min(1, "Requirement key cannot be empty"),
  title: z.string().trim().min(1, "Requirement title cannot be empty"),
  description: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  created_at: z.union([z.string(), z.date()]).optional(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

/**
 * -----------------------------------------------------------------------------
 * Node Schema
 * -----------------------------------------------------------------------------
 */
export const NodeSchema = z
  .object({
    id: z.string().optional(),
    projectId: z.string().optional(),
    project_id: z.string().optional(),
    node_key: z.string().trim().min(1).optional(),
    nodeKey: z.string().trim().min(1).optional(),
    key: z.string().trim().min(1).optional(),
    phase: z.string().trim().min(1, "Phase is required"),
    title: z.string().trim().min(1, "Title is required"),
    type: z.string().nullable().optional(),
    status: NodeStatusSchema.default("not_started"),
    requirement_id: z.string().nullable().optional(),
    requirementId: z.string().nullable().optional(),
    files: z.array(z.string()).default([]),
    explanation: z.string().nullable().optional(),
    acceptance: z.array(z.string()).default([]),
    tests: z.array(z.string()).default([]),
    prompt: z.string().nullable().optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    created_at: z.union([z.string(), z.date()]).optional(),
  })
  .refine((data) => !!(data.node_key || data.nodeKey || data.key), {
    message: "Node key is required (specify node_key, nodeKey, or key)",
    path: ["node_key"],
  });
export type Node = z.infer<typeof NodeSchema>;

/**
 * -----------------------------------------------------------------------------
 * Edge Schema
 * -----------------------------------------------------------------------------
 * Validates relationship between two distinct nodes.
 * Rejects self-edges (from_node === to_node) per database constraint.
 */
export const EdgeSchema = z
  .object({
    id: z.string().optional(),
    projectId: z.string().optional(),
    project_id: z.string().optional(),
    from_node: z.string().trim().min(1).optional(),
    fromNode: z.string().trim().min(1).optional(),
    from: z.string().trim().min(1).optional(),
    source: z.string().trim().min(1).optional(),
    to_node: z.string().trim().min(1).optional(),
    toNode: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
    target: z.string().trim().min(1).optional(),
    type: EdgeTypeSchema,
  })
  .superRefine((data, ctx) => {
    const from = data.from_node ?? data.fromNode ?? data.from ?? data.source;
    const to = data.to_node ?? data.toNode ?? data.to ?? data.target;

    if (!from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Edge source node is required (from_node, from, or source)",
        path: ["from_node"],
      });
    }

    if (!to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Edge target node is required (to_node, to, or target)",
        path: ["to_node"],
      });
    }

    if (from && to && from === to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Self-edge is not allowed: source and target nodes must be distinct",
        path: ["to_node"],
      });
    }
  });
export type Edge = z.infer<typeof EdgeSchema>;

/**
 * -----------------------------------------------------------------------------
 * Graph Schema
 * -----------------------------------------------------------------------------
 * Composed graph holding requirements, nodes, and edges.
 */
export const GraphSchema = z.object({
  projectId: z.string().optional(),
  project_id: z.string().optional(),
  requirements: z.array(RequirementSchema).default([]),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema).default([]),
});
export type Graph = z.infer<typeof GraphSchema>;

// Provide value exports mirroring types for dual use (e.g. Requirement.parse)
export const Requirement = RequirementSchema;
export const Node = NodeSchema;
export const Edge = EdgeSchema;
export const EdgeType = EdgeTypeSchema;
export const NodeStatus = NodeStatusSchema;
export const Status = NodeStatusSchema;
export const Graph = GraphSchema;
