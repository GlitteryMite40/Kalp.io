"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import GraphPreview from "@/components/GraphPreview";
import FeaturesGrid from "@/components/FeaturesGrid";
import Footer from "@/components/Footer";
import {
  api,
  ApiClientError,
  type ComputedNode,
  type NodeStatus,
  type PipelineStage,
  type ProjectGraphData,
} from "@/lib/api";

import {
  MAX_UPLOAD_SIZE_BYTES,
  MAX_CHAR_LIMIT,
  MIN_CHAR_LIMIT,
  validateProjectIdea,
  validateUploadFile,
} from "@/lib/validation";

export {
  MAX_UPLOAD_SIZE_BYTES,
  MAX_CHAR_LIMIT,
  MIN_CHAR_LIMIT,
  validateProjectIdea,
  validateUploadFile,
};

const SAMPLE_PROMPTS = [
  "Multi-tenant SaaS with Supabase, Stripe billing & audit logs",
  "Real-time multiplayer collaborative canvas using WebSockets",
  "AI-powered code review agent with GitHub webhook integration",
  "E-commerce microservices with inventory sync & Redis cache",
];

const STAGES: {
  id: PipelineStage;
  label: string;
  description: string;
}[] = [
  {
    id: "requirements",
    label: "1. Requirements Extraction",
    description:
      "Extracting structured requirements & functional specifications",
  },
  {
    id: "architecture",
    label: "2. Architecture Synthesis",
    description: "Synthesizing architectural patterns, data flow & tech stack",
  },
  {
    id: "decomposition",
    label: "3. Graph Decomposition",
    description: "Deconstructing into acyclic build nodes and dependency edges",
  },
  {
    id: "criteria",
    label: "4. Criteria & Tests",
    description:
      "Generating verifiable acceptance criteria, test cases & prompts",
  },
];

const STATUS_CONFIG: Record<
  NodeStatus,
  { label: string; color: string; dot: string }
> = {
  not_started: {
    label: "Not Started",
    color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
    dot: "bg-zinc-500",
  },
  ready: {
    label: "Ready",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  in_progress: {
    label: "In Progress",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    dot: "bg-amber-400",
  },
  committed: {
    label: "Committed",
    color: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    dot: "bg-violet-400",
  },
  completed: {
    label: "Completed",
    color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    dot: "bg-cyan-400",
  },
  blocked: {
    label: "Blocked",
    color: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    dot: "bg-rose-400",
  },
  failed: {
    label: "Failed",
    color: "bg-red-500/10 text-red-400 border-red-500/30",
    dot: "bg-red-400",
  },
  needs_review: {
    label: "Needs Review",
    color: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    dot: "bg-orange-400",
  },
};

export default function Home() {
  const [idea, setIdea] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pipelineState, setPipelineState] = useState<
    "idle" | "creating" | "running" | "completed" | "failed"
  >("idle");
  const [currentStage, setCurrentStage] = useState<PipelineStage | null>(null);
  const [completedStages, setCompletedStages] = useState<PipelineStage[]>([]);
  const [graphData, setGraphData] = useState<ProjectGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<ComputedNode | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const executePipeline = async (targetProjectId: string) => {
    setPipelineState("running");
    setApiError(null);

    try {
      let done = false;
      let guard = 0;
      while (!done && guard < 10) {
        guard++;
        const result = await api.runNextProjectStage(targetProjectId);
        if (result.stage) {
          setCurrentStage(result.stage);
          setCompletedStages((prev) =>
            prev.includes(result.stage!) ? prev : [...prev, result.stage!],
          );
        }
        if (result.done) {
          done = true;
          break;
        }
      }

      // Graph generation completed, fetch fresh graph
      const graphResult = await api.getProjectGraph(targetProjectId);
      setGraphData(graphResult);
      if (graphResult.nodes.length > 0) {
        setSelectedNode(graphResult.nodes[0]);
      }
      setCompletedStages([
        "requirements",
        "architecture",
        "decomposition",
        "criteria",
      ]);
      setPipelineState("completed");
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "An error occurred while generating the build graph.";
      setApiError(message);
      setPipelineState("failed");
    }
  };

  const resumeProject = async (activeProjectId: string) => {
    setIsResuming(true);
    setApiError(null);
    setProjectId(activeProjectId);
    try {
      const graph = await api.getProjectGraph(activeProjectId);
      if (graph.project.status === "ready") {
        setGraphData(graph);
        if (graph.nodes.length > 0) {
          setSelectedNode(graph.nodes[0]);
        }
        setCompletedStages([
          "requirements",
          "architecture",
          "decomposition",
          "criteria",
        ]);
        setPipelineState("completed");
        setIsResuming(false);
        return;
      }

      if (graph.project.status === "failed") {
        setApiError(
          "Previous generation was interrupted or failed. You can retry the stage or start over.",
        );
        setPipelineState("failed");
        setIsResuming(false);
        return;
      }

      // Project is still generating -> resolve completed stages
      const stageOrder: PipelineStage[] = [
        "requirements",
        "architecture",
        "decomposition",
        "criteria",
      ];
      const curStage = graph.project.current_stage as PipelineStage | null;
      if (curStage) {
        const idx = stageOrder.indexOf(curStage);
        if (idx >= 0) {
          setCompletedStages(stageOrder.slice(0, idx + 1));
          setCurrentStage(curStage);
        }
      }

      setIsResuming(false);
      await executePipeline(activeProjectId);
    } catch {
      if (typeof window !== "undefined") {
        localStorage.removeItem("kalp_active_project_id");
      }
      setProjectId(null);
      setPipelineState("idle");
      setIsResuming(false);
    }
  };

  const handleStartNewProject = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("kalp_active_project_id");
      const url = new URL(window.location.href);
      url.searchParams.delete("projectId");
      window.history.replaceState(null, "", url.pathname);
    }
    setProjectId(null);
    setPipelineState("idle");
    setGraphData(null);
    setSelectedNode(null);
    setCompletedStages([]);
    setCurrentStage(null);
    setIdea("");
    setUploadedFileName(null);
    setValidationError(null);
    setFileError(null);
    setApiError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Resume active project on explicit URL search param or handle hash / home navigation
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const paramProjectId = urlParams.get("projectId");

    // Only auto-resume if explicitly passed in URL query param
    if (paramProjectId) {
      Promise.resolve().then(() => {
        void resumeProject(paramProjectId);
      });
    }

    const scrollToHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash) {
        setTimeout(() => {
          const el = document.getElementById(hash);
          if (el) {
            el.scrollIntoView({ behavior: "smooth" });
            if (hash === "try-demo" || hash === "build-graph") {
              document.getElementById("idea-input")?.focus();
            }
          }
        }, 150);
      }
    };

    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);

    const onNavHome = () => {
      handleStartNewProject();
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => {
        document.getElementById("idea-input")?.focus();
      }, 100);
    };

    window.addEventListener("kalp:navigate-home", onNavHome);

    return () => {
      window.removeEventListener("hashchange", scrollToHash);
      window.removeEventListener("kalp:navigate-home", onNavHome);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setValidationError(null);

    const validation = validateUploadFile(file);
    if (!validation.valid) {
      setFileError(validation.error);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    try {
      const content = await file.text();
      setIdea(content);
      setUploadedFileName(file.name);
      setFileError(null);
    } catch {
      setFileError("Failed to read the uploaded file. Please try again.");
    }
  };

  const handleRemoveFile = () => {
    setUploadedFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setFileError(null);
    setApiError(null);

    const validation = validateProjectIdea(idea);
    if (!validation.valid) {
      setValidationError(validation.error);
      return;
    }

    setIsSubmitting(true);
    setPipelineState("creating");
    try {
      const project = await api.createProject({ idea: idea.trim() });
      setProjectId(project.id);

      if (typeof window !== "undefined") {
        localStorage.setItem("kalp_active_project_id", project.id);
        const url = new URL(window.location.href);
        url.searchParams.set("projectId", project.id);
        window.history.pushState(null, "", url.toString());
      }

      setIsSubmitting(false);
      await executePipeline(project.id);
    } catch (err) {
      setIsSubmitting(false);
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to create project.";
      setApiError(message);
      setPipelineState("idle");
    }
  };

  const handleUpdateNodeStatus = async (
    nodeId: string,
    newStatus: NodeStatus,
  ) => {
    if (!projectId) return;
    setUpdatingStatus(true);
    try {
      await api.updateNodeStatus(nodeId, { status: newStatus });
      const refreshed = await api.getProjectGraph(projectId);
      setGraphData(refreshed);
      const updated = refreshed.nodes.find((n) => n.id === nodeId);
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
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Navbar />

      <main className="flex-1">
        {/* Loading existing session banner */}
        {isResuming && (
          <div className="bg-indigo-600/20 border-b border-indigo-500/30 px-4 py-2.5 text-center text-xs text-indigo-300">
            Resuming your build graph session...
          </div>
        )}

        {/* 1. IDLE STATE: Hero & Input Form */}
        {pipelineState === "idle" && (
          <section
            id="build-graph"
            className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 scroll-mt-16"
          >
            <div
              className="pointer-events-none absolute -top-40 left-1/2 -z-10 -translate-x-1/2 blur-3xl"
              aria-hidden="true"
            >
              <div className="aspect-[1155/678] w-[72.1875rem] bg-gradient-to-tr from-indigo-600/30 via-violet-600/20 to-cyan-500/30 opacity-40" />
            </div>

            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
              {/* Pill Badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300">
                <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                Autonomous Software Architecture Engine
              </div>

              {/* Headline */}
              <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl sm:leading-[1.15]">
                Turn Any Project Idea into a{" "}
                <span className="bg-gradient-to-r from-indigo-400 via-violet-300 to-cyan-400 bg-clip-text text-transparent">
                  Dependency-Aware Build Graph
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-base text-zinc-300 sm:text-lg font-normal leading-relaxed">
                Deconstruct complex systems into precise modules, prerequisite
                chains, and critical execution paths before writing a single
                line of code.
              </p>

              {/* Form Box */}
              <div
                id="try-demo"
                className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 sm:p-6 shadow-2xl backdrop-blur-xl text-left scroll-mt-24"
              >
                <form onSubmit={handleSubmit}>
                  <div className="flex items-center justify-between mb-2">
                    <label
                      htmlFor="idea-input"
                      className="text-xs font-semibold uppercase tracking-wider text-zinc-400"
                    >
                      Project Description or Spec
                    </label>
                    <span className="text-xs text-zinc-500">
                      {idea.length.toLocaleString()} /{" "}
                      {MAX_CHAR_LIMIT.toLocaleString()} chars
                    </span>
                  </div>

                  <textarea
                    id="idea-input"
                    rows={6}
                    value={idea}
                    onChange={(e) => {
                      setIdea(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    placeholder="Describe your software project idea in detail (e.g. core features, target users, preferred tech stack, architecture requirements)... or upload a spec file below."
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all resize-y"
                  />

                  {/* Upload Controls & Actions */}
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-zinc-800/80 pt-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label
                        htmlFor="file-upload"
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:border-indigo-500/50 hover:bg-zinc-800 hover:text-white cursor-pointer transition-all active:scale-95"
                      >
                        <svg
                          className="h-4 w-4 text-indigo-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span>Upload Spec (.txt, .md)</span>
                      </label>
                      <input
                        id="file-upload"
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.md,text/plain,text/markdown"
                        onChange={handleFileUpload}
                        className="sr-only"
                      />

                      <span className="text-[11px] text-zinc-500">
                        Max file size: 4.5 MB (Vercel request limit)
                      </span>

                      {uploadedFileName && (
                        <div className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-300">
                          <span className="truncate max-w-[200px]">
                            {uploadedFileName}
                          </span>
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="text-zinc-400 hover:text-white font-bold ml-1"
                            title="Remove file"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-violet-500 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          <span>Initializing...</span>
                        </>
                      ) : (
                        <>
                          <span>Generate Graph</span>
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M5 12h14" />
                            <path d="m12 5 7 7-7 7" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Oversized File Error */}
                  {fileError && (
                    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
                      <svg
                        className="h-4 w-4 shrink-0 text-rose-400 mt-0.5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div>
                        <span className="font-semibold">Upload rejected:</span>{" "}
                        {fileError}
                      </div>
                    </div>
                  )}

                  {/* Empty Input Validation Error */}
                  {validationError && (
                    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
                      <svg
                        className="h-4 w-4 shrink-0 text-amber-400 mt-0.5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div>
                        <span className="font-semibold">Validation:</span>{" "}
                        {validationError}
                      </div>
                    </div>
                  )}

                  {/* API Error Alert */}
                  {apiError && (
                    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
                      <svg
                        className="h-4 w-4 shrink-0 text-rose-400 mt-0.5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div>
                        <span className="font-semibold">API Error:</span>{" "}
                        {apiError}
                      </div>
                    </div>
                  )}
                </form>

                {/* Example Prompts */}
                <div className="mt-4 flex flex-wrap items-center gap-1.5 pt-3 border-t border-zinc-800 text-xs">
                  <span className="text-zinc-500 font-medium mr-1">
                    Try example:
                  </span>
                  {SAMPLE_PROMPTS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setIdea(sample);
                        if (validationError) setValidationError(null);
                      }}
                      className="rounded-md border border-zinc-800/80 bg-zinc-950/60 px-2 py-1 text-zinc-400 hover:border-indigo-500/40 hover:text-zinc-200 transition-all truncate max-w-[280px]"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 2. RUNNING OR FAILED STATE: Stage Progress Tracker */}
        {(pipelineState === "running" || pipelineState === "failed") && (
          <section className="py-16 md:py-24">
            <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
              <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/80 p-6 md:p-8 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                      AI Build Pipeline
                    </span>
                    <h2 className="text-xl font-bold text-white mt-1">
                      {pipelineState === "failed"
                        ? "Pipeline Paused"
                        : "Synthesizing Dependency Graph"}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      {pipelineState === "failed"
                        ? "A stage encountered an issue. You can retry the stage or start over."
                        : "Executing autonomous architectural stages sequentially with Zod validation."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {pipelineState === "running" ? (
                      <>
                        <span className="flex h-2.5 w-2.5 rounded-full bg-indigo-500 animate-ping" />
                        <span className="text-xs font-mono text-indigo-300">
                          Running
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-mono text-rose-400 border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 rounded">
                        Failed
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                  <div className="flex justify-between text-xs text-zinc-400 mb-2">
                    <span>Stage Completion</span>
                    <span>
                      {completedStages.length} of {STAGES.length} stages
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 transition-all duration-500 rounded-full"
                      style={{
                        width: `${(completedStages.length / STAGES.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Stage Steps */}
                <div className="space-y-4">
                  {STAGES.map((stage) => {
                    const isCompleted = completedStages.includes(stage.id);
                    const isRunning = currentStage === stage.id && !isCompleted;
                    const isFailed = pipelineState === "failed" && isRunning;

                    return (
                      <div
                        key={stage.id}
                        className={`flex items-start gap-4 rounded-xl border p-4 transition-all ${
                          isFailed
                            ? "border-rose-500/60 bg-rose-950/20"
                            : isRunning
                              ? "border-indigo-500/70 bg-indigo-950/20 shadow-lg shadow-indigo-500/10"
                              : isCompleted
                                ? "border-emerald-500/30 bg-emerald-950/10"
                                : "border-zinc-800/80 bg-zinc-950/40 opacity-70"
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isCompleted ? (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 font-bold">
                              <svg
                                className="h-3.5 w-3.5"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                          ) : isFailed ? (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white font-bold text-xs">
                              !
                            </div>
                          ) : isRunning ? (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                          ) : (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-500">
                              •
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-white">
                              {stage.label}
                            </h4>
                            <span
                              className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full border ${
                                isCompleted
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                                  : isFailed
                                    ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                                    : isRunning
                                      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-400 animate-pulse"
                                      : "border-zinc-800 bg-zinc-900 text-zinc-500"
                              }`}
                            >
                              {isCompleted
                                ? "Completed"
                                : isFailed
                                  ? "Failed"
                                  : isRunning
                                    ? "Running..."
                                    : "Pending"}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 mt-1">
                            {stage.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Error Banner with Retry */}
                {apiError && (
                  <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300">
                    <div className="flex items-start gap-2.5">
                      <svg
                        className="h-4 w-4 shrink-0 text-rose-400 mt-0.5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div>
                        <span className="font-semibold">Pipeline Error:</span>{" "}
                        {apiError}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {projectId && (
                        <button
                          type="button"
                          onClick={() => executePipeline(projectId)}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition-colors"
                        >
                          Retry Stage
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleStartNewProject}
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                      >
                        Start Over
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 3. COMPLETED STATE: Generated Build Graph Display */}
        {pipelineState === "completed" && graphData && (
          <section id="build-graph" className="py-12 md:py-16 scroll-mt-16">
            <div id="graph-preview" className="sr-only" />
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {/* Project Header Banner */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-xl mb-8">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                      Build Graph Ready
                    </span>
                    <span className="text-xs font-mono text-zinc-500">
                      ID: {graphData.project_id.slice(0, 8)}...
                    </span>
                  </div>
                  <h2 className="text-2xl font-extrabold text-white">
                    {graphData.project.name}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1 max-w-2xl line-clamp-2">
                    {graphData.project.idea}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-4 text-xs font-mono text-zinc-400 bg-zinc-950/80 px-3.5 py-2 rounded-xl border border-zinc-800">
                    <div>
                      <span className="text-white font-bold">
                        {graphData.nodes.length}
                      </span>{" "}
                      Nodes
                    </div>
                    <div>
                      <span className="text-white font-bold">
                        {graphData.edges.length}
                      </span>{" "}
                      Edges
                    </div>
                    <div>
                      <span className="text-white font-bold">
                        {graphData.requirements.length}
                      </span>{" "}
                      Specs
                    </div>
                  </div>
                  <Link
                    href={`/p/${graphData.project_id}`}
                    className="rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 hover:from-indigo-400 hover:to-violet-500 transition-all flex items-center gap-1.5"
                  >
                    Open Full Graph →
                  </Link>
                  <button
                    type="button"
                    onClick={handleStartNewProject}
                    className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors"
                  >
                    + New Project
                  </button>
                </div>
              </div>

              {/* Graph Grid & Inspector */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Node List View */}
                <div className="lg:col-span-2 rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6 backdrop-blur-xl shadow-2xl space-y-6">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <span className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase">
                      Build Graph DAG Topology
                    </span>
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />{" "}
                        Ready
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-rose-400" />{" "}
                        Blocked
                      </span>
                    </div>
                  </div>

                  {graphData.nodes.length === 0 ? (
                    <div className="py-12 text-center text-sm text-zinc-500">
                      No build nodes found for this project.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {graphData.nodes.map((node) => {
                        const isSelected = selectedNode?.id === node.id;
                        const statusInfo =
                          STATUS_CONFIG[node.status] ||
                          STATUS_CONFIG.not_started;

                        return (
                          <div
                            key={node.id}
                            onClick={() => setSelectedNode(node)}
                            className={`cursor-pointer rounded-xl border p-4 transition-all ${
                              isSelected
                                ? "border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/10 scale-[1.01]"
                                : "border-zinc-800/90 bg-zinc-950/50 hover:border-zinc-700 hover:bg-zinc-900/40"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-mono font-bold border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
                                {node.node_key}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusInfo.color}`}
                              >
                                {statusInfo.label}
                              </span>
                            </div>

                            <h4 className="text-sm font-semibold text-white truncate">
                              {node.title}
                            </h4>
                            <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                              {node.explanation || node.phase}
                            </p>

                            <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2 text-[10px] text-zinc-500 font-mono">
                              <span>Phase: {node.phase}</span>
                              {node.is_blocked ? (
                                <span className="text-rose-400 font-semibold">
                                  Blocked by ({node.blocked_by.length})
                                </span>
                              ) : (
                                <span className="text-emerald-400 font-semibold">
                                  Ready
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Node Inspector Panel */}
                <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/80 p-6 backdrop-blur-xl shadow-xl">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
                    <span className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase">
                      Node Inspector
                    </span>
                    {selectedNode && (
                      <span className="text-xs font-mono text-indigo-400">
                        {selectedNode.node_key}
                      </span>
                    )}
                  </div>

                  {selectedNode ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          {selectedNode.title}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {selectedNode.phase}
                        </p>
                      </div>

                      {/* Status row & interactive changer */}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-400 font-medium">
                            Current Status
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                              STATUS_CONFIG[selectedNode.status]?.color ||
                              STATUS_CONFIG.not_started.color
                            }`}
                          >
                            {STATUS_CONFIG[selectedNode.status]?.label ||
                              selectedNode.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            type="button"
                            disabled={updatingStatus || selectedNode.is_blocked}
                            onClick={() =>
                              handleUpdateNodeStatus(
                                selectedNode.id,
                                "in_progress",
                              )
                            }
                            className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors"
                          >
                            Start
                          </button>
                          <button
                            type="button"
                            disabled={updatingStatus || selectedNode.is_blocked}
                            onClick={() =>
                              handleUpdateNodeStatus(
                                selectedNode.id,
                                "completed",
                              )
                            }
                            className="flex-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 transition-colors"
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            disabled={updatingStatus}
                            onClick={() =>
                              handleUpdateNodeStatus(
                                selectedNode.id,
                                "needs_review",
                              )
                            }
                            className="flex-1 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[11px] font-semibold text-orange-300 hover:bg-orange-500/20 disabled:opacity-40 transition-colors"
                          >
                            Review
                          </button>
                        </div>
                      </div>

                      {/* Blocked by explanation */}
                      {selectedNode.is_blocked && (
                        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
                          <span className="font-semibold">Blocked by:</span>
                          <ul className="mt-1 list-disc list-inside space-y-0.5 text-[11px]">
                            {selectedNode.blocked_by.map((dep, i) => (
                              <li key={i}>{dep}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Explanation */}
                      {selectedNode.explanation && (
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                            Description
                          </span>
                          <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
                            {selectedNode.explanation}
                          </p>
                        </div>
                      )}

                      {/* Files */}
                      {selectedNode.files && selectedNode.files.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                            Affected Files
                          </span>
                          <div className="mt-1 space-y-1">
                            {selectedNode.files.map((file, i) => (
                              <div
                                key={i}
                                className="rounded bg-zinc-950 px-2 py-1 font-mono text-[11px] text-indigo-300 truncate"
                              >
                                {file}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Acceptance Criteria */}
                      {selectedNode.acceptance &&
                        selectedNode.acceptance.length > 0 && (
                          <div>
                            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                              Acceptance Criteria
                            </span>
                            <ul className="mt-1 space-y-1 text-xs text-zinc-300">
                              {selectedNode.acceptance.map((crit, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-indigo-400 mt-0.5">
                                    •
                                  </span>
                                  <span>{crit}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {/* Verification Tests */}
                      {selectedNode.tests && selectedNode.tests.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                            Tests & Scenarios
                          </span>
                          <ul className="mt-1 space-y-1 text-xs text-zinc-300">
                            {selectedNode.tests.map((test, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-cyan-400 mt-0.5">✓</span>
                                <span>{test}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-xs text-zinc-500">
                      Select a node in the DAG to inspect details.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Features & Architecture sections when idle */}
        {pipelineState === "idle" && (
          <>
            <GraphPreview />
            <FeaturesGrid />

            {/* Architecture Section */}
            <section
              id="architecture"
              className="py-20 md:py-28 border-t border-zinc-900 bg-zinc-950/60 scroll-mt-16"
            >
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-3xl mx-auto">
                  <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    System Topology
                  </span>
                  <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
                    Decoupled Serverless Architecture
                  </h2>
                  <p className="mt-4 text-base text-zinc-400">
                    Designed from day one for zero server maintenance, high
                    horizontal concurrency, and strict separation of concerns.
                  </p>
                </div>

                <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Frontend Card */}
                  <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-6 backdrop-blur-md">
                    <div className="inline-flex rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-400 mb-4">
                      kalp-io / frontend
                    </div>
                    <h3 className="text-lg font-bold text-white">
                      Frontend UI Layer
                    </h3>
                    <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                      Next.js App Router providing pages, interactive React Flow
                      canvases, and client state. Dedicated Vercel deployment
                      with zero database/AI keys exposed.
                    </p>
                    <div className="mt-4 border-t border-zinc-800/80 pt-4 text-xs font-mono text-zinc-500">
                      Target: Vercel (Edge & Node.js)
                    </div>
                  </div>

                  {/* Vercel Services Connector */}
                  <div className="rounded-2xl border border-cyan-800/40 bg-cyan-950/10 p-6 backdrop-blur-md relative">
                    <div className="inline-flex rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 text-xs font-semibold text-cyan-400 mb-4">
                      Vercel Services
                    </div>
                    <h3 className="text-lg font-bold text-white">
                      /api → Backend Routing
                    </h3>
                    <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                      <code className="text-cyan-300 font-mono">
                        vercel.json
                      </code>{" "}
                      declaratively routes all{" "}
                      <code className="text-cyan-300 font-mono">/api/*</code>{" "}
                      traffic to the backend service and everything else to the
                      frontend service on the same domain.
                    </p>
                    <div className="mt-4 border-t border-zinc-800/80 pt-4 text-xs font-mono text-cyan-500">
                      Routing: vercel.json services
                    </div>
                  </div>

                  {/* Backend Card */}
                  <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-6 backdrop-blur-md">
                    <div className="inline-flex rounded-lg bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 text-xs font-semibold text-violet-400 mb-4">
                      kalp-io / backend
                    </div>
                    <h3 className="text-lg font-bold text-white">
                      Serverless API Engine
                    </h3>
                    <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                      Headless Next.js App Router providing API routes only.
                      Executes LLM DAG prompts, validates contracts with Zod,
                      and persists graphs to Supabase Postgres.
                    </p>
                    <div className="mt-4 border-t border-zinc-800/80 pt-4 text-xs font-mono text-zinc-500">
                      Target: Vercel Serverless Functions
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
