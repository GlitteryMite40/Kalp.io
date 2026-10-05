import {
  ApiClientError,
  api,
  createProject,
  getHealth,
  getLlmStatus,
  getNode,
  getProjectGraph,
  listProjects,
  pingBackend,
  runNextProjectStage,
  updateNodeStatus,
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

function textResponse(text, status = 200, contentType = "text/plain") {
  return new Response(text, {
    status,
    headers: { "content-type": contentType },
  });
}

async function expectApiError(desc, fn, expected) {
  try {
    await fn();
    check(`${desc}: throws`, false);
  } catch (error) {
    check(
      `${desc}: throws ApiClientError`,
      error instanceof ApiClientError,
      error,
    );
    if (expected.status !== undefined) {
      check(`${desc}: status`, error.status === expected.status, error);
    }
    if (expected.code !== undefined) {
      check(`${desc}: code`, error.code === expected.code, error);
    }
    check(
      `${desc}: readable message`,
      typeof error.message === "string" && error.message.length > 0,
      error,
    );
    if (expected.messageSubstring !== undefined) {
      check(
        `${desc}: message contains "${expected.messageSubstring}"`,
        error.message.includes(expected.messageSubstring),
        error,
      );
    }
  }
}

async function run() {
  console.log("=== RUNNING TASK 05.9 API CLIENT TEST SUITE ===\n");

  console.log("--- Part 1: All Typed Fetch Helpers (Success) ---");

  // 1.1 createProject
  const created = await createProject(
    { idea: "Build a dependency-aware graph" },
    {
      fetcher: async (url, init) => {
        check(
          "createProject calls relative /api/projects",
          url === "/api/projects",
          url,
        );
        check("createProject uses POST", init?.method === "POST", init);
        check(
          "createProject sends JSON body",
          init?.body ===
            JSON.stringify({ idea: "Build a dependency-aware graph" }),
          init,
        );
        return jsonResponse(
          {
            success: true,
            id: "proj-101",
            status: "generating",
            data: {
              id: "proj-101",
              owner_id: "user-1",
              name: "Build a dependency-aware graph",
              idea: "Build a dependency-aware graph",
              status: "generating",
              current_stage: null,
              repo_url: null,
              created_at: "2026-10-05T00:00:00.000Z",
              updated_at: "2026-10-05T00:00:00.000Z",
            },
          },
          201,
        );
      },
    },
  );
  check(
    "createProject returns typed ProjectRecord",
    created.id === "proj-101" && created.status === "generating",
    created,
  );

  // 1.2 listProjects
  const projects = await listProjects({
    fetcher: async (url, init) => {
      check(
        "listProjects calls relative /api/projects",
        url === "/api/projects",
        url,
      );
      check("listProjects uses GET", init?.method === "GET", init);
      return jsonResponse({
        success: true,
        data: [created],
      });
    },
  });
  check(
    "listProjects returns array of ProjectRecord",
    Array.isArray(projects) &&
      projects.length === 1 &&
      projects[0].id === "proj-101",
    projects,
  );

  // 1.3 getProjectGraph
  const graph = await getProjectGraph("proj 101", {
    fetcher: async (url, init) => {
      check(
        "getProjectGraph encodes projectId in URL",
        url === "/api/projects/proj%20101/graph",
        url,
      );
      check("getProjectGraph uses GET", init?.method === "GET", init);
      return jsonResponse({
        success: true,
        project_id: "proj-101",
        status: "ready",
        nodes: [
          {
            id: "node-1",
            project_id: "proj-101",
            node_key: "REQ-01",
            phase: "backend",
            title: "Setup API",
            type: "api",
            status: "ready",
            computed_status: "ready",
            is_ready: true,
            is_blocked: false,
            dependencies: [],
            blocked_by: [],
            files: ["src/api.ts"],
            explanation: "api explanation",
            acceptance: ["passes tests"],
            tests: ["test.ts"],
            prompt: null,
            created_at: "2026-10-05T00:00:00.000Z",
          },
        ],
        edges: [],
        data: {
          project_id: "proj-101",
          project: created,
          nodes: [],
          edges: [],
          requirements: [],
        },
      });
    },
  });
  check(
    "getProjectGraph returns ProjectGraphData",
    graph.project_id === "proj-101" && graph.project.id === "proj-101",
    graph,
  );

  // 1.4 runNextProjectStage
  const stageResult = await runNextProjectStage("proj-101", {
    fetcher: async (url, init) => {
      check(
        "runNextProjectStage calls /api/projects/:id/run",
        url === "/api/projects/proj-101/run",
        url,
      );
      check("runNextProjectStage uses POST", init?.method === "POST", init);
      return jsonResponse({
        success: true,
        stage: "requirements",
        done: false,
        data: {
          stage: "requirements",
          done: false,
        },
      });
    },
  });
  check(
    "runNextProjectStage returns stage result",
    stageResult.stage === "requirements" && stageResult.done === false,
    stageResult,
  );

  // 1.5 getNode
  const nodeDetail = await getNode("node-101", {
    fetcher: async (url, init) => {
      check("getNode calls /api/nodes/:id", url === "/api/nodes/node-101", url);
      check("getNode uses GET", init?.method === "GET", init);
      return jsonResponse({
        success: true,
        id: "node-101",
        node_key: "N1",
        status: "ready",
        is_blocked: false,
        blocked_by: [],
        dependencies: [],
        data: {
          id: "node-101",
          project_id: "proj-101",
          node_key: "N1",
          phase: "core",
          title: "Init",
          type: "core",
          status: "ready",
          requirement_id: null,
          files: [],
          explanation: null,
          acceptance: [],
          tests: [],
          prompt: null,
          created_at: "2026-10-05T00:00:00.000Z",
        },
      });
    },
  });
  check(
    "getNode returns NodeDetailResponse with blocked status",
    nodeDetail.id === "node-101" && nodeDetail.is_blocked === false,
    nodeDetail,
  );

  // 1.6 updateNodeStatus
  const updatedNode = await updateNodeStatus(
    "node-101",
    { status: "in_progress", prompt: "Execute task" },
    {
      fetcher: async (url, init) => {
        check(
          "updateNodeStatus calls PATCH /api/nodes/:id",
          url === "/api/nodes/node-101",
          url,
        );
        check("updateNodeStatus uses PATCH", init?.method === "PATCH", init);
        check(
          "updateNodeStatus serializes body",
          init?.body ===
            JSON.stringify({ status: "in_progress", prompt: "Execute task" }),
          init,
        );
        return jsonResponse({
          success: true,
          id: "node-101",
          node_key: "N1",
          status: "in_progress",
          data: {
            id: "node-101",
            project_id: "proj-101",
            node_key: "N1",
            phase: "core",
            title: "Init",
            type: "core",
            status: "in_progress",
            requirement_id: null,
            files: [],
            explanation: null,
            acceptance: [],
            tests: [],
            prompt: "Execute task",
            created_at: "2026-10-05T00:00:00.000Z",
          },
        });
      },
    },
  );
  check(
    "updateNodeStatus returns updated NodeRecord",
    updatedNode.status === "in_progress",
    updatedNode,
  );

  // 1.7 getLlmStatus
  const llmStatus = await getLlmStatus({
    refresh: true,
    fetcher: async (url) => {
      check(
        "getLlmStatus with refresh appends ?refresh=1",
        url === "/api/llm/status?refresh=1",
        url,
      );
      return jsonResponse({
        provider: "gemini",
        state: "available",
        selectedModel: "gemini-2.5-flash",
        pinned: false,
        modelsListed: 4,
        candidates: [],
        checkedAt: "2026-10-05T00:00:00.000Z",
        cached: false,
        nextRefreshAt: null,
      });
    },
  });
  check(
    "getLlmStatus returns LlmStatusResponse",
    llmStatus.state === "available" &&
      llmStatus.selectedModel === "gemini-2.5-flash",
    llmStatus,
  );

  // 1.8 getHealth
  const health = await getHealth({
    fetcher: async (url) => {
      check("getHealth calls /api/health", url === "/api/health", url);
      return jsonResponse({
        status: "ok",
        service: "kalp-io-backend",
        timestamp: "2026-10-05T00:00:00.000Z",
        database: { ok: true, latencyMs: 12 },
      });
    },
  });
  check(
    "getHealth returns HealthResponse",
    health.status === "ok" && health.database.ok === true,
    health,
  );

  // 1.9 pingBackend
  const ping = await pingBackend({
    fetcher: async (url) => {
      check("pingBackend calls /api/ping", url === "/api/ping", url);
      return jsonResponse({
        status: "ok",
        message: "pong",
        timestamp: "2026-10-05T00:00:00.000Z",
        service: "kalp-io-backend",
      });
    },
  });
  check(
    "pingBackend returns PingResponse",
    ping.status === "ok" && ping.message === "pong",
    ping,
  );

  // 1.10 api helper map verification
  check(
    "api object exports all helper functions",
    typeof api.listProjects === "function" &&
      typeof api.createProject === "function" &&
      typeof api.getProjectGraph === "function" &&
      typeof api.runNextProjectStage === "function" &&
      typeof api.getNode === "function" &&
      typeof api.updateNodeStatus === "function" &&
      typeof api.getLlmStatus === "function" &&
      typeof api.getHealth === "function" &&
      typeof api.pingBackend === "function",
  );

  console.log("\n--- Part 2: 429 Readable Error ---");
  await expectApiError(
    "429 rate limit with details",
    () =>
      createProject(
        { idea: "Another project" },
        {
          fetcher: async () =>
            jsonResponse(
              {
                success: false,
                error: {
                  code: "RATE_LIMIT_EXCEEDED",
                  message:
                    "Daily plan generation limit reached. Try again after 2026-10-06T00:00:00.000Z.",
                  details: { reset_at: "2026-10-06T00:00:00.000Z" },
                },
              },
              429,
            ),
        },
      ),
    {
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      messageSubstring: "Daily plan generation limit reached",
    },
  );

  console.log("\n--- Part 3: 500 Readable Error ---");
  await expectApiError(
    "500 internal server error",
    () =>
      getHealth({
        fetcher: async () =>
          jsonResponse(
            {
              success: false,
              error: {
                code: "INTERNAL_SERVER_ERROR",
                message: "Database connection failed",
              },
            },
            500,
          ),
      }),
    {
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      messageSubstring: "Database connection failed",
    },
  );

  console.log("\n--- Part 4: Network Failure ---");
  await expectApiError(
    "Network failure before response",
    () =>
      getHealth({
        fetcher: async () => {
          throw new Error("Failed to fetch: Connection refused");
        },
      }),
    {
      status: 0,
      code: "NETWORK_ERROR",
      messageSubstring: "Connection refused",
    },
  );

  console.log(
    "\n--- Part 5: Edge Error Cases (HTML, Text, and Proxy messages) ---",
  );
  await expectApiError(
    "504 Gateway Timeout HTML page",
    () =>
      getHealth({
        fetcher: async () =>
          textResponse(
            "<html><head><title>504 Gateway Time-out</title></head><body><h1>Gateway Timeout</h1></body></html>",
            504,
            "text/html",
          ),
      }),
    {
      status: 504,
      code: "HTTP_504",
      messageSubstring: "504 Gateway Time-out",
    },
  );

  await expectApiError(
    "Plain text error response",
    () =>
      getHealth({
        fetcher: async () =>
          textResponse("Service Temporarily Unavailable", 503),
      }),
    {
      status: 503,
      code: "HTTP_503",
      messageSubstring: "Service Temporarily Unavailable",
    },
  );

  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log("\nALL API CLIENT CHECKS PASSED!");
  }
}

run().catch((error) => {
  console.error("Unhandled error in test runner:", error);
  process.exitCode = 1;
});
