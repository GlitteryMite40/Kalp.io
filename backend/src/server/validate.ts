import { findDependsOnCycle, GraphSchema } from "@/lib/schema";
import { BadRequestError } from "@/lib/errors";

export type GraphValidationErrorCode =
  | "CYCLE_DETECTED"
  | "ORPHAN_NODE"
  | "DUPLICATE_ID"
  | "DUPLICATE_NODE_KEY"
  | "DUPLICATE_EDGE"
  | "MISSING_DEPENDENCY"
  | "SCHEMA_ERROR";

export interface GraphValidationError {
  code: GraphValidationErrorCode;
  message: string;
  path?: string[];
  details?: unknown;
}

export interface GraphValidationResult {
  valid: boolean;
  errors: GraphValidationError[];
  cycle: string[] | null;
  orphans: string[];
  duplicates: {
    nodeIds: string[];
    nodeKeys: string[];
    edgeIds: string[];
    edges: string[];
    requirementKeys: string[];
  };
  missingDependencies: {
    unknownEdgeNodes: string[];
    unknownRequirementKeys: string[];
  };
}

export interface ValidateGraphOptions {
  knownRequirementKeys?: string[];
  requireRequirementKey?: boolean;
  requireFullCoverage?: boolean;
}

export interface NodeLike {
  node_key?: string;
  key?: string;
  id?: string;
  phase?: string;
  type?: string | null;
  requirement_key?: string | null;
  requirement_id?: string | null;
  [key: string]: unknown;
}

export interface EdgeLike {
  from_node?: string;
  fromNode?: string;
  from?: string;
  to_node?: string;
  toNode?: string;
  to?: string;
  type?: string;
  id?: string;
  [key: string]: unknown;
}

export interface RequirementLike {
  key?: string;
  id?: string;
  title?: string;
  [key: string]: unknown;
}

export interface GraphLike {
  nodes: NodeLike[];
  edges?: EdgeLike[];
  requirements?: RequirementLike[];
  project_id?: string;
  projectId?: string;
  [key: string]: unknown;
}

export class InvalidGraphError extends BadRequestError {
  public readonly validationErrors: GraphValidationError[];

  constructor(message: string, validationErrors: GraphValidationError[] = []) {
    super(message, { errors: validationErrors });
    this.name = "InvalidGraphError";
    this.validationErrors = validationErrors;
  }
}

/**
 * Formats validation errors into a human and LLM-friendly prompt for regeneration.
 */
export function formatValidationFeedback(
  errors: GraphValidationError[],
): string {
  const summary = errors.map((e) => `- [${e.code}] ${e.message}`).join("\n");
  return `The previous build graph failed validation with the following errors:\n${summary}\n\nPlease regenerate the graph resolving all of these errors. Ensure there are NO cycles, NO orphan nodes, NO duplicate keys or IDs, and all edge dependencies reference existing nodes.`;
}

/**
 * Normalizes node endpoint string from various alias formats.
 */
function resolveEndpoint(edge: EdgeLike, side: "from" | "to"): string {
  if (side === "from") {
    return (edge.from_node ?? edge.fromNode ?? edge.from ?? "").trim();
  }
  return (edge.to_node ?? edge.toNode ?? edge.to ?? "").trim();
}

/**
 * Thoroughly validates a build graph:
 * - Detects cycles among DEPENDS_ON edges and self-edges
 * - Detects orphan nodes (disconnected or missing prerequisite outside root setup)
 * - Detects duplicate IDs, duplicate node_keys, duplicate edges
 * - Detects missing dependencies (edges referencing non-existent nodes, invalid requirement keys)
 */
export function validateGraph(
  graph: unknown,
  options?: ValidateGraphOptions,
): GraphValidationResult {
  const errors: GraphValidationError[] = [];
  const orphans: string[] = [];
  const duplicateNodeIds: string[] = [];
  const duplicateNodeKeys: string[] = [];
  const duplicateEdgeIds: string[] = [];
  const duplicateEdges: string[] = [];
  const duplicateReqKeys: string[] = [];
  const unknownEdgeNodes: string[] = [];
  const unknownReqKeys: string[] = [];

  if (!graph || typeof graph !== "object") {
    errors.push({
      code: "SCHEMA_ERROR",
      message: "Graph must be a non-null object",
    });
    return {
      valid: false,
      errors,
      cycle: null,
      orphans,
      duplicates: {
        nodeIds: duplicateNodeIds,
        nodeKeys: duplicateNodeKeys,
        edgeIds: duplicateEdgeIds,
        edges: duplicateEdges,
        requirementKeys: duplicateReqKeys,
      },
      missingDependencies: {
        unknownEdgeNodes,
        unknownRequirementKeys: unknownReqKeys,
      },
    };
  }

  const g = graph as GraphLike;
  const rawNodes = Array.isArray(g.nodes) ? g.nodes : [];
  const rawEdges = Array.isArray(g.edges) ? g.edges : [];
  const rawRequirements = Array.isArray(g.requirements) ? g.requirements : [];

  if (rawNodes.length === 0) {
    errors.push({
      code: "SCHEMA_ERROR",
      message: "Graph must contain at least one node",
      path: ["nodes"],
    });
  }

  // 1. Check duplicate IDs and duplicate keys among nodes
  const seenNodeKeys = new Set<string>();
  const seenNodeIds = new Set<string>();
  const idOrKeyToNodeKey = new Map<string, string>();

  for (let i = 0; i < rawNodes.length; i++) {
    const node = rawNodes[i];
    const key = (node.node_key ?? node.key ?? "").trim();

    if (!key) {
      errors.push({
        code: "SCHEMA_ERROR",
        message: `Node at index ${i} is missing node_key`,
        path: ["nodes", String(i), "node_key"],
      });
      continue;
    }

    if (seenNodeKeys.has(key)) {
      duplicateNodeKeys.push(key);
      errors.push({
        code: "DUPLICATE_NODE_KEY",
        message: `Duplicate node_key "${key}" found in graph`,
        path: ["nodes", String(i), "node_key"],
      });
    } else {
      seenNodeKeys.add(key);
      idOrKeyToNodeKey.set(key, key);
    }

    if (node.id && typeof node.id === "string") {
      const id = node.id.trim();
      if (seenNodeIds.has(id)) {
        duplicateNodeIds.push(id);
        errors.push({
          code: "DUPLICATE_ID",
          message: `Duplicate node id "${id}" found in graph`,
          path: ["nodes", String(i), "id"],
        });
      } else {
        seenNodeIds.add(id);
        idOrKeyToNodeKey.set(id, key);
      }
    }
  }

  // 2. Check duplicate requirement keys and IDs
  const seenReqKeys = new Set<string>();
  const seenReqIds = new Set<string>();
  for (let i = 0; i < rawRequirements.length; i++) {
    const req = rawRequirements[i];
    const rKey = (req.key ?? "").trim();
    if (rKey) {
      if (seenReqKeys.has(rKey)) {
        duplicateReqKeys.push(rKey);
        errors.push({
          code: "DUPLICATE_ID",
          message: `Duplicate requirement key "${rKey}" found`,
          path: ["requirements", String(i), "key"],
        });
      } else {
        seenReqKeys.add(rKey);
      }
    }
    if (req.id && typeof req.id === "string") {
      const rId = req.id.trim();
      if (seenReqIds.has(rId)) {
        errors.push({
          code: "DUPLICATE_ID",
          message: `Duplicate requirement id "${rId}" found`,
          path: ["requirements", String(i), "id"],
        });
      } else {
        seenReqIds.add(rId);
      }
    }
  }

  // Known requirement keys set for checking node requirement references
  const effectiveReqKeys =
    options?.knownRequirementKeys !== undefined
      ? new Set(options.knownRequirementKeys)
      : seenReqKeys.size > 0
        ? seenReqKeys
        : null;

  if (effectiveReqKeys) {
    for (let i = 0; i < rawNodes.length; i++) {
      const node = rawNodes[i];
      const rKey = (node.requirement_key ?? "").trim();
      if (rKey && !effectiveReqKeys.has(rKey)) {
        unknownReqKeys.push(rKey);
        errors.push({
          code: "MISSING_DEPENDENCY",
          message: `Node "${node.node_key}" references unknown requirement_key "${rKey}"`,
          path: ["nodes", String(i), "requirement_key"],
        });
      }
    }
  }

  // 3. Check duplicate edge IDs and duplicate edges, plus missing edge endpoints
  const seenEdgeIds = new Set<string>();
  const seenEdgeSignatures = new Set<string>();

  for (let i = 0; i < rawEdges.length; i++) {
    const edge = rawEdges[i];
    const from = resolveEndpoint(edge, "from");
    const to = resolveEndpoint(edge, "to");
    const type = (edge.type ?? "DEPENDS_ON").trim();

    if (edge.id && typeof edge.id === "string") {
      const eId = edge.id.trim();
      if (seenEdgeIds.has(eId)) {
        duplicateEdgeIds.push(eId);
        errors.push({
          code: "DUPLICATE_ID",
          message: `Duplicate edge id "${eId}" found`,
          path: ["edges", String(i), "id"],
        });
      } else {
        seenEdgeIds.add(eId);
      }
    }

    // Check missing dependencies (endpoints that do not exist)
    if (!idOrKeyToNodeKey.has(from)) {
      unknownEdgeNodes.push(from);
      errors.push({
        code: "MISSING_DEPENDENCY",
        message: `Edge references unknown from_node "${from}"`,
        path: ["edges", String(i), "from_node"],
      });
    }

    if (!idOrKeyToNodeKey.has(to)) {
      unknownEdgeNodes.push(to);
      errors.push({
        code: "MISSING_DEPENDENCY",
        message: `Edge references unknown to_node "${to}"`,
        path: ["edges", String(i), "to_node"],
      });
    }

    // Canonical endpoints
    const canonicalFrom = idOrKeyToNodeKey.get(from) ?? from;
    const canonicalTo = idOrKeyToNodeKey.get(to) ?? to;

    // Check self-edges
    if (canonicalFrom && canonicalTo && canonicalFrom === canonicalTo) {
      errors.push({
        code: "CYCLE_DETECTED",
        message: `Self-edge detected: node "${canonicalFrom}" depends on itself`,
        path: ["edges", String(i)],
      });
    }

    // Check duplicate edges
    const sig = `${canonicalFrom}->${canonicalTo}:${type}`;
    if (seenEdgeSignatures.has(sig)) {
      duplicateEdges.push(sig);
      errors.push({
        code: "DUPLICATE_EDGE",
        message: `Duplicate edge (${canonicalFrom} -> ${canonicalTo} of type ${type})`,
        path: ["edges", String(i)],
      });
    } else {
      seenEdgeSignatures.add(sig);
    }
  }

  // 4. Check for cycles among DEPENDS_ON edges
  const cycle = findDependsOnCycle(
    rawNodes.map((n) => ({
      node_key: (n.node_key ?? n.key ?? "").trim(),
      id: n.id,
    })),
    rawEdges.map((e) => ({
      from_node: resolveEndpoint(e, "from"),
      to_node: resolveEndpoint(e, "to"),
      type: (e.type ?? "DEPENDS_ON").trim(),
    })),
  );

  if (cycle) {
    errors.push({
      code: "CYCLE_DETECTED",
      message: `DEPENDS_ON cycle detected: ${cycle.join(" -> ")}`,
      path: ["edges"],
    });
  }

  // 5. Check for orphans
  // Identify first phase
  const phases = Array.from(
    new Set(
      rawNodes.map((n) => (n.phase ?? "").trim()).filter((p) => p.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const firstPhase = phases[0];

  const outgoingDependsOn = new Set<string>();
  const incomingEdges = new Set<string>();

  for (const edge of rawEdges) {
    const from =
      idOrKeyToNodeKey.get(resolveEndpoint(edge, "from")) ??
      resolveEndpoint(edge, "from");
    const to =
      idOrKeyToNodeKey.get(resolveEndpoint(edge, "to")) ??
      resolveEndpoint(edge, "to");
    const type = (edge.type ?? "DEPENDS_ON").trim();

    if (type === "DEPENDS_ON") {
      outgoingDependsOn.add(from);
    }
    incomingEdges.add(to);
  }

  for (let i = 0; i < rawNodes.length; i++) {
    const node = rawNodes[i];
    const key = (node.node_key ?? node.key ?? "").trim();
    const phase = (node.phase ?? "").trim();

    if (!key) continue;

    // A: Completely disconnected node (in multi-node graph)
    const hasAnyEdge = outgoingDependsOn.has(key) || incomingEdges.has(key);
    if (rawNodes.length > 1 && !hasAnyEdge) {
      orphans.push(key);
      errors.push({
        code: "ORPHAN_NODE",
        message: `Node "${key}" is completely disconnected with no incoming or outgoing edges (orphan node)`,
        path: ["nodes", String(i)],
      });
      continue;
    }

    // B: Node outside first phase with no prerequisite
    const isOutsideFirstPhase =
      firstPhase !== undefined &&
      phase.length > 0 &&
      phase.localeCompare(firstPhase, undefined, { numeric: true }) > 0;

    if (isOutsideFirstPhase && !outgoingDependsOn.has(key)) {
      orphans.push(key);
      errors.push({
        code: "ORPHAN_NODE",
        message: `Node "${key}" (phase ${phase}) has no DEPENDS_ON prerequisite (orphan node)`,
        path: ["nodes", String(i)],
      });
    }
  }

  // 6. Check general GraphSchema validation to catch any additional issues
  const schemaResult = GraphSchema.safeParse(graph);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      // Avoid duplicate messages if already caught above
      const alreadyReported = errors.some(
        (e) =>
          e.message.includes(issue.message) ||
          issue.message.includes(e.message),
      );
      if (!alreadyReported) {
        errors.push({
          code: "SCHEMA_ERROR",
          message: issue.message,
          path: issue.path.map(String),
        });
      }
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    cycle,
    orphans,
    duplicates: {
      nodeIds: duplicateNodeIds,
      nodeKeys: duplicateNodeKeys,
      edgeIds: duplicateEdgeIds,
      edges: duplicateEdges,
      requirementKeys: duplicateReqKeys,
    },
    missingDependencies: {
      unknownEdgeNodes,
      unknownRequirementKeys: unknownReqKeys,
    },
  };
}

/**
 * Asserts that a graph is valid. Throws InvalidGraphError if validation fails.
 */
export function assertValidGraph<T extends GraphLike>(
  graph: T,
  options?: ValidateGraphOptions,
): T {
  const validation = validateGraph(graph, options);
  if (!validation.valid) {
    throw new InvalidGraphError(
      `Graph validation failed with ${validation.errors.length} error(s): ${validation.errors.map((e) => e.message).join("; ")}`,
      validation.errors,
    );
  }
  return graph;
}

/**
 * Validates a graph before saving. If invalid, attempts regeneration ONCE using regenerateFn.
 * Enforces acceptance criteria: Invalid graphs are NEVER saved.
 */
export async function validateAndSaveGraph<T extends GraphLike, R>(
  graph: T,
  saveFn: (validGraph: T) => Promise<R>,
  regenerateFn?: (feedback: string) => Promise<T>,
  options?: ValidateGraphOptions,
): Promise<{
  result: R;
  regenerated: boolean;
  validation: GraphValidationResult;
}> {
  // Step 1: Validate initial candidate graph
  const initialValidation = validateGraph(graph, options);

  if (initialValidation.valid) {
    const result = await saveFn(graph);
    return { result, regenerated: false, validation: initialValidation };
  }

  // Step 2: On failure, regenerate once if generator provided
  if (!regenerateFn) {
    throw new InvalidGraphError(
      `Cannot save invalid graph: ${initialValidation.errors.map((e) => e.message).join("; ")}`,
      initialValidation.errors,
    );
  }

  const feedback = formatValidationFeedback(initialValidation.errors);
  const regeneratedGraph = await regenerateFn(feedback);

  // Step 3: Validate regenerated graph
  const secondValidation = validateGraph(regeneratedGraph, options);

  if (!secondValidation.valid) {
    // REJECT: Invalid graphs are NEVER saved
    throw new InvalidGraphError(
      `Cannot save graph: regenerated graph failed validation on second attempt: ${secondValidation.errors.map((e) => e.message).join("; ")}`,
      secondValidation.errors,
    );
  }

  const result = await saveFn(regeneratedGraph);
  return { result, regenerated: true, validation: secondValidation };
}

/**
 * Validates a graph produced by generateFn. On failure, triggers generateFn with feedback once.
 */
export async function validateWithRegeneration<T extends GraphLike>(
  generateFn: (feedback?: string) => Promise<T>,
  options?: ValidateGraphOptions,
): Promise<{
  graph: T;
  regenerated: boolean;
  validation: GraphValidationResult;
}> {
  const attempt1 = await generateFn();
  const val1 = validateGraph(attempt1, options);

  if (val1.valid) {
    return { graph: attempt1, regenerated: false, validation: val1 };
  }

  const feedback = formatValidationFeedback(val1.errors);
  const attempt2 = await generateFn(feedback);
  const val2 = validateGraph(attempt2, options);

  if (!val2.valid) {
    throw new InvalidGraphError(
      `Graph failed validation after regeneration: ${val2.errors.map((e) => e.message).join("; ")}`,
      val2.errors,
    );
  }

  return { graph: attempt2, regenerated: true, validation: val2 };
}
