"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  downloadPlanJson,
  downloadPlanMarkdown,
  generatePlanMarkdown,
  type ExportPlanInput,
} from "@/lib/export";
import { copyToClipboard } from "@/lib/clipboard";

export interface ExportMenuProps {
  data: ExportPlanInput | null;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm";
}

export default function ExportMenu({
  data,
  disabled = false,
  className = "",
  size = "default",
}: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const showFeedback = (msg: string) => {
    setDownloadFeedback(msg);
    setTimeout(() => {
      setDownloadFeedback(null);
    }, 2000);
  };

  const handleExportJson = () => {
    if (!data || disabled) return;
    try {
      downloadPlanJson(data);
      showFeedback("Downloaded JSON!");
      setIsOpen(false);
    } catch (err) {
      console.error("Export JSON failed:", err);
    }
  };

  const handleExportMarkdown = () => {
    if (!data || disabled) return;
    try {
      downloadPlanMarkdown(data);
      showFeedback("Downloaded Markdown!");
      setIsOpen(false);
    } catch (err) {
      console.error("Export Markdown failed:", err);
    }
  };

  const handleCopyMarkdown = async () => {
    if (!data || disabled) return;
    try {
      const markdown = generatePlanMarkdown(data);
      const res = await copyToClipboard(markdown);
      if (res.success) {
        showFeedback("Copied to clipboard!");
      } else {
        showFeedback("Copy failed");
      }
      setIsOpen(false);
    } catch (err) {
      console.error("Copy Markdown failed:", err);
    }
  };

  const hasNodes = Boolean(data && data.nodes && data.nodes.length > 0);
  const isDisabled = disabled || !hasNodes;

  const btnPadding =
    size === "sm"
      ? "px-2 py-1 text-[11px]"
      : "px-2.5 py-1.5 text-xs";

  return (
    <div
      ref={menuRef}
      className={`relative inline-block text-left ${className}`}
      data-testid="export-menu-container"
    >
      {/* Export Dropdown Trigger Button */}
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => setIsOpen((prev) => !prev)}
        data-testid="export-menu-trigger"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Export build plan"
        title={isDisabled ? "No plan available to export" : "Export plan as JSON or Markdown"}
        className={`inline-flex items-center gap-1.5 rounded-lg border font-semibold transition-all select-none disabled:opacity-40 disabled:cursor-not-allowed ${
          isOpen
            ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300 shadow-md shadow-indigo-500/10"
            : "border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:text-white hover:border-zinc-700 hover:bg-zinc-800/80"
        } ${btnPadding}`}
      >
        {/* Download tray icon */}
        <svg
          className="h-3.5 w-3.5 shrink-0 text-indigo-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>

        <span>{downloadFeedback || "Export"}</span>

        {/* Chevron icon */}
        <svg
          className={`h-3 w-3 text-zinc-400 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu Panel */}
      {isOpen && (
        <div
          data-testid="export-dropdown"
          className="absolute right-0 mt-1.5 w-64 origin-top-right rounded-xl border border-zinc-800/90 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150 focus:outline-none"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 border-b border-zinc-800/60 mb-1">
            Download Plan
          </div>

          {/* Option 1: Download JSON */}
          <button
            type="button"
            onClick={handleExportJson}
            data-testid="export-json-button"
            className="w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-zinc-800/80 transition-colors group"
          >
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 group-hover:border-cyan-500/50 group-hover:bg-cyan-500/20">
              <span className="font-mono text-[10px] font-bold">{"{}"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-zinc-200 group-hover:text-white flex items-center justify-between">
                <span>Download JSON</span>
                <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-400">
                  .json
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 line-clamp-1">
                Full graph topology & dependencies
              </p>
            </div>
          </button>

          {/* Option 2: Download Markdown */}
          <button
            type="button"
            onClick={handleExportMarkdown}
            data-testid="export-markdown-button"
            className="w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-zinc-800/80 transition-colors group"
          >
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-400 group-hover:border-violet-500/50 group-hover:bg-violet-500/20">
              <span className="font-mono text-[10px] font-bold">MD</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-zinc-200 group-hover:text-white flex items-center justify-between">
                <span>Markdown Checklist</span>
                <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-400">
                  .md
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 line-clamp-1">
                Interactive checklist grouped by phase
              </p>
            </div>
          </button>

          <div className="my-1 border-t border-zinc-800/60" />

          {/* Option 3: Copy Markdown to Clipboard */}
          <button
            type="button"
            onClick={handleCopyMarkdown}
            data-testid="export-copy-button"
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors"
          >
            <svg
              className="h-3.5 w-3.5 text-zinc-400 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>Copy Checklist to Clipboard</span>
          </button>
        </div>
      )}
    </div>
  );
}
