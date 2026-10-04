export type NodeStatus = "planned" | "in_progress" | "ready" | "blocked";

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
