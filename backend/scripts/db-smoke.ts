import { getDb } from "../src/lib/db";

class RollbackSentinel extends Error {
  constructor() {
    super("Rollback transaction sentinel");
    this.name = "RollbackSentinel";
  }
}

interface SmokeCheckResult {
  name: string;
  passed: boolean;
  details?: string;
}

async function runDbSmoke(): Promise<void> {
  const db = getDb();
  const checks: SmokeCheckResult[] = [];

  try {
    await db.begin(async (tx) => {
      // 1. Initial Insert: project, requirement, two nodes, and an edge
      let initialInsertPassed = false;
      let projectId = "";
      let node1Id = "";
      let node2Id = "";

      try {
        const [project] = await tx<{ id: string }[]>`
          INSERT INTO projects (owner_id, name, idea, status)
          VALUES (gen_random_uuid(), 'Smoke Test Project', 'Verify db constraints', 'generating')
          RETURNING id
        `;
        projectId = project.id;

        const [requirement] = await tx<{ id: string }[]>`
          INSERT INTO requirements (project_id, key, title, description)
          VALUES (${projectId}, 'REQ-1', 'Initial Setup', 'Smoke test requirement')
          RETURNING id
        `;

        const [node1] = await tx<{ id: string }[]>`
          INSERT INTO nodes (project_id, node_key, phase, title, requirement_id, status)
          VALUES (${projectId}, '01.1', 'Foundation', 'First Task', ${requirement.id}, 'ready')
          RETURNING id
        `;
        node1Id = node1.id;

        const [node2] = await tx<{ id: string }[]>`
          INSERT INTO nodes (project_id, node_key, phase, title, requirement_id, status)
          VALUES (${projectId}, '01.2', 'Foundation', 'Second Task', ${requirement.id}, 'not_started')
          RETURNING id
        `;
        node2Id = node2.id;

        await tx`
          INSERT INTO edges (project_id, from_node, to_node, type)
          VALUES (${projectId}, ${node1Id}, ${node2Id}, 'DEPENDS_ON')
        `;

        initialInsertPassed = true;
      } catch {
        initialInsertPassed = false;
      }
      checks.push({
        name: "Initial insert (project, requirement, nodes, edge)",
        passed: initialInsertPassed,
      });

      // 2. Assert: a self-edge is rejected
      let selfEdgeRejected = false;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO edges (project_id, from_node, to_node, type)
            VALUES (${projectId}, ${node1Id}, ${node1Id}, 'DEPENDS_ON')
          `;
        });
      } catch {
        selfEdgeRejected = true;
      }
      checks.push({
        name: "Self-edge rejected by constraint",
        passed: selfEdgeRejected,
      });

      // 3. Assert: an invalid node status is rejected
      let invalidStatusRejected = false;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO nodes (project_id, node_key, phase, title, status)
            VALUES (${projectId}, '99.9', 'Test Phase', 'Bad Status Node', 'invalid_status_enum')
          `;
        });
      } catch {
        invalidStatusRejected = true;
      }
      checks.push({
        name: "Invalid node status rejected by constraint",
        passed: invalidStatusRejected,
      });

      // 4. Assert: deleting the project removes its nodes and edges (cascade)
      let cascadePassed = false;
      try {
        await tx`DELETE FROM projects WHERE id = ${projectId}`;

        const remainingNodes = await tx<{ count: number }[]>`
          SELECT count(*)::int as count FROM nodes WHERE project_id = ${projectId}
        `;
        const remainingEdges = await tx<{ count: number }[]>`
          SELECT count(*)::int as count FROM edges WHERE project_id = ${projectId}
        `;
        const remainingReqs = await tx<{ count: number }[]>`
          SELECT count(*)::int as count FROM requirements WHERE project_id = ${projectId}
        `;

        cascadePassed =
          remainingNodes[0].count === 0 &&
          remainingEdges[0].count === 0 &&
          remainingReqs[0].count === 0;
      } catch {
        cascadePassed = false;
      }
      checks.push({
        name: "Cascade delete removes child nodes and edges",
        passed: cascadePassed,
      });

      // Always roll back transaction so no test data is left behind
      throw new RollbackSentinel();
    });
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) {
      console.error("Unexpected smoke test error:", error);
      process.exit(1);
    }
  } finally {
    await db.end();
  }

  // Print results
  let anyFailed = false;
  for (const check of checks) {
    const status = check.passed ? "PASS" : "FAIL";
    console.log(`${status}: ${check.name}`);
    if (!check.passed) {
      anyFailed = true;
    }
  }

  if (anyFailed) {
    console.error("\n❌ Smoke test failed.");
    process.exit(1);
  } else {
    console.log("\n✅ All smoke checks passed. No data retained.");
    process.exit(0);
  }
}

runDbSmoke();
