import type {
  ConnectRepoInput,
  CreateProjectInput,
  CreateProjectResponse,
  HealthResponse,
  ListProjectsResponse,
  LlmStatusResponse,
  NodeDetailResponse,
  PingResponse,
  ProjectGraphResponse,
  ProjectRepoInfo,
  RunProjectResponse,
  UpdateNodeStatusInput,
  UpdateNodeStatusResponse,
} from "../types/api";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(args: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  }) {
    super(args.message);
    this.name = "ApiClientError";
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
  }
}

export type ApiFetch = typeof fetch;

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  fetcher?: ApiFetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractMessage(
  body: unknown,
  status: number,
): { message: string; code: string; details?: unknown } {
  if (typeof body === "string" && body.trim().length > 0) {
    const trimmed = body.trim();
    if (trimmed.includes("<html") || trimmed.includes("<!DOCTYPE")) {
      const titleMatch = trimmed.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch?.[1]) {
        return {
          code: `HTTP_${status}`,
          message: titleMatch[1].trim(),
        };
      }
      return {
        code: `HTTP_${status}`,
        message: `Server returned an HTML error response (HTTP ${status}).`,
      };
    }
    return {
      code: `HTTP_${status}`,
      message: trimmed,
    };
  }

  if (isRecord(body)) {
    const error = body.error;
    if (isRecord(error)) {
      const code =
        typeof error.code === "string" && error.code.trim().length > 0
          ? error.code
          : `HTTP_${status}`;
      const message =
        typeof error.message === "string" && error.message.trim().length > 0
          ? error.message
          : `Request failed with HTTP ${status}.`;
      return { code, message, details: error.details };
    }

    if (typeof error === "string" && error.trim().length > 0) {
      return {
        code: `HTTP_${status}`,
        message: error.trim(),
      };
    }

    if (typeof body.message === "string" && body.message.trim().length > 0) {
      return {
        code:
          typeof body.code === "string" && body.code.trim().length > 0
            ? body.code
            : `HTTP_${status}`,
        message: body.message.trim(),
        details: body.details,
      };
    }
  }

  return {
    code: `HTTP_${status}`,
    message: `Request failed with HTTP ${status}.`,
  };
}

function errorFromBody(status: number, body: unknown): ApiClientError {
  const { code, message, details } = extractMessage(body, status);
  return new ApiClientError({
    status,
    code,
    message,
    details,
  });
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, fetcher = fetch, headers, ...init } = options;
  const requestHeaders = new Headers(headers);

  const requestInit: RequestInit = {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: requestHeaders,
  };

  if (body !== undefined) {
    requestHeaders.set("content-type", "application/json");
    requestInit.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetcher(path, requestInit);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Network request failed before the server responded.";
    throw new ApiClientError({
      status: 0,
      code: "NETWORK_ERROR",
      message,
    });
  }

  const data = await readJson(response);

  if (!response.ok) {
    throw errorFromBody(response.status, data);
  }

  return data as T;
}

export async function listProjects(options?: ApiRequestOptions) {
  const response = await apiRequest<ListProjectsResponse>("/api/projects", {
    method: "GET",
    ...options,
  });
  return response.data;
}

export async function createProject(
  input: CreateProjectInput,
  options?: ApiRequestOptions,
) {
  const response = await apiRequest<CreateProjectResponse>("/api/projects", {
    method: "POST",
    body: input,
    ...options,
  });
  return response.data;
}

export async function deleteProject(
  projectId: string,
  options?: ApiRequestOptions,
) {
  return apiRequest<{
    success: true;
    message?: string;
    id: string;
  }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    ...options,
  });
}

export async function getProjectGraph(
  projectId: string,
  options?: ApiRequestOptions,
) {
  const response = await apiRequest<ProjectGraphResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/graph`,
    {
      method: "GET",
      ...options,
    },
  );
  return response.data;
}

export async function runNextProjectStage(
  projectId: string,
  options?: ApiRequestOptions,
) {
  const response = await apiRequest<RunProjectResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/run`,
    {
      method: "POST",
      ...options,
    },
  );
  return response.data;
}

export async function getNode(nodeId: string, options?: ApiRequestOptions) {
  return apiRequest<NodeDetailResponse>(
    `/api/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: "GET",
      ...options,
    },
  );
}

export async function updateNodeStatus(
  nodeId: string,
  input: UpdateNodeStatusInput,
  options?: ApiRequestOptions,
) {
  const response = await apiRequest<UpdateNodeStatusResponse>(
    `/api/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: "PATCH",
      body: input,
      ...options,
    },
  );
  return response.data;
}

export async function getLlmStatus(
  options?: ApiRequestOptions & { refresh?: boolean },
) {
  const { refresh, ...requestOptions } = options ?? {};
  const query = refresh ? "?refresh=1" : "";
  return apiRequest<LlmStatusResponse>(`/api/llm/status${query}`, {
    method: "GET",
    ...requestOptions,
  });
}

export async function getProjectRepo(
  projectId: string,
  options?: ApiRequestOptions,
): Promise<ProjectRepoInfo> {
  const res = await apiRequest<{
    success: true;
    data: ProjectRepoInfo;
  }>(`/api/projects/${encodeURIComponent(projectId)}/repo`, {
    method: "GET",
    ...options,
  });
  return res.data;
}

export async function connectProjectRepo(
  projectId: string,
  input: ConnectRepoInput,
  options?: ApiRequestOptions,
): Promise<ProjectRepoInfo> {
  const res = await apiRequest<{
    success: true;
    data: ProjectRepoInfo;
  }>(`/api/projects/${encodeURIComponent(projectId)}/repo`, {
    method: "POST",
    body: input,
    ...options,
  });
  return res.data;
}

export async function disconnectProjectRepo(
  projectId: string,
  options?: ApiRequestOptions,
): Promise<{ disconnected: boolean }> {
  const res = await apiRequest<{
    success: true;
    data: { disconnected: boolean };
  }>(`/api/projects/${encodeURIComponent(projectId)}/repo`, {
    method: "DELETE",
    ...options,
  });
  return res.data;
}

export async function getHealth(options?: ApiRequestOptions) {
  return apiRequest<HealthResponse>("/api/health", {
    method: "GET",
    ...options,
  });
}

export async function pingBackend(options?: ApiRequestOptions) {
  return apiRequest<PingResponse>("/api/ping", {
    method: "GET",
    ...options,
  });
}

export const api = {
  request: apiRequest,
  listProjects,
  createProject,
  deleteProject,
  getProjectGraph,
  runNextProjectStage,
  getNode,
  updateNodeStatus,
  getProjectRepo,
  connectProjectRepo,
  disconnectProjectRepo,
  getLlmStatus,
  getHealth,
  pingBackend,
};

export type * from "../types/api";
