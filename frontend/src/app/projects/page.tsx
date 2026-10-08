"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/api";
import type { ProjectRecord } from "@/types/api";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for the delete confirmation modal
  const [projectToDelete, setProjectToDelete] = useState<ProjectRecord | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.listProjects();
      setProjects(data || []);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load projects.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.resolve().then(() => {
      if (!ignore) {
        void fetchProjects();
      }
    });
    return () => {
      ignore = true;
    };
  }, [fetchProjects]);

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await api.deleteProject(projectToDelete.id);
      // Remove from local list upon successful deletion
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      setProjectToDelete(null);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to delete project.";
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ready":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Ready
          </span>
        );
      case "generating":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Generating
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            {status}
          </span>
        );
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              onClick={() => {
                if (typeof window !== "undefined") {
                  localStorage.removeItem("kalp_active_project_id");
                }
              }}
              className="flex items-center gap-2 text-white font-bold tracking-tight text-lg group"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-sm shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                ⚡
              </div>
              <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                Kalp.io
              </span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-sm font-medium text-zinc-400">Projects</span>
          </div>

          <Link
            href="/"
            data-testid="create-project-nav-btn"
            onClick={() => {
              if (typeof window !== "undefined") {
                localStorage.removeItem("kalp_active_project_id");
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/20 transition-all active:scale-95"
          >
            <span>+</span>
            <span>New Project</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Your Projects
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Only your authenticated projects are listed here. Manage, view,
              and inspect build graphs.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
            <span>Total Projects:</span>
            <span className="font-bold text-zinc-300 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
              {projects.length}
            </span>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div
            data-testid="projects-loading"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4 animate-pulse"
              >
                <div className="h-4 bg-zinc-800 rounded w-2/3" />
                <div className="h-3 bg-zinc-800/60 rounded w-full" />
                <div className="h-3 bg-zinc-800/40 rounded w-4/5" />
                <div className="pt-4 border-t border-zinc-800/60 flex justify-between items-center">
                  <div className="h-5 bg-zinc-800 rounded w-16" />
                  <div className="h-5 bg-zinc-800 rounded w-12" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div
            data-testid="projects-error"
            className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-5 text-rose-300 text-sm max-w-md mx-auto text-center space-y-3"
          >
            <p className="font-semibold">{error}</p>
            <button
              type="button"
              onClick={() => void fetchProjects()}
              className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && projects.length === 0 && (
          <div
            data-testid="projects-empty-state"
            className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-12 text-center max-w-lg mx-auto space-y-4"
          >
            <div className="w-12 h-12 mx-auto rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-xl text-zinc-400">
              📁
            </div>
            <h2 className="text-lg font-bold text-white">No projects yet</h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
              Transform your project idea into a complete, dependency-aware
              build graph with automated step-by-step tasks.
            </p>
            <div className="pt-2">
              <Link
                href="/"
                data-testid="empty-create-btn"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    localStorage.removeItem("kalp_active_project_id");
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/25 transition-all"
              >
                <span>+</span>
                <span>Create Your First Project</span>
              </Link>
            </div>
          </div>
        )}

        {/* Projects Grid */}
        {!isLoading && !error && projects.length > 0 && (
          <div
            data-testid="projects-list"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {projects.map((project) => (
              <div
                key={project.id}
                data-testid="project-card"
                className="group relative rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/70 hover:border-zinc-700 transition-all duration-200 p-5 flex flex-col justify-between shadow-sm hover:shadow-md"
              >
                <div>
                  {/* Status & Date */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div data-testid="project-status">
                      {getStatusBadge(project.status)}
                    </div>
                    {project.created_at && (
                      <span className="text-[11px] font-mono text-zinc-500">
                        {formatDate(project.created_at)}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3
                    data-testid="project-title"
                    className="text-base font-bold text-white tracking-tight leading-snug line-clamp-1 group-hover:text-indigo-300 transition-colors"
                  >
                    <Link href={`/p/${project.id}`}>{project.name}</Link>
                  </h3>

                  {/* Idea / Description */}
                  <p
                    data-testid="project-idea"
                    className="mt-2 text-xs text-zinc-400 line-clamp-2 leading-relaxed"
                  >
                    {project.idea}
                  </p>
                </div>

                {/* Progress / Stage indicator */}
                <div className="mt-5 pt-4 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                  <div
                    data-testid="project-progress"
                    className="text-[11px] font-mono text-zinc-500 flex items-center gap-1.5"
                  >
                    <span>Stage:</span>
                    <span className="text-zinc-300 font-medium">
                      {project.current_stage ||
                        (project.status === "ready"
                          ? "completed"
                          : project.status)}
                    </span>
                  </div>

                  {/* Actions: View & Delete */}
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/p/${project.id}`}
                      data-testid={`view-project-btn-${project.id}`}
                      className="text-xs font-semibold px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                    >
                      Open →
                    </Link>

                    <button
                      type="button"
                      data-testid="delete-project-btn"
                      onClick={() => {
                        setProjectToDelete(project);
                        setDeleteError(null);
                      }}
                      title="Delete project"
                      className="text-xs font-semibold px-2 py-1 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation Step Modal */}
      {projectToDelete && (
        <div
          data-testid="confirm-delete-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center text-lg shrink-0">
                ⚠️
              </div>
              <div>
                <h3
                  id="delete-dialog-title"
                  className="text-base font-bold text-white tracking-tight"
                >
                  Delete Project?
                </h3>
                <p className="text-xs text-zinc-400">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <strong className="text-white font-semibold">
                &ldquo;{projectToDelete.name}&rdquo;
              </strong>
              ? All dependency nodes, edges, criteria, and plan data will be
              removed immediately.
            </p>

            {deleteError && (
              <div
                data-testid="delete-error-banner"
                className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-2.5 text-xs text-rose-300"
              >
                {deleteError}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                data-testid="cancel-delete-btn"
                disabled={isDeleting}
                onClick={() => {
                  setProjectToDelete(null);
                  setDeleteError(null);
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                data-testid="confirm-delete-btn"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-sm shadow-rose-600/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Project</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
