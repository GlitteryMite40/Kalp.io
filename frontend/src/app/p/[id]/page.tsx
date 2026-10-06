"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Graph from "@/components/Graph";
import NodePanel from "@/components/NodePanel";
import ExportMenu from "@/components/ExportMenu";
import RepoConnect from "@/components/RepoConnect";
import {
  api,
  ApiClientError,
  type ComputedNode,
  type NodeStatus,
  type ProjectGraphData,
} from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }> | { id: string };
}

export default function ProjectGraphPage({ params }: PageProps) {
  // Support both Next.js 15+ Promise params and unwrapped params
  const unwrappedParams =
    typeof (params as unknown as { then?: unknown })?.then === "function"
      ? use(params as Promise<{ id: string }>)
      : (params as { id: string });
  const routeParams = useParams();

  const projectId = (
    unwrappedParams?.id ||
    (routeParams?.id as string) ||
    ""
  ).trim();

  const [graphData, setGraphData] = useState<ProjectGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<ComputedNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isRunningStage, setIsRunningStage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const fetchGraph = async (id: string) => {
    if (!id) return;
    setIsLoading(true);
    setError(null);

    try {
      const data = await api.getProjectGraph(id);
      setGraphData(data);
      if (data.nodes.length > 0) {
        // Select first node if none selected, or keep currently selected if still in graph
        setSelectedNode((prev) => {
          if (!prev) return data.nodes[0];
          const exists = data.nodes.find(
            (n) => n.id === prev.id || n.node_key === prev.node_key,
          );
          return exists || data.nodes[0];
        });
      }
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load project graph.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    let ignore = false;

    Promise.resolve().then(() => {
      if (!ignore) {
        void fetchGraph(projectId);
      }
    });

    return () => {
      ignore = true;
    };
  }, [projectId]);

  const handleUpdateNodeStatus = async (
    nodeId: string,
    newStatus: NodeStatus,
  ) => {
    if (!projectId || !selectedNode) return;
    setIsUpdatingStatus(true);
    try {
      await api.updateNodeStatus(nodeId, { status: newStatus });
      // Refresh whole graph to recompute Ready / Blocked statuses across DAG
      const refreshed = await api.getProjectGraph(projectId);
      setGraphData(refreshed);
      const updated = refreshed.nodes.find(
        (n) => n.id === nodeId || n.node_key === nodeId,
      );
      if (updated) setSelectedNode(updated);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to update node status.";
      alert(msg);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleRunNextStage = async () => {
    if (!projectId) return;
    setIsRunningStage(true);
    try {
      await api.runNextProjectStage(projectId);
      await fetchGraph(projectId);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to run next pipeline stage.";
      alert(msg);
    } finally {
      setIsRunningStage(false);
    }
  };

  const selectNodeByKey = (key: string) => {
    if (!graphData) return;
    const target = graphData.nodes.find(
      (n) => n.node_key === key || n.id === key,
    );
    if (target) {
      setSelectedNode(target);
      setInspectorOpen(true);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Top Header / Project Bar */}
      <header className="z-30 flex h-14 w-full shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 group hover:opacity-90 transition-opacity"
            title="Return to Home"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-400 p-[1px]">
              <div className="flex h-full w-full items-center justify-center rounded-[7px] bg-zinc-950">
                <svg
                  className="h-4 w-4 text-indigo-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="18" cy="18" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M6 9v6" />
                  <path d="M9 6h6" />
                  <path d="m9 15 6-6" />
                </svg>
              </div>
            </div>
            <span className="hidden sm:inline font-bold tracking-tight text-white text-sm">
              Kalp<span className="text-indigo-400">.io</span>
            </span>
          </Link>

          <span className="text-zinc-600">/</span>

          {graphData ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-sm font-semibold text-white max-w-[200px] sm:max-w-xs md:max-w-md">
                {graphData.project.name || "Build Graph"}
              </span>

              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  graphData.project.status === "ready"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : graphData.project.status === "failed"
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                }`}
              >
                {graphData.project.status}
              </span>
            </div>
          ) : (
            <span className="text-xs text-zinc-400">Loading project...</span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {graphData && (
            <div className="hidden md:flex items-center gap-3 text-xs font-mono text-zinc-400 bg-zinc-900/60 px-3 py-1 rounded-lg border border-zinc-800">
              <span>
                <b className="text-white">{graphData.nodes.length}</b> Nodes
              </span>
              <span>•</span>
              <span>
                <b className="text-white">{graphData.edges.length}</b> Edges
              </span>
              <span>•</span>
              <span>
                <b className="text-emerald-400">
                  {
                    graphData.nodes.filter(
                      (n) => n.is_ready || n.status === "ready",
                    ).length
                  }
                </b>{" "}
                Ready
              </span>
            </div>
          )}

          {graphData && graphData.project.status === "generating" && (
            <button
              type="button"
              disabled={isRunningStage}
              onClick={handleRunNextStage}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {isRunningStage ? "Running..." : "Run Next Stage"}
            </button>
          )}

          {graphData && (
            <ExportMenu
              data={{
                project: graphData.project,
                nodes: graphData.nodes,
                edges: graphData.edges,
                requirements: graphData.requirements,
              }}
            />
          )}

          <button
            type="button"
            onClick={() => void fetchGraph(projectId)}
            disabled={isLoading}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
            title="Refresh Graph"
          >
            ↻
          </button>

          <button
            type="button"
            onClick={() => setInspectorOpen(!inspectorOpen)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              inspectorOpen
                ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
            }`}
            title="Toggle Node Inspector"
          >
            Inspector
          </button>
        </div>
      </header>

      {/* GitHub Repo Integration Banner */}
      {projectId && (
        <div className="z-20 border-b border-zinc-800/80 bg-zinc-950/60 px-4 py-2 backdrop-blur-md">
          <RepoConnect
            projectId={projectId}
            initialRepoInfo={
              graphData?.project?.repo_url
                ? {
                    repo_url: graphData.project.repo_url,
                  }
                : undefined
            }
          />
        </div>
      )}

      {/* Main Graph Area */}
      <div className="relative flex flex-1 w-full overflow-hidden">
        {/* Loading State */}
        {isLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="mt-4 text-sm font-medium text-zinc-300">
              Loading build graph topology...
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Fetching nodes, dependencies, and execution readiness
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-zinc-950 p-6 text-center">
            <div className="max-w-md rounded-2xl border border-rose-500/40 bg-rose-950/20 p-6 shadow-2xl">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 text-xl font-bold">
                !
              </div>
              <h3 className="mt-3 text-lg font-bold text-white">
                Unable to load graph
              </h3>
              <p className="mt-2 text-xs text-zinc-300 leading-relaxed">
                {error}
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => void fetchGraph(projectId)}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition-colors"
                >
                  Retry Loading
                </button>
                <Link
                  href="/"
                  className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
                >
                  Return to Home
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* React Flow Graph Canvas */}
        {graphData && (
          <div className="flex-1 h-full w-full relative">
            <Graph
              nodes={graphData.nodes}
              edges={graphData.edges}
              selectedNodeId={selectedNode?.id}
              onSelectNode={(node) => {
                setSelectedNode(node);
                setInspectorOpen(true);
              }}
              fitViewOnInit
            />
          </div>
        )}

        {/* Node Inspector Drawer / Sidebar */}
        <NodePanel
          node={selectedNode}
          isOpen={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
          onSelectNodeByKey={selectNodeByKey}
          onUpdateStatus={handleUpdateNodeStatus}
          isUpdatingStatus={isUpdatingStatus}
          allNodes={graphData?.nodes || []}
        />
      </div>
    </div>
  );
}
