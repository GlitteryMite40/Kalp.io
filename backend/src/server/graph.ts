import type postgres from "postgres";
import { getDb } from "@/lib/db";
import { assertValidUuid } from "./session";
import { isValidOwnerId } from "./sessionShared";
import {
  type DbNodeStatus,
  type NodeStatus,
  toDbNodeStatus,
} from "@/lib/schema";
import type { NodeRecord, ProjectRecord } from "./session";
import type { EdgeLike } from "./validate";

export interface EdgeRecord {
  id: string;
  project_id: string;
  from_node: string;
  to_node: string;
  type: string;
}

export interface RequirementRecord {
  id: string;
  project_id: string;
  key: string;
  title: string;
  description: string | null;
  created_at: string | Date;
}

export interface FormattedEdge {
  id?: string;
  project_id?: string;
  from_node: string;
  to_node: string;
  from_node_key: string;
  to_node_key: string;
  type: string;
  source: string;
  target: string;
}

export interface ComputedNodeFields {
  status: DbNodeStatus;
  computed_status: DbNodeStatus;
  is_ready: boolean;
  is_blocked: boolean;
  dependencies: string[];
  blocked_by: string[];
}

export type ComputedNode<T = NodeRecord> = T & ComputedNodeFields;

export interface ProjectGraphResult {
  project: ProjectRecord;
  nodes: ComputedNode[];
  edges: FormattedEdge[];
  requirements: RequirementRecord[];
}

export interface ComputeStatusOptions {
  /**
   * If true, non-completed statuses are strictly computed to either 'ready' or 'blocked'.
   * Nodes with 'completed' or 'committed' remain completed.
   */
  forceReadyBlocked?: boolean;
}

/**
 * Checks whether a given node status signifies completed/satisfied work.
 * In Kalp.io: 'completed' and 'committed' are satisfied.
 */
export function isNodeCompleted(status: unknown): boolean {
  if (typeof status !== "string") return false;
  const normalized = toDbNodeStatus(status as NodeStatus);
  return normalized === "completed" || normalized === "committed";
}

export type NodeStatusInput = {
  id?: string;
  node_key?: string;
  key?: string;
  status?: string | null;
  [key: string]: unknown;
};

/**
 * Computes Ready / Blocked status for all nodes in a dependency graph.
 *
 * Dependency semantics (per Kalp.io standard):
 * - DEPENDS_ON: `from_node` DEPENDS ON `to_node`. That is, `to_node` is the prerequisite
 *   that must complete before `from_node` can start or become ready.
 * - BLOCKS: `from_node` BLOCKS `to_node`. That is, `from_node` actively blocks `to_node`
 *   from proceeding until `from_node` completes.
 *
 * Status determination rules:
 * 1. Nodes already 'completed' or 'committed' remain 'completed' or 'committed'.
 * 2. Active execution statuses ('in_progress', 'failed', 'needs_review') are preserved
 *    unless forceReadyBlocked is enabled.
 * 3. Unstarted, ready, or blocked nodes are evaluated against their prerequisites:
 *    - If all prerequisites are satisfied (or node has 0 prerequisites): status is 'ready'.
 *    - If at least one prerequisite is unsatisfied: status is 'blocked'.
 *
 * Works with both UUIDs and human-readable node_keys (e.g. "01.1", "01.2").
 */
export function computeNodeStatuses<
  T extends {
    id?: string;
    node_key?: string;
    key?: string;
    status?: string | null;
  },
>(
  nodes: T[],
  edges: Array<EdgeRecord | EdgeLike> = [],
  options?: ComputeStatusOptions,
): Array<T & ComputedNodeFields> {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  // 1. Build lookup tables for node resolution
  const idOrKeyToIndex = new Map<string, number>();
  const idOrKeyToCanonicalKey = new Map<string, string>();

  nodes.forEach((node, index) => {
    const key = (
      node.node_key ??
      node.key ??
      node.id ??
      `node-${index}`
    ).toString();
    idOrKeyToIndex.set(key, index);
    idOrKeyToCanonicalKey.set(key, key);

    if (node.id) {
      idOrKeyToIndex.set(node.id, index);
      idOrKeyToCanonicalKey.set(node.id, key);
    }
  });

  // 2. Build prerequisite sets for each node index
  const prerequisites = new Map<number, Set<string>>();
  for (let i = 0; i < nodes.length; i++) {
    prerequisites.set(i, new Set<string>());
  }

  for (const rawEdge of edges) {
    const edgeObj = rawEdge as Record<string, unknown>;
    const fromRaw = (
      edgeObj.from_node ??
      edgeObj.fromNode ??
      edgeObj.from ??
      ""
    ).toString();
    const toRaw = (
      edgeObj.to_node ??
      edgeObj.toNode ??
      edgeObj.to ??
      ""
    ).toString();
    const type = (edgeObj.type ?? "DEPENDS_ON").toString().trim();

    const fromIdx = idOrKeyToIndex.get(fromRaw);
    const toIdx = idOrKeyToIndex.get(toRaw);

    // Ignore edges with unresolved endpoints or self-edges
    if (fromIdx === undefined || toIdx === undefined || fromIdx === toIdx) {
      continue;
    }

    const fromKey = idOrKeyToCanonicalKey.get(fromRaw)!;
    const toKey = idOrKeyToCanonicalKey.get(toRaw)!;

    if (type === "DEPENDS_ON") {
      // from_node DEPENDS ON to_node => to_node is prerequisite for from_node
      prerequisites.get(fromIdx)!.add(toKey);
    } else if (type === "BLOCKS") {
      // from_node BLOCKS to_node => from_node is prerequisite/blocker for to_node
      prerequisites.get(toIdx)!.add(fromKey);
    }
  }

  // 3. Evaluate each node's status based on prerequisites
  return nodes.map((node, index) => {
    const prereqKeys = Array.from(prerequisites.get(index) ?? []);

    // Check which prerequisites are NOT completed
    const unsatisfiedBlockers: string[] = [];
    for (const pKey of prereqKeys) {
      const pIdx = idOrKeyToIndex.get(pKey);
      if (pIdx === undefined) {
        unsatisfiedBlockers.push(pKey);
        continue;
      }
      const pNode = nodes[pIdx];
      if (!isNodeCompleted(pNode.status)) {
        unsatisfiedBlockers.push(pKey);
      }
    }

    const rawStatus = (node.status ?? "not_started").toString();
    let normalizedDbStatus: DbNodeStatus;
    try {
      normalizedDbStatus = toDbNodeStatus(rawStatus as NodeStatus);
    } catch {
      normalizedDbStatus = "not_started";
    }

    let finalStatus: DbNodeStatus;
    let isReady = false;
    let isBlocked = false;

    // Terminal / active preserved states
    if (
      normalizedDbStatus === "completed" ||
      normalizedDbStatus === "committed"
    ) {
      finalStatus = normalizedDbStatus;
    } else if (
      !options?.forceReadyBlocked &&
      (normalizedDbStatus === "in_progress" ||
        normalizedDbStatus === "failed" ||
        normalizedDbStatus === "needs_review")
    ) {
      finalStatus = normalizedDbStatus;
    } else {
      // Evaluate Ready vs Blocked
      if (unsatisfiedBlockers.length === 0) {
        finalStatus = "ready";
        isReady = true;
      } else {
        finalStatus = "blocked";
        isBlocked = true;
      }
    }

    return {
      ...node,
      status: finalStatus,
      computed_status: finalStatus,
      is_ready: isReady,
      is_blocked: isBlocked,
      dependencies: prereqKeys,
      blocked_by: unsatisfiedBlockers,
    };
  });
}

/**
 * Normalizes edges with both UUID and node_key identifiers for consumers.
 */
export function formatGraphEdges(
  nodes: Array<{ id?: string; node_key?: string; key?: string }>,
  edges: Array<EdgeRecord | EdgeLike>,
): FormattedEdge[] {
  const idOrKeyToKey = new Map<string, string>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const key = (
      node.node_key ??
      node.key ??
      node.id ??
      `node-${i}`
    ).toString();
    idOrKeyToKey.set(key, key);
    if (node.id) {
      idOrKeyToKey.set(node.id, key);
    }
  }

  return edges.map((rawEdge) => {
    const edgeObj = rawEdge as Record<string, unknown>;
    const from = (
      edgeObj.from_node ??
      edgeObj.fromNode ??
      edgeObj.from ??
      ""
    ).toString();
    const to = (
      edgeObj.to_node ??
      edgeObj.toNode ??
      edgeObj.to ??
      ""
    ).toString();
    const type = (edgeObj.type ?? "DEPENDS_ON").toString();

    const fromKey = idOrKeyToKey.get(from) ?? from;
    const toKey = idOrKeyToKey.get(to) ?? to;

    return {
      id: typeof edgeObj.id === "string" ? edgeObj.id : undefined,
      project_id:
        typeof edgeObj.project_id === "string" ? edgeObj.project_id : undefined,
      from_node: from,
      to_node: to,
      from_node_key: fromKey,
      to_node_key: toKey,
      type,
      source: from,
      target: to,
    };
  });
}

/**
 * Retrieves the complete build graph for a project strictly scoped to the requesting owner.
 * Returns nodes with computed Ready/Blocked statuses, edges, and requirements.
 */
export async function findProjectGraphForOwner(
  projectId: string,
  ownerId: string,
  client?: postgres.Sql,
): Promise<ProjectGraphResult | null> {
  assertValidUuid(projectId, "Invalid project ID format");
  assertValidUuid(ownerId, "Invalid owner ID format");

  const db = client ?? getDb();

  // 1. Verify project exists and belongs to requesting owner
  const [project] = await db<ProjectRecord[]>`
    SELECT id, owner_id, name, idea, status, current_stage, repo_url, created_at, updated_at
    FROM projects
    WHERE id = ${projectId} AND owner_id = ${ownerId}
  `;

  if (!project) {
    return null;
  }

  // 2. Fetch nodes, edges, and requirements in parallel
  const [rawNodes, rawEdges, requirements] = await Promise.all([
    db<NodeRecord[]>`
      SELECT id, project_id, node_key, phase, title, type, status,
             requirement_id, files, explanation, acceptance, tests, prompt, created_at
      FROM nodes
      WHERE project_id = ${projectId}
      ORDER BY phase ASC, node_key ASC
    `,
    db<EdgeRecord[]>`
      SELECT id, project_id, from_node, to_node, type
      FROM edges
      WHERE project_id = ${projectId}
    `,
    db<RequirementRecord[]>`
      SELECT id, project_id, key, title, description, created_at
      FROM requirements
      WHERE project_id = ${projectId}
      ORDER BY key ASC
    `,
  ]);

  // 3. Compute Ready/Blocked statuses
  const computedNodes = computeNodeStatuses(rawNodes, rawEdges);

  // 4. Format edges with node_key aliases and source/target for React Flow
  const formattedEdges = formatGraphEdges(rawNodes, rawEdges);

  return {
    project,
    nodes: computedNodes,
    edges: formattedEdges,
    requirements,
  };
}

/**
 * Alias for findProjectGraphForOwner
 */
export const getProjectGraph = findProjectGraphForOwner;

/**
 * Finds a node by either UUID id or string node_key strictly verifying owner access through project.
 */
export async function findNodeByIdOrKeyForOwner(
  idOrKey: string,
  ownerId: string,
  client?: postgres.Sql,
): Promise<NodeRecord | null> {
  const db = client ?? getDb();
  const trimmed = idOrKey.trim();

  if (isValidOwnerId(trimmed)) {
    const rows = await db<NodeRecord[]>`
      SELECT n.*
      FROM nodes n
      JOIN projects p ON n.project_id = p.id
      WHERE n.id = ${trimmed} AND p.owner_id = ${ownerId}
      LIMIT 1
    `;
    if (rows.length > 0) return rows[0];
  }

  // Also lookup by node_key for this owner
  const rows = await db<NodeRecord[]>`
    SELECT n.*
    FROM nodes n
    JOIN projects p ON n.project_id = p.id
    WHERE n.node_key = ${trimmed} AND p.owner_id = ${ownerId}
    LIMIT 1
  `;
  return rows.length > 0 ? rows[0] : null;
}

export interface NodeBlockedStateResult {
  node: NodeRecord;
  isBlocked: boolean;
  blockedBy: string[];
  dependencies: string[];
}

/**
 * Evaluates whether a specific node is currently blocked by unsatisfied prerequisites.
 */
export async function getNodeBlockedState(
  nodeIdOrKey: string,
  ownerId: string,
  client?: postgres.Sql,
): Promise<NodeBlockedStateResult | null> {
  const db = client ?? getDb();

  const node = await findNodeByIdOrKeyForOwner(nodeIdOrKey, ownerId, db);
  if (!node) {
    return null;
  }

  const [projectNodes, projectEdges] = await Promise.all([
    db<NodeRecord[]>`
      SELECT id, project_id, node_key, phase, title, type, status,
             requirement_id, files, explanation, acceptance, tests, prompt, created_at
      FROM nodes
      WHERE project_id = ${node.project_id}
      ORDER BY phase ASC, node_key ASC
    `,
    db<EdgeRecord[]>`
      SELECT id, project_id, from_node, to_node, type
      FROM edges
      WHERE project_id = ${node.project_id}
    `,
  ]);

  const computedNodes = computeNodeStatuses(projectNodes, projectEdges);
  const target = computedNodes.find(
    (n) => n.id === node.id || n.node_key === node.node_key,
  );

  return {
    node,
    isBlocked: target ? target.is_blocked : false,
    blockedBy: target ? target.blocked_by : [],
    dependencies: target ? target.dependencies : [],
  };
}
