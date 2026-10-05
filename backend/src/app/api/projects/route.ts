import { NextRequest, NextResponse } from "next/server";
import {
  getOwnerId,
  issueOwnerId,
  setOwnerCookie,
  createProjectForOwner,
  findProjectsByOwner,
} from "@/server/session";
import { jsonError } from "@/server/response";
import {
  checkAndIncrementPlanGenerationUsage,
  PLAN_INPUT_CHAR_LIMIT,
} from "@/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Derives a concise project name from the user's idea text if none is supplied.
 */
function deriveProjectName(idea: string): string {
  const firstLine = idea.split(/[\r\n.]+/)[0].trim();
  if (firstLine.length > 0 && firstLine.length <= 50) {
    return firstLine;
  }
  if (firstLine.length > 50) {
    return `${firstLine.slice(0, 47)}...`;
  }
  return "New Project";
}

/**
 * POST /api/projects
 *
 * Accepts idea text, creates the project (with owner id from cookie/session)
 * with status 'generating', and returns the project ID immediately.
 * The AI pipeline is NOT executed inside this request.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Resolve owner ID from cookie or request header (middleware)
    const existingOwnerId = getOwnerId(request);
    const isNewOwner = !existingOwnerId;
    const ownerId = existingOwnerId ?? issueOwnerId();

    // 2. Parse request JSON body
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "Invalid JSON request body",
          },
        },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "Request body must be a valid JSON object",
          },
        },
        { status: 400 },
      );
    }

    // 3. Extract and validate idea text
    const rawIdea = typeof body.idea === "string" ? body.idea : "";
    const trimmedIdea = rawIdea.trim();

    if (!trimmedIdea) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_IDEA",
            message: "Project idea is required and cannot be empty.",
          },
        },
        { status: 400 },
      );
    }

    if (trimmedIdea.length < 5) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INPUT_TOO_SHORT",
            message: "Project idea is too short. Minimum is 5 characters.",
          },
        },
        { status: 400 },
      );
    }

    if (trimmedIdea.length > PLAN_INPUT_CHAR_LIMIT) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INPUT_TOO_LONG",
            message: `Project idea is too long (${trimmedIdea.length} characters). Maximum is ${PLAN_INPUT_CHAR_LIMIT} characters.`,
          },
        },
        { status: 400 },
      );
    }

    // 4. Determine project name
    const rawName = typeof body.name === "string" ? body.name.trim() : "";
    const name = rawName || deriveProjectName(trimmedIdea);

    // 5. Count this plan generation against the owner's daily allowance.
    await checkAndIncrementPlanGenerationUsage(ownerId);

    // 6. Create project in database with status 'generating'
    // createProjectForOwner automatically enforces the session ownerId and discards any body.owner_id
    const project = await createProjectForOwner(
      {
        name,
        idea: trimmedIdea,
        repo_url: typeof body.repo_url === "string" ? body.repo_url : null,
      },
      ownerId,
    );

    // 7. Return ID and status 'generating' immediately
    // Fast response without running the AI pipeline inside this request
    const responseBody = {
      success: true,
      id: project.id,
      status: project.status,
      data: {
        id: project.id,
        owner_id: project.owner_id,
        name: project.name,
        idea: project.idea,
        status: project.status,
        current_stage: project.current_stage,
        created_at: project.created_at,
        updated_at: project.updated_at,
      },
    };

    const response = NextResponse.json(responseBody, { status: 201 });

    // If owner was newly issued, set the cookie on the response
    if (isNewOwner) {
      setOwnerCookie(response, ownerId);
    }

    return response;
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * GET /api/projects
 *
 * Lists all projects belonging to the requesting anonymous owner.
 */
export async function GET(request: NextRequest) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      return NextResponse.json({ success: true, data: [] }, { status: 200 });
    }
    const projects = await findProjectsByOwner(ownerId);
    return NextResponse.json(
      { success: true, data: projects },
      { status: 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
