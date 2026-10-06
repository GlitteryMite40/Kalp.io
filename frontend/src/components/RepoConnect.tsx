"use client";

import React, { useState, useEffect } from "react";
import { api, ApiClientError, type ProjectRepoInfo } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";

export interface RepoConnectProps {
  projectId: string;
  initialRepoInfo?: ProjectRepoInfo | null;
  className?: string;
}

export default function RepoConnect({
  projectId,
  initialRepoInfo,
  className = "",
}: RepoConnectProps) {
  const [repoInfo, setRepoInfo] = useState<ProjectRepoInfo | null>(
    initialRepoInfo ?? null,
  );
  const [repoUrlInput, setRepoUrlInput] = useState("");
  const [isLoading, setIsLoading] = useState(!initialRepoInfo);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedPayloadUrl, setCopiedPayloadUrl] = useState(false);

  // Fetch current repo status on mount if not provided initially
  useEffect(() => {
    if (!projectId) return;
    let isMounted = true;

    async function loadRepo() {
      try {
        const data = await api.getProjectRepo(projectId);
        if (isMounted) {
          setRepoInfo(data);
          if (data.repo_url) {
            setRepoUrlInput(data.repo_url);
          }
        }
      } catch (err) {
        // Silently tolerate initial load failure or not-found
        console.warn("Failed to load repo info:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    if (!initialRepoInfo) {
      void loadRepo();
    }

    return () => {
      isMounted = false;
    };
  }, [projectId, initialRepoInfo]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !repoUrlInput.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await api.connectProjectRepo(projectId, {
        repo_url: repoUrlInput.trim(),
      });
      setRepoInfo(result);
      setIsExpanded(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "INVALID_REPO_URL") {
          setErrorMessage(
            "Invalid GitHub repository URL. Must be in the form https://github.com/owner/repo.",
          );
        } else if (err.code === "REPO_NOT_FOUND_OR_PRIVATE") {
          setErrorMessage(
            "Repository not found or is private. Kalp currently requires a public GitHub repository.",
          );
        } else {
          setErrorMessage(err.message || "Failed to connect repository.");
        }
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("An unexpected error occurred while connecting.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!projectId) return;
    if (
      !confirm(
        "Are you sure you want to disconnect this repository? Incoming webhook events will be rejected.",
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await api.disconnectProjectRepo(projectId);
      setRepoInfo({ repo_url: null });
      setRepoUrlInput("");
      setShowSecret(false);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to disconnect repository.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const payloadUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhook/github`
      : "/api/webhook/github";

  const handleCopySecret = async () => {
    if (!repoInfo?.webhook_secret) return;
    const res = await copyToClipboard(repoInfo.webhook_secret);
    if (res.success) {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const handleCopyPayloadUrl = async () => {
    const res = await copyToClipboard(payloadUrl);
    if (res.success) {
      setCopiedPayloadUrl(true);
      setTimeout(() => setCopiedPayloadUrl(false), 2000);
    }
  };

  const isConnected = Boolean(repoInfo?.repo_url);

  return (
    <div
      data-testid="repo-connect-container"
      className={`rounded-xl border transition-all duration-200 ${
        isConnected
          ? "border-cyan-500/40 bg-zinc-950/80 shadow-lg shadow-cyan-950/20"
          : "border-zinc-800 bg-zinc-900/60"
      } ${className}`}
    >
      {/* Collapsible Header Summary */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* GitHub Icon */}
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
              isConnected
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
                : "border-zinc-700 bg-zinc-800/80 text-zinc-400"
            }`}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-200">
                GitHub Repository
              </span>
              <span
                className={`rounded-full border px-2 py-0.2 text-[10px] font-mono font-semibold ${
                  isConnected
                    ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-400"
                }`}
              >
                {isConnected ? "Connected" : "Not connected"}
              </span>
            </div>

            {isConnected && repoInfo?.repo_full_name && (
              <p
                data-testid="repo-full-name"
                className="font-mono text-[11px] text-cyan-400 truncate mt-0.5"
              >
                {repoInfo.repo_full_name}
              </p>
            )}
          </div>
        </div>

        {/* Toggle Expansion Button */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          data-testid="repo-connect-toggle"
          aria-expanded={isExpanded}
          className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
        >
          {isExpanded ? "Collapse" : isConnected ? "Manage Webhook" : "Connect"}
        </button>
      </div>

      {/* Expandable Body */}
      {isExpanded && (
        <div className="border-t border-zinc-800/80 p-3.5 space-y-4 text-xs">
          {isLoading ? (
            <p className="text-zinc-400 italic">
              Checking repository status...
            </p>
          ) : isConnected ? (
            /* Connected State with Webhook Instructions */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-white">
                    Track Commits from GitHub
                  </span>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Configure your repository webhook to automatically parse
                    completed build nodes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isSubmitting}
                  data-testid="repo-disconnect-btn"
                  className="rounded-lg border border-rose-500/40 bg-rose-950/20 px-3 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-900/30 hover:border-rose-500/60 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>

              {/* Numbered Instructions */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-3 font-sans">
                <div className="font-semibold text-zinc-300 text-xs">
                  Webhook Setup Instructions:
                </div>

                <ol className="list-decimal list-inside space-y-2.5 text-zinc-300 text-[11px] leading-relaxed">
                  <li>
                    Open repository <b>Settings</b> &rarr; <b>Webhooks</b>{" "}
                    &rarr; <b>Add webhook</b>.
                  </li>

                  {/* 2. Payload URL */}
                  <li className="space-y-1">
                    <span>
                      Set <b>Payload URL</b> to:
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <code
                        data-testid="webhook-payload-url"
                        className="rounded bg-zinc-950 px-2 py-1 font-mono text-[11px] text-cyan-300 border border-zinc-800 select-all"
                      >
                        {payloadUrl}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyPayloadUrl}
                        data-testid="copy-payload-url-btn"
                        className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300 hover:text-white transition-colors"
                      >
                        {copiedPayloadUrl ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </li>

                  {/* 3. Content Type */}
                  <li>
                    Set <b>Content type</b> to{" "}
                    <code className="text-cyan-300 font-mono">
                      application/json
                    </code>
                    .
                  </li>

                  {/* 4. Secret */}
                  <li className="space-y-1">
                    <span>
                      Set <b>Secret</b> to:
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <code
                        data-testid="webhook-secret-value"
                        className="rounded bg-zinc-950 px-2 py-1 font-mono text-[11px] text-cyan-300 border border-zinc-800 select-all max-w-[280px] sm:max-w-md truncate"
                      >
                        {showSecret
                          ? repoInfo?.webhook_secret
                          : "••••••••••••••••••••••••••••••••"}
                      </code>
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        data-testid="toggle-secret-btn"
                        className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300 hover:text-white transition-colors"
                      >
                        {showSecret ? "Hide" : "Show"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopySecret}
                        data-testid="copy-secret-btn"
                        className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300 hover:text-white transition-colors"
                      >
                        {copiedSecret ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </li>

                  {/* 5. Just the push event */}
                  <li>
                    Select <b>&ldquo;Just the push event&rdquo;</b>.
                  </li>

                  {/* 6. Add webhook */}
                  <li>
                    Click <b>Add webhook</b>.
                  </li>

                  {/* 7. Verify green 200 */}
                  <li>
                    Confirm that GitHub&apos;s <b>Recent Deliveries</b> tab
                    shows a green{" "}
                    <code className="text-emerald-400 font-mono">200 OK</code>{" "}
                    response.
                  </li>
                </ol>

                <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-2.5 text-[11px] text-cyan-200">
                  <p>
                    <b>Commit convention:</b> Put the node ID in the first line
                    of your commit message, like{" "}
                    <code className="text-white font-mono bg-zinc-950 px-1 py-0.5 rounded border border-cyan-500/30">
                      [03.5] Decompose to nodes
                    </code>
                    . Only pushes to the default branch count.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Unconnected State Form */
            <form onSubmit={handleConnect} className="space-y-3">
              <div>
                <label
                  htmlFor="repo-url-input"
                  className="block font-medium text-zinc-300 mb-1"
                >
                  GitHub Repository URL:
                </label>
                <div className="flex gap-2">
                  <input
                    id="repo-url-input"
                    type="url"
                    value={repoUrlInput}
                    onChange={(e) => setRepoUrlInput(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    disabled={isSubmitting}
                    data-testid="repo-url-input"
                    className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !repoUrlInput.trim()}
                    data-testid="repo-connect-btn"
                    className="rounded-lg bg-cyan-600 px-4 py-1.5 font-semibold text-white hover:bg-cyan-500 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? "Connecting..." : "Connect"}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div
                  data-testid="repo-connect-error"
                  className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-2.5 text-xs text-rose-300"
                >
                  {errorMessage}
                </div>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
