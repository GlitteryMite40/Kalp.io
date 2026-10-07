"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { BuildGraphNode, NodeStatus, NODE_STATUS_LABELS } from "@/types";
import { copyToClipboard } from "@/lib/clipboard";

interface NodeBlueprint {
  key: string;
  files: string[];
  acceptance: string[];
  tests: string[];
  purposeDetail: string;
}

const BLUEPRINTS: Record<string, NodeBlueprint> = {
  "node-1": {
    key: "01.1",
    purposeDetail:
      "Provision the PostgreSQL relational schema in Supabase to persist project graphs, nodes, and prerequisite edges with strict multi-tenant Row-Level Security.",
    files: [
      "supabase/migrations/20261001_initial_schema.sql",
      "backend/src/lib/supabase.ts",
      "backend/tests/schema.test.ts",
    ],
    acceptance: [
      "Create projects, nodes, edges, and webhooks tables with UUID primary keys.",
      "Apply foreign key cascade constraints between projects and dependent node entities.",
      "Enable Row-Level Security (RLS) policies restricting queries to the authenticated owner session.",
      "Index nodes(project_id) and edges(source_node_id, target_node_id) for high-speed DAG traversal.",
    ],
    tests: ["npx supabase test db", "npm run test:schema"],
  },
  "node-2": {
    key: "01.2",
    purposeDetail:
      "Establish stateless HMAC session token issuance and verification middleware to protect API routes and prevent cross-tenant data leaks.",
    files: [
      "backend/src/middleware/auth.ts",
      "backend/src/lib/session.ts",
      "backend/tests/auth.test.ts",
    ],
    acceptance: [
      "Implement stateless HMAC-SHA256 session token generation and verification.",
      "Attach authenticated workspace owner context to downstream Next.js API requests.",
      "Enforce IP and token bucket rate limits on unauthenticated endpoints.",
    ],
    tests: ["npm run test:auth", "curl -I http://localhost:3000/api/projects"],
  },
  "node-3": {
    key: "02.1",
    purposeDetail:
      "Implement the serverless LLM decomposition prompt pipeline that takes raw project ideas, deconstructs them into sequential phases, and outputs acyclic task dependencies.",
    files: [
      "backend/src/server/llm.ts",
      "backend/src/prompts/decomposition.ts",
      "backend/tests/llm.test.ts",
    ],
    acceptance: [
      "Structure system prompt enforcing topological phase hierarchy and acyclic prerequisite edges.",
      "Stream response chunks with structured JSON output schema matching Zod contracts.",
      "Fallback gracefully to deterministic template graph if LLM quota is exhausted.",
    ],
    tests: ["npm run test:llm-pipeline", "vitest run backend/tests/llm.test.ts"],
  },
  "node-4": {
    key: "02.2",
    purposeDetail:
      "Build strict compile-time and runtime validation with Zod, Kahn's algorithm cycle detection, and automated stage progress tracking.",
    files: [
      "backend/src/server/validate.ts",
      "backend/src/lib/dag.ts",
      "backend/tests/validation.test.ts",
    ],
    acceptance: [
      "Implement Kahn's algorithm topological sorting to detect cyclic dependency deadlocks.",
      "Validate all incoming and synthesized node payloads against strict Zod schemas.",
      "Compute node readiness: unblock nodes only when all prerequisite parents are marked completed.",
    ],
    tests: ["npm run test:cycle-detection", "npm run test:validation"],
  },
  "node-5": {
    key: "03.1",
    purposeDetail:
      "Create the interactive build graph canvas using React Flow, custom phase grouping, reactive node statuses, and mini-map layout navigation.",
    files: [
      "frontend/src/components/GraphCanvas.tsx",
      "frontend/src/components/CustomNode.tsx",
      "frontend/src/lib/graph.ts",
    ],
    acceptance: [
      "Mount React Flow (@xyflow/react) canvas with smooth pan, zoom, and viewport centering.",
      "Render custom node components reflecting real-time status badges and phase colors.",
      "Animate SVG edges along active build execution paths with interactive node selection.",
    ],
    tests: ["npm run test:graph", "npx playwright test flow.spec.ts"],
  },
  "node-6": {
    key: "03.2",
    purposeDetail:
      "Provide client-side export capabilities for plans into portable JSON formats and structured Markdown checklists for GitHub PRs and linear trackers.",
    files: [
      "frontend/src/lib/export.ts",
      "frontend/src/components/ExportMenu.tsx",
      "frontend/tests/export.test.ts",
    ],
    acceptance: [
      "Export full graph plan to structured kalp-plan-v1 JSON specification.",
      "Generate GitHub Markdown checklist grouped by phase with task dependencies.",
      "Enable direct clipboard copy and file download in browser with zero server roundtrips.",
    ],
    tests: ["npm run test:export", "npm run test:unit"],
  },
};

function formatBlueprintPrompt(
  node: BuildGraphNode,
  blueprint: NodeBlueprint,
): string {
  const deps =
    node.dependencies.length > 0
      ? node.dependencies.map((d) => `- ${d}`).join("\n")
      : "- None (Root Foundation)";

  const files = blueprint.files.map((f) => `- \`${f}\``).join("\n");
  const acceptance = blueprint.acceptance.map((a) => `- [ ] ${a}`).join("\n");
  const tests = blueprint.tests.map((t) => `$ ${t}`).join("\n");

  return `# TASK: [${blueprint.key}] ${node.title}
PHASE: ${node.phase}
TYPE: ${node.type}
ESTIMATED TIME: ${node.estimatedHours || 4} hours

## PURPOSE & CONTEXT
${blueprint.purposeDetail}

## PREREQUISITES & DEPENDENCIES
${deps}

## TARGET FILES & MODULES
${files}

## ACCEPTANCE CRITERIA
${acceptance}

## VERIFICATION & TESTS
\`\`\`bash
${tests}
\`\`\`
`;
}

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
    status: "not_started",
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
    status: "not_started",
    dependencies: ["node-5"],
    estimatedHours: 4,
  },
];

const STATUS_CONFIG: Record<
  NodeStatus,
  {
    label: string;
    color: string;
    dot: string;
  }
> = {
  not_started: {
    label: NODE_STATUS_LABELS.not_started,
    color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
    dot: "bg-zinc-500",
  },
  ready: {
    label: NODE_STATUS_LABELS.ready,
    color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    dot: "bg-cyan-400",
  },
  in_progress: {
    label: NODE_STATUS_LABELS.in_progress,
    color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    dot: "bg-amber-400",
  },
  committed: {
    label: NODE_STATUS_LABELS.committed,
    color: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    dot: "bg-violet-400",
  },
  completed: {
    label: NODE_STATUS_LABELS.completed,
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  blocked: {
    label: NODE_STATUS_LABELS.blocked,
    color: "bg-zinc-500/10 text-zinc-500/70 border-zinc-500/20 opacity-70",
    dot: "bg-zinc-600 opacity-60",
  },
  failed: {
    label: NODE_STATUS_LABELS.failed,
    color: "bg-red-500/10 text-red-400 border-red-500/30",
    dot: "bg-red-400",
  },
  needs_review: {
    label: NODE_STATUS_LABELS.needs_review,
    color: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    dot: "bg-orange-400",
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
  const [isBlueprintOpen, setIsBlueprintOpen] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"spec" | "prompt">("spec");

  const currentBlueprint = useMemo(
    () =>
      BLUEPRINTS[selectedNode.id] || {
        key: selectedNode.id.replace("node-", "01."),
        purposeDetail: selectedNode.description,
        files: ["src/index.ts"],
        acceptance: ["Implement node requirements cleanly."],
        tests: ["npm test"],
      },
    [selectedNode.id, selectedNode.description],
  );

  const handleCopyPrompt = useCallback(async () => {
    const markdown = formatBlueprintPrompt(selectedNode, currentBlueprint);
    const res = await copyToClipboard(markdown);
    if (res.success) {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  }, [selectedNode, currentBlueprint]);

  const handleCopyFile = (file: string) => {
    void copyToClipboard(file);
    setCopiedFile(file);
    setTimeout(() => setCopiedFile(null), 1500);
  };

  useEffect(() => {
    if (!isBlueprintOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsBlueprintOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBlueprintOpen]);

  return (
    <section
      id="graph-preview"
      className="py-16 md:py-24 border-t border-zinc-900 bg-zinc-950/40 scroll-mt-16"
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

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#try-demo"
              onClick={(e) => {
                e.preventDefault();
                const target = document.getElementById("try-demo");
                if (target) {
                  target.scrollIntoView({ behavior: "smooth" });
                  const input = document.getElementById("idea-input");
                  if (input) {
                    setTimeout(() => input.focus(), 350);
                  }
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/10 px-3.5 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all active:scale-95"
            >
              <span>Build Your Own Graph ↑</span>
            </a>
            <div className="flex items-center gap-3 text-xs text-zinc-400 bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${STATUS_CONFIG.ready.dot}`}
              />{" "}
              {NODE_STATUS_LABELS.ready}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${STATUS_CONFIG.in_progress.dot}`}
              />{" "}
              {NODE_STATUS_LABELS.in_progress}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${STATUS_CONFIG.not_started.dot}`}
              />{" "}
              {NODE_STATUS_LABELS.not_started}
            </span>
          </div>
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
                            {NODE_STATUS_LABELS[node.status]}
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
                            {NODE_STATUS_LABELS[node.status]}
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
                            {NODE_STATUS_LABELS[node.status]}
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
                  id="view-step-blueprint-btn"
                  onClick={() => {
                    setIsBlueprintOpen(true);
                    setCopiedPrompt(false);
                    setActiveTab("spec");
                  }}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-xs font-semibold text-white py-2.5 transition-all shadow-md shadow-indigo-500/25 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg
                    className="h-4 w-4 text-indigo-200"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span>View Step Blueprint</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step Blueprint Modal */}
      {isBlueprintOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="blueprint-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsBlueprintOpen(false);
            }
          }}
        >
          <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-left">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 p-4 sm:px-6 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md border border-indigo-500/40 bg-indigo-500/20 text-indigo-300 shrink-0">
                  [{currentBlueprint.key}]
                </span>
                <div className="min-w-0">
                  <h3
                    id="blueprint-modal-title"
                    className="text-base sm:text-lg font-bold text-white truncate"
                  >
                    {selectedNode.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400 font-mono">
                    <span>{selectedNode.phase}</span>
                    <span>•</span>
                    <span className="capitalize text-indigo-400">
                      {selectedNode.type}
                    </span>
                    <span>•</span>
                    <span>{selectedNode.estimatedHours || 4}h</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                    STATUS_CONFIG[selectedNode.status].color
                  }`}
                >
                  {NODE_STATUS_LABELS[selectedNode.status]}
                </span>
                <button
                  type="button"
                  onClick={() => setIsBlueprintOpen(false)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                  aria-label="Close modal"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Subheader / Tab Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/30 px-4 sm:px-6 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("spec")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                    activeTab === "spec"
                      ? "bg-zinc-800 text-white font-semibold shadow-sm"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                >
                  Specification & Criteria
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("prompt")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                    activeTab === "prompt"
                      ? "bg-zinc-800 text-white font-semibold shadow-sm"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                >
                  Agent Prompt (Markdown)
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyPrompt}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all active:scale-95 cursor-pointer ${
                  copiedPrompt
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                }`}
              >
                {copiedPrompt ? (
                  <>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Copied Prompt! ✓</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <span>Copy Blueprint Prompt</span>
                  </>
                )}
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-sm text-zinc-300">
              {activeTab === "spec" ? (
                <>
                  {/* Context & Purpose */}
                  <div>
                    <h4 className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-400 mb-2">
                      Purpose & Architecture Context
                    </h4>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-xs sm:text-sm leading-relaxed text-zinc-200">
                      {currentBlueprint.purposeDetail}
                    </div>
                  </div>

                  {/* Prerequisites */}
                  <div>
                    <h4 className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-400 mb-2">
                      Prerequisites ({selectedNode.dependencies.length})
                    </h4>
                    {selectedNode.dependencies.length === 0 ? (
                      <div className="text-xs text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl">
                        Root node — this task has zero prerequisites and can execute immediately.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedNode.dependencies.map((depId) => {
                          const dep = INITIAL_NODES.find((n) => n.id === depId);
                          return (
                            <button
                              key={depId}
                              type="button"
                              onClick={() => dep && setSelectedNode(dep)}
                              className="rounded-lg border border-indigo-500/30 bg-indigo-950/30 px-3 py-1.5 text-xs text-indigo-300 hover:border-indigo-400 hover:bg-indigo-900/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>→ {dep?.title || depId}</span>
                              <span className="text-[10px] text-zinc-400 font-mono">
                                ({dep ? NODE_STATUS_LABELS[dep.status] : ""})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Target Files */}
                  <div>
                    <h4 className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-400 mb-2">
                      Target Files / Modules ({currentBlueprint.files.length})
                    </h4>
                    <div className="space-y-1.5">
                      {currentBlueprint.files.map((file) => (
                        <div
                          key={file}
                          className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 font-mono text-xs text-zinc-300"
                        >
                          <span className="truncate">{file}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyFile(file)}
                            className="text-[10px] text-zinc-400 hover:text-white px-2 py-0.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer shrink-0 ml-2"
                          >
                            {copiedFile === file ? "Copied" : "Copy"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Acceptance Criteria */}
                  <div>
                    <h4 className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-400 mb-2">
                      Acceptance Criteria ({currentBlueprint.acceptance.length})
                    </h4>
                    <div className="space-y-2">
                      {currentBlueprint.acceptance.map((crit, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs sm:text-sm text-zinc-300"
                        >
                          <span className="text-emerald-400 font-bold shrink-0 mt-0.5">
                            ✓
                          </span>
                          <span>{crit}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Verification & Tests */}
                  <div>
                    <h4 className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-400 mb-2">
                      Verification & Tests
                    </h4>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-1.5 font-mono text-xs">
                      {currentBlueprint.tests.map((test, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-zinc-300">
                          <span className="text-indigo-400 select-none">$</span>
                          <span>{test}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* Raw Prompt / Markdown View */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>
                      Copy and paste this structured prompt into your AI coding tool:
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                    >
                      {copiedPrompt ? "Copied! ✓" : "Copy full markdown"}
                    </button>
                  </div>
                  <pre className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[480px]">
                    {formatBlueprintPrompt(selectedNode, currentBlueprint)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-zinc-800 bg-zinc-900/60 p-4 sm:px-6 shrink-0">
              <button
                type="button"
                onClick={() => setIsBlueprintOpen(false)}
                className="rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                {copiedPrompt ? "Copied! ✓" : "Copy Blueprint"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
