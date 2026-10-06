"use client";

import React, { useMemo, useState, useCallback } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  Panel,
  useNodesState,
  useEdgesState,
  type Node as FlowNode,
  type NodeProps,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { ComputedNode, GraphEdge, NodeStatus } from "../types/api";
import {
  STATUS_STYLES,
  TYPE_STYLES,
  layoutGraphByPhase,
  extractPhaseIndex,
  type KalpNodeData,
  type StatusStyleConfig,
  type LayoutOptions,
} from "../lib/graph";

export {
  STATUS_STYLES,
  TYPE_STYLES,
  layoutGraphByPhase,
  extractPhaseIndex,
  type KalpNodeData,
  type StatusStyleConfig,
  type LayoutOptions,
};

/**
 * Custom React Flow Node Component for Kalp.io DAG tasks.
 */
export function KalpNodeComponent({
  data,
  selected,
}: NodeProps<FlowNode<KalpNodeData>>) {
  const { node, onSelect, isSelected } = data;
  const status = (node.computed_status ||
    node.status ||
    "not_started") as NodeStatus;
  const style = STATUS_STYLES[status] || STATUS_STYLES.not_started;
  const typeKey = (node.type || "").toLowerCase();
  const typeConfig = TYPE_STYLES[typeKey] || {
    badge: (node.type || "TASK").toUpperCase().slice(0, 4),
    color: "text-zinc-400 border-zinc-700 bg-zinc-800/40",
  };

  const isHighlighted = isSelected || selected;

  return (
    <div
      onClick={() => onSelect?.(node)}
      className={`group relative w-[280px] rounded-2xl border p-4 text-left backdrop-blur-xl transition-all duration-200 cursor-pointer shadow-lg select-none ${
        style.bg
      } ${style.border} ${style.glow} ${
        isHighlighted
          ? "ring-2 ring-indigo-400 shadow-xl shadow-indigo-500/25 scale-[1.02] border-indigo-400"
          : "hover:scale-[1.01]"
      }`}
    >
      {/* React Flow Left Handle (Target: incoming prerequisites) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !-left-2 !bg-indigo-400 !border-2 !border-zinc-950 transition-transform group-hover:scale-125"
      />

      {/* Header: Node Key + Type + Status */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md border border-indigo-500/30 bg-indigo-500/15 text-indigo-300 shrink-0">
            {node.node_key}
          </span>
          {node.type && (
            <span
              className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border truncate ${typeConfig.color}`}
            >
              {typeConfig.badge}
            </span>
          )}
        </div>

        {/* Status Badge */}
        <span
          className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${style.badgeBg} ${style.badgeText}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </div>

      {/* Title */}
      <h4 className="text-sm font-semibold text-white tracking-tight line-clamp-2 group-hover:text-indigo-200 transition-colors">
        {node.title}
      </h4>

      {/* Description / Explanation */}
      {node.explanation && (
        <p className="mt-1 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
          {node.explanation}
        </p>
      )}

      {/* Footer / Phase & Dependency Info */}
      <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2 text-[10px] font-mono text-zinc-400">
        <span
          className="truncate max-w-[130px] text-zinc-400"
          title={node.phase}
        >
          {node.phase}
        </span>

        {node.is_blocked ? (
          <span className="text-rose-400 font-semibold flex items-center gap-1 shrink-0">
            <span>Blocked</span>
            {node.blocked_by && node.blocked_by.length > 0 && (
              <span className="rounded bg-rose-500/20 px-1 py-0.2 text-[9px]">
                {node.blocked_by.length}
              </span>
            )}
          </span>
        ) : (
          <span className="text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
            <span>Ready</span>
          </span>
        )}
      </div>

      {/* React Flow Right Handle (Source: outgoing dependencies) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !-right-2 !bg-indigo-400 !border-2 !border-zinc-950 transition-transform group-hover:scale-125"
      />
    </div>
  );
}

const nodeTypes = {
  kalpNode: KalpNodeComponent,
};

export interface GraphProps {
  nodes: ComputedNode[];
  edges: GraphEdge[];
  selectedNodeId?: string | null;
  onSelectNode?: (node: ComputedNode) => void;
  className?: string;
  fitViewOnInit?: boolean;
  showControls?: boolean;
  showMinimap?: boolean;
  showLegend?: boolean;
  showPhaseHeaders?: boolean;
}

export function GraphCanvas({
  nodes: rawNodes = [],
  edges: rawEdges = [],
  selectedNodeId,
  onSelectNode,
  className = "",
  fitViewOnInit = true,
  showControls = true,
  showMinimap = true,
  showLegend = true,
  showPhaseHeaders = true,
}: GraphProps) {
  const [statusFilter, setStatusFilter] = useState<NodeStatus | "all">("all");
  const [phaseFilter, setPhaseFilter] = useState<string | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter nodes based on user selections
  const filteredNodes = useMemo(() => {
    return rawNodes.filter((node) => {
      const matchesStatus =
        statusFilter === "all" ||
        node.status === statusFilter ||
        node.computed_status === statusFilter;

      const matchesPhase = phaseFilter === "all" || node.phase === phaseFilter;

      const matchesSearch =
        searchQuery.trim().length === 0 ||
        node.node_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (node.explanation &&
          node.explanation.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesStatus && matchesPhase && matchesSearch;
    });
  }, [rawNodes, statusFilter, phaseFilter, searchQuery]);

  // Layout the filtered graph
  const {
    nodes: initialFlowNodes,
    edges: initialFlowEdges,
    phaseSummary,
  } = useMemo(() => {
    return layoutGraphByPhase(
      filteredNodes,
      rawEdges,
      {},
      selectedNodeId,
      onSelectNode,
    );
  }, [filteredNodes, rawEdges, selectedNodeId, onSelectNode]);

  const [nodes, , onNodesChange] = useNodesState<FlowNode<KalpNodeData>>(
    initialFlowNodes as FlowNode<KalpNodeData>[],
  );
  const [edges, , onEdgesChange] = useEdgesState(initialFlowEdges);

  // Status counts for legend
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ready: 0,
      in_progress: 0,
      completed: 0,
      committed: 0,
      blocked: 0,
      failed: 0,
      needs_review: 0,
      not_started: 0,
    };
    rawNodes.forEach((node) => {
      const st = node.computed_status || node.status || "not_started";
      if (counts[st] !== undefined) {
        counts[st]++;
      }
    });
    return counts;
  }, [rawNodes]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, flowNode: FlowNode) => {
      const found = rawNodes.find(
        (n) => n.id === flowNode.id || n.node_key === flowNode.id,
      );
      if (found && onSelectNode) {
        onSelectNode(found);
      }
    },
    [rawNodes, onSelectNode],
  );

  return (
    <div
      className={`relative w-full h-full min-h-[550px] bg-zinc-950 overflow-hidden ${className}`}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Search & Filter Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-zinc-900/90 backdrop-blur-md p-1.5 rounded-xl border border-zinc-800 shadow-xl">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes..."
              className="w-40 sm:w-56 rounded-lg bg-zinc-950/80 px-3 py-1.5 text-xs text-white placeholder-zinc-500 border border-zinc-800 focus:border-indigo-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1.5 text-xs text-zinc-500 hover:text-white"
              >
                ×
              </button>
            )}
          </div>

          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            className="rounded-lg bg-zinc-950/80 px-2.5 py-1.5 text-xs text-zinc-300 border border-zinc-800 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All Phases ({rawNodes.length})</option>
            {phaseSummary.map((p) => (
              <option key={p.phase} value={p.phase}>
                {p.phase} ({p.count})
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as NodeStatus | "all")
            }
            className="rounded-lg bg-zinc-950/80 px-2.5 py-1.5 text-xs text-zinc-300 border border-zinc-800 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_STYLES).map(([st, cfg]) => (
              <option key={st} value={st}>
                {cfg.label} ({statusCounts[st] || 0})
              </option>
            ))}
          </select>
        </div>

        {/* Phase Header Badges */}
        {showPhaseHeaders && phaseSummary.length > 0 && (
          <div className="hidden lg:flex pointer-events-auto items-center gap-2 overflow-x-auto max-w-xl bg-zinc-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-zinc-800 text-xs">
            <span className="text-[11px] font-mono text-zinc-500 uppercase shrink-0">
              Phases:
            </span>
            {phaseSummary.map((p) => (
              <span
                key={p.phase}
                className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-300 bg-zinc-950/70 border border-zinc-800 px-2 py-0.5 rounded-md shrink-0"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                <span className="truncate max-w-[120px]">{p.phase}</span>
                <span className="text-zinc-500 font-bold">({p.count})</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView={fitViewOnInit}
        fitViewOptions={{ padding: 0.15, minZoom: 0.1, maxZoom: 1.5 }}
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#27272a"
        />

        {showControls && (
          <Controls
            className="!bg-zinc-900 !border-zinc-800 !rounded-xl !shadow-xl !fill-white"
            showInteractive={false}
          />
        )}

        {showMinimap && (
          <MiniMap
            className="!bg-zinc-950 !border-zinc-800 !rounded-xl !overflow-hidden !shadow-2xl"
            nodeColor={(n) => {
              const nd = n.data as KalpNodeData;
              const st = (nd?.node?.computed_status ||
                nd?.node?.status ||
                "not_started") as NodeStatus;
              return STATUS_STYLES[st]?.hex || "#71717a";
            }}
            maskColor="rgba(9, 9, 11, 0.75)"
          />
        )}

        {/* Bottom Legend Panel */}
        {showLegend && (
          <Panel position="bottom-left" className="!m-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/90 p-2 text-[11px] backdrop-blur-md shadow-xl text-zinc-300">
              <span className="font-mono text-zinc-500 text-[10px] uppercase font-bold mr-1">
                Status:
              </span>
              {(
                [
                  "ready",
                  "in_progress",
                  "completed",
                  "committed",
                  "blocked",
                  "failed",
                ] as NodeStatus[]
              ).map((st) => {
                const cfg = STATUS_STYLES[st];
                const count = statusCounts[st] || 0;
                const isSelected = statusFilter === st;

                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(isSelected ? "all" : st)}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-all ${
                      isSelected
                        ? "border-indigo-400 bg-indigo-500/20 text-white"
                        : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                    <span>{cfg.label}</span>
                    <span className="text-[10px] font-mono text-zinc-500 font-bold">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

/**
 * Graph component exported with ReactFlowProvider.
 */
export default function Graph(props: GraphProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
