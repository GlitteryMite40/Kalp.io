/**
 * Export Plan Utilities (Task 05.8: Export plan)
 *
 * Provides browser-side generation and downloading of build plans as:
 * 1. Machine-readable JSON (with full schema, nodes, edges, dependencies & metadata)
 * 2. GitHub-compatible Markdown Checklist (grouped by phase with dependencies and verification tests)
 *
 * Both formats guarantee inclusion of every node and its complete dependency list.
 */

import type {
  ComputedNode,
  NodeRecord,
  GraphEdge,
  ProjectRecord,
  RequirementRecord,
} from "../types/api";

export interface ExportPlanProject {
  id?: string;
  name?: string;
  idea?: string;
  status?: string;
  repo_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExportPlanNode {
  id?: string;
  node_key: string;
  title: string;
  phase?: string;
  type?: string | null;
  status?: string;
  dependencies?: string[];
  blocked_by?: string[];
  files?: string[];
  acceptance?: string[];
  tests?: string[];
  explanation?: string | null;
  prompt?: string | null;
  requirement_key?: string | null;
  requirement_id?: string | null;
}

export interface ExportPlanEdge {
  from_node?: string;
  to_node?: string;
  from_node_key?: string;
  to_node_key?: string;
  type?: string;
}

export interface ExportPlanRequirement {
  id?: string;
  key?: string;
  title: string;
  description?: string | null;
}

export type AnyProjectInput = ProjectRecord | ExportPlanProject;
export type AnyNodeInput = ComputedNode | NodeRecord | ExportPlanNode;
export type AnyEdgeInput = GraphEdge | ExportPlanEdge;
export type AnyRequirementInput = RequirementRecord | ExportPlanRequirement;

export interface ExportPlanInput {
  project?: AnyProjectInput | null;
  nodes: AnyNodeInput[];
  edges?: AnyEdgeInput[];
  requirements?: AnyRequirementInput[];
  exportedAt?: string;
}

export interface ExportedPlanJsonNode {
  node_key: string;
  title: string;
  phase: string;
  type: string | null;
  status: string;
  dependencies: string[];
  files: string[];
  acceptance: string[];
  tests: string[];
  explanation: string | null;
  prompt: string | null;
  requirement_key: string | null;
}

export interface ExportedPlanJsonEdge {
  from: string;
  to: string;
  type: string;
}

export interface ExportedPlanJson {
  version: "1.0";
  format: "kalp-plan-v1";
  exported_at: string;
  project: {
    id: string | null;
    name: string;
    idea: string | null;
    status: string | null;
    repo_url: string | null;
  };
  summary: {
    total_nodes: number;
    total_edges: number;
    completed_nodes: number;
    in_progress_nodes: number;
    ready_nodes: number;
    blocked_nodes: number;
    by_phase: Record<string, number>;
  };
  nodes: ExportedPlanJsonNode[];
  edges: ExportedPlanJsonEdge[];
  requirements?: Array<{
    key: string;
    title: string;
    description: string | null;
  }>;
}

export interface DownloadFileOptions {
  documentObj?: Document | null;
  revokeTimeoutMs?: number;
  createBlobFn?: (parts: BlobPart[], options?: BlobPropertyBag) => Blob;
  createObjectURLFn?: (blob: Blob) => string;
  revokeObjectURLFn?: (url: string) => void;
}

/**
 * Resolves all upstream dependencies for a node.
 * Merges dependencies declared on the node itself with incoming edges.
 */
export function resolveNodeDependencies(
  node: AnyNodeInput,
  edges: AnyEdgeInput[] = [],
  allNodes: AnyNodeInput[] = [],
): string[] {
  const deps = new Set<string>();

  // 1. Direct dependencies array on node record
  if ("dependencies" in node && Array.isArray(node.dependencies)) {
    for (const dep of node.dependencies) {
      if (typeof dep === "string" && dep.trim()) {
        deps.add(dep.trim());
      }
    }
  }

  // 2. Incoming edges pointing to this node
  const currentKey = node.node_key;
  const currentId = node.id;

  for (const edge of edges) {
    const isTarget =
      ("to_node_key" in edge &&
        edge.to_node_key &&
        edge.to_node_key === currentKey) ||
      (edge.to_node &&
        (edge.to_node === currentKey || edge.to_node === currentId));

    if (isTarget) {
      let sourceKey = "from_node_key" in edge ? edge.from_node_key : undefined;
      if (!sourceKey && edge.from_node) {
        const found = allNodes.find(
          (n) => n.id === edge.from_node || n.node_key === edge.from_node,
        );
        sourceKey = found ? found.node_key : edge.from_node;
      }

      if (sourceKey && sourceKey.trim()) {
        deps.add(sourceKey.trim());
      }
    }
  }

  return Array.from(deps).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

/**
 * Sanitizes a title for single-line checklist headers by replacing
 * embedded line breaks with a single space while keeping all punctuation and characters intact.
 */
function sanitizeSingleLine(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\r?\n+/g, " ").trim();
}

/**
 * Sanitizes a project name for use in file downloads across Windows, macOS, and Linux.
 */
export function sanitizeFilename(
  name: string | null | undefined,
  fallback = "kalp-project-plan",
): string {
  if (!name || typeof name !== "string") {
    return fallback;
  }

  // Replace invalid filesystem characters: \ / : * ? " < > | control codes
  const sanitized = name
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim()
    .slice(0, 100);

  return sanitized || fallback;
}

/**
 * Computes default filename with current date stamp.
 */
export function getDefaultFilename(
  input: ExportPlanInput,
  ext: "json" | "md",
): string {
  const base = sanitizeFilename(input.project?.name || "project-plan");
  const dateStr = new Date().toISOString().slice(0, 10);
  return `${base}-${dateStr}.${ext}`;
}

/**
 * Generates formatted JSON containing the full plan, all nodes, and their dependencies.
 */
export function generatePlanJson(input: ExportPlanInput): string {
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const edges = Array.isArray(input.edges) ? input.edges : [];
  const projectName = input.project?.name?.trim() || "Untitled Project";

  let completedCount = 0;
  let inProgressCount = 0;
  let readyCount = 0;
  let blockedCount = 0;
  const byPhase: Record<string, number> = {};

  const exportedNodes: ExportedPlanJsonNode[] = nodes.map((node) => {
    const status = String(node.status || "not_started");
    if (status === "completed" || status === "committed") completedCount++;
    else if (status === "in_progress") inProgressCount++;
    else if (status === "ready") readyCount++;
    else if (status === "blocked") blockedCount++;

    const phase = String(node.phase || "Unphased");
    byPhase[phase] = (byPhase[phase] || 0) + 1;

    const resolvedDeps = resolveNodeDependencies(node, edges, nodes);

    return {
      node_key: String(node.node_key),
      title: String(node.title ?? ""),
      phase: String(node.phase || "01"),
      type: node.type ? String(node.type) : null,
      status,
      dependencies: resolvedDeps,
      files: Array.isArray(node.files) ? node.files.map(String) : [],
      acceptance: Array.isArray(node.acceptance)
        ? node.acceptance.map(String)
        : [],
      tests: Array.isArray(node.tests) ? node.tests.map(String) : [],
      explanation: node.explanation ? String(node.explanation) : null,
      prompt: node.prompt ? String(node.prompt) : null,
      requirement_key: node.requirement_key
        ? String(node.requirement_key)
        : null,
    };
  });

  const exportedEdges: ExportedPlanJsonEdge[] = edges.map((e) => {
    const fromKey =
      ("from_node_key" in e && e.from_node_key) || e.from_node || "";
    const toKey = ("to_node_key" in e && e.to_node_key) || e.to_node || "";
    return {
      from: String(fromKey),
      to: String(toKey),
      type: String(e.type || "dependency"),
    };
  });

  const exportedPayload: ExportedPlanJson = {
    version: "1.0",
    format: "kalp-plan-v1",
    exported_at: input.exportedAt || new Date().toISOString(),
    project: {
      id: input.project?.id ? String(input.project.id) : null,
      name: projectName,
      idea: input.project?.idea ? String(input.project.idea) : null,
      status: input.project?.status ? String(input.project.status) : null,
      repo_url: input.project?.repo_url ? String(input.project.repo_url) : null,
    },
    summary: {
      total_nodes: nodes.length,
      total_edges: edges.length,
      completed_nodes: completedCount,
      in_progress_nodes: inProgressCount,
      ready_nodes: readyCount,
      blocked_nodes: blockedCount,
      by_phase: byPhase,
    },
    nodes: exportedNodes,
    edges: exportedEdges,
  };

  if (Array.isArray(input.requirements) && input.requirements.length > 0) {
    exportedPayload.requirements = input.requirements.map((req, idx) => ({
      key: req.key ? String(req.key) : `REQ-${idx + 1}`,
      title: String(req.title ?? ""),
      description: req.description ? String(req.description) : null,
    }));
  }

  return JSON.stringify(exportedPayload, null, 2);
}

/**
 * Generates a GitHub-compatible Markdown checklist grouped by phase with every node and its dependencies.
 */
export function generatePlanMarkdown(input: ExportPlanInput): string {
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const edges = Array.isArray(input.edges) ? input.edges : [];
  const projectName =
    sanitizeSingleLine(input.project?.name) || "Untitled Project";
  const idea = sanitizeSingleLine(input.project?.idea);

  let completedCount = 0;
  for (const n of nodes) {
    const s = String(n.status || "");
    if (s === "completed" || s === "committed") {
      completedCount++;
    }
  }

  const totalNodes = nodes.length;
  const pct =
    totalNodes > 0 ? Math.round((completedCount / totalNodes) * 100) : 0;
  const exportTimestamp = input.exportedAt || new Date().toISOString();

  // Group nodes by phase
  const phaseMap = new Map<string, AnyNodeInput[]>();
  for (const node of nodes) {
    const phase = sanitizeSingleLine(node.phase) || "General";
    if (!phaseMap.has(phase)) {
      phaseMap.set(phase, []);
    }
    phaseMap.get(phase)!.push(node);
  }

  // Sort phase keys naturally (e.g. "01", "02", "10")
  const sortedPhases = Array.from(phaseMap.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  const lines: string[] = [];

  // Header Section
  lines.push(`# ${projectName} - Build Plan Checklist`);
  lines.push("");
  if (idea) {
    lines.push(`> ${idea}`);
    lines.push("");
  }
  lines.push(
    `**Exported**: ${exportTimestamp} | **Progress**: ${completedCount}/${totalNodes} completed (${pct}%) | **Total Nodes**: ${totalNodes} | **Dependencies**: ${edges.length}`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  // Plan Phases & Nodes Checklist
  if (totalNodes === 0) {
    lines.push("## Plan Overview");
    lines.push("");
    lines.push("_No nodes present in this plan._");
    lines.push("");
  } else {
    for (const phase of sortedPhases) {
      const phaseNodes = phaseMap.get(phase) || [];
      // Sort nodes within phase by node_key naturally
      phaseNodes.sort((a, b) =>
        String(a.node_key).localeCompare(String(b.node_key), undefined, {
          numeric: true,
        }),
      );

      const isPhaseNumber = /^\d+$/.test(phase);
      const phaseHeading = isPhaseNumber ? `Phase ${phase}` : phase;
      lines.push(
        `## ${phaseHeading} (${phaseNodes.length} task${phaseNodes.length === 1 ? "" : "s"})`,
      );
      lines.push("");

      for (const node of phaseNodes) {
        const isDone =
          node.status === "completed" || node.status === "committed";
        const checkMark = isDone ? "[x]" : "[ ]";
        const titleLine = sanitizeSingleLine(node.title) || "Untitled Task";
        const statusLabel = node.status || "not_started";
        const deps = resolveNodeDependencies(node, edges, nodes);

        // Checklist header item
        lines.push(
          `- ${checkMark} **[${node.node_key}] ${titleLine}** \`(${statusLabel})\``,
        );

        // Dependencies specification (ACCEPTANCE CRITERIA: files contain every node and its dependencies)
        if (deps.length > 0) {
          lines.push(`  - **Dependencies**: ${deps.join(", ")}`);
        } else {
          lines.push(`  - **Dependencies**: None (root task)`);
        }

        // Phase / Type line
        const metaParts: string[] = [];
        if (node.phase) metaParts.push(`**Phase**: ${node.phase}`);
        if (node.type) metaParts.push(`**Type**: ${node.type}`);
        if (node.requirement_key)
          metaParts.push(`**Requirement**: ${node.requirement_key}`);
        if (metaParts.length > 0) {
          lines.push(`  - ${metaParts.join(" | ")}`);
        }

        // Files
        if (Array.isArray(node.files) && node.files.length > 0) {
          const filesFormatted = node.files
            .map((f) => `\`${sanitizeSingleLine(f)}\``)
            .join(", ");
          lines.push(`  - **Files**: ${filesFormatted}`);
        }

        // Purpose / Explanation
        if (node.explanation) {
          lines.push(
            `  - **Purpose**: ${sanitizeSingleLine(node.explanation)}`,
          );
        }

        // Acceptance Criteria
        if (Array.isArray(node.acceptance) && node.acceptance.length > 0) {
          lines.push(`  - **Acceptance Criteria**:`);
          for (const crit of node.acceptance) {
            lines.push(`    - [ ] ${sanitizeSingleLine(crit)}`);
          }
        }

        // Tests
        if (Array.isArray(node.tests) && node.tests.length > 0) {
          lines.push(`  - **Tests**:`);
          for (const test of node.tests) {
            lines.push(`    - \`$ ${sanitizeSingleLine(test)}\``);
          }
        }

        lines.push("");
      }
    }
  }

  // Footer / Attribution
  lines.push("---");
  lines.push("");
  lines.push(
    "_Generated in the browser by [Kalp.io](https://kalp.io) - Dependency-aware build graph._",
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Triggers a file download in the browser using Blob and an anchor element.
 * Safe to call in non-browser environments (returns false).
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
  options?: DownloadFileOptions,
): boolean {
  const doc =
    options?.documentObj !== undefined
      ? options.documentObj
      : typeof document !== "undefined"
        ? document
        : null;

  if (!doc || typeof Blob === "undefined") {
    return false;
  }

  try {
    const makeBlob =
      options?.createBlobFn ?? ((parts, opts) => new Blob(parts, opts));
    const blob = makeBlob([content], { type: mimeType });

    const makeUrl =
      options?.createObjectURLFn ?? ((b: Blob) => URL.createObjectURL(b));
    const revokeUrl =
      options?.revokeObjectURLFn ?? ((u: string) => URL.revokeObjectURL(u));

    const url = makeUrl(blob);
    const link = doc.createElement("a");

    link.href = url;
    link.download = filename;
    link.style.display = "none";
    doc.body.appendChild(link);
    link.click();

    const timeout = options?.revokeTimeoutMs ?? 200;
    setTimeout(() => {
      try {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
        revokeUrl(url);
      } catch {
        // Ignore cleanup errors
      }
    }, timeout);

    return true;
  } catch (err) {
    console.error("Failed to trigger file download:", err);
    return false;
  }
}

/**
 * Generates plan JSON and triggers a browser download.
 * Returns the generated JSON content.
 */
export function downloadPlanJson(
  input: ExportPlanInput,
  filename?: string,
  options?: DownloadFileOptions,
): string {
  const json = generatePlanJson(input);
  const targetFilename = filename || getDefaultFilename(input, "json");
  downloadFile(json, targetFilename, "application/json;charset=utf-8", options);
  return json;
}

/**
 * Generates plan Markdown and triggers a browser download.
 * Returns the generated Markdown content.
 */
export function downloadPlanMarkdown(
  input: ExportPlanInput,
  filename?: string,
  options?: DownloadFileOptions,
): string {
  const markdown = generatePlanMarkdown(input);
  const targetFilename = filename || getDefaultFilename(input, "md");
  downloadFile(
    markdown,
    targetFilename,
    "text/markdown;charset=utf-8",
    options,
  );
  return markdown;
}

// Aliases matching alternative consumer naming conventions
export const exportPlanAsJson = downloadPlanJson;
export const exportPlanAsMarkdown = downloadPlanMarkdown;
