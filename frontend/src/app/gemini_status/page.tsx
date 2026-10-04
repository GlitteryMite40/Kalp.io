"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LlmStatus, LlmState } from "@/types";

const STATE_CONFIG: Record<
  LlmState,
  { label: string; badgeClass: string; dotClass: string; description: string }
> = {
  available: {
    label: "Available",
    badgeClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    dotClass: "bg-emerald-400",
    description: "Gemini API is reachable and responding with valid outputs.",
  },
  unavailable: {
    label: "Unavailable",
    badgeClass: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    dotClass: "bg-rose-400",
    description:
      "No probed Gemini text models could be reached or all were rate-limited.",
  },
  key_missing: {
    label: "Key Missing",
    badgeClass: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    dotClass: "bg-amber-400",
    description:
      "LLM_API_KEY is not configured in backend environment variables.",
  },
  key_invalid: {
    label: "Key Invalid",
    badgeClass: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    dotClass: "bg-rose-400",
    description: "The provided Gemini API key is rejected or unauthorized.",
  },
};

const TIER_COLORS: Record<string, string> = {
  pro: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  flash: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  "flash-lite": "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};

export default function GeminiStatusPage() {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  const performFetch = async (refresh: boolean) => {
    setLoading(true);
    setNetworkError(null);
    try {
      const url = refresh ? "/api/llm/status?refresh=1" : "/api/llm/status";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Backend service returned error`);
      }
      const data: LlmStatus = await res.json();
      setStatus(data);

      if (data.nextRefreshAt) {
        const msRemaining = Math.max(
          0,
          new Date(data.nextRefreshAt).getTime() - Date.now(),
        );
        setCooldownRemaining(Math.ceil(msRemaining / 1000));
      } else {
        setCooldownRemaining(0);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect to backend";
      setNetworkError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isSubscribed = true;

    async function initialLoad() {
      try {
        const res = await fetch("/api/llm/status", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Backend service returned error`);
        }
        const data: LlmStatus = await res.json();
        if (isSubscribed) {
          setStatus(data);
          if (data.nextRefreshAt) {
            const msRemaining = Math.max(
              0,
              new Date(data.nextRefreshAt).getTime() - Date.now(),
            );
            setCooldownRemaining(Math.ceil(msRemaining / 1000));
          }
        }
      } catch (err) {
        if (isSubscribed) {
          const message =
            err instanceof Error ? err.message : "Failed to connect to backend";
          setNetworkError(message);
        }
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    initialLoad();

    return () => {
      isSubscribed = false;
    };
  }, []);

  // Countdown timer for cooldown
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  const stateInfo = status ? STATE_CONFIG[status.state] : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-xl font-bold tracking-tight text-white">
                Kalp<span className="text-cyan-400">.io</span>
              </span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-sm font-medium text-zinc-300">
              Gemini Engine Status
            </span>
          </div>

          <Link
            href="/"
            className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
          >
            ← Back to App
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-10 md:py-16">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8 border-b border-zinc-900">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-400">
              Provider: Google Gemini
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Model Diagnostic & Fallback Status
            </h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-2xl">
              Live status of automatic model ranking, availability probes, and
              execution fallback for build graph generation.
            </p>
          </div>

          {/* Re-check Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => performFetch(true)}
              disabled={loading || cooldownRemaining > 0}
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-lg transition-all ${
                loading || cooldownRemaining > 0
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50"
                  : "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:from-cyan-400 hover:to-indigo-500 shadow-cyan-500/20 active:scale-95"
              }`}
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  <span>Probing...</span>
                </>
              ) : cooldownRemaining > 0 ? (
                <span>Re-check ({cooldownRemaining}s)</span>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Re-check now</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Network Error Alert */}
        {networkError && (
          <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-rose-400">
                  Backend Communication Error
                </h3>
                <p className="mt-1 text-sm text-zinc-300">{networkError}</p>
              </div>
              <button
                type="button"
                onClick={() => performFetch(false)}
                className="rounded-lg bg-rose-950/60 border border-rose-500/40 px-3.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/60 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Status Dashboard Grid */}
        {status && stateInfo && (
          <div className="mt-8 space-y-8">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Overall State Card */}
              <div className="md:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-md">
                <span className="text-xs font-mono uppercase text-zinc-400 tracking-wider">
                  Provider Health
                </span>
                <div className="mt-3 flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-base font-bold ${stateInfo.badgeClass}`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${stateInfo.dotClass} animate-pulse`}
                    />
                    {stateInfo.label}
                  </span>
                  {status.cached && (
                    <span className="text-xs text-zinc-400 border border-zinc-800 px-2 py-1 rounded-md">
                      Cached result
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                  {status.error || stateInfo.description}
                </p>
              </div>

              {/* Selected Model Card */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-md">
                <span className="text-xs font-mono uppercase text-zinc-400 tracking-wider">
                  Active Model
                </span>
                <div className="mt-3 text-xl font-bold text-white truncate">
                  {status.selectedModel || "None Available"}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {status.pinned ? (
                    <span className="inline-flex rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300">
                      Pinned via LLM_MODEL
                    </span>
                  ) : (
                    <span className="inline-flex rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-300">
                      Auto-Selected (Best Available)
                    </span>
                  )}
                </div>
              </div>

              {/* Metadata Card */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-md">
                <span className="text-xs font-mono uppercase text-zinc-400 tracking-wider">
                  Telemetry
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-xs text-zinc-400">Models Scanned:</span>
                  <span className="text-lg font-bold text-white font-mono">
                    {status.modelsListed}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xs text-zinc-400">Last Checked:</span>
                  <span
                    className="text-xs text-zinc-300 font-mono truncate max-w-[150px]"
                    title={status.checkedAt}
                  >
                    {status.checkedAt}
                  </span>
                </div>
              </div>
            </div>

            {/* Candidates Table */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-md shadow-xl overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-2">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Ranked Candidate Models
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Probed in strict topological preference order (Version desc
                    → Tier rank → Stable first).
                  </p>
                </div>
                <span className="text-xs font-mono text-zinc-500">
                  {status.candidates.length} candidates evaluated
                </span>
              </div>

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/80 text-[11px] font-mono uppercase text-zinc-400">
                      <th className="pb-3 pr-4 font-semibold">Model</th>
                      <th className="pb-3 px-4 font-semibold">Version</th>
                      <th className="pb-3 px-4 font-semibold">Tier</th>
                      <th className="pb-3 px-4 font-semibold">Release</th>
                      <th className="pb-3 px-4 font-semibold">State</th>
                      <th className="pb-3 pl-4 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {status.candidates.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-6 text-center text-sm text-zinc-500"
                        >
                          No candidate models available or key missing.
                        </td>
                      </tr>
                    ) : (
                      status.candidates.map((candidate) => {
                        const tierClass =
                          TIER_COLORS[candidate.tier] ||
                          "border-zinc-700 bg-zinc-800 text-zinc-300";

                        const stateBadge =
                          candidate.state === "selected"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : candidate.state === "failed"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : "bg-zinc-800/40 text-zinc-400 border-zinc-700/40";

                        return (
                          <tr
                            key={candidate.name}
                            className="hover:bg-zinc-900/60 transition-colors"
                          >
                            <td className="py-3.5 pr-4 font-mono font-medium text-white">
                              {candidate.name}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-zinc-300">
                              v{candidate.version}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-block rounded px-2 py-0.5 text-[11px] font-mono font-bold border capitalize ${tierClass}`}
                              >
                                {candidate.tier}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-zinc-400">
                              {candidate.preview ? (
                                <span className="text-amber-400/90 font-medium">
                                  Preview
                                </span>
                              ) : (
                                <span className="text-zinc-400">Stable</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${stateBadge}`}
                              >
                                {candidate.state}
                              </span>
                            </td>
                            <td className="py-3.5 pl-4 text-xs text-zinc-400 max-w-xs truncate">
                              {candidate.reason || "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
