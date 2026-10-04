"use client";

import { useState } from "react";
import { BuildGraphNode } from "@/types";

const INITIAL_NODES: BuildGraphNode[] = [
  {
    id: "node-1",
    title: "Supabase Schema & RLS",
    description:
      "PostgreSQL tables for projects, graphs, nodes, and Row-Level Security policies.",
    phase: "Phase 1: Foundation",
    type: "database",
    status: "ready",
    dependencies: [],
    estimatedHours: 4,
  },
  {
    id: "node-2",
    title: "Session & Auth Gateway",
    description:
      "Stateless JWT authentication and rate-limited API verification headers.",
    phase: "Phase 1: Foundation",
    type: "core",
    status: "ready",
    dependencies: [],
    estimatedHours: 3,
  },
  {
    id: "node-3",
    title: "LLM Graph Decomposition Engine",
    description:
      "Serverless prompt pipeline that breaks requirement docs into acyclic DAGs.",
    phase: "Phase 2: Core Engine",
    type: "api",
    status: "in_progress",
    dependencies: ["node-1", "node-2"],
    estimatedHours: 8,
  },
  {
    id: "node-4",
    title: "Zod Schema & Cycle Validator",
    description:
      "Strict payload parsing, cycle detection, and topological sorting validation.",
    phase: "Phase 2: Core Engine",
    type: "core",
    status: "ready",
    dependencies: ["node-1"],
    estimatedHours: 2,
  },
  {
    id: "node-5",
    title: "React Flow Dynamic Canvas",
    description:
      "Interactive visual DAG canvas with custom nodes, mini-map, and layout controls.",
    phase: "Phase 3: Interactive UI",
    type: "ui",
    status: "planned",
    dependencies: ["node-3", "node-4"],
    estimatedHours: 6,
  },
  {
    id: "node-6",
    title: "GitHub / Ticket Export Dispatcher",
    description:
      "Generates GitHub Issues, linear tickets, and PR scaffolds from graph steps.",
    phase: "Phase 3: Interactive UI",
    type: "integration",
    status: "planned",
    dependencies: ["node-5"],
    estimatedHours: 4,
  },
];

const STATUS_CONFIG = {
  ready: {
    label: "Ready to Build",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  in_progress: {
    label: "In Progress",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  },
  planned: {
    label: "Waiting Dependencies",
    color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  },
  blocked: {
    label: "Blocked",
    color: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  },
};

const TYPE_CONFIG = {
  database: {
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
  ui: {
    badge: "UI",
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

export default function GraphPreview() {
  const [selectedNode, setSelectedNode] = useState<BuildGraphNode>(
    INITIAL_NODES[2],
  );

  return (
    <section
      id="graph-preview"
      className="py-16 md:py-24 border-t border-zinc-900 bg-zinc-950/40"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-400">
              Interactive Graph Demo
            </div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Live Dependency Topology
            </h2>
            <p className="mt-2 text-sm text-zinc-400 max-w-xl">
              Inspect how Kalp.io orders prerequisites, identifies critical
              execution paths, and prevents circular blockers.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-zinc-400 bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Complete
              / Ready
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" /> In Progress
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-500" /> Pending
            </span>
          </div>
        </div>

        {/* Visual Graph Canvas Mockup */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main Nodes Flow */}
          <div className="lg:col-span-2 rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6 backdrop-blur-xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-3 right-4 text-[11px] font-mono text-zinc-500">
              DAG Visualizer — 6 Nodes, 5 Edges
            </div>

            <div className="space-y-6 mt-4">
              {/* Phase 1 */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  Phase 1: Foundation
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  {INITIAL_NODES.slice(0, 2).map((node) => {
                    const isSelected = selectedNode.id === node.id;
                    const status = STATUS_CONFIG[node.status];
                    const type = TYPE_CONFIG[node.type];
                    return (
                      <div
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className={`cursor-pointer rounded-xl border p-4 transition-all ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/10 scale-[1.02]"
                            : "border-zinc-800/90 bg-zinc-950/50 hover:border-zinc-700 hover:bg-zinc-900/40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold border ${type.color}`}
                          >
                            {type.badge}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.color}`}
                          >
                            {status.label}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-white">
                          {node.title}
                        </h4>
                        <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                          {node.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Connecting Flow Indicator */}
              <div className="flex items-center justify-center py-1">
                <div className="h-6 w-0.5 bg-gradient-to-b from-indigo-500 to-violet-500" />
              </div>

              {/* Phase 2 */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                  Phase 2: Core Engine
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  {INITIAL_NODES.slice(2, 4).map((node) => {
                    const isSelected = selectedNode.id === node.id;
                    const status = STATUS_CONFIG[node.status];
                    const type = TYPE_CONFIG[node.type];
                    return (
                      <div
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className={`cursor-pointer rounded-xl border p-4 transition-all ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/10 scale-[1.02]"
                            : "border-zinc-800/90 bg-zinc-950/50 hover:border-zinc-700 hover:bg-zinc-900/40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold border ${type.color}`}
                          >
                            {type.badge}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.color}`}
                          >
                            {status.label}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-white">
                          {node.title}
                        </h4>
                        <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                          {node.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Connecting Flow Indicator */}
              <div className="flex items-center justify-center py-1">
                <div className="h-6 w-0.5 bg-gradient-to-b from-violet-500 to-cyan-500" />
              </div>

              {/* Phase 3 */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  Phase 3: Interactive UI & Integration
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  {INITIAL_NODES.slice(4, 6).map((node) => {
                    const isSelected = selectedNode.id === node.id;
                    const status = STATUS_CONFIG[node.status];
                    const type = TYPE_CONFIG[node.type];
                    return (
                      <div
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className={`cursor-pointer rounded-xl border p-4 transition-all ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/10 scale-[1.02]"
                            : "border-zinc-800/90 bg-zinc-950/50 hover:border-zinc-700 hover:bg-zinc-900/40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold border ${type.color}`}
                          >
                            {type.badge}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.color}`}
                          >
                            {status.label}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-white">
                          {node.title}
                        </h4>
                        <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                          {node.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Node Inspector Panel */}
          <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/80 p-6 backdrop-blur-xl shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <span className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase">
                Node Inspector
              </span>
              <span className="text-xs font-mono text-indigo-400">
                {selectedNode.id}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {selectedNode.title}
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  {selectedNode.phase}
                </p>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Description
                </label>
                <p className="mt-1 text-sm text-zinc-300 leading-relaxed">
                  {selectedNode.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <span className="text-[10px] text-zinc-500 uppercase font-medium">
                    Estimated Time
                  </span>
                  <div className="text-base font-semibold text-white mt-1">
                    {selectedNode.estimatedHours} hours
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <span className="text-[10px] text-zinc-500 uppercase font-medium">
                    Type
                  </span>
                  <div className="text-base font-semibold text-indigo-300 capitalize mt-1">
                    {selectedNode.type}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Prerequisites ({selectedNode.dependencies.length})
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedNode.dependencies.length === 0 ? (
                    <span className="text-xs text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md">
                      Root node (No prerequisites)
                    </span>
                  ) : (
                    selectedNode.dependencies.map((depId) => {
                      const depNode = INITIAL_NODES.find((n) => n.id === depId);
                      return (
                        <button
                          key={depId}
                          onClick={() => depNode && setSelectedNode(depNode)}
                          className="rounded-md border border-indigo-500/30 bg-indigo-950/40 px-2.5 py-1 text-xs text-indigo-300 hover:border-indigo-400 transition-colors"
                        >
                          → {depNode?.title || depId}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  className="w-full rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white py-2.5 transition-colors border border-zinc-700"
                >
                  View Step Blueprint
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
