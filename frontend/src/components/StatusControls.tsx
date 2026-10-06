"use client";

import React, { useState } from "react";
import type { ComputedNode, NodeStatus } from "@/types/api";
import { STATUS_STYLES } from "@/lib/graph";
import {
  STATUS_ACTIONS,
  isNodeBlocked,
  isNodeReady,
  canTransitionToStatus,
  executeStatusTransition,
} from "@/lib/status";

export interface StatusControlsProps {
  node: ComputedNode | null;
  onUpdateStatus?: (nodeId: string, status: NodeStatus) => Promise<void> | void;
  isUpdating?: boolean;
  onSelectNodeByKey?: (nodeKey: string) => void;
  className?: string;
}

export default function StatusControls({
  node,
  onUpdateStatus,
  isUpdating = false,
  onSelectNodeByKey,
  className = "",
}: StatusControlsProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!node) {
    return null;
  }

  const currentStatus = (node.computed_status ||
    node.status ||
    "not_started") as NodeStatus;
  const statusCfg = STATUS_STYLES[currentStatus] || STATUS_STYLES.not_started;
  const isBlocked = isNodeBlocked(node);
  const isReady = isNodeReady(node);

  const handleActionClick = async (targetStatus: NodeStatus) => {
    setErrorMessage(null);

    // Defensive check: if blocked, do not allow starting
    const check = canTransitionToStatus(node, targetStatus);
    if (!check.allowed) {
      setErrorMessage(check.reason || "Action not allowed.");
      return;
    }

    if (!onUpdateStatus) return;

    const result = await executeStatusTransition(
      node,
      targetStatus,
      onUpdateStatus,
    );
    if (!result.success && result.error) {
      setErrorMessage(result.error);
    }
  };

  return (
    <div
      data-testid="status-controls"
      className={`rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5 space-y-3.5 ${className}`}
    >
      {/* 1. Header with Current Status Badge */}
      <div className="flex items-center justify-between">
        <span className="text-zinc-400 font-medium text-xs">Node Status</span>
        <span
          data-testid="status-controls-current"
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusCfg.badgeBg} ${statusCfg.badgeText}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
          {statusCfg.label}
        </span>
      </div>

      {/* 2. Highlight Ready Node Banner */}
      {isReady && currentStatus !== "in_progress" && (
        <div
          data-testid="status-ready-highlight"
          className="rounded-lg border border-emerald-500/50 bg-emerald-950/30 p-2.5 text-emerald-200 animate-in fade-in duration-200 shadow-sm shadow-emerald-500/10"
        >
          <div className="flex items-center gap-1.5 font-semibold text-[11px]">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span>Ready to Build</span>
          </div>
          <p className="mt-1 text-[10px] text-emerald-300/80 leading-relaxed">
            All prerequisite dependencies are completed. You can start this task
            now.
          </p>
        </div>
      )}

      {/* 3. Blocked Node Banner (Disabled warning) */}
      {isBlocked && (
        <div
          data-testid="status-blocked-banner"
          className="rounded-lg border border-rose-500/40 bg-rose-950/25 p-2.5 text-rose-300 animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-1.5 font-semibold text-[11px] mb-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400 shrink-0" />
            <span>
              Blocked ({node.blocked_by?.length || 0} prerequisite pending)
            </span>
          </div>
          <p className="text-[10px] text-rose-200/80 mb-2 leading-relaxed">
            This node cannot start until all prerequisite tasks are completed.
          </p>
          {node.blocked_by && node.blocked_by.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {node.blocked_by.map((key) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`blocker-nav-${key}`}
                  onClick={() => onSelectNodeByKey?.(key)}
                  className="rounded bg-rose-500/20 hover:bg-rose-500/30 px-2 py-0.5 font-mono text-[10px] text-rose-200 transition-colors border border-rose-500/30 flex items-center gap-1"
                >
                  <span>{key}</span>
                  <span className="text-[9px]">→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. Action Buttons: In Progress, Completed, Failed */}
      {onUpdateStatus && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-mono text-zinc-500 uppercase">
              Transition Status
            </span>
            {isBlocked && (
              <span className="text-[10px] font-mono text-rose-400/90 font-semibold">
                Disabled (Blocked)
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {STATUS_ACTIONS.map((action) => {
              const isCurrent = currentStatus === action.status;
              const disabled =
                isUpdating ||
                (isBlocked &&
                  (action.status === "in_progress" ||
                    action.status === "completed" ||
                    action.status === "failed")) ||
                isCurrent;

              // Ready node highlight applied specifically to In Progress button
              const isReadyStart =
                isReady && action.status === "in_progress" && !isCurrent;

              return (
                <button
                  key={action.status}
                  type="button"
                  data-testid={action.testId}
                  disabled={disabled}
                  aria-disabled={disabled}
                  onClick={() => handleActionClick(action.status)}
                  title={
                    isBlocked
                      ? `Cannot start: blocked by ${node.blocked_by?.join(", ") || "prerequisites"}`
                      : isCurrent
                        ? `Currently ${action.label}`
                        : action.description
                  }
                  className={`relative flex flex-col items-center justify-center p-2 rounded-lg font-semibold text-xs transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed ${
                    isCurrent
                      ? action.activeColor
                      : isReadyStart
                        ? "border-emerald-500/80 bg-emerald-500/20 text-emerald-200 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400/50 hover:bg-emerald-500/30 animate-pulse"
                        : action.color
                  }`}
                >
                  <span className="text-[11px] leading-tight">
                    {action.label}
                  </span>
                  {isReadyStart && (
                    <span className="text-[8px] font-mono text-emerald-300 font-bold uppercase tracking-wider mt-0.5">
                      Ready!
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-[8px] font-mono text-zinc-400 font-normal uppercase tracking-wider mt-0.5">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Error Feedback / Reason alert */}
      {errorMessage && (
        <div
          data-testid="status-error-feedback"
          role="alert"
          className="rounded-lg border border-rose-500/50 bg-rose-950/30 p-2 text-rose-300 text-[11px] flex items-start gap-1.5 animate-in fade-in duration-150"
        >
          <span className="shrink-0 text-rose-400">⚠️</span>
          <span className="flex-1 leading-snug">{errorMessage}</span>
          <button
            type="button"
            data-testid="status-error-dismiss"
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-200 text-xs leading-none shrink-0"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
