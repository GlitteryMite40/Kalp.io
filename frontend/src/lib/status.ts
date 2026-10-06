import type { ComputedNode, NodeStatus } from "@/types/api";

export interface StatusTransitionResult {
  allowed: boolean;
  reason?: string;
  blockedBy?: string[];
}

export interface StatusActionConfig {
  status: NodeStatus;
  label: string;
  shortLabel: string;
  testId: string;
  color: string;
  activeColor: string;
  description: string;
}

/**
 * Standard status actions for Kalp.io graph nodes.
 * Explicitly supports: In Progress, Completed, Failed.
 */
export const STATUS_ACTIONS: StatusActionConfig[] = [
  {
    status: "in_progress",
    label: "In Progress",
    shortLabel: "Start Task",
    testId: "status-btn-in-progress",
    color:
      "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/60",
    activeColor:
      "border-amber-400 bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/50",
    description: "Mark task as currently being worked on",
  },
  {
    status: "completed",
    label: "Completed",
    shortLabel: "Complete",
    testId: "status-btn-completed",
    color:
      "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-500/60",
    activeColor:
      "border-cyan-400 bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400/50",
    description: "Mark task implementation as verified and done",
  },
  {
    status: "failed",
    label: "Failed",
    shortLabel: "Fail",
    testId: "status-btn-failed",
    color:
      "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/60",
    activeColor:
      "border-rose-400 bg-rose-500/25 text-rose-200 ring-1 ring-rose-400/50",
    description: "Mark task as blocked or failed during build/test",
  },
];

/**
 * Checks whether a node is currently blocked by unresolved prerequisites.
 */
export function isNodeBlocked(node: ComputedNode | null): boolean {
  if (!node) return false;
  return Boolean(
    node.is_blocked ||
    node.computed_status === "blocked" ||
    node.status === "blocked" ||
    (Array.isArray(node.blocked_by) && node.blocked_by.length > 0),
  );
}

/**
 * Checks whether a node is ready to start (all prerequisites met).
 */
export function isNodeReady(node: ComputedNode | null): boolean {
  if (!node) return false;
  // If explicitly blocked, it cannot be ready
  if (isNodeBlocked(node)) return false;

  return Boolean(
    node.is_ready ||
    node.computed_status === "ready" ||
    node.status === "ready",
  );
}

/**
 * Validates whether transitioning to targetStatus is allowed.
 * Strictly enforces acceptance criterion: "blocked cannot start".
 */
export function canTransitionToStatus(
  node: ComputedNode | null,
  targetStatus: NodeStatus,
): StatusTransitionResult {
  if (!node) {
    return {
      allowed: false,
      reason: "No node provided for status transition.",
    };
  }

  const currentStatus = (node.computed_status ||
    node.status ||
    "not_started") as NodeStatus;

  // Cannot transition to identical status
  if (currentStatus === targetStatus) {
    return {
      allowed: false,
      reason: `Node is already in "${currentStatus}" status.`,
    };
  }

  // ACCEPTANCE CRITERIA: "blocked cannot start"
  // Blocked nodes cannot transition to in_progress, completed, or ready
  if (isNodeBlocked(node)) {
    const blockers = node.blocked_by || [];
    const blockerText =
      blockers.length > 0 ? blockers.join(", ") : "prerequisites";

    if (
      targetStatus === "in_progress" ||
      targetStatus === "completed" ||
      targetStatus === "ready" ||
      targetStatus === "committed"
    ) {
      return {
        allowed: false,
        reason: `Cannot start blocked node "${node.node_key}". Prerequisites not completed: ${blockerText}.`,
        blockedBy: blockers,
      };
    }

    // A blocked node can also not be marked failed before it even started
    return {
      allowed: false,
      reason: `Node "${node.node_key}" is blocked. Complete prerequisites before updating status.`,
      blockedBy: blockers,
    };
  }

  return { allowed: true };
}

/**
 * Executes status transition safely. Guard rails prevent any call if blocked.
 */
export async function executeStatusTransition(
  node: ComputedNode | null,
  targetStatus: NodeStatus,
  updateFn: (nodeId: string, status: NodeStatus) => Promise<void> | void,
): Promise<{ success: boolean; error?: string }> {
  const check = canTransitionToStatus(node, targetStatus);
  if (!check.allowed) {
    return {
      success: false,
      error: check.reason || "Transition not permitted.",
    };
  }

  try {
    await updateFn(node!.id, targetStatus);
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update node status.";
    return { success: false, error: message };
  }
}

export interface RawNodeItem {
  id?: string;
  project_id?: string;
  node_key: string;
  phase?: string;
  title?: string;
  type?: string | null;
  status?: NodeStatus | string;
  requirement_id?: string | null;
  requirement_key?: string | null;
  files?: string[];
  explanation?: string | null;
  acceptance?: string[];
  tests?: string[];
  prompt?: string | null;
  created_at?: string;
  dependencies?: string[];
}

export interface RawEdgeItem {
  from_node?: string;
  to_node?: string;
  from_node_key?: string;
  to_node_key?: string;
  type?: string;
}

/**
 * Computes dynamic graph statuses (Ready, Blocked, In Progress, Completed, Failed)
 * for a list of nodes and edges, matching Kalp.io DAG evaluation rules.
 */
export function computeGraphStatuses(
  nodes: RawNodeItem[] = [],
  edges: RawEdgeItem[] = [],
): ComputedNode[] {
  // Index nodes by node_key and id for fast resolution
  const nodeMap = new Map<string, RawNodeItem>();
  const idToKeyMap = new Map<string, string>();

  nodes.forEach((n) => {
    nodeMap.set(n.node_key, n);
    if (n.id) {
      nodeMap.set(n.id, n);
      idToKeyMap.set(n.id, n.node_key);
    }
  });

  // Resolve dependencies for each node from node.dependencies array and edge connections
  const depsMap = new Map<string, Set<string>>();
  nodes.forEach((n) => {
    const set = new Set<string>();
    (n.dependencies || []).forEach((d) => {
      const resolved = idToKeyMap.get(d) || d;
      set.add(resolved);
    });
    depsMap.set(n.node_key, set);
  });

  edges.forEach((e) => {
    if (e.type === "DEPENDS_ON" || !e.type) {
      const fromKey =
        e.from_node_key || idToKeyMap.get(e.from_node || "") || e.from_node;
      const toKey =
        e.to_node_key || idToKeyMap.get(e.to_node || "") || e.to_node;
      if (fromKey && toKey) {
        if (!depsMap.has(fromKey)) depsMap.set(fromKey, new Set());
        depsMap.get(fromKey)!.add(toKey);
      }
    }
  });

  return nodes.map((n) => {
    const st = (n.status || "not_started") as NodeStatus;
    const dependencies = Array.from(depsMap.get(n.node_key) || []);

    if (st === "completed" || st === "committed") {
      return {
        id: n.id || n.node_key,
        project_id: n.project_id || "",
        node_key: n.node_key,
        phase: n.phase || "01",
        title: n.title || "",
        type: n.type || "task",
        status: st,
        computed_status: st,
        is_ready: false,
        is_blocked: false,
        dependencies,
        blocked_by: [],
        files: n.files || [],
        explanation: n.explanation || null,
        acceptance: n.acceptance || [],
        tests: n.tests || [],
        prompt: n.prompt || null,
        created_at: n.created_at || new Date().toISOString(),
        requirement_id: n.requirement_id || null,
        requirement_key: n.requirement_key || null,
      };
    }

    if (st === "in_progress" || st === "failed") {
      return {
        id: n.id || n.node_key,
        project_id: n.project_id || "",
        node_key: n.node_key,
        phase: n.phase || "01",
        title: n.title || "",
        type: n.type || "task",
        status: st,
        computed_status: st,
        is_ready: false,
        is_blocked: false,
        dependencies,
        blocked_by: [],
        files: n.files || [],
        explanation: n.explanation || null,
        acceptance: n.acceptance || [],
        tests: n.tests || [],
        prompt: n.prompt || null,
        created_at: n.created_at || new Date().toISOString(),
        requirement_id: n.requirement_id || null,
        requirement_key: n.requirement_key || null,
      };
    }

    // Evaluate prerequisites for unstarted / ready nodes
    const blockedBy: string[] = [];
    dependencies.forEach((depKey) => {
      const depNode = nodeMap.get(depKey);
      const depStatus = (depNode?.status || "not_started") as NodeStatus;
      if (depStatus !== "completed" && depStatus !== "committed") {
        blockedBy.push(depKey);
      }
    });

    const isBlocked = blockedBy.length > 0;
    const computedStatus: NodeStatus = isBlocked ? "blocked" : "ready";

    return {
      id: n.id || n.node_key,
      project_id: n.project_id || "",
      node_key: n.node_key,
      phase: n.phase || "01",
      title: n.title || "",
      type: n.type || "task",
      status: st,
      computed_status: computedStatus,
      is_ready: !isBlocked,
      is_blocked: isBlocked,
      dependencies,
      blocked_by: blockedBy,
      files: n.files || [],
      explanation: n.explanation || null,
      acceptance: n.acceptance || [],
      tests: n.tests || [],
      prompt: n.prompt || null,
      created_at: n.created_at || new Date().toISOString(),
      requirement_id: n.requirement_id || null,
      requirement_key: n.requirement_key || null,
    };
  });
}
