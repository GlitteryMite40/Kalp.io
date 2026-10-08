import { NextRequest } from "next/server";
import { z } from "zod";
import { getOwnerId } from "@/server/session";
import {
  getNodeWithProjectForOwner,
  getNodeLearningRecord,
  getNodeAnswerStats,
  recordNodeAnswer,
  gradeAnswer,
  completeNodeStatusIfEligible,
} from "@/server/learning";
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
} from "@/lib/errors";
import { jsonSuccess, jsonError } from "@/server/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AnswerBodySchema = z
  .object({
    skip: z.boolean().optional(),
    selected_index: z.number().int().min(0).max(3).optional(),
  })
  .refine(
    (data) => data.skip === true || typeof data.selected_index === "number",
    {
      message:
        "Request must either set skip: true or provide selected_index (0..3)",
    },
  );

/**
 * POST /api/nodes/[id]/answer
 *
 * Submits an answer to the node's learning check question, or skips the check.
 * Completes the node when correct or skipped.
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

    // 1. Verify node ownership
    const node = await getNodeWithProjectForOwner(id, ownerId);

    // 2. Parse request body
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new BadRequestError("Invalid JSON body", { code: "INVALID_JSON" });
    }

    const parsed = AnswerBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestError(
        parsed.error.issues[0]?.message || "Invalid answer body",
        { code: "INVALID_ANSWER_BODY", details: parsed.error.issues },
      );
    }

    const body = parsed.data;

    // 3. Prior answers stats
    const priorStats = await getNodeAnswerStats(id);

    // 4. Handle "Skip check"
    if (body.skip === true) {
      await recordNodeAnswer({
        nodeId: id,
        projectId: node.project_id,
        selectedIndex: null,
        result: "skipped",
      });

      // Complete the node if actionable
      await completeNodeStatusIfEligible(id);

      return jsonSuccess(
        {
          result: "skipped",
          completed: true,
          wrong_count: priorStats.wrongCount,
        },
        200,
      );
    }

    // 5. Handle multiple-choice answer
    const selectedIndex = body.selected_index!;

    // Load learning record (must exist to answer)
    const learning = await getNodeLearningRecord(id);
    if (!learning) {
      throw new ConflictError("No check question found for this step yet", {
        code: "NO_LEARNING_FOUND",
      });
    }

    // Grade answer
    const grade = gradeAnswer({
      selectedIndex,
      correctIndex: learning.correct_index,
      priorWrongCount: priorStats.wrongCount,
    });

    // Record attempt
    await recordNodeAnswer({
      nodeId: id,
      projectId: node.project_id,
      selectedIndex,
      result: grade.result,
    });

    if (grade.result === "correct") {
      // Correct answer unlocks dependents by marking node completed
      await completeNodeStatusIfEligible(id);

      return jsonSuccess(
        {
          result: "correct",
          completed: true,
          wrong_count: priorStats.wrongCount,
          explanation: learning.question.explanation,
          reveal: {
            correct_index: learning.correct_index,
            explanation: learning.question.explanation,
          },
        },
        200,
      );
    }

    // Wrong answer
    const newWrongCount = priorStats.wrongCount + 1;

    if (grade.reveal) {
      // 2 or more wrong answers: reveal correct answer and its explanation
      return jsonSuccess(
        {
          result: "wrong",
          completed: false,
          wrong_count: newWrongCount,
          explanation: learning.question.explanation,
          hint: learning.question.hint,
          reveal: {
            correct_index: learning.correct_index,
            explanation: learning.question.explanation,
          },
        },
        200,
      );
    }

    return jsonSuccess(
      {
        result: "wrong",
        completed: false,
        wrong_count: newWrongCount,
        hint: learning.question.hint,
        reveal: null,
      },
      200,
    );
  } catch (error) {
    return jsonError(error);
  }
}
