/**
 * Test Suite for Task 04.4: POST /api/projects/[id]/run
 *
 * Verifies:
 * 1. One stage is run per call.
 * 2. Stage failure is stored and the same stage can be retried.
 * 3. Repeated calls complete the final saved plan.
 * 4. Calling after completion returns done: true without rerunning stages.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import {
  POST,
  runNextProjectStage,
} from "../src/app/api/projects/[id]/run/route";
import {
  OWNER_COOKIE_NAME,
  OWNER_HEADER_NAME,
  createProjectForOwner,
} from "../src/server/session";
import { getProjectStages } from "../src/server/savePlan";
import { getDb } from "../src/lib/db";
import type { ExtractedRequirements } from "../src/server/extract";
import type { ProposedArchitecture } from "../src/server/architecture";
import type { DecomposedGraph } from "../src/server/decompose";
import type { EnrichedGraphWithCriteria } from "../src/server/criteria";

if (!process.env.DATABASE_URL) {
  try {
    if (fs.existsSync(".env.local")) {
      process.loadEnvFile(".env.local");
    } else if (fs.existsSync(".env")) {
      process.loadEnvFile(".env");
    }
  } catch {
    // Continue
  }
}

let totalChecks = 0;
let passedChecks = 0;
let failed = false;

function check(desc: string, condition: boolean, details?: unknown) {
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

async function run() {
  console.log("=== RUNNING TASK 04.4 RUN NEXT STAGE TEST SUITE ===\n");

  const ownerId = crypto.randomUUID();
  const cleanupProjectIds: string[] = [];
  const db = getDb();

  if (process.env.DATABASE_URL) {
    await db`SELECT 1`;
  }

  const requirementsOutput: ExtractedRequirements = {
    project_name: "Run Stage Test",
    projectName: "Run Stage Test",
    assumptions: ["Use the existing Kalp.io test stack."],
    requirements: [
      {
        id: crypto.randomUUID(),
        key: "REQ-1",
        title: "Create authenticated projects",
        description:
          "Users can create a project under their anonymous session.",
      },
      {
        id: crypto.randomUUID(),
        key: "REQ-2",
        title: "Show project graph",
        description: "Users can view the generated dependency graph.",
      },
    ],
    features: [],
    users: ["builder"],
    constraints: ["serverless"],
    integrations: [],
    model: "test-model",
    version: "test-requirements",
  };
  requirementsOutput.features = requirementsOutput.requirements;

  const architectureOutput: ProposedArchitecture = {
    stack: {
      frontend: "Next.js",
      backend: "Next.js API routes",
      database: "Supabase Postgres",
      db: "Supabase Postgres",
      hosting: "Vercel",
      other: ["anonymous owner cookie"],
    },
    assumptions: ["Serverless API routes only."],
    components: [
      {
        name: "Project API",
        responsibility: "Create projects and advance the run pipeline.",
        requirement_keys: ["REQ-1"],
      },
      {
        name: "Graph API",
        responsibility: "Expose nodes and edges for React Flow.",
        requirement_keys: ["REQ-2"],
      },
    ],
    modules: [],
    interactions: ["Project API saves stages before the graph is available."],
    summary: "Small serverless graph generation pipeline.",
    model: "test-model",
    version: "test-architecture",
  };
  architectureOutput.modules = architectureOutput.components;

  const decompositionOutput: DecomposedGraph = {
    requirements: requirementsOutput.requirements,
    nodes: [
      {
        id: crypto.randomUUID(),
        node_key: "01.1",
        phase: "01",
        title: "Implement project creation",
        type: "backend",
        status: "not_started",
        requirement_key: "REQ-1",
        requirement_id: requirementsOutput.requirements[0].id,
        files: ["backend/src/app/api/projects/route.ts"],
        explanation: "Create project records scoped to the anonymous owner.",
        acceptance: [],
        tests: [],
      },
      {
        id: crypto.randomUUID(),
        node_key: "02.1",
        phase: "02",
        title: "Implement graph view API",
        type: "backend",
        status: "not_started",
        requirement_key: "REQ-2",
        requirement_id: requirementsOutput.requirements[1].id,
        files: ["backend/src/app/api/projects/[id]/graph/route.ts"],
        explanation: "Return dependency-aware nodes and edges.",
        acceptance: [],
        tests: [],
      },
    ],
    edges: [{ from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" }],
    parentsMap: { "01.1": [], "02.1": ["01.1"] },
    shape: {
      nodeCount: 2,
      edgeCount: 1,
      dependsOnEdgeCount: 1,
      roots: ["01.1"],
      maxParallelWidth: 1,
      multiPrereqNodes: 0,
      maxPrereqs: 1,
      longestPathLength: 2,
      isStrictChain: true,
    },
    model: "test-model",
    version: "test-decomposition",
  };

  const criteriaOutput: EnrichedGraphWithCriteria = {
    requirements: requirementsOutput.requirements,
    edges: decompositionOutput.edges,
    nodes: decompositionOutput.nodes.map((node) => ({
      ...node,
      acceptance: [
        `${node.title} has a happy path acceptance check.`,
        `${node.title} rejects invalid or unauthorized input.`,
      ],
      tests: [
        `${node.node_key} unit test covers valid input.`,
        `${node.node_key} unit test covers invalid input.`,
        `${node.node_key} integration test covers persistence.`,
      ],
    })),
    criteria: {
      "01.1": {
        acceptance: [
          "Project creation stores owner-scoped records.",
          "Project creation rejects invalid input.",
        ],
        tests: ["valid project", "invalid project", "owner isolation"],
      },
      "02.1": {
        acceptance: [
          "Graph API returns nodes and edges.",
          "Graph API rejects unauthorized access.",
        ],
        tests: ["valid graph", "missing session", "unknown project"],
      },
    },
    criteriaMap: {},
    model: "test-model",
    version: "test-criteria",
  };
  criteriaOutput.criteriaMap = criteriaOutput.criteria;

  try {
    const project = await createProjectForOwner(
      {
        name: "Run Stage Test Project",
        idea: "Build a project graph tool and run one generation stage per request.",
      },
      ownerId,
    );
    cleanupProjectIds.push(project.id);

    let failRequirementsOnce = true;
    const deps = {
      extractRequirementsStage: async () => {
        if (failRequirementsOnce) {
          failRequirementsOnce = false;
          throw new Error("synthetic requirements failure");
        }
        return requirementsOutput;
      },
      architectureStage: async () => architectureOutput,
      decompositionStage: async () => decompositionOutput,
      criteriaStage: async () => criteriaOutput,
    };

    console.log("--- Part 1: Stage failure then retry ---");
    try {
      await runNextProjectStage(project.id, ownerId, deps);
      check("Failing requirements stage throws", false);
    } catch {
      check("Failing requirements stage throws", true);
    }

    const failedStages = await getProjectStages(project.id);
    check(
      "Stage failure is stored as failed",
      failedStages.some(
        (s) => s.stage === "requirements" && s.status === "failed",
      ),
    );

    const retryRequirements = await runNextProjectStage(
      project.id,
      ownerId,
      deps,
    );
    check(
      "Retry runs requirements again and succeeds",
      retryRequirements.stage === "requirements" &&
        retryRequirements.done === false,
      retryRequirements,
    );

    console.log("\n--- Part 2: Repeated calls complete the plan ---");
    const runArchitecture = await runNextProjectStage(
      project.id,
      ownerId,
      deps,
    );
    check(
      "Second successful call runs architecture only",
      runArchitecture.stage === "architecture" &&
        runArchitecture.done === false,
      runArchitecture,
    );

    const runDecomposition = await runNextProjectStage(
      project.id,
      ownerId,
      deps,
    );
    check(
      "Third successful call runs decomposition only",
      runDecomposition.stage === "decomposition" &&
        runDecomposition.done === false,
      runDecomposition,
    );

    const runCriteria = await runNextProjectStage(project.id, ownerId, deps);
    check(
      "Fourth successful call runs criteria and finishes",
      runCriteria.stage === "criteria" && runCriteria.done === true,
      runCriteria,
    );

    const [projectAfterDone] = await db<
      { status: string; current_stage: string | null }[]
    >`
      SELECT status, current_stage FROM projects WHERE id = ${project.id}
    `;
    check(
      "Final criteria stage saves plan and marks project ready",
      projectAfterDone?.status === "ready" &&
        projectAfterDone.current_stage === "criteria",
      projectAfterDone,
    );

    const [counts] = await db<
      { requirements: number; nodes: number; edges: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM requirements WHERE project_id = ${project.id}) AS requirements,
        (SELECT count(*)::int FROM nodes WHERE project_id = ${project.id}) AS nodes,
        (SELECT count(*)::int FROM edges WHERE project_id = ${project.id}) AS edges
    `;
    check(
      "Repeated calls saved requirements, nodes, and edges",
      counts?.requirements === 2 && counts.nodes === 2 && counts.edges === 1,
      counts,
    );

    console.log("\n--- Part 3: Call after done ---");
    const reqAfterDone = new NextRequest(
      `http://localhost:3000/api/projects/${project.id}/run`,
      {
        method: "POST",
        headers: {
          [OWNER_HEADER_NAME]: ownerId,
          cookie: `${OWNER_COOKIE_NAME}=${ownerId}`,
        },
      },
    );
    const resAfterDone = await POST(reqAfterDone, {
      params: Promise.resolve({ id: project.id }),
    });
    const bodyAfterDone = (await resAfterDone.json()) as {
      stage: string | null;
      done: boolean;
      success: boolean;
    };
    check("Call after done returns HTTP 200", resAfterDone.status === 200);
    check(
      "TEST CASE: call after done returns done true and null stage",
      bodyAfterDone.success === true &&
        bodyAfterDone.done === true &&
        bodyAfterDone.stage === null,
      bodyAfterDone,
    );
  } finally {
    for (const projectId of cleanupProjectIds) {
      await db`DELETE FROM projects WHERE id = ${projectId}`;
    }
    if (cleanupProjectIds.length > 0) {
      console.log(`\nCleaned up ${cleanupProjectIds.length} test project(s).`);
    }
  }

  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log("\nALL RUN NEXT STAGE CHECKS PASSED!");
  }
}

run().catch((err) => {
  console.error("Unhandled error in test runner:", err);
  process.exitCode = 1;
});
