"use client";

import React, { useState } from "react";
import type { ComputedNode, NodeStatus } from "@/types/api";
import { STATUS_STYLES, TYPE_STYLES } from "@/lib/graph";
import CopyPrompt from "@/components/CopyPrompt";
import StatusControls from "@/components/StatusControls";
import ExportMenu from "@/components/ExportMenu";
import LearningCheck from "@/components/LearningCheck";
import { formatNodePromptFallback } from "@/lib/clipboard";

export interface NodePanelProps {
  node: ComputedNode | null;
  isOpen?: boolean;
  onClose?: () => void;
  onSelectNodeByKey?: (nodeKey: string) => void;
  onUpdateStatus?: (nodeId: string, status: NodeStatus) => Promise<void> | void;
  isUpdatingStatus?: boolean;
  allNodes?: ComputedNode[];
  className?: string;
  onRefreshGraph?: () => void;
}

export default function NodePanel({
  node,
  isOpen = true,
  onClose,
  onSelectNodeByKey,
  onUpdateStatus,
  isUpdatingStatus = false,
  allNodes = [],
  className = "",
  onRefreshGraph,
}: NodePanelProps) {
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [copiedTest, setCopiedTest] = useState<string | null>(null);
  const [manualResolvedNodeId, setManualResolvedNodeId] = useState<
    string | null
  >(null);
  const [isManuallyResolved, setIsManuallyResolved] = useState<boolean>(false);

  if (!isOpen || !node) {
    return null;
  }

  const isLearningResolved =
    node.status === "completed" ||
    (manualResolvedNodeId === node.id && isManuallyResolved);

  const typeKey = (node.type || "").toLowerCase();
  const typeCfg = TYPE_STYLES[typeKey] || {
    badge: (node.type || "TASK").toUpperCase().slice(0, 4),
    color: "text-zinc-400 border-zinc-700 bg-zinc-800/40",
  };

  const handleCopy = (text: string, type: "file" | "test") => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      if (type === "file") {
        setCopiedFile(text);
        setTimeout(() => setCopiedFile(null), 1500);
      } else {
        setCopiedTest(text);
        setTimeout(() => setCopiedTest(null), 1500);
      }
    }
  };

  // Find downstream dependents: nodes in allNodes that depend on current node
  const downstreamDependents = allNodes.filter(
    (other) =>
      other.dependencies?.includes(node.node_key) ||
      other.dependencies?.includes(node.id) ||
      other.blocked_by?.includes(node.node_key),
  );

  return (
    <aside
      data-testid="node-panel"
      aria-label="Node Inspector"
      className={`w-80 md:w-96 shrink-0 border-l border-zinc-800/80 bg-zinc-900/95 backdrop-blur-xl flex flex-col h-full z-20 shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200 select-none ${className}`}
    >
      {/* 1. Panel Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 p-4 shrink-0 bg-zinc-950/40">
        <div className="flex items-center gap-2 min-w-0">
          <span
            data-testid="node-panel-key"
            className="font-mono text-xs font-bold px-2 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/15 text-indigo-300 shrink-0"
          >
            {node.node_key}
          </span>
          <span className="text-xs font-mono text-zinc-400 uppercase font-semibold truncate">
            Node Inspector
          </span>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            data-testid="node-panel-close-btn"
            className="text-zinc-400 hover:text-white text-sm leading-none p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            title="Close Inspector"
          >
            ✕
          </button>
        )}
      </div>

      {/* 2. Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-left text-xs">
        {/* Title & Phase */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              data-testid="node-panel-phase"
              className="font-mono text-[11px] text-zinc-400"
            >
              {node.phase}
            </span>
            {node.type && (
              <span
                data-testid="node-panel-type"
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold border ${typeCfg.color}`}
              >
                {typeCfg.badge}
              </span>
            )}
          </div>
          <h3
            data-testid="node-panel-title"
            className="text-base font-bold text-white leading-snug tracking-tight"
          >
            {node.title}
          </h3>
        </div>

        {/* What you are building and why */}
        <div data-testid="node-panel-purpose">
          <span className="font-mono text-zinc-500 text-[10px] uppercase font-bold block mb-1.5">
            What you are building and why
          </span>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 leading-relaxed text-zinc-300">
            {node.explanation ? (
              <p>{node.explanation}</p>
            ) : (
              <p className="text-zinc-500 italic">
                No purpose description available.
              </p>
            )}
            {node.requirement_key && (
              <div className="mt-2 pt-2 border-t border-zinc-800/80 flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
                <span className="text-zinc-500">Requirement:</span>
                <span className="text-indigo-300 font-semibold">
                  {node.requirement_key}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Status Section */}
        <div data-testid="node-panel-status">
          <StatusControls
            node={node}
            onUpdateStatus={onUpdateStatus}
            isUpdating={isUpdatingStatus}
            onSelectNodeByKey={onSelectNodeByKey}
            hasCommit={node.status === "committed"}
            isLearningResolved={isLearningResolved}
            onTakeCheck={() => {
              const el =
                document.getElementById("learning-check-section") ||
                document.getElementById("learning-check-card");
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                (
                  el.querySelector(
                    "button:not(:disabled), input",
                  ) as HTMLElement | null
                )?.focus();
              }
            }}
          />
          {node.is_blocked && (
            <div
              data-testid="node-panel-blocked-banner"
              className="sr-only"
              aria-hidden="true"
            >
              Blocked node
            </div>
          )}
        </div>

        {/* Learning Check Layer */}
        <LearningCheck
          node={node}
          onLearningStateChange={(resolved) => {
            setManualResolvedNodeId(node.id);
            setIsManuallyResolved(resolved);
          }}
          onNodeCompleted={(id) => {
            void onUpdateStatus?.(id, "completed");
            onRefreshGraph?.();
          }}
        />

        {/* 5. Dependencies Section */}
        <div data-testid="node-panel-dependencies">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-zinc-500 text-[10px] uppercase font-bold">
              Dependencies ({node.dependencies?.length || 0})
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              Prerequisites
            </span>
          </div>

          {node.dependencies && node.dependencies.length > 0 ? (
            <div className="space-y-1.5">
              {node.dependencies.map((dep) => {
                const targetNode = allNodes.find(
                  (n) => n.node_key === dep || n.id === dep,
                );
                const depStatus = (targetNode?.computed_status ||
                  targetNode?.status ||
                  "not_started") as NodeStatus;
                const depStatusCfg =
                  STATUS_STYLES[depStatus] || STATUS_STYLES.not_started;

                return (
                  <button
                    key={dep}
                    type="button"
                    onClick={() => onSelectNodeByKey?.(dep)}
                    className="w-full flex items-center justify-between p-2 rounded-lg border border-zinc-800 bg-zinc-950/40 hover:border-indigo-500/40 hover:bg-zinc-800/40 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-indigo-400 text-[11px] shrink-0">
                        {dep}
                      </span>
                      {targetNode && (
                        <span className="truncate text-zinc-300 text-xs">
                          {targetNode.title}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {targetNode && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${depStatusCfg.dot}`}
                        />
                      )}
                      <span className="text-zinc-500 group-hover:text-indigo-300 text-xs">
                        →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/20 p-2.5 text-zinc-500 text-xs italic">
              No prerequisites — root module.
            </div>
          )}

          {/* Downstream Dependents */}
          {downstreamDependents.length > 0 && (
            <div className="mt-3">
              <span className="font-mono text-zinc-500 text-[10px] uppercase font-bold block mb-1">
                Required By ({downstreamDependents.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {downstreamDependents.map((down) => (
                  <button
                    key={down.id}
                    type="button"
                    onClick={() => onSelectNodeByKey?.(down.node_key)}
                    className="rounded bg-zinc-800/80 hover:bg-zinc-700/80 px-2 py-1 font-mono text-[11px] text-zinc-300 border border-zinc-700/80 transition-colors"
                  >
                    {down.node_key} →
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 6. Files Section */}
        <div data-testid="node-panel-files">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-zinc-500 text-[10px] uppercase font-bold">
              Files ({node.files?.length || 0})
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              Target Codebase
            </span>
          </div>

          {node.files && node.files.length > 0 ? (
            <div className="space-y-1.5">
              {node.files.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/80 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 group"
                >
                  <span className="truncate" title={file}>
                    {file}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(file, "file")}
                    className="text-[10px] text-zinc-500 hover:text-white shrink-0 px-1 py-0.5 rounded hover:bg-zinc-800 transition-colors"
                    title="Copy path"
                  >
                    {copiedFile === file ? "Copied" : "Copy"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/20 p-2.5 text-zinc-500 text-xs italic">
              No files specified for this node.
            </div>
          )}
        </div>

        {/* 7. Criteria Section */}
        <div data-testid="node-panel-criteria">
          <span className="font-mono text-zinc-500 text-[10px] uppercase font-bold block mb-1.5">
            Acceptance Criteria ({node.acceptance?.length || 0})
          </span>

          {node.acceptance && node.acceptance.length > 0 ? (
            <ul className="space-y-1.5">
              {node.acceptance.map((crit, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2.5 text-zinc-300 leading-relaxed"
                >
                  <span className="mt-0.5 text-emerald-400 font-bold shrink-0">
                    ✓
                  </span>
                  <span>{crit}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/20 p-2.5 text-zinc-500 text-xs italic">
              No acceptance criteria specified.
            </div>
          )}
        </div>

        {/* 8. Tests Section */}
        <div data-testid="node-panel-tests">
          <span className="font-mono text-zinc-500 text-[10px] uppercase font-bold block mb-1.5">
            Tests & Verification ({node.tests?.length || 0})
          </span>

          {node.tests && node.tests.length > 0 ? (
            <div className="space-y-1.5">
              {node.tests.map((test, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/80 p-2 font-mono text-[11px] text-zinc-300 group"
                >
                  <span className="truncate text-zinc-400">
                    <span className="text-indigo-400">$</span> {test}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(test, "test")}
                    className="text-[10px] text-zinc-500 hover:text-white shrink-0 px-1 py-0.5 rounded hover:bg-zinc-800 transition-colors"
                    title="Copy command"
                  >
                    {copiedTest === test ? "Copied" : "Copy"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/20 p-2.5 text-zinc-500 text-xs italic">
              No test commands specified.
            </div>
          )}
        </div>

        {/* 9. AI Task Prompt & Clipboard Copy */}
        <div data-testid="node-panel-prompt">
          <CopyPrompt
            prompt={node.prompt || formatNodePromptFallback(node)}
            nodeKey={node.node_key}
            title={node.title}
          />
        </div>

        {/* 10. Plan Export */}
        {allNodes.length > 0 && (
          <div
            data-testid="node-panel-export"
            className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 flex items-center justify-between"
          >
            <div>
              <span className="font-mono text-zinc-300 text-[11px] font-semibold block">
                Export Plan
              </span>
              <span className="text-[10px] text-zinc-500">
                JSON & Markdown checklist
              </span>
            </div>
            <ExportMenu data={{ nodes: allNodes }} size="sm" />
          </div>
        )}
      </div>
    </aside>
  );
}
