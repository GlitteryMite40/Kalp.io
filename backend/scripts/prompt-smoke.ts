/**
 * Real-model smoke test for prompt templates and graph schemas.
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
  stageMeta,
} from "../src/server/prompts/index";

const SAMPLE_IDEA =
  "A lightweight command-line tool named 'dockclean' that discovers and removes " +
  "dangling Docker containers, unused images, and orphan volumes, with interactive " +
  "confirmation prompts and JSON export.";

async function runPromptSmoke() {
  console.log("=== RUNNING PROMPT TEMPLATES REAL-MODEL SMOKE TEST ===\n");
  console.log("Input Idea:", SAMPLE_IDEA);
  console.log("");

  let hasFailed = false;

  // ---------------------------------------------------------------------------
  // Stage 1: Extract
  // ---------------------------------------------------------------------------
  let extractResult: { data: ExtractOutput; model: string } | null = null;
  try {
    const extractMsgs = buildExtractMessages(SAMPLE_IDEA);
    extractResult = await generateJson(extractMsgs.prompt, {
      system: extractMsgs.system,
      schema: ExtractOutputSchema,
      maxOutputTokens: 2048,
    });
    const meta = stageMeta("extract", extractResult.model);
    console.log("STAGE 1 [Extract]: PASS");
    console.log(`  Model:        ${meta.model}`);
    console.log(`  Prompt Ver:   ${meta.prompt_version}`);
    console.log(
      `  Requirements: ${extractResult.data.requirements?.length ?? 0}`,
    );
    console.log(
      `  Constraints:  ${extractResult.data.constraints?.length ?? 0}`,
    );
  } catch (err) {
    hasFailed = true;
    console.error("STAGE 1 [Extract]: FAIL");
    console.error("  Error:", (err as Error).message);
    process.exit(1);
  }

  const reqKeys = extractResult.data.requirements.map(
    (r: { key: string }) => r.key,
  );

  // ---------------------------------------------------------------------------
  // Stage 2: Architecture
  // ---------------------------------------------------------------------------
  let archResult: { data: ArchitectureOutput; model: string } | null = null;
  try {
    const archMsgs = buildArchitectureMessages(extractResult.data.requirements);
    const archSchema = makeArchitectureOutputSchema(reqKeys);
    archResult = await generateJson(archMsgs.prompt, {
      system: archMsgs.system,
      schema: archSchema,
      maxOutputTokens: 2048,
    });
    const meta = stageMeta("architecture", archResult.model);
    console.log("\nSTAGE 2 [Architecture]: PASS");
    console.log(`  Model:        ${meta.model}`);
    console.log(`  Prompt Ver:   ${meta.prompt_version}`);
    console.log(`  Modules:      ${archResult.data.modules?.length ?? 0}`);
    console.log(`  Interactions: ${archResult.data.interactions?.length ?? 0}`);
  } catch (err) {
    hasFailed = true;
    console.error("\nSTAGE 2 [Architecture]: FAIL");
    console.error("  Error:", (err as Error).message);
    process.exit(1);
  }

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
    decompResult = await generateJson(decompMsgs.prompt, {
      system: decompMsgs.system,
      schema: decompSchema,
      maxOutputTokens: 4096,
    });
    const meta = stageMeta("decompose", decompResult.model);
    console.log("\nSTAGE 3 [Decompose]: PASS");
    console.log(`  Model:        ${meta.model}`);
    console.log(`  Prompt Ver:   ${meta.prompt_version}`);
    console.log(`  Nodes:        ${decompResult.data.nodes?.length ?? 0}`);
    console.log(`  Edges:        ${decompResult.data.edges?.length ?? 0}`);
  } catch (err) {
    hasFailed = true;
    console.error("\nSTAGE 3 [Decompose]: FAIL");
    console.error("  Error:", (err as Error).message);
    process.exit(1);
  }

  const nodeKeys = decompResult.data.nodes.map(
    (n: { node_key: string }) => n.node_key,
  );

  // ---------------------------------------------------------------------------
  // Stage 4: Criteria
  // ---------------------------------------------------------------------------
  try {
    const critMsgs = buildCriteriaMessages(decompResult.data.nodes);
    const critSchema = makeCriteriaSchema(nodeKeys);
    const critResult = await generateJson(critMsgs.prompt, {
      system: critMsgs.system,
      schema: critSchema,
      maxOutputTokens: 4096,
    });
    const meta = stageMeta("criteria", critResult.model);
    const criteriaCount = Object.keys(critResult.data || {}).length;
    console.log("\nSTAGE 4 [Criteria]: PASS");
    console.log(`  Model:        ${meta.model}`);
    console.log(`  Prompt Ver:   ${meta.prompt_version}`);
    console.log(`  Nodes Keyed:  ${criteriaCount}`);
  } catch (err) {
    hasFailed = true;
    console.error("\nSTAGE 4 [Criteria]: FAIL");
    console.error("  Error:", (err as Error).message);
    process.exit(1);
  }

  if (hasFailed) {
    console.error("\nONE OR MORE STAGES FAILED.");
    process.exit(1);
  } else {
    console.log("\nALL 4 PIPELINE STAGES PASSED REAL-MODEL VALIDATION.");
  }
}

runPromptSmoke();
