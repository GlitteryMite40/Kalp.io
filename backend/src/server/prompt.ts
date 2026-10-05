import {
  NodeSchema,
  type Node,
  type Edge,
  type Requirement,
} from "@/lib/schema";
import { BadRequestError } from "@/lib/errors";

export const PROMPT_GENERATOR_VERSION = "prompt.v1";

export interface ProjectContext {
  name?: string;
  title?: string;
  idea?: string;
  description?: string;
  stack?: string | string[];
  components?:
    string | string[] | Array<{ name: string; description?: string }>;
  assumptions?: string | string[];
  guidelines?: string | string[];
  repoLayout?: string;
  [key: string]: unknown;
}

export interface DependencyInfo {
  node_key?: string;
  key?: string;
  id?: string;
  title?: string;
  phase?: string;
  status?: string;
  type?: string;
  files?: string[];
  explanation?: string;
}

export interface NodePromptInput {
  node: Node | Record<string, unknown>;
  project?: ProjectContext | string;
  projectContext?: ProjectContext | string;
  requirement?: Requirement | Record<string, unknown> | null;
  dependencies?: Array<
    DependencyInfo | Node | Record<string, unknown> | string
  >;
  files?: string[];
  acceptance?: string[];
  criteria?: string[];
  tests?: string[];
  customInstructions?: string;
}

export interface GraphPromptInput {
  nodes: Node[] | Array<Record<string, unknown>>;
  edges?: Edge[] | Array<Record<string, unknown>>;
  requirements?: Requirement[] | Array<Record<string, unknown>>;
  project?: ProjectContext | string;
  projectContext?: ProjectContext | string;
  [key: string]: unknown;
}

export interface PromptOptions {
  project?: ProjectContext | string;
  projectContext?: ProjectContext | string;
  customInstructions?: string;
}

export interface EnrichedGraphWithPrompts {
  nodes: Node[];
  edges: Edge[];
  requirements?: Requirement[];
  prompts: Record<string, string>;
  version: string;
}

/**
 * Formats a commit message following the rule: '[node-ID] message'
 */
export function formatCommitMessage(nodeId: string, message: string): string {
  const cleanId = (nodeId ?? "").trim().replace(/^\[|\]$/g, "");
  const cleanMsg = (message ?? "").trim().replace(/^\[[^\]]+\]\s*/, "");
  return `[${cleanId}] ${cleanMsg}`;
}

/**
 * Parses a commit message following the rule: '[node-ID] message'
 */
export function parseCommitMessage(
  commitMsg: string,
): { nodeId: string; message: string } | null {
  if (typeof commitMsg !== "string") return null;
  const match = commitMsg.trim().match(/^\[([^\]]+)\]\s*(.+)$/);
  if (!match) return null;
  return {
    nodeId: match[1].trim(),
    message: match[2].trim(),
  };
}

/**
 * Builds the agent prompt for an actionable node in the build graph.
 *
 * Includes:
 * 1. Project Context
 * 2. Requirement
 * 3. Dependencies
 * 4. Files
 * 5. Acceptance Criteria
 * 6. Tests
 * 7. Commit Rule ('[node-ID] message')
 */
export function buildNodePrompt(input: NodePromptInput): string {
  if (!input || !input.node) {
    throw new BadRequestError("Node input cannot be empty", {
      code: "INVALID_NODE",
    });
  }

  const rawNode = input.node as Record<string, unknown>;
  const nodeKey = (rawNode.node_key ?? rawNode.key ?? rawNode.id ?? "")
    .toString()
    .trim();

  if (!nodeKey) {
    throw new BadRequestError("Node is missing a node_key or id", {
      code: "INVALID_NODE",
    });
  }

  const title = (rawNode.title ?? nodeKey).toString().trim();
  const phase = (rawNode.phase ?? "").toString().trim();
  const type = (rawNode.type ?? "").toString().trim();
  const status = (rawNode.status ?? "not_started").toString().trim();
  const explanation =
    typeof rawNode.explanation === "string" ? rawNode.explanation.trim() : "";

  // 1. Project Context Section
  const ctx = input.projectContext ?? input.project;
  const projectLines: string[] = [];

  if (typeof ctx === "string" && ctx.trim().length > 0) {
    projectLines.push(`- **Overview**: ${ctx.trim()}`);
  } else if (typeof ctx === "object" && ctx !== null) {
    const pName = ctx.name || ctx.title;
    if (pName) {
      projectLines.push(`- **Project**: ${pName}`);
    }
    const pDesc = ctx.description || ctx.idea;
    if (pDesc) {
      projectLines.push(`- **Overview**: ${pDesc}`);
    }
    if (ctx.stack) {
      const stackStr = Array.isArray(ctx.stack)
        ? ctx.stack.join(", ")
        : String(ctx.stack);
      projectLines.push(`- **Stack**: ${stackStr}`);
    }
    if (ctx.components) {
      if (Array.isArray(ctx.components)) {
        const compStr = ctx.components
          .map((c) =>
            typeof c === "string"
              ? c
              : typeof c === "object" && c && "name" in c
                ? (c as { name: string }).name
                : JSON.stringify(c),
          )
          .join(", ");
        projectLines.push(`- **Components**: ${compStr}`);
      } else {
        projectLines.push(`- **Components**: ${ctx.components}`);
      }
    }
    if (ctx.repoLayout) {
      projectLines.push(`- **Repo Layout**: ${ctx.repoLayout}`);
    }
    if (ctx.guidelines) {
      const guideStr = Array.isArray(ctx.guidelines)
        ? ctx.guidelines.join("; ")
        : String(ctx.guidelines);
      projectLines.push(`- **Guidelines**: ${guideStr}`);
    }
  }

  if (projectLines.length === 0) {
    projectLines.push(
      "- **Project**: Kalp.io Project",
      "- **Overview**: Dependency-aware build graph execution.",
    );
  }

  // 2. Requirement Section
  const reqObj = input.requirement as Record<string, unknown> | null;
  const reqKey = (
    reqObj?.key ??
    rawNode.requirement_key ??
    rawNode.requirementKey ??
    ""
  )
    .toString()
    .trim();
  const reqTitle = (reqObj?.title ?? reqKey).toString().trim();
  const reqDesc =
    typeof reqObj?.description === "string" ? reqObj.description.trim() : "";

  const requirementLines: string[] = [];
  if (reqKey || reqTitle) {
    if (reqKey) requirementLines.push(`- **Key**: ${reqKey}`);
    if (reqTitle && reqTitle !== reqKey)
      requirementLines.push(`- **Title**: ${reqTitle}`);
    if (reqDesc) requirementLines.push(`- **Description**: ${reqDesc}`);
  } else {
    requirementLines.push("- None (self-contained foundational task).");
  }

  // 3. Dependencies Section
  const dependencies = input.dependencies ?? [];
  const dependencyLines: string[] = [];

  if (dependencies.length > 0) {
    dependencyLines.push(
      "Prerequisites that must be completed before starting this task:",
    );
    for (const dep of dependencies) {
      if (typeof dep === "string") {
        dependencyLines.push(`- ${dep}`);
      } else if (typeof dep === "object" && dep !== null) {
        const d = dep as Record<string, unknown>;
        const dKey = (d.node_key ?? d.key ?? d.id ?? "Unknown").toString();
        const dTitle = (d.title ?? "").toString();
        const dPhase = d.phase ? `Phase: ${d.phase}` : "";
        const dStatus = d.status ? `Status: ${d.status}` : "";
        const meta = [dPhase, dStatus].filter(Boolean).join(", ");
        const metaStr = meta ? ` (${meta})` : "";
        dependencyLines.push(
          `- [${dKey}] ${dTitle || "Prerequisite Task"}${metaStr}`,
        );
      }
    }
  } else {
    dependencyLines.push(
      "- None (this is an initial setup / root node with no prerequisites).",
    );
  }

  // 4. Files Section
  const filesList =
    input.files ??
    (Array.isArray(rawNode.files) ? (rawNode.files as string[]) : []);
  const fileLines: string[] = [];

  if (filesList.length > 0) {
    fileLines.push("Target files to create, modify, or test:");
    for (const f of filesList) {
      fileLines.push(`- \`${f}\``);
    }
  } else {
    fileLines.push(
      "- None specified in advance. Create or modify files as necessary to satisfy the criteria.",
    );
  }

  // 5. Criteria Section
  const criteriaList =
    input.criteria ??
    input.acceptance ??
    (Array.isArray(rawNode.acceptance) ? (rawNode.acceptance as string[]) : []);
  const criteriaLines: string[] = [];

  if (criteriaList.length > 0) {
    criteriaLines.push(
      "The implementation must satisfy the following criteria:",
    );
    for (const c of criteriaList) {
      criteriaLines.push(`- [ ] ${c}`);
    }
  } else {
    criteriaLines.push("- None specified.");
  }

  // 6. Tests Section
  const testsList =
    input.tests ??
    (Array.isArray(rawNode.tests) ? (rawNode.tests as string[]) : []);
  const testLines: string[] = [];

  if (testsList.length > 0) {
    testLines.push("Verify the implementation with the following test cases:");
    for (const t of testsList) {
      testLines.push(`- [ ] ${t}`);
    }
  } else {
    testLines.push("- None specified.");
  }

  // 7. Commit Rule Section
  const commitLines: string[] = [
    "Rule: Commit as '[node-ID] message'.",
    "All commits for this task must follow the format:",
    `\`[${nodeKey}] <message>\``,
    "",
    "Example:",
    `\`git commit -m "[${nodeKey}] ${title}"\``,
  ];

  // Header meta line
  const metaParts: string[] = [];
  if (phase) metaParts.push(`**Phase**: ${phase}`);
  if (type) metaParts.push(`**Type**: ${type}`);
  if (status) metaParts.push(`**Status**: ${status}`);
  const metaLine = metaParts.length > 0 ? metaParts.join(" | ") : "";

  const sections: string[] = [
    `# TASK: [${nodeKey}] ${title}`,
    ...(metaLine ? [metaLine] : []),
    ...(explanation ? [explanation] : []),
    "",
    "## Project Context",
    projectLines.join("\n"),
    "",
    "## Requirement",
    requirementLines.join("\n"),
    "",
    "## Dependencies",
    dependencyLines.join("\n"),
    "",
    "## Files",
    fileLines.join("\n"),
    "",
    "## Acceptance Criteria",
    criteriaLines.join("\n"),
    "",
    "## Tests",
    testLines.join("\n"),
    "",
    "## Commit Rule",
    commitLines.join("\n"),
  ];

  if (input.customInstructions && input.customInstructions.trim().length > 0) {
    sections.push(
      "",
      "## Additional Instructions",
      input.customInstructions.trim(),
    );
  }

  return sections.join("\n").trim() + "\n";
}

/**
 * Normalizes graph input components (nodes, edges, requirements).
 */
function resolveGraphInput(
  input: GraphPromptInput | Node[] | Array<Record<string, unknown>>,
): {
  rawNodes: Array<Record<string, unknown>>;
  rawEdges: Array<Record<string, unknown>>;
  rawRequirements: Array<Record<string, unknown>>;
  projectContext?: ProjectContext | string;
} {
  if (!input) {
    throw new BadRequestError("Input graph or nodes cannot be empty", {
      code: "INVALID_INPUT",
    });
  }

  let rawNodes: Array<Record<string, unknown>> = [];
  let rawEdges: Array<Record<string, unknown>> = [];
  let rawRequirements: Array<Record<string, unknown>> = [];
  let projectContext: ProjectContext | string | undefined;

  if (Array.isArray(input)) {
    rawNodes = input as Array<Record<string, unknown>>;
  } else if (typeof input === "object") {
    const obj = input as GraphPromptInput;
    if (Array.isArray(obj.nodes)) {
      rawNodes = obj.nodes as Array<Record<string, unknown>>;
    }
    if (Array.isArray(obj.edges)) {
      rawEdges = obj.edges as Array<Record<string, unknown>>;
    }
    if (Array.isArray(obj.requirements)) {
      rawRequirements = obj.requirements as Array<Record<string, unknown>>;
    }
    projectContext = obj.projectContext ?? obj.project;
  }

  if (rawNodes.length === 0) {
    throw new BadRequestError("Graph must contain at least one node", {
      code: "NODES_EMPTY",
    });
  }

  for (let i = 0; i < rawNodes.length; i++) {
    const n = rawNodes[i];
    const key = (n.node_key ?? n.key ?? n.id ?? "").toString().trim();
    if (!key) {
      throw new BadRequestError(
        `Node at index ${i} is missing node_key or id`,
        {
          code: "INVALID_NODE",
        },
      );
    }
  }

  return { rawNodes, rawEdges, rawRequirements, projectContext };
}

/**
 * Generates and attaches agent prompts for each actionable node in the build graph.
 */
export function generateGraphPrompts(
  input: GraphPromptInput | Node[] | Array<Record<string, unknown>>,
  options?: PromptOptions,
): EnrichedGraphWithPrompts {
  const {
    rawNodes,
    rawEdges,
    rawRequirements,
    projectContext: inputProjectContext,
  } = resolveGraphInput(input);

  const projectContext =
    options?.projectContext ?? options?.project ?? inputProjectContext;

  // Build lookups
  const nodeMap = new Map<string, Record<string, unknown>>();
  for (const n of rawNodes) {
    const key = (n.node_key ?? n.key ?? "").toString().trim();
    const id = (n.id ?? "").toString().trim();
    if (key) nodeMap.set(key, n);
    if (id) nodeMap.set(id, n);
  }

  const reqMap = new Map<string, Record<string, unknown>>();
  for (const r of rawRequirements) {
    const key = (r.key ?? "").toString().trim();
    const id = (r.id ?? "").toString().trim();
    if (key) reqMap.set(key, r);
    if (id) reqMap.set(id, r);
  }

  const prompts: Record<string, string> = {};

  const finalNodes: Node[] = rawNodes.map((n) => {
    const nodeKey = (n.node_key ?? n.key ?? n.id ?? "").toString().trim();

    // Find prerequisite dependencies from DEPENDS_ON edges
    const prereqNodes: DependencyInfo[] = rawEdges
      .filter((e) => {
        const from = (e.from_node ?? e.from ?? "").toString().trim();
        const type = (e.type ?? "DEPENDS_ON").toString().trim();
        return from === nodeKey && type === "DEPENDS_ON";
      })
      .map((e) => {
        const to = (e.to_node ?? e.to ?? "").toString().trim();
        const targetNode = nodeMap.get(to);
        return {
          node_key: to,
          title: targetNode?.title as string | undefined,
          phase: targetNode?.phase as string | undefined,
          status: targetNode?.status as string | undefined,
          type: targetNode?.type as string | undefined,
          files: targetNode?.files as string[] | undefined,
        };
      });

    // Find linked requirement
    const reqKey = (n.requirement_key ?? "").toString().trim();
    const reqId = (n.requirement_id ?? "").toString().trim();
    const linkedReq = reqMap.get(reqKey) ?? reqMap.get(reqId) ?? null;

    const promptText = buildNodePrompt({
      node: n,
      projectContext,
      requirement: linkedReq as Requirement | null,
      dependencies: prereqNodes,
      customInstructions: options?.customInstructions,
    });

    prompts[nodeKey] = promptText;

    const candidateNode = {
      ...n,
      prompt: promptText,
    };

    return NodeSchema.parse(candidateNode);
  });

  return {
    nodes: finalNodes,
    edges: rawEdges as Edge[],
    requirements: rawRequirements as Requirement[],
    prompts,
    version: PROMPT_GENERATOR_VERSION,
  };
}

// Aliases for convenience
export const generateNodePrompt = buildNodePrompt;
export const attachNodePrompts = generateGraphPrompts;
export const generatePrompts = generateGraphPrompts;
export const prompt = buildNodePrompt;
