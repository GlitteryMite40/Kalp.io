import {
  MAX_UPLOAD_SIZE_BYTES,
  MIN_CHAR_LIMIT,
  MAX_CHAR_LIMIT,
  validateProjectIdea,
  validateUploadFile,
} from "../src/lib/validation.ts";
import {
  ApiClientError,
  createProject,
  runNextProjectStage,
  getProjectGraph,
} from "../src/lib/api.ts";

let totalChecks = 0;
let passedChecks = 0;
let failed = false;

function check(desc, condition, details) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`PASS: ${desc}`);
  } else {
    failed = true;
    console.error(`FAIL: ${desc}`);
    if (details !== undefined) {
      console.error("  Details:", details);
    }
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function run() {
  console.log("=== RUNNING TASK 05.1 INPUT PAGE TEST SUITE ===\n");

  console.log("--- Part 1: Empty & Short Input Validation ---");
  const emptyRes = validateProjectIdea("");
  check(
    "Empty string input is invalid",
    emptyRes.valid === false &&
      emptyRes.error !== null &&
      emptyRes.error.includes("empty"),
    emptyRes,
  );

  const whitespaceRes = validateProjectIdea("   \n\t  ");
  check(
    "Whitespace-only input is invalid",
    whitespaceRes.valid === false &&
      whitespaceRes.error !== null &&
      whitespaceRes.error.includes("empty"),
    whitespaceRes,
  );

  const shortRes = validateProjectIdea("Tiny");
  check(
    `Input shorter than ${MIN_CHAR_LIMIT} chars is rejected`,
    shortRes.valid === false &&
      shortRes.error !== null &&
      shortRes.error.includes("too short"),
    shortRes,
  );

  const validRes = validateProjectIdea(
    "Build a real-time collaborative workspace with build graphs",
  );
  check(
    "Valid project idea passes validation",
    validRes.valid === true && validRes.error === null,
    validRes,
  );

  const tooLongRes = validateProjectIdea("a".repeat(MAX_CHAR_LIMIT + 1));
  check(
    "Input exceeding maximum limit is rejected",
    tooLongRes.valid === false &&
      tooLongRes.error !== null &&
      tooLongRes.error.includes("exceeds maximum length"),
    tooLongRes,
  );

  console.log("\n--- Part 2: Oversized & Invalid File Upload Validation ---");
  check(
    "MAX_UPLOAD_SIZE_BYTES equals 4.5 MB in bytes",
    MAX_UPLOAD_SIZE_BYTES === 4.5 * 1024 * 1024,
  );
  const oversizedFile = {
    name: "architecture_spec.md",
    size: MAX_UPLOAD_SIZE_BYTES + 1024, // Exceeds 4.5 MB limit
  };
  const oversizedRes = validateUploadFile(oversizedFile);
  check(
    "File exceeding 4.5 MB limit is rejected",
    oversizedRes.valid === false &&
      oversizedRes.error !== null &&
      oversizedRes.error.includes("4.5 MB limit"),
    oversizedRes,
  );

  const validMdFile = {
    name: "project_spec.md",
    size: 250 * 1024, // 250 KB
  };
  const validMdRes = validateUploadFile(validMdFile);
  check(
    "Valid .md file under 4.5 MB passes",
    validMdRes.valid === true && validMdRes.error === null,
    validMdRes,
  );

  const validTxtFile = {
    name: "ideas.txt",
    size: 10 * 1024, // 10 KB
  };
  const validTxtRes = validateUploadFile(validTxtFile);
  check(
    "Valid .txt file under 4.5 MB passes",
    validTxtRes.valid === true && validTxtRes.error === null,
    validTxtRes,
  );

  const invalidExtFile = {
    name: "malicious.exe",
    size: 1024,
  };
  const invalidExtRes = validateUploadFile(invalidExtFile);
  check(
    "Unsupported file extension (.exe) is rejected",
    invalidExtRes.valid === false &&
      invalidExtRes.error !== null &&
      invalidExtRes.error.includes("Invalid file type"),
    invalidExtRes,
  );

  console.log(
    "\n--- Part 3: API Failure Handling (Project Creation & Stages) ---",
  );

  // 3.1 Rate limit failure during createProject (429)
  let createErrorCaught = false;
  try {
    await createProject(
      { idea: "Real-time chat with LLM" },
      {
        fetcher: async () =>
          jsonResponse(
            {
              success: false,
              error: {
                code: "RATE_LIMIT_EXCEEDED",
                message:
                  "Daily plan generation limit reached. Try again tomorrow.",
                details: { reset_at: "2026-10-06T00:00:00.000Z" },
              },
            },
            429,
          ),
      },
    );
  } catch (err) {
    createErrorCaught = true;
    check(
      "createProject 429 throws ApiClientError",
      err instanceof ApiClientError && err.status === 429,
      err,
    );
    check(
      "createProject 429 message contains readable rate limit text",
      err.message.includes("Daily plan generation limit reached"),
      err.message,
    );
  }
  check("createProject 429 was handled", createErrorCaught);

  // 3.2 Server error during stage execution (500)
  let stageErrorCaught = false;
  try {
    await runNextProjectStage("proj-123", {
      fetcher: async () =>
        jsonResponse(
          {
            success: false,
            error: {
              code: "STAGE_EXECUTION_FAILED",
              message: "LLM provider timed out while generating architecture.",
            },
          },
          500,
        ),
    });
  } catch (err) {
    stageErrorCaught = true;
    check(
      "runNextProjectStage 500 throws ApiClientError",
      err instanceof ApiClientError && err.status === 500,
      err,
    );
    check(
      "runNextProjectStage 500 preserves readable failure message",
      err.message.includes("LLM provider timed out"),
      err.message,
    );
  }
  check("runNextProjectStage 500 was handled", stageErrorCaught);

  // 3.3 Network disconnect during stage execution
  let networkErrorCaught = false;
  try {
    await runNextProjectStage("proj-123", {
      fetcher: async () => {
        throw new Error("fetch failed: socket connection reset");
      },
    });
  } catch (err) {
    networkErrorCaught = true;
    check(
      "Stage network failure produces status 0 and NETWORK_ERROR",
      err instanceof ApiClientError &&
        err.status === 0 &&
        err.code === "NETWORK_ERROR",
      err,
    );
  }
  check("Stage network failure was caught", networkErrorCaught);

  console.log("\n--- Part 4: Stage Progression & Repeated Run Route ---");
  const stageResponses = [
    {
      success: true,
      stage: "requirements",
      done: false,
      data: { stage: "requirements", done: false },
    },
    {
      success: true,
      stage: "architecture",
      done: false,
      data: { stage: "architecture", done: false },
    },
    {
      success: true,
      stage: "decomposition",
      done: false,
      data: { stage: "decomposition", done: false },
    },
    {
      success: true,
      stage: "criteria",
      done: true,
      data: { stage: "criteria", done: true },
    },
  ];

  let currentCall = 0;
  const executedStages = [];
  let isPipelineDone = false;

  while (!isPipelineDone && currentCall < stageResponses.length) {
    const responseData = stageResponses[currentCall++];
    const result = await runNextProjectStage("proj-sequential", {
      fetcher: async (url, init) => {
        check(
          `Call ${currentCall} hits /api/projects/:id/run with POST`,
          url === "/api/projects/proj-sequential/run" && init.method === "POST",
        );
        return jsonResponse(responseData);
      },
    });

    if (result.stage) {
      executedStages.push(result.stage);
    }
    if (result.done) {
      isPipelineDone = true;
    }
  }

  check(
    "Repeated stage calls completed all 4 stages in topological order",
    executedStages.length === 4 &&
      executedStages[0] === "requirements" &&
      executedStages[1] === "architecture" &&
      executedStages[2] === "decomposition" &&
      executedStages[3] === "criteria",
    executedStages,
  );
  check("Pipeline terminated with done: true", isPipelineDone === true);

  console.log("\n--- Part 5: Refresh Resume Verification ---");
  // Simulating refresh with stored ID when project is already ready
  const completedGraphMock = {
    success: true,
    project_id: "proj-resumed",
    status: "ready",
    nodes: [
      {
        id: "node-1",
        project_id: "proj-resumed",
        node_key: "REQ-01",
        phase: "Phase 1: Foundation",
        title: "Database schema",
        type: "database",
        status: "ready",
        computed_status: "ready",
        is_ready: true,
        is_blocked: false,
        dependencies: [],
        blocked_by: [],
        files: ["schema.sql"],
        explanation: "Foundation db",
        acceptance: ["tables exist"],
        tests: ["test.ts"],
        prompt: null,
        created_at: "2026-10-05T00:00:00.000Z",
      },
    ],
    edges: [],
    data: {
      project_id: "proj-resumed",
      project: {
        id: "proj-resumed",
        owner_id: "owner-1",
        name: "Resumed Project",
        idea: "Resumed Project Idea",
        status: "ready",
        current_stage: "criteria",
        repo_url: null,
        created_at: "2026-10-05T00:00:00.000Z",
        updated_at: "2026-10-05T00:00:00.000Z",
      },
      nodes: [],
      edges: [],
      requirements: [],
    },
  };

  const resumedGraph = await getProjectGraph("proj-resumed", {
    fetcher: async (url) => {
      check(
        "Resume queries getProjectGraph for stored projectId",
        url === "/api/projects/proj-resumed/graph",
      );
      return jsonResponse(completedGraphMock);
    },
  });

  check(
    "Resumed project has status ready and loaded nodes",
    resumedGraph.project.status === "ready" &&
      resumedGraph.project_id === "proj-resumed",
    resumedGraph,
  );

  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log("\nALL INPUT PAGE & PIPELINE RUNNER CHECKS PASSED!");
  }
}

run().catch((error) => {
  console.error("Unhandled error in test runner:", error);
  process.exitCode = 1;
});
