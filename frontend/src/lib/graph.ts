import type { ComputedNode, GraphEdge, NodeStatus } from "../types/api";

export interface StatusStyleConfig {
  label: string;
  badgeBg: string;
  badgeText: string;
  border: string;
  bg: string;
  dot: string;
  glow: string;
  edgeColor: string;
  hex: string;
}

export const STATUS_STYLES: Record<NodeStatus, StatusStyleConfig> = {
  ready: {
    label: "Ready",
    badgeBg: "bg-emerald-500/15",
    badgeText: "text-emerald-300 border-emerald-500/40",
    border: "border-emerald-500/60 hover:border-emerald-400",
    bg: "bg-gradient-to-b from-emerald-950/40 via-zinc-900/90 to-zinc-950/95",
    dot: "bg-emerald-400",
    glow: "shadow-emerald-500/10 hover:shadow-emerald-500/20",
    edgeColor: "#10b981",
    hex: "#10b981",
  },
  in_progress: {
    label: "In Progress",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-300 border-amber-500/40",
    border: "border-amber-500/60 hover:border-amber-400",
    bg: "bg-gradient-to-b from-amber-950/40 via-zinc-900/90 to-zinc-950/95",
    dot: "bg-amber-400 animate-pulse",
    glow: "shadow-amber-500/10 hover:shadow-amber-500/20",
    edgeColor: "#f59e0b",
    hex: "#f59e0b",
  },
  completed: {
    label: "Completed",
    badgeBg: "bg-cyan-500/15",
    badgeText: "text-cyan-300 border-cyan-500/40",
    border: "border-cyan-500/60 hover:border-cyan-400",
    bg: "bg-gradient-to-b from-cyan-950/40 via-zinc-900/90 to-zinc-950/95",
    dot: "bg-cyan-400",
    glow: "shadow-cyan-500/10 hover:shadow-cyan-500/20",
    edgeColor: "#06b6d4",
    hex: "#06b6d4",
  },
  committed: {
    label: "Committed",
    badgeBg: "bg-violet-500/15",
    badgeText: "text-violet-300 border-violet-500/40",
    border: "border-violet-500/60 hover:border-violet-400",
    bg: "bg-gradient-to-b from-violet-950/40 via-zinc-900/90 to-zinc-950/95",
    dot: "bg-violet-400",
    glow: "shadow-violet-500/10 hover:shadow-violet-500/20",
    edgeColor: "#8b5cf6",
    hex: "#8b5cf6",
  },
  blocked: {
    label: "Blocked",
    badgeBg: "bg-rose-500/15",
    badgeText: "text-rose-400 border-rose-500/40",
    border: "border-rose-500/40 hover:border-rose-400/70",
    bg: "bg-gradient-to-b from-rose-950/25 via-zinc-900/90 to-zinc-950/95 opacity-85",
    dot: "bg-rose-400",
    glow: "shadow-rose-500/10 hover:shadow-rose-500/20",
    edgeColor: "#71717a",
    hex: "#f43f5e",
  },
  failed: {
    label: "Failed",
    badgeBg: "bg-red-500/20",
    badgeText: "text-red-300 border-red-500/50",
    border: "border-red-500/70 hover:border-red-400",
    bg: "bg-gradient-to-b from-red-950/50 via-zinc-900/90 to-zinc-950/95",
    dot: "bg-red-400",
    glow: "shadow-red-500/15 hover:shadow-red-500/25",
    edgeColor: "#ef4444",
    hex: "#ef4444",
  },
  needs_review: {
    label: "Needs Review",
    badgeBg: "bg-orange-500/15",
    badgeText: "text-orange-300 border-orange-500/40",
    border: "border-orange-500/60 hover:border-orange-400",
    bg: "bg-gradient-to-b from-orange-950/40 via-zinc-900/90 to-zinc-950/95",
    dot: "bg-orange-400",
    glow: "shadow-orange-500/10 hover:shadow-orange-500/20",
    edgeColor: "#f97316",
    hex: "#f97316",
  },
  not_started: {
    label: "Not Started",
    badgeBg: "bg-zinc-500/15",
    badgeText: "text-zinc-400 border-zinc-600/40",
    border: "border-zinc-800 hover:border-zinc-700",
    bg: "bg-gradient-to-b from-zinc-900/80 via-zinc-900/90 to-zinc-950/95",
    dot: "bg-zinc-500",
    glow: "shadow-transparent hover:shadow-zinc-800/20",
    edgeColor: "#52525b",
    hex: "#71717a",
  },
};

export const TYPE_STYLES: Record<string, { badge: string; color: string }> = {
  database: {
    badge: "DB",
    color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  },
  db: {
    badge: "DB",
    color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  },
  core: {
    badge: "CORE",
    color: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  },
  api: {
    badge: "API",
    color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
  },
  backend: {
    badge: "BE",
    color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
  },
  ui: {
    badge: "UI",
    color: "text-purple-400 border-purple-500/30 bg-purple-500/10",
  },
  frontend: {
    badge: "FE",
    color: "text-purple-400 border-purple-500/30 bg-purple-500/10",
  },
  integration: {
    badge: "INTG",
    color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
  },
  feature: {
    badge: "FEAT",
    color: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  },
};

export interface KalpNodeData extends Record<string, unknown> {
  node: ComputedNode;
  isSelected?: boolean;
  onSelect?: (node: ComputedNode) => void;
}

export interface FlowNodeOutput {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: KalpNodeData;
}

export interface FlowEdgeOutput {
  id: string;
  source: string;
  target: string;
  type: string;
  animated: boolean;
  style: {
    stroke: string;
    strokeWidth: number;
    opacity: number;
  };
  markerEnd: {
    type: "arrowclosed" | "arrow";
    color: string;
    width: number;
    height: number;
  };
  data: Record<string, unknown>;
}

export interface LayoutOptions {
  columnWidth?: number;
  columnGap?: number;
  nodeHeight?: number;
  rowGap?: number;
  paddingTop?: number;
  paddingLeft?: number;
}

/**
 * Extracts numeric prefix or ordering index from phase string.
 * Example: "Phase 1: Foundation" -> 1, "02 Database" -> 2, "Architecture" -> NaN
 */
export function extractPhaseIndex(phase: string): number {
  if (!phase) return Number.POSITIVE_INFINITY;
  const match = phase.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    if (!Number.isNaN(num)) return num;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Lays out nodes in columns by Phase, and constructs React Flow compatible nodes and edges.
 * Guarantees that:
 * 1. Nodes in earlier phases appear in earlier horizontal columns (left-to-right).
 * 2. Nodes within each phase are cleanly stacked with no overlapping coordinates.
 * 3. Edges connect prerequisite nodes to dependent nodes with arrows and status colors.
 */
export function layoutGraphByPhase(
  rawNodes: ComputedNode[] = [],
  rawEdges: GraphEdge[] = [],
  options: LayoutOptions = {},
  selectedNodeId?: string | null,
  onSelectNode?: (node: ComputedNode) => void,
): {
  nodes: FlowNodeOutput[];
  edges: FlowEdgeOutput[];
  phaseSummary: Array<{ phase: string; count: number; x: number }>;
} {
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    return { nodes: [], edges: [], phaseSummary: [] };
  }

  const {
    columnWidth = 320,
    columnGap = 100,
    nodeHeight = 150,
    rowGap = 36,
    paddingTop = 70,
    paddingLeft = 50,
  } = options;

  // 1. Group nodes by Phase preserving natural sequence
  const phaseMap = new Map<string, ComputedNode[]>();
  const phaseFirstSeen = new Map<string, number>();

  rawNodes.forEach((node, idx) => {
    const phaseKey = (node.phase || "Phase 1: General").trim();
    if (!phaseMap.has(phaseKey)) {
      phaseMap.set(phaseKey, []);
      phaseFirstSeen.set(phaseKey, idx);
    }
    phaseMap.get(phaseKey)!.push(node);
  });

  // 2. Sort unique phases by numeric prefix, then first appearance
  const sortedPhases = Array.from(phaseMap.keys()).sort((a, b) => {
    const numA = extractPhaseIndex(a);
    const numB = extractPhaseIndex(b);
    if (numA !== numB) return numA - numB;
    const seenA = phaseFirstSeen.get(a) ?? 0;
    const seenB = phaseFirstSeen.get(b) ?? 0;
    return seenA - seenB;
  });

  // 3. Build ID lookup maps for robust edge resolution
  const idMap = new Map<string, string>();
  const nodeStatusMap = new Map<string, NodeStatus>();

  rawNodes.forEach((node, idx) => {
    const canonicalId = (node.id || node.node_key || `node-${idx}`).toString();
    idMap.set(canonicalId, canonicalId);
    if (node.id) idMap.set(node.id, canonicalId);
    if (node.node_key) idMap.set(node.node_key, canonicalId);

    const st = (node.computed_status ||
      node.status ||
      "not_started") as NodeStatus;
    nodeStatusMap.set(canonicalId, st);
  });

  // 4. Place nodes in phase columns
  const flowNodes: FlowNodeOutput[] = [];
  const phaseSummary: Array<{ phase: string; count: number; x: number }> = [];

  sortedPhases.forEach((phase, colIndex) => {
    const phaseNodes = phaseMap.get(phase) || [];
    const colX = paddingLeft + colIndex * (columnWidth + columnGap);

    phaseSummary.push({
      phase,
      count: phaseNodes.length,
      x: colX,
    });

    phaseNodes.forEach((node, rowIndex) => {
      const canonicalId = (
        node.id ||
        node.node_key ||
        `node-${flowNodes.length}`
      ).toString();
      const nodeY = paddingTop + rowIndex * (nodeHeight + rowGap);

      flowNodes.push({
        id: canonicalId,
        type: "kalpNode",
        position: { x: colX, y: nodeY },
        data: {
          node,
          isSelected: selectedNodeId
            ? canonicalId === selectedNodeId || node.id === selectedNodeId
            : false,
          onSelect: onSelectNode,
        },
      });
    });
  });

  // 5. Connect and style edges
  const flowEdges: FlowEdgeOutput[] = [];
  const edgeSet = new Set<string>();

  (rawEdges || []).forEach((edge, idx) => {
    // In Kalp.io:
    // DEPENDS_ON: from_node depends on to_node.
    // Build order flow: to_node (prerequisite) -> from_node (dependent).
    // BLOCKS: from_node blocks to_node.
    // Build order flow: from_node (blocker) -> to_node (blocked).
    let sourceCandidate = edge.source || edge.from_node;
    let targetCandidate = edge.target || edge.to_node;

    if (edge.type === "DEPENDS_ON") {
      sourceCandidate = edge.to_node || edge.to_node_key || edge.target;
      targetCandidate = edge.from_node || edge.from_node_key || edge.source;
    } else if (edge.type === "BLOCKS") {
      sourceCandidate = edge.from_node || edge.from_node_key || edge.source;
      targetCandidate = edge.to_node || edge.to_node_key || edge.target;
    }

    const flowSource =
      idMap.get(sourceCandidate) ||
      idMap.get(edge.to_node_key) ||
      sourceCandidate;
    const flowTarget =
      idMap.get(targetCandidate) ||
      idMap.get(edge.from_node_key) ||
      targetCandidate;

    if (!flowSource || !flowTarget || flowSource === flowTarget) {
      return;
    }

    // Filter dangling edges that don't connect to any node
    if (!idMap.has(flowSource) || !idMap.has(flowTarget)) {
      return;
    }

    const edgeKey = `${flowSource}->${flowTarget}`;
    if (edgeSet.has(edgeKey)) {
      return;
    }
    edgeSet.add(edgeKey);

    const sourceStatus = nodeStatusMap.get(flowSource) || "not_started";
    const statusCfg = STATUS_STYLES[sourceStatus] || STATUS_STYLES.not_started;

    const isAnimated =
      sourceStatus === "in_progress" || sourceStatus === "ready";

    flowEdges.push({
      id: edge.id || `edge-${idx}-${flowSource}-${flowTarget}`,
      source: flowSource,
      target: flowTarget,
      type: "smoothstep",
      animated: isAnimated,
      style: {
        stroke: statusCfg.edgeColor,
        strokeWidth: 2,
        opacity: sourceStatus === "blocked" ? 0.45 : 0.85,
      },
      markerEnd: {
        type: "arrowclosed" as const,
        color: statusCfg.edgeColor,
        width: 14,
        height: 14,
      },
      data: { ...edge },
    });
  });

  return { nodes: flowNodes, edges: flowEdges, phaseSummary };
}
