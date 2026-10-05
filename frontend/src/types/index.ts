export type NodeStatus =
  | "not_started"
  | "ready"
  | "in_progress"
  | "committed"
  | "completed"
  | "blocked"
  | "failed"
  | "needs_review";

export const NODE_STATUS_LABELS: Record<NodeStatus, string> = {
  not_started: "Not Started",
  ready: "Ready",
  in_progress: "In Progress",
  committed: "Committed",
  completed: "Completed",
  blocked: "Blocked",
  failed: "Failed",
  needs_review: "Needs Review",
};

export type NodeType =
  "core" | "feature" | "database" | "api" | "ui" | "integration";

export interface BuildGraphNode {
  id: string;
  title: string;
  description: string;
  phase: string;
  type: NodeType;
  status: NodeStatus;
  dependencies: string[];
  estimatedHours?: number;
}

export interface BuildGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Phase {
  id: string;
  name: string;
  order: number;
  color: string;
}

export interface BuildGraph {
  projectId: string;
  title: string;
  description: string;
  phases: Phase[];
  nodes: BuildGraphNode[];
  edges: BuildGraphEdge[];
  createdAt: string;
}

export interface ProjectPrompt {
  idea: string;
  targetPlatform?: string;
  complexity?: "prototype" | "mvp" | "production";
}

export type LlmState =
  "available" | "unavailable" | "key_missing" | "key_invalid";

export interface LlmCandidate {
  name: string;
  version: number;
  tier: "pro" | "flash" | "flash-lite";
  preview: boolean;
  state: "selected" | "failed" | "untested";
  reason?: string;
}

export interface LlmStatus {
  provider: "gemini";
  state: LlmState;
  selectedModel: string | null;
  pinned: boolean;
  modelsListed: number;
  candidates: LlmCandidate[];
  checkedAt: string;
  cached: boolean;
  nextRefreshAt: string | null;
  error?: string;
}
