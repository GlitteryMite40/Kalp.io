/**
 * Test Suite for Task 03.9: Save plan (backend/src/server/savePlan.ts)
 *
 * Verifies:
 * 1. Pipeline Stage Persistence:
 *    - Persist intermediate stage outputs as each finishes
 *    - Track running, done, and failed statuses
 *    - Retrieve stage outputs
 *    - Compute pipeline resume state (completed stages, next stage, canResume)
 * 2. Atomic Plan Saving (ACCEPTANCE CRITERIA: Plan saved atomically):
 *    - Saves nodes, edges, and requirements in one transaction
 *    - Resolves edges to node UUIDs
 *    - Links nodes to requirements
 *    - Updates project status to 'ready'
 * 3. Failure Rolls Back (TEST CASES: failure rolls back):
 *    - Case A: Self-edge or edge constraint failure triggers complete rollback
 *    - Case B: Mid-transaction error via beforeCommitHook triggers complete rollback
 *    - Zero orphaned nodes, edges, or requirements saved on failure
 * 4. Graph Validator Integration:
 *    - Graph validator rejects invalid graphs before save (cycles, orphans)
 *    - Invalid graphs are never saved
 * 5. Input Validation & Error Handling
 */

import fs from "node:fs";
import {
  savePlan,
  saveStageOutput,
  saveStageRunning,
  saveStageFailed,
  getStageOutput,
  getProjectStages,
  getPipelineResumeState,
} from "../src/server/savePlan";
import { getDb } from "../src/lib/db";
import { BadRequestError, NotFoundError } from "../src/lib/errors";
import { InvalidGraphError } from "../src/server/validate";

// Load .env.local if not already loaded
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

if (!process.env.DATABASE_URL) {
  console.log("Skipping live database test: DATABASE_URL is not set.");
  process.exit(0);
}

let totalChecks = 0;
let passedChecks = 0;
let failed = false;

function check(name: string, condition: boolean, details?: unknown) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`PASS: ${name}`);
  } else {
    failed = true;
    console.error(`FAIL: ${name}`);
    if (details !== undefined) {
      console.error("  Details:", details);
    }
  }
}

// ---------------------------------------------------------------------------
// Sample Graph Fixtures
// ---------------------------------------------------------------------------
const SAMPLE_REQUIREMENTS = [
  {
    key: "REQ-1",
    title: "User Authentication",
    description: "Session and auth management",
  },
  {
    key: "REQ-2",
    title: "Habit Streaks",
    description: "Daily habit tracking engine",
  },
];

const SAMPLE_NODES = [
  {
    node_key: "01.1",
    phase: "01",
    title: "Scaffolding & Setup",
    type: "setup",
    status: "not_started" as const,
    requirement_key: "REQ-1",
    files: ["package.json", "tsconfig.json"],
    explanation: "Initial workspace scaffolding",
    acceptance: ["Repo initializes", "Types check"],
    tests: ["Build test", "Typecheck test"],
  },
  {
    node_key: "02.1",
    phase: "02",
    title: "Database Migrations",
    type: "database",
    status: "not_started" as const,
    requirement_key: "REQ-1",
    files: ["supabase/migrations/001_init.sql"],
    explanation: "Database schema migration",
    acceptance: ["Tables created", "Constraints verified"],
    tests: ["Migration test", "Constraints test"],
  },
  {
    node_key: "02.2",
    phase: "02",
    title: "Auth Route Handlers",
    type: "backend",
    status: "not_started" as const,
    requirement_key: "REQ-1",
    files: ["src/app/api/auth/route.ts"],
    explanation: "JWT auth routes",
    acceptance: ["POST /api/auth returns 200", "401 on invalid token"],
    tests: ["Token verification test", "Invalid token test"],
  },
  {
    node_key: "03.1",
    phase: "03",
    title: "Habit Dashboard UI",
    type: "frontend",
    status: "not_started" as const,
    requirement_key: "REQ-2",
    files: ["src/app/habits/page.tsx"],
    explanation: "Habits UI",
    acceptance: ["Dashboard renders", "Habit toggle works"],
    tests: ["Render test", "Interaction test"],
  },
  {
    node_key: "03.2",
    phase: "03",
    title: "Streak Calculation Service",
    type: "backend",
    status: "not_started" as const,
    requirement_key: "REQ-2",
    files: ["src/server/streaks.ts"],
    explanation: "Computes consecutive active days",
    acceptance: ["Calculates streaks", "Resets on missed day"],
    tests: ["5-day streak test", "Missed day reset test"],
  },
];

const SAMPLE_EDGES = [
  { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" as const },
  { from_node: "02.2", to_node: "01.1", type: "DEPENDS_ON" as const },
  { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" as const },
  { from_node: "03.2", to_node: "02.2", type: "DEPENDS_ON" as const },
];

async function runTests() {
  console.log("=== RUNNING TASK 03.9 SAVE PLAN TEST SUITE ===\n");

  const db = getDb();
  const createdProjectIds: string[] = [];

  try {
    // =========================================================================
    // Part 1: Pipeline Stage Persistence & Resuming
    // =========================================================================
    console.log("--- Part 1: Pipeline Stage Persistence & Resuming ---");

    // Create test project
    const [proj1] = await db<{ id: string }[]>`
      INSERT INTO projects (owner_id, name, idea, status)
      VALUES (gen_random_uuid(), 'Stage Persistence Test Project', 'Verify pipeline resume', 'generating')
      RETURNING id
    `;
    const proj1Id = proj1.id;
    createdProjectIds.push(proj1Id);

    // 1.1 Save stage running
    const runRec = await saveStageRunning(proj1Id, "requirements");
    check(
      "saveStageRunning sets status to 'running'",
      runRec.status === "running",
    );

    // 1.2 Save stage output (done)
    const reqOutput = {
      features: ["User Authentication", "Habit Tracking"],
      users: ["Productivity enthusiasts"],
    };
    const doneRec = await saveStageOutput(proj1Id, "requirements", reqOutput);
    check("saveStageOutput sets status to 'done'", doneRec.status === "done");
    check("saveStageOutput records output json", doneRec.output !== null);

    // 1.3 Get stage output
    const fetchedOutput = (await getStageOutput(
      proj1Id,
      "requirements",
    )) as typeof reqOutput;
    check(
      "getStageOutput retrieves persisted output",
      fetchedOutput !== null &&
        Array.isArray(fetchedOutput.features) &&
        fetchedOutput.features[0] === "User Authentication",
    );

    // 1.4 Save architecture stage done
    const archOutput = { stack: ["Next.js", "Supabase", "Tailwind"] };
    await saveStageOutput(proj1Id, "architecture", archOutput);

    // 1.5 Save decomposition stage failed
    await saveStageFailed(
      proj1Id,
      "decomposition",
      "Rate limit exceeded (simulated error)",
    );

    // 1.6 Verify project stages query
    const allStages = await getProjectStages(proj1Id);
    check(
      "getProjectStages returns all recorded stages (3 stages)",
      allStages.length === 3,
    );

    // 1.7 Pipeline resume state
    const resumeState = await getPipelineResumeState(proj1Id);
    check(
      "Resume state detects completed stages: requirements, architecture",
      resumeState.completedStages.length === 2 &&
        resumeState.completedStages[0] === "requirements" &&
        resumeState.completedStages[1] === "architecture",
    );
    check(
      "Resume state reports lastCompletedStage = 'architecture'",
      resumeState.lastCompletedStage === "architecture",
    );
    check(
      "Resume state reports nextStage = 'decomposition'",
      resumeState.nextStage === "decomposition",
    );
    check(
      "Resume state reports canResume = true",
      resumeState.canResume === true,
    );

    // =========================================================================
    // Part 2: Atomic Plan Saving (ACCEPTANCE CRITERIA: Plan saved atomically)
    // =========================================================================
    console.log("\n--- Part 2: Atomic Plan Saving ---");

    const saveResult = await savePlan({
      projectId: proj1Id,
      nodes: SAMPLE_NODES,
      edges: SAMPLE_EDGES,
      requirements: SAMPLE_REQUIREMENTS,
      prompts: {
        "01.1": "# TASK: [01.1] Scaffolding",
        "02.1": "# TASK: [02.1] Migrations",
      },
    });

    check(
      "savePlan returns correct requirementsSaved count (2)",
      saveResult.requirementsSaved === 2,
    );
    check(
      "savePlan returns correct nodesSaved count (5)",
      saveResult.nodesSaved === 5,
    );
    check(
      "savePlan returns correct edgesSaved count (4)",
      saveResult.edgesSaved === 4,
    );
    check("savePlan marks status as 'ready'", saveResult.status === "ready");

    // Verify database contents
    const dbReqs = await db<{ key: string; title: string }[]>`
      SELECT key, title FROM requirements WHERE project_id = ${proj1Id} ORDER BY key
    `;
    check(
      "Database contains 2 requirements",
      dbReqs.length === 2 && dbReqs[0].key === "REQ-1",
    );

    const dbNodes = await db<
      {
        node_key: string;
        requirement_id: string | null;
        prompt: string | null;
      }[]
    >`
      SELECT node_key, requirement_id, prompt FROM nodes WHERE project_id = ${proj1Id} ORDER BY node_key
    `;
    check("Database contains 5 nodes", dbNodes.length === 5);
    check(
      "Nodes have requirement_id populated linking to requirements table",
      dbNodes.every((n) => n.requirement_id !== null),
    );
    check(
      "Node 01.1 has prompt attached",
      dbNodes.find((n) => n.node_key === "01.1")?.prompt?.includes("[01.1]") ===
        true,
    );

    const dbEdges = await db<
      { from_node: string; to_node: string; type: string }[]
    >`
      SELECT from_node, to_node, type FROM edges WHERE project_id = ${proj1Id}
    `;
    check("Database contains 4 edges", dbEdges.length === 4);
    check(
      "Edges reference node UUIDs (not raw keys)",
      dbEdges.every(
        (e) =>
          typeof e.from_node === "string" &&
          e.from_node.length === 36 &&
          typeof e.to_node === "string" &&
          e.to_node.length === 36,
      ),
    );

    const [dbProject] = await db<{ status: string; current_stage: string }[]>`
      SELECT status, current_stage FROM projects WHERE id = ${proj1Id}
    `;
    check(
      "Project status updated to 'ready' and current_stage = 'criteria'",
      dbProject.status === "ready" && dbProject.current_stage === "criteria",
    );

    // =========================================================================
    // Part 3: Failure Rolls Back (TEST CASES: failure rolls back)
    // =========================================================================
    console.log("\n--- Part 3: Failure Rolls Back ---");

    // Case 3.1: Self-edge rejected by database constraint -> full transaction rollback
    const [proj2] = await db<{ id: string }[]>`
      INSERT INTO projects (owner_id, name, idea, status)
      VALUES (gen_random_uuid(), 'Rollback Test Project 1', 'Test constraint failure rollback', 'generating')
      RETURNING id
    `;
    const proj2Id = proj2.id;
    createdProjectIds.push(proj2Id);

    const invalidSelfEdge = [
      { from_node: "01.1", to_node: "01.1", type: "DEPENDS_ON" as const }, // SELF-EDGE!
    ];

    let case1Failed = false;
    try {
      await savePlan(
        {
          projectId: proj2Id,
          nodes: SAMPLE_NODES.slice(0, 2),
          edges: invalidSelfEdge,
          requirements: SAMPLE_REQUIREMENTS.slice(0, 1),
        },
        { validate: false }, // bypass validator to exercise db/savePlan rollback
      );
    } catch {
      case1Failed = true;
    }
    check("savePlan throws error on invalid self-edge", case1Failed);

    // Assert: zero nodes, edges, or requirements saved for proj2Id
    const proj2Nodes = await db<{ count: number }[]>`
      SELECT count(*)::int as count FROM nodes WHERE project_id = ${proj2Id}
    `;
    const proj2Edges = await db<{ count: number }[]>`
      SELECT count(*)::int as count FROM edges WHERE project_id = ${proj2Id}
    `;
    const proj2Reqs = await db<{ count: number }[]>`
      SELECT count(*)::int as count FROM requirements WHERE project_id = ${proj2Id}
    `;
    const [proj2Project] = await db<{ status: string }[]>`
      SELECT status FROM projects WHERE id = ${proj2Id}
    `;

    check(
      "TEST CASE (Failure rolls back): 0 nodes saved after rollback",
      proj2Nodes[0].count === 0,
    );
    check(
      "TEST CASE (Failure rolls back): 0 edges saved after rollback",
      proj2Edges[0].count === 0,
    );
    check(
      "TEST CASE (Failure rolls back): 0 requirements saved after rollback",
      proj2Reqs[0].count === 0,
    );
    check(
      "TEST CASE (Failure rolls back): project status remains 'generating'",
      proj2Project.status === "generating",
    );

    // Case 3.2: Injected error in transaction via beforeCommitHook -> full rollback
    const [proj3] = await db<{ id: string }[]>`
      INSERT INTO projects (owner_id, name, idea, status)
      VALUES (gen_random_uuid(), 'Rollback Test Project 2', 'Test hook failure rollback', 'generating')
      RETURNING id
    `;
    const proj3Id = proj3.id;
    createdProjectIds.push(proj3Id);

    let case2Failed = false;
    try {
      await savePlan(
        {
          projectId: proj3Id,
          nodes: SAMPLE_NODES,
          edges: SAMPLE_EDGES,
          requirements: SAMPLE_REQUIREMENTS,
        },
        {
          beforeCommitHook: async () => {
            throw new Error(
              "Simulated system failure right before transaction commit",
            );
          },
        },
      );
    } catch {
      case2Failed = true;
    }
    check("savePlan throws error when beforeCommitHook fails", case2Failed);

    const proj3Nodes = await db<{ count: number }[]>`
      SELECT count(*)::int as count FROM nodes WHERE project_id = ${proj3Id}
    `;
    const proj3Edges = await db<{ count: number }[]>`
      SELECT count(*)::int as count FROM edges WHERE project_id = ${proj3Id}
    `;
    const proj3Reqs = await db<{ count: number }[]>`
      SELECT count(*)::int as count FROM requirements WHERE project_id = ${proj3Id}
    `;

    check(
      "TEST CASE (Failure rolls back): Hook failure rolls back all 5 nodes to 0",
      proj3Nodes[0].count === 0,
    );
    check(
      "TEST CASE (Failure rolls back): Hook failure rolls back all 4 edges to 0",
      proj3Edges[0].count === 0,
    );
    check(
      "TEST CASE (Failure rolls back): Hook failure rolls back all requirements to 0",
      proj3Reqs[0].count === 0,
    );

    // =========================================================================
    // Part 4: Graph Validator Integration (Cycles rejected before save)
    // =========================================================================
    console.log("\n--- Part 4: Graph Validator Integration ---");

    const [proj4] = await db<{ id: string }[]>`
      INSERT INTO projects (owner_id, name, idea, status)
      VALUES (gen_random_uuid(), 'Cycle Rejection Test Project', 'Verify validator save guard', 'generating')
      RETURNING id
    `;
    const proj4Id = proj4.id;
    createdProjectIds.push(proj4Id);

    const cyclicEdges = [
      { from_node: "01.1", to_node: "01.2", type: "DEPENDS_ON" as const },
      { from_node: "01.2", to_node: "01.1", type: "DEPENDS_ON" as const }, // CYCLE!
    ];

    let validatorThrew = false;
    try {
      await savePlan({
        projectId: proj4Id,
        nodes: [
          {
            node_key: "01.1",
            phase: "01",
            title: "Task 1",
            requirement_key: "REQ-1",
          },
          {
            node_key: "01.2",
            phase: "01",
            title: "Task 2",
            requirement_key: "REQ-1",
          },
        ],
        edges: cyclicEdges,
        requirements: [{ key: "REQ-1", title: "Req 1" }],
      });
    } catch (err) {
      validatorThrew = err instanceof InvalidGraphError;
    }
    check(
      "savePlan rejects cyclic graph with InvalidGraphError",
      validatorThrew,
    );

    const proj4Nodes = await db<{ count: number }[]>`
      SELECT count(*)::int as count FROM nodes WHERE project_id = ${proj4Id}
    `;
    check(
      "ACCEPTANCE CRITERIA: Invalid graph never saved (0 nodes saved)",
      proj4Nodes[0].count === 0,
    );

    // =========================================================================
    // Part 5: Input Validation & Error Handling
    // =========================================================================
    console.log("\n--- Part 5: Input Validation & Error Handling ---");

    // 5.1 Invalid UUID
    try {
      await savePlan({
        projectId: "invalid-uuid",
        nodes: SAMPLE_NODES,
        edges: SAMPLE_EDGES,
      });
      check("Non-UUID projectId throws error", false);
    } catch (err) {
      check(
        "Non-UUID projectId throws BadRequestError",
        err instanceof BadRequestError && err.code === "BAD_REQUEST",
      );
    }

    // 5.2 Non-existent project
    try {
      await savePlan({
        projectId: "00000000-0000-4000-8000-000000000000",
        nodes: SAMPLE_NODES,
        edges: SAMPLE_EDGES,
        requirements: SAMPLE_REQUIREMENTS,
      });
      check("Non-existent project throws error", false);
    } catch (err) {
      check(
        "Non-existent project throws NotFoundError",
        err instanceof NotFoundError && err.statusCode === 404,
      );
    }

    // 5.3 Empty nodes
    try {
      await savePlan({
        projectId: proj1Id,
        nodes: [],
        edges: [],
      });
      check("Empty nodes array throws error", false);
    } catch (err) {
      check(
        "Empty nodes array throws BadRequestError",
        err instanceof BadRequestError && err.code === "BAD_REQUEST",
      );
    }
  } catch (outerErr) {
    console.error("Unexpected test failure:", outerErr);
    failed = true;
  } finally {
    // Clean up all created test projects (cascade deletes all test rows)
    if (createdProjectIds.length > 0) {
      try {
        await db`
          DELETE FROM projects WHERE id IN ${db(createdProjectIds)}
        `;
        console.log(`\nCleaned up ${createdProjectIds.length} test projects.`);
      } catch (cleanupErr) {
        console.error("Cleanup error:", cleanupErr);
      }
    }
    await db.end();
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);

  if (failed) {
    console.error("\nTEST SUITE FAILED!");
    process.exit(1);
  } else {
    console.log("\nALL SAVE PLAN CHECKS PASSED!");
  }
}

runTests().catch((err) => {
  console.error("Unhandled error in test-save-plan:", err);
  process.exit(1);
});
