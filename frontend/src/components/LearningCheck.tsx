"use client";

import React, { useState, useEffect, useCallback } from "react";
import type {
  ComputedNode,
  NodeLearnData,
  AnswerState,
  DiffSource,
} from "@/types/api";
import {
  getNodeLearn,
  generateNodeLearn,
  submitNodeAnswer,
  ApiClientError,
} from "@/lib/api";

export interface LearningCheckProps {
  node: ComputedNode;
  onNodeCompleted?: (nodeId: string) => void;
  className?: string;
  initialLearnData?: NodeLearnData | null;
  initialLoading?: boolean;
  initialError?: string | null;
  initialSelectedOption?: number | null;
  initialShowSkipConfirm?: boolean;
  initialJustCompleted?: boolean;
}

const SOURCE_LABELS: Record<DiffSource, string> = {
  patch: "based on your code changes",
  files_only: "based on your file list",
  plan_only: "based on the plan",
};

export default function LearningCheck({
  node,
  onNodeCompleted,
  className = "",
  initialLearnData,
  initialLoading,
  initialError,
  initialSelectedOption,
  initialShowSkipConfirm,
  initialJustCompleted,
}: LearningCheckProps) {
  const [loading, setLoading] = useState<boolean>(
    initialLoading ?? initialLearnData === undefined,
  );
  const [generating, setGenerating] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const [learnData, setLearnData] = useState<NodeLearnData | null>(
    initialLearnData ?? null,
  );
  const [selectedOption, setSelectedOption] = useState<number | null>(
    initialSelectedOption ?? null,
  );
  const [showSkipConfirm, setShowSkipConfirm] = useState<boolean>(
    initialShowSkipConfirm ?? false,
  );
  const [justCompleted, setJustCompleted] = useState<boolean>(
    initialJustCompleted ?? false,
  );

  // Fetch initial learning state
  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNodeLearn(node.id);
      setLearnData(data);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : "Failed to load learning state";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [node.id]);

  useEffect(() => {
    if (initialLearnData !== undefined) return;
    let ignore = false;

    Promise.resolve().then(() => {
      if (!ignore) {
        setSelectedOption(null);
        setShowSkipConfirm(false);
        setJustCompleted(false);
        void fetchState();
      }
    });

    return () => {
      ignore = true;
    };
  }, [fetchState, initialLearnData]);

  // Generate explanation and question
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await generateNodeLearn(node.id);
      setLearnData(data);
      setSelectedOption(null);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : "Failed to generate explanation. Please try again or skip the check.";
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  // Submit multiple-choice answer
  const handleSubmitAnswer = async () => {
    if (selectedOption === null || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await submitNodeAnswer(node.id, {
        selected_index: selectedOption,
      });

      // Update answer state
      setLearnData((prev) => {
        if (!prev) return null;
        const currentLearning = prev.learning;
        const newAnswerState: AnswerState = {
          wrong_count: res.wrong_count,
          resolved: res.completed,
          result:
            res.result === "correct" ? "correct" : prev.answer_state.result,
          reveal: res.reveal ?? prev.answer_state.reveal,
          hint: res.hint ?? prev.answer_state.hint,
        };
        return {
          ...prev,
          learning: currentLearning,
          answer_state: newAnswerState,
        };
      });

      if (res.completed && res.result === "correct") {
        setJustCompleted(true);
        onNodeCompleted?.(node.id);
      }
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : "Failed to submit answer";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle skip check
  const handleSkip = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitNodeAnswer(node.id, { skip: true });
      setLearnData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          answer_state: {
            ...prev.answer_state,
            resolved: true,
            result: "skipped",
          },
        };
      });
      setShowSkipConfirm(false);
      setJustCompleted(true);
      onNodeCompleted?.(node.id);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : "Failed to skip check";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        data-testid="learning-check-loading"
        className={`rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-center text-xs text-zinc-400 ${className}`}
      >
        <span className="inline-block animate-pulse">
          Loading learning check...
        </span>
      </div>
    );
  }

  const hasCommit = learnData?.has_commit ?? false;
  const learning = learnData?.learning ?? null;
  const answerState = learnData?.answer_state;
  const isResolved =
    answerState?.resolved ||
    answerState?.result === "correct" ||
    answerState?.result === "skipped" ||
    node.status === "completed";
  const isRevealed = Boolean(answerState?.reveal);

  return (
    <div
      data-testid="learning-check-container"
      id="learning-check-section"
      className={`rounded-xl border border-cyan-500/30 bg-gradient-to-b from-cyan-950/20 to-zinc-950/60 p-4 space-y-3.5 shadow-lg shadow-cyan-950/10 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-300">
            Learning Check
          </span>
        </div>
        {learning?.diff_source && (
          <span
            data-testid="diff-source-label"
            className="text-[10px] font-mono text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded border border-zinc-700/60"
          >
            {SOURCE_LABELS[learning.diff_source]}
          </span>
        )}
      </div>

      {/* State A: No Commit Yet */}
      {!hasCommit && (
        <div
          data-testid="learning-check-no-commit"
          className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3.5 text-center text-xs text-zinc-400 space-y-1.5"
        >
          <p className="font-medium text-zinc-300">No commit found yet</p>
          <p className="text-[11px] text-zinc-500">
            Build this step, then come back to explain and check it
          </p>
        </div>
      )}

      {/* State B: Commit Exists, Ready to Explain / Re-explain */}
      {hasCommit && !learning && (
        <div data-testid="learning-commit-ready" className="space-y-3">
          <p className="text-xs text-zinc-300 leading-relaxed">
            A commit was detected for this step! Get a beginner-friendly
            explanation of what changed and take a quick check to unlock the
            next steps.
          </p>
          <button
            type="button"
            data-testid="explain-commit-btn"
            disabled={generating}
            onClick={handleGenerate}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-cyan-500/20 hover:from-cyan-400 hover:to-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <svg
                  className="animate-spin h-3.5 w-3.5"
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
                <span>Explaining what changed...</span>
              </>
            ) : (
              <span>Explain my commit</span>
            )}
          </button>
        </div>
      )}

      {/* Error alert with Retry and Skip buttons */}
      {error && (
        <div
          data-testid="learning-error"
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 space-y-2 text-xs"
        >
          <div className="flex items-start gap-2 text-rose-300 font-semibold">
            <span>⚠️</span>
            <span className="flex-1">{error}</span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              data-testid="retry-generate-btn"
              onClick={handleGenerate}
              className="rounded bg-rose-900/60 hover:bg-rose-800/60 border border-rose-500/50 px-2.5 py-1 text-[11px] font-semibold text-rose-200 transition-colors"
            >
              Retry
            </button>
            <button
              type="button"
              data-testid="skip-on-error-btn"
              onClick={() => setShowSkipConfirm(true)}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 underline transition-colors"
            >
              Skip check
            </button>
          </div>
        </div>
      )}

      {/* State C: Explanation and Check Question Displayed */}
      {learning && (
        <div data-testid="learning-content" className="space-y-4">
          {/* Explanation Banner */}
          {learning.diff_explanation && (
            <div
              data-testid="diff-explanation"
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 text-xs text-zinc-200 leading-relaxed space-y-1.5"
            >
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 uppercase font-bold">
                <span>What changed in this step</span>
              </div>
              <p className="text-zinc-300 whitespace-pre-line">
                {learning.diff_explanation}
              </p>
            </div>
          )}

          {/* Stale Commit Warning */}
          {learning.stale && (
            <div
              data-testid="stale-commit-banner"
              className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-2.5 flex items-center justify-between gap-2 text-xs text-amber-200"
            >
              <span>New commit detected on this step</span>
              <button
                type="button"
                data-testid="re-explain-btn"
                disabled={generating}
                onClick={handleGenerate}
                className="rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-2 py-0.5 text-[11px] font-semibold text-amber-200 transition-colors shrink-0"
              >
                Explain again
              </button>
            </div>
          )}

          {/* Question Card */}
          <div
            data-testid="learning-check-card"
            className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 space-y-3"
          >
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold tracking-wide">
                Quick Understanding Check
              </span>
              <h4
                data-testid="question-prompt"
                className="text-sm font-semibold text-white leading-snug"
              >
                {learning.question.prompt}
              </h4>
            </div>

            {/* 4 Options */}
            <div
              role="radiogroup"
              aria-label="Answer options"
              className="space-y-2 pt-1"
            >
              {learning.question.options.map((option, idx) => {
                const isSelected = selectedOption === idx;
                const isCorrectOption =
                  isRevealed && answerState?.reveal?.correct_index === idx;

                let cardStyle =
                  "border-zinc-800/80 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/40";
                if (isSelected) {
                  cardStyle =
                    "border-cyan-500 bg-cyan-950/30 text-cyan-200 ring-1 ring-cyan-500/50";
                }
                if (isCorrectOption) {
                  cardStyle =
                    "border-emerald-500 bg-emerald-950/30 text-emerald-200 ring-1 ring-emerald-500/50";
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    data-testid={`option-${idx}`}
                    disabled={isResolved || submitting}
                    onClick={() => setSelectedOption(idx)}
                    className={`w-full text-left p-3 rounded-xl border text-xs font-medium transition-all flex items-start gap-2.5 disabled:cursor-default ${cardStyle}`}
                  >
                    <span
                      className={`inline-flex items-center justify-center h-4 w-4 rounded-full border text-[10px] font-mono font-bold shrink-0 mt-0.5 ${
                        isSelected
                          ? "border-cyan-400 bg-cyan-400 text-zinc-950"
                          : isCorrectOption
                            ? "border-emerald-400 bg-emerald-400 text-zinc-950"
                            : "border-zinc-700 bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="flex-1 leading-relaxed">{option}</span>
                    {isCorrectOption && (
                      <span className="text-emerald-400 font-bold text-xs shrink-0">
                        ✓ Correct
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Action Bar (when not resolved) */}
            {!isResolved && (
              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  data-testid="submit-answer-btn"
                  disabled={selectedOption === null || submitting}
                  onClick={handleSubmitAnswer}
                  className="rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold px-4 py-2 text-xs transition-colors shadow-sm shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Checking..." : "Submit Answer"}
                </button>

                <button
                  type="button"
                  data-testid="skip-check-btn"
                  onClick={() => setShowSkipConfirm(true)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors"
                >
                  Skip check
                </button>
              </div>
            )}

            {/* Wrong feedback banner */}
            {!isResolved &&
              (answerState?.wrong_count ?? 0) > 0 &&
              !isRevealed && (
                <div
                  data-testid="wrong-answer-feedback"
                  role="alert"
                  className="rounded-xl border border-amber-500/40 bg-amber-950/25 p-3 text-xs text-amber-200 space-y-1 animate-in fade-in duration-150"
                >
                  <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <span>Not quite</span>
                    <span className="text-[10px] font-mono text-amber-400/80">
                      (Attempt {answerState?.wrong_count}/2)
                    </span>
                  </div>
                  {answerState?.hint ? (
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      <span className="font-semibold text-amber-300">
                        Hint:{" "}
                      </span>
                      {answerState.hint}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-200/80">
                      Think about the architectural purpose of this step and try
                      again.
                    </p>
                  )}
                </div>
              )}

            {/* Reveal Answer Box (after 2 wrong answers) */}
            {isRevealed && !justCompleted && (
              <div
                data-testid="answer-reveal-box"
                className="rounded-xl border border-indigo-500/40 bg-indigo-950/25 p-3.5 text-xs text-indigo-200 space-y-2 animate-in fade-in duration-150"
              >
                <div className="font-semibold text-indigo-300">
                  Here is the answer
                </div>
                <p className="text-zinc-300 leading-relaxed">
                  {answerState?.reveal?.explanation}
                </p>
                {!isResolved && (
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="continue-after-reveal-btn"
                      onClick={handleSkip}
                      disabled={submitting}
                      className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 text-xs transition-colors"
                    >
                      {submitting ? "Continuing..." : "Got it, continue"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Completed Banner */}
            {isResolved && (
              <div
                data-testid="learning-completed-banner"
                className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3.5 text-xs text-emerald-200 space-y-1.5 animate-in fade-in duration-200"
              >
                <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                  <span>✓</span>
                  <span>
                    Step completed. Steps that needed it are now unlocked.
                  </span>
                </div>
                {answerState?.reveal?.explanation && (
                  <div className="mt-2 pt-2 border-t border-emerald-500/20 text-zinc-300 text-[11px]">
                    <span className="font-semibold text-emerald-400">
                      Concept note:{" "}
                    </span>
                    {answerState.reveal.explanation}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Skip Confirmation Modal / Inline Step */}
      {showSkipConfirm && (
        <div
          data-testid="confirm-skip-modal"
          role="dialog"
          aria-labelledby="skip-dialog-title"
          className="rounded-xl border border-zinc-700 bg-zinc-900/95 p-3.5 space-y-2.5 text-xs shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div id="skip-dialog-title" className="font-bold text-white">
            Skip this check?
          </div>
          <p className="text-zinc-400 text-[11px] leading-relaxed">
            This will immediately complete the step and unlock dependent tasks
            without answering the check question.
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              data-testid="cancel-skip-btn"
              onClick={() => setShowSkipConfirm(false)}
              className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="confirm-skip-btn"
              disabled={submitting}
              onClick={handleSkip}
              className="rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-colors"
            >
              {submitting ? "Skipping..." : "Yes, skip check"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
