export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorBody;
  meta?: Record<string, unknown>;
}

export type NodeStatus =
  | "not_started"
  | "ready"
  | "in_progress"
  | "committed"
  | "completed"
  | "blocked"
  | "failed"
  | "needs_review";

export type ProjectStatus = "generating" | "ready" | "failed";

export interface ProjectRecord {
  id: string;
  owner_id: string;
  name: string;
  idea: string;
  status: ProjectStatus | string;
  current_stage: string | null;
  repo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  idea: string;
  name?: string;
  repo_url?: string | null;
}

export interface CreateProjectResponse {
  success: true;
  id: string;
  status: string;
  data: ProjectRecord;
}

export interface ListProjectsResponse {
  success: true;
  data: ProjectRecord[];
}

export interface RequirementRecord {
  id: string;
  project_id: string;
  key: string;
  title: string;
  description: string | null;
  created_at: string;
}

export interface NodeRecord {
  id: string;
  project_id: string;
  node_key: string;
  phase: string;
  title: string;
  type: string | null;
  status: NodeStatus | string;
  requirement_id: string | null;
  requirement_key?: string | null;
  files: string[];
  explanation: string | null;
  acceptance: string[];
  tests: string[];
  prompt: string | null;
  created_at: string;
}

export interface ComputedNode extends NodeRecord {
  status: NodeStatus;
  computed_status: NodeStatus;
  is_ready: boolean;
  is_blocked: boolean;
  dependencies: string[];
  blocked_by: string[];
}

export interface GraphEdge {
  id?: string;
  project_id?: string;
  from_node: string;
  to_node: string;
  from_node_key: string;
  to_node_key: string;
  type: string;
  source: string;
  target: string;
}

export interface ProjectGraphData {
  project_id: string;
  project: ProjectRecord;
  nodes: ComputedNode[];
  edges: GraphEdge[];
  requirements: RequirementRecord[];
}

export interface ProjectGraphResponse {
  success: true;
  project_id: string;
  status: string;
  nodes: ComputedNode[];
  edges: GraphEdge[];
  data: ProjectGraphData;
}

export type PipelineStage =
  "requirements" | "architecture" | "decomposition" | "criteria";

export interface RunProjectResponse {
  success: true;
  stage: PipelineStage | null;
  done: boolean;
  data: {
    stage: PipelineStage | null;
    done: boolean;
  };
}

export interface NodeDetailResponse {
  success: true;
  id: string;
  node_key: string;
  status: string;
  is_blocked: boolean;
  blocked_by: string[];
  dependencies: string[];
  data: NodeRecord;
}

export interface UpdateNodeStatusInput {
  status: NodeStatus;
  prompt?: string | null;
}

export interface UpdateNodeStatusResponse {
  success: true;
  id: string;
  node_key: string;
  status: string;
  data: NodeRecord;
}

export type LlmState =
  "available" | "unavailable" | "key_missing" | "key_invalid";

export interface LlmCandidate {
  name: string;
  version: number;
  tier: "pro" | "flash" | "flash-lite" | string;
  preview: boolean;
  state: "selected" | "failed" | "untested";
  reason?: string;
}

export interface LlmStatusResponse {
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

export interface HealthResponse {
  status: "ok" | "unavailable";
  service: "kalp-io-backend";
  timestamp: string;
  database: {
    ok: boolean;
    latencyMs: number;
  };
}

export interface PingResponse {
  status: "ok";
  message: "pong";
  timestamp: string;
  service: "kalp-io-backend";
}
