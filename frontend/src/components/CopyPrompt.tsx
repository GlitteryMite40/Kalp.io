"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { copyToClipboard, type CopyResult } from "@/lib/clipboard";

export interface CopyPromptProps {
  /** The full task prompt to be copied */
  prompt: string;
  /** Optional node key for context (e.g. "01.1") */
  nodeKey?: string;
  /** Optional title of the node */
  title?: string;
  /** Button label when not copied. Defaults to "Copy Prompt" */
  label?: string;
  /** Additional wrapper class names */
  className?: string;
  /** Additional button class names */
  buttonClassName?: string;
  /** Whether to show expandable preview of the prompt. Defaults to true */
  showPreview?: boolean;
  /** Callback fired when copy succeeds */
  onCopied?: (method: CopyResult["method"]) => void;
  /** Callback fired when copy fails / falls back */
  onError?: (error: string) => void;
}

export default function CopyPrompt({
  prompt,
  nodeKey,
  title,
  label = "Copy Prompt",
  className = "",
  buttonClassName = "",
  showPreview = true,
  onCopied,
  onError,
}: CopyPromptProps) {
  const [copied, setCopied] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up any pending timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!prompt) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      const result = await copyToClipboard(prompt);

      if (result.success) {
        setCopied(true);
        setFallbackOpen(false);
        setStatusMessage("Full prompt copied to clipboard!");
        onCopied?.(result.method);

        timeoutRef.current = setTimeout(() => {
          setCopied(false);
          setStatusMessage("");
          timeoutRef.current = null;
        }, 2000);
      } else {
        // Fallback: clipboard access denied or unsupported
        setCopied(false);
        setFallbackOpen(true);
        const errMsg =
          result.error ||
          "Clipboard access denied. Please select and copy the prompt manually.";
        setStatusMessage(errMsg);
        onError?.(errMsg);

        // Auto-select text in fallback textarea after render
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
          }
        }, 50);
      }
    } catch (err) {
      setCopied(false);
      setFallbackOpen(true);
      const errMsg =
        err instanceof Error
          ? err.message
          : "Clipboard error. Please copy manually.";
      setStatusMessage(errMsg);
      onError?.(errMsg);
    }
  }, [prompt, onCopied, onError]);

  const handleSelectAll = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
      setStatusMessage("All text selected. Press Ctrl+C or Cmd+C to copy.");
    }
  }, []);

  return (
    <div
      data-testid="copy-prompt-container"
      className={`rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5 space-y-3 ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs shrink-0">
            🤖
          </div>
          <div className="min-w-0">
            <span className="font-mono text-[11px] font-bold text-zinc-300 block truncate">
              {nodeKey ? `Task Prompt [${nodeKey}]` : "Task Prompt"}
            </span>
            {title && (
              <span className="text-[10px] text-zinc-500 block truncate">
                {title}
              </span>
            )}
          </div>
        </div>

        {/* Copy Button */}
        <button
          type="button"
          data-testid="copy-prompt-btn"
          onClick={handleCopy}
          aria-label={
            copied ? "Prompt copied to clipboard" : `Copy prompt: ${label}`
          }
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 shrink-0 ${
            copied
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20"
              : "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/30 hover:border-indigo-300 shadow-sm shadow-indigo-600/20 active:scale-95"
          } ${buttonClassName}`}
        >
          {copied ? (
            <>
              <svg
                data-testid="copied-icon"
                className="w-3.5 h-3.5 text-emerald-300 animate-in zoom-in-50 duration-150"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <svg
                data-testid="copy-icon"
                className="w-3.5 h-3.5 text-indigo-200"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span>{label}</span>
            </>
          )}
        </button>
      </div>

      {/* Accessible Live Feedback */}
      {statusMessage && (
        <div
          data-testid="copy-prompt-status"
          role="status"
          aria-live="polite"
          className={`text-[11px] font-mono px-2.5 py-1 rounded-md border ${
            copied
              ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
              : fallbackOpen
                ? "text-amber-300 bg-amber-500/10 border-amber-500/30"
                : "text-zinc-400 bg-zinc-900 border-zinc-800"
          }`}
        >
          {copied ? `✓ ${statusMessage}` : statusMessage}
        </div>
      )}

      {/* Clipboard Denied / Manual Fallback Drawer */}
      {fallbackOpen && (
        <div
          data-testid="copy-prompt-fallback"
          className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 space-y-2 animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between text-amber-300 text-xs">
            <span className="font-semibold flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Clipboard Access Denied</span>
            </span>
            <button
              type="button"
              data-testid="copy-prompt-fallback-close-btn"
              onClick={() => setFallbackOpen(false)}
              className="text-amber-400 hover:text-amber-200 text-xs p-1"
              aria-label="Close fallback prompt box"
            >
              ✕
            </button>
          </div>

          <p className="text-[11px] text-zinc-300 leading-snug">
            Your browser blocked clipboard access. Please select all text below
            and press{" "}
            <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-amber-300 font-mono text-[10px]">
              Ctrl+C
            </kbd>{" "}
            (or{" "}
            <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-amber-300 font-mono text-[10px]">
              Cmd+C
            </kbd>
            ):
          </p>

          <textarea
            ref={textareaRef}
            data-testid="copy-prompt-textarea"
            readOnly
            value={prompt}
            rows={5}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 p-2 font-mono text-[10px] text-zinc-200 leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-400 select-all resize-y"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              data-testid="copy-prompt-select-btn"
              onClick={handleSelectAll}
              className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 text-[11px] font-semibold transition-colors"
            >
              Select All Text
            </button>
          </div>
        </div>
      )}

      {/* Expandable Preview Section */}
      {showPreview && (
        <div>
          <button
            type="button"
            data-testid="copy-prompt-preview-toggle"
            onClick={() => setIsPreviewOpen((prev) => !prev)}
            className="flex items-center gap-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <span>
              {isPreviewOpen ? "▼ Hide Prompt Preview" : "▶ Preview Prompt"}
            </span>
            <span className="text-[10px] text-zinc-600">
              ({prompt ? `${prompt.length} chars` : "empty"})
            </span>
          </button>

          {isPreviewOpen && (
            <pre
              data-testid="copy-prompt-preview"
              className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-[10px] text-zinc-300 leading-relaxed"
            >
              {prompt}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
