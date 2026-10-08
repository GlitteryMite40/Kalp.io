import { NextRequest } from "next/server";
import { getOwnerId } from "@/server/session";
import {
  getNodeWithProjectForOwner,
  getLatestCommitForNode,
  getNodeLearningRecord,
  getNodeLearningDetails,
  upsertNodeLearning,
  shuffleOptions,
  assertDailyGenerationCap,
  type DiffSource,
} from "@/server/learning";
import { fetchCommitPatch } from "@/server/commitDiff";
import {
  buildLearnMessages,
  LearnOutputSchema,
  LEARN_PROMPT_VERSION,
  type LearnOutput,
} from "@/server/prompts/learn";
import { generateJson } from "@/server/llm";
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  BadGatewayError,
  ApiError,
} from "@/lib/errors";
import { jsonSuccess, jsonError } from "@/server/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/nodes/[id]/learn/generate
 *
 * Generates or retrieves cached learning explanation and check question for a committed node.
 * Scoped to the requesting owner session.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      throw new UnauthorizedError(
        "Missing or invalid anonymous owner session cookie",
        { code: "UNAUTHORIZED_SESSION" },
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const id = (resolvedParams?.id ?? "").trim();
    if (!id) {
      throw new BadRequestError("Node ID is required", {
        code: "MISSING_NODE_ID",
      });
    }

    // 1. Verify node ownership and retrieve project details
    const node = await getNodeWithProjectForOwner(id, ownerId);

    // 2. Verify at least one commit exists for this node
    const latestCommit = await getLatestCommitForNode(id);
    if (!latestCommit) {
      throw new ConflictError("No commit found for this step yet", {
        code: "NO_COMMIT_FOUND",
      });
    }

    // 3. Check for fresh cached generation
    const storedLearning = await getNodeLearningRecord(id);
    if (storedLearning && storedLearning.commit_sha === latestCommit.sha) {
      // Cached hit: return without making an LLM call or charging daily quota
      const details = await getNodeLearningDetails(id, ownerId);
      return jsonSuccess(details, 200, { cached: true });
    }

    // 4. Enforce daily generation cap (60 items / day / owner)
    await assertDailyGenerationCap(ownerId);

    // 5. Fetch commit patch if repo URL or repo_full_name is connected
    const repoIdentifier = node.repo_url || node.repo_full_name || "";
    let diffPatch: string | null = null;
    let diffSource: DiffSource = "plan_only";

    if (repoIdentifier) {
      const patchResult = await fetchCommitPatch(
        repoIdentifier,
        latestCommit.sha,
      );
      if (patchResult && patchResult.text) {
        diffPatch = patchResult.text;
        diffSource = "patch";
      }
    }

    if (!diffPatch) {
      if (
        (latestCommit.files && latestCommit.files.length > 0) ||
        (latestCommit.message && latestCommit.message.trim())
      ) {
        diffSource = "files_only";
      } else {
        diffSource = "plan_only";
      }
    }

    // 6. Build prompt messages
    const messages = buildLearnMessages({
      node: {
        title: node.title,
        explanation: node.explanation,
        acceptance: node.acceptance,
        files: node.files,
        requirementTitle: node.requirement_title,
      },
      diff: diffPatch,
      commitMessage: latestCommit.message,
      filesChanged: latestCommit.files,
    });

    // 7. Invoke Gemini via generateJson with output schema
    let result: { data: LearnOutput; model: string };
    try {
      result = await generateJson<LearnOutput>(messages.prompt, {
        system: messages.system,
        schema: LearnOutputSchema,
      });
    } catch (llmErr) {
      if (llmErr instanceof ApiError) {
        throw llmErr;
      }
      throw new BadGatewayError(
        "AI service was unable to generate an explanation right now. Please retry or skip the check to continue.",
        { code: "LLM_GENERATION_FAILED" },
      );
    }

    // 8. Shuffle options server-side so correct answer is not in fixed position
    const shuffled = shuffleOptions(
      result.data.question.options,
      result.data.question.correct_index,
    );

    const storedQuestion = {
      prompt: result.data.question.prompt,
      options: shuffled.options,
      explanation: result.data.question.explanation,
      hint: result.data.question.hint,
    };

    // 9. Upsert node_learning record in database
    await upsertNodeLearning({
      nodeId: id,
      projectId: node.project_id,
      diffExplanation: result.data.diff_explanation,
      diffSource,
      commitSha: latestCommit.sha,
      question: storedQuestion,
      correctIndex: shuffled.correctIndex,
      promptVersion: LEARN_PROMPT_VERSION,
    });

    // 10. Return formatted client response
    const details = await getNodeLearningDetails(id, ownerId);
    return jsonSuccess(details, 200, { cached: false, model: result.model });
  } catch (error) {
    return jsonError(error);
  }
}
