/**
 * Real-model smoke test for prompt templates and graph schemas (v2).
 *
 * NOTE:
 * - This script spends about four Gemini API calls on the active tier.
 * - On the Google AI Studio free tier, prompt inputs may be reviewed by human
 *   reviewers or used to train Google models. Therefore, ONLY sample or synthetic
 *   text is allowed here. Never pass proprietary, confidential, or customer data.
 */

import { generateJson } from "../src/server/llm";
import {
  buildExtractMessages,
  ExtractOutputSchema,
  type ExtractOutput,
  buildArchitectureMessages,
  makeArchitectureOutputSchema,
  type ArchitectureOutput,
  buildDecomposeMessages,
  makeDecomposeOutputSchema,
  type DecomposeOutput,
  buildCriteriaMessages,
  makeCriteriaSchema,
  type CriteriaOutput,
  FOUNDATION_NODE_TYPES,
  MAX_NODES_PER_CRITERIA_CALL,
  chunkNodes,
  type CriteriaInputNode,
} from "../src/server/prompts/index";

const SAMPLE_IDEA =
  "A habit tracker for college students with streaks and reminders.";

async function generateWithRetry<T>(
  prompt: string,
  opts?: Parameters<typeof generateJson<T>>[1],
  maxRetries = 3,
): Promise<{ data: T; model: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await generateJson<T>(prompt, opts);
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message || "";
      const isTransient =
        msg.includes("503") ||
        msg.includes("500") ||
        msg.includes("502") ||
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("fetch failed");

      if (isTransient && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 2000;
        console.warn(
          `  [Retry ${attempt + 1}/${maxRetries}] Transient error: ${msg}. Retrying in ${delay}ms...`,
        );
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function runPromptSmoke() {
  console.log("=== RUNNING PROMPT TEMPLATES REAL-MODEL SMOKE TEST (v2) ===\n");

  // ---------------------------------------------------------------------------
  // Stage 1: Extract
  // ---------------------------------------------------------------------------
  let extractResult: { data: ExtractOutput; model: string } | null = null;
  try {
    const extractMsgs = buildExtractMessages(SAMPLE_IDEA);
    extractResult = await generateWithRetry(extractMsgs.prompt, {
      system: extractMsgs.system,
      schema: ExtractOutputSchema,
      maxOutputTokens: 2048,
    });
  } catch (err) {
    console.error("STAGE 1 [Extract]: FAIL");
    console.error("  Error:", (err as Error).message);
    process.exit(1);
  }

  const projectName = extractResult.data.project_name;
  const reqKeys = extractResult.data.requirements.map(
    (r: { key: string }) => r.key,
  );
  const requirementCount = extractResult.data.requirements.length;

  console.log("STAGE 1 [Extract]: PASS");
  console.log(`  project_name:      ${projectName}`);
  console.log(`  requirement count: ${requirementCount}`);

  // ---------------------------------------------------------------------------
  // Stage 2: Architecture
  // ---------------------------------------------------------------------------
  let archResult: { data: ArchitectureOutput; model: string } | null = null;
  try {
    const archMsgs = buildArchitectureMessages({
      requirements: extractResult.data.requirements,
      assumptions: extractResult.data.assumptions,
    });
    const archSchema = makeArchitectureOutputSchema(reqKeys);
    archResult = await generateWithRetry(archMsgs.prompt, {
      system: archMsgs.system,
      schema: archSchema,
      maxOutputTokens: 2048,
    });
  } catch (err) {
    console.error("\nSTAGE 2 [Architecture]: FAIL");
    console.error("  Error:", (err as Error).message);
    process.exit(1);
  }

  const moduleCount = archResult.data.modules.length;
  console.log("\nSTAGE 2 [Architecture]: PASS");
  console.log(`  module count:      ${moduleCount}`);

  // ---------------------------------------------------------------------------
  // Stage 3: Decompose
  // ---------------------------------------------------------------------------
  let decompResult: { data: DecomposeOutput; model: string } | null = null;
  try {
    const decompMsgs = buildDecomposeMessages({
      requirements: extractResult.data.requirements,
      architecture: archResult.data,
    });
    const decompSchema = makeDecomposeOutputSchema(reqKeys);
    decompResult = await generateWithRetry(decompMsgs.prompt, {
      system: decompMsgs.system,
      schema: decompSchema,
      maxOutputTokens: 16384,
    });
  } catch (err) {
    console.error("\nSTAGE 3 [Decompose]: FAIL");
    console.error("  Error:", (err as Error).message);
    process.exit(1);
  }

  const nodeCount = decompResult.data.nodes.length;
  const edgeCount = decompResult.data.edges.length;

  const foundationNodeCount = decompResult.data.nodes.filter((n) =>
    (FOUNDATION_NODE_TYPES as readonly string[]).includes(
      (n.type ?? "").toLowerCase().trim(),
    ),
  ).length;
  const nonFoundationNodeCount = nodeCount - foundationNodeCount;

  console.log("\nSTAGE 3 [Decompose]: PASS");
  console.log(`  node count:        ${nodeCount}`);
  console.log(`  edge count:        ${edgeCount}`);
  console.log(`  foundation nodes:  ${foundationNodeCount}`);
  console.log(`  non-foundation:    ${nonFoundationNodeCount}`);

  if (nodeCount < 12 || nodeCount > 40) {
    console.warn(
      `  [Warning] Node count ${nodeCount} is outside recommended 12-40 range.`,
    );
  }

  // ---------------------------------------------------------------------------
  // Stage 4: Criteria (First batch up to 8 nodes)
  // ---------------------------------------------------------------------------
  let critResult: { data: CriteriaOutput; model: string } | null = null;
  let batchNodeKeys: string[] = [];
  try {
    const nodeMap = new Map(
      decompResult.data.nodes.map((n) => [n.node_key, n]),
    );
    const reqMap = new Map(
      extractResult.data.requirements.map((r) => [r.key, r]),
    );

    const enrichedNodes: CriteriaInputNode[] = decompResult.data.nodes.map(
      (node) => {
        const prereqKeys = decompResult.data.edges
          .filter(
            (e) => e.from_node === node.node_key && e.type === "DEPENDS_ON",
          )
          .map((e) => e.to_node);
        const depends_on = prereqKeys
          .map((k) => nodeMap.get(k)?.title)
          .filter((t): t is string => Boolean(t));
        const reqTitle = node.requirement_key
          ? reqMap.get(node.requirement_key)?.title
          : undefined;

        return {
          node_key: node.node_key,
          title: node.title,
          explanation: node.explanation,
          files: node.files,
          requirement_key: node.requirement_key,
          requirement_title: reqTitle,
          depends_on: depends_on.length > 0 ? depends_on : undefined,
        };
      },
    );

    const batches = chunkNodes(enrichedNodes, MAX_NODES_PER_CRITERIA_CALL);
    const firstBatch = batches[0];
    batchNodeKeys = firstBatch.map((n) => n.node_key);

    const critMsgs = buildCriteriaMessages(firstBatch);
    const critSchema = makeCriteriaSchema(batchNodeKeys);
    critResult = await generateWithRetry(critMsgs.prompt, {
      system: critMsgs.system,
      schema: critSchema,
      maxOutputTokens: 4096,
    });
  } catch (err) {
    console.error("\nSTAGE 4 [Criteria]: FAIL");
    console.error("  Error:", (err as Error).message);
    process.exit(1);
  }

  const criteriaKeys = Object.keys(critResult.data || {});
  console.log("\nSTAGE 4 [Criteria]: PASS");
  console.log(`  criteria keys returned: [${criteriaKeys.join(", ")}]`);

  console.log("\nALL 4 PIPELINE STAGES PASSED REAL-MODEL VALIDATION.");
}

runPromptSmoke();
