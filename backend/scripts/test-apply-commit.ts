/**
 * Test Suite for Task 06.4: Mark Committed
 *
 * Requirements & Acceptance Criteria:
 * 1. Node becomes Committed; commit stored.
 * 2. Idempotency: GitHub redeliveries / duplicate pushes succeed without error (duplicate push test case).
 * 3. Unknown ID: Commits with unrecognized/missing node keys store commit with node_id = null without error,
 *    and leave graph nodes untouched (unknown ID test case).
 * 4. Multi-node commits: Updates all matched nodes in the project.
 * 5. Commit with no node keys: Stores commit with node_id = null.
 * 6. Input validation: Invalid UUID, empty SHA, non-existent project rejected.
 * 7. applyCommits batch helper applies array of commits.
 * 8. End-to-end webhook integration with onCommit callback.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { getDb } from "../src/lib/db";
import { applyCommit, applyCommits } from "../src/server/applyCommit";
import { createProjectForOwner } from "../src/server/session";
import { savePlan } from "../src/server/savePlan";
import { processWebhook } from "../src/server/webhook";
import { BadRequestError, NotFoundError } from "../src/lib/errors";

// Load .env.local if present
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

function signPayload(secret: string, rawBody: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody, "utf8");
  return `sha256=${hmac.digest("hex")}`;
}

async function run() {
  console.log("=== RUNNING TASK 06.4 MARK COMMITTED TEST SUITE ===\n");

  const cleanupProjectIds: string[] = [];
  const db = getDb();

  // Warm up connection pool
  if (process.env.DATABASE_URL) {
    await Promise.all([db`SELECT 1`, db`SELECT 1`]);
  }

  try {
    // ---------------------------------------------------------------------------
    // Part 1: Input Validation Tests (No DB mutation)
    // ---------------------------------------------------------------------------
    console.log("--- Part 1: Input Validation Tests ---");

    let invalidUuidCaught = false;
    try {
      await applyCommit({
        projectId: "invalid-uuid-format",
        sha: "a".repeat(40),
        message: "[01.1] test",
      });
    } catch (err) {
      if (err instanceof BadRequestError) {
        invalidUuidCaught = true;
      }
    }
    check(
      "applyCommit: rejects invalid projectId UUID format with BadRequestError",
      invalidUuidCaught,
    );

    let emptyShaCaught = false;
    try {
      await applyCommit({
        projectId: crypto.randomUUID(),
        sha: "   ",
        message: "[01.1] test",
      });
    } catch (err) {
      if (err instanceof BadRequestError) {
        emptyShaCaught = true;
      }
    }
    check(
      "applyCommit: rejects empty/missing commit SHA with BadRequestError",
      emptyShaCaught,
    );

    let nonExistentProjectCaught = false;
    try {
      await applyCommit({
        projectId: crypto.randomUUID(),
        sha: "b".repeat(40),
        message: "[01.1] test",
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        nonExistentProjectCaught = true;
      }
    }
    check(
      "applyCommit: rejects non-existent project with NotFoundError",
      nonExistentProjectCaught,
    );

    // ---------------------------------------------------------------------------
    // Part 2: Setup Test Project & Plan
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 2: Setup Test Project & Nodes ---");

    const ownerId = crypto.randomUUID();
    const project = await createProjectForOwner(
      {
        name: "Task 06.4 Apply Commit Test Project",
        idea: "Testing commit tracking, node status transitions, and duplicate pushes.",
      },
      ownerId,
    );
    cleanupProjectIds.push(project.id);

    // Save a plan with 4 nodes:
    // 01.1: ready
    // 01.2: not_started
    // 02.1: blocked
    // 02.2: not_started
    await savePlan({
      projectId: project.id,
      requirements: [
        {
          key: "REQ-1",
          title: "System Requirements",
          description: "Testing applyCommit",
          category: "functional",
        },
      ],
      nodes: [
        {
          key: "01.1",
          phase: "01",
          title: "Setup Auth",
          requirement_key: "REQ-1",
          files: ["src/auth.ts"],
          status: "ready",
        },
        {
          key: "01.2",
          phase: "01",
          title: "Setup Database Client",
          requirement_key: "REQ-1",
          files: ["src/db.ts"],
          status: "not_started",
        },
        {
          key: "02.1",
          phase: "02",
          title: "Build API Handler",
          requirement_key: "REQ-1",
          files: ["src/api.ts"],
          status: "blocked",
        },
        {
          key: "02.2",
          phase: "02",
          title: "Write End-to-End Tests",
          requirement_key: "REQ-1",
          files: ["tests/e2e.test.ts"],
          status: "not_started",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "01.2", type: "DEPENDS_ON" },
      ],
    });

    const initialNodes = await db<
      Array<{ id: string; node_key: string; status: string }>
    >`
      SELECT id, node_key, status
      FROM nodes
      WHERE project_id = ${project.id}
      ORDER BY node_key ASC
    `;

    check(
      "Setup: initial project created with 4 nodes",
      initialNodes.length === 4,
    );

    const node01_1 = initialNodes.find((n) => n.node_key === "01.1")!;
    const node01_2 = initialNodes.find((n) => n.node_key === "01.2")!;
    const node02_1 = initialNodes.find((n) => n.node_key === "02.1")!;
    const node02_2 = initialNodes.find((n) => n.node_key === "02.2")!;

    check(
      "Setup: node 01.1 initial status is ready",
      node01_1?.status === "ready",
    );

    // ---------------------------------------------------------------------------
    // Part 3: Test Case - Standard Commit (ACCEPTANCE CRITERIA)
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 3: Standard Commit (Mark Committed) ---");

    const commitSha1 = "c0ffee1111111111111111111111111111111111";
    const commitMsg1 = "[01.1] Setup auth mechanism";
    const commitFiles1 = ["src/auth.ts", "src/auth.test.ts"];

    const res1 = await applyCommit({
      projectId: project.id,
      sha: commitSha1,
      message: commitMsg1,
      files: commitFiles1,
      committedAt: "2026-10-06T14:30:00Z",
    });

    check("res1: commitId returned as UUID", typeof res1.commitId === "string");
    check(
      "res1: matchedNodeId matches node 01.1 id",
      res1.matchedNodeId === node01_1.id,
    );
    check("res1: matchedNodeKey is '01.1'", res1.matchedNodeKey === "01.1");
    check("res1: nodeUpdated is true", res1.nodeUpdated === true);
    check(
      "res1: duplicate is false on initial delivery",
      res1.duplicate === false,
    );

    // Verify DB node state: Node becomes Committed
    const [dbNode01_1] = await db<Array<{ status: string }>>`
      SELECT status FROM nodes WHERE id = ${node01_1.id}
    `;
    check(
      "ACCEPTANCE CRITERIA: node 01.1 status in database is now 'committed'",
      dbNode01_1?.status === "committed",
    );

    // Verify DB commit state: commit stored
    const dbCommits1 = await db<
      Array<{
        id: string;
        project_id: string;
        node_id: string | null;
        sha: string;
        message: string;
        files: string[];
        matched_by: string;
      }>
    >`
      SELECT id, project_id, node_id, sha, message, files, matched_by
      FROM commits
      WHERE project_id = ${project.id} AND sha = ${commitSha1}
    `;
    check(
      "ACCEPTANCE CRITERIA: commit row stored in commits table",
      dbCommits1.length === 1 &&
        dbCommits1[0].node_id === node01_1.id &&
        dbCommits1[0].matched_by === "message" &&
        dbCommits1[0].files.includes("src/auth.ts"),
    );

    // ---------------------------------------------------------------------------
    // Part 4: Test Case - Duplicate Push (IDEMPOTENCY)
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 4: Duplicate Push (Idempotency) ---");

    // GitHub redelivers the exact same push
    const resDuplicate = await applyCommit({
      projectId: project.id,
      sha: commitSha1,
      message: commitMsg1,
      files: commitFiles1,
      committedAt: "2026-10-06T14:30:00Z",
    });

    check(
      "TEST CASE duplicate push: redelivery succeeds without unique constraint violation",
      resDuplicate.commitId === res1.commitId,
    );
    check(
      "TEST CASE duplicate push: duplicate flag is true",
      resDuplicate.duplicate === true,
    );

    // Verify DB commits table still has exactly 1 row for this sha
    const duplicateCountRows = await db<Array<{ count: number }>>`
      SELECT count(*)::int as count
      FROM commits
      WHERE project_id = ${project.id} AND sha = ${commitSha1}
    `;
    check(
      "TEST CASE duplicate push: no duplicate rows inserted in commits table",
      duplicateCountRows[0].count === 1,
    );

    // Node status remains committed
    const [dbNodeAfterDup] = await db<Array<{ status: string }>>`
      SELECT status FROM nodes WHERE id = ${node01_1.id}
    `;
    check(
      "TEST CASE duplicate push: node 01.1 status remains 'committed'",
      dbNodeAfterDup?.status === "committed",
    );

    // ---------------------------------------------------------------------------
    // Part 5: Test Case - Unknown ID
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 5: Unknown ID ---");

    const unknownSha = "deadbeef22222222222222222222222222222222";
    const unknownMsg = "[99.9] Upgrade external framework";
    const unknownFiles = ["package.json"];

    const resUnknown = await applyCommit({
      projectId: project.id,
      sha: unknownSha,
      message: unknownMsg,
      files: unknownFiles,
    });

    check(
      "TEST CASE unknown ID: succeeds without error",
      typeof resUnknown.commitId === "string",
    );
    check(
      "TEST CASE unknown ID: matchedNodeId is null",
      resUnknown.matchedNodeId === null,
    );
    check(
      "TEST CASE unknown ID: matchedNodeKey is null",
      resUnknown.matchedNodeKey === null,
    );
    check(
      "TEST CASE unknown ID: nodeUpdated is false",
      resUnknown.nodeUpdated === false,
    );

    // Verify existing nodes were untouched
    const nodesAfterUnknown = await db<
      Array<{ node_key: string; status: string }>
    >`
      SELECT node_key, status
      FROM nodes
      WHERE project_id = ${project.id}
      ORDER BY node_key ASC
    `;

    check(
      "TEST CASE unknown ID: node 01.2 status remains 'not_started'",
      nodesAfterUnknown.find((n) => n.node_key === "01.2")?.status ===
        "not_started",
    );
    check(
      "TEST CASE unknown ID: node 02.1 status remains 'blocked'",
      nodesAfterUnknown.find((n) => n.node_key === "02.1")?.status ===
        "blocked",
    );

    // Verify commit stored with node_id = null and matched_by = null
    const [unknownCommitRow] = await db<
      Array<{ node_id: string | null; matched_by: string | null; sha: string }>
    >`
      SELECT node_id, matched_by, sha
      FROM commits
      WHERE project_id = ${project.id} AND sha = ${unknownSha}
    `;
    check(
      "TEST CASE unknown ID: commit stored with node_id = null and matched_by = null",
      unknownCommitRow?.node_id === null &&
        unknownCommitRow?.matched_by === null &&
        unknownCommitRow?.sha === unknownSha,
    );

    // ---------------------------------------------------------------------------
    // Part 6: Commit with no bracketed node IDs
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 6: Commit with No Bracketed Node IDs ---");

    const noIdSha = "feedface33333333333333333333333333333333";
    const noIdMsg = "Merge pull request #12 from branch/patch";

    const resNoId = await applyCommit({
      projectId: project.id,
      sha: noIdSha,
      message: noIdMsg,
    });

    check(
      "Commit without node IDs: stores commit with node_id = null",
      resNoId.matchedNodeId === null && resNoId.nodeUpdated === false,
    );

    // ---------------------------------------------------------------------------
    // Part 7: Multi-Node Commit
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 7: Multi-Node Commit ---");

    const multiSha = "ba5eba1144444444444444444444444444444444";
    const multiMsg =
      "[01.2] [02.1] Implement database client and wire API handler";

    const resMulti = await applyCommit({
      projectId: project.id,
      sha: multiSha,
      message: multiMsg,
      files: ["src/db.ts", "src/api.ts"],
    });

    check(
      "Multi-node commit: matchedNodeKeys contains both ['01.2', '02.1']",
      resMulti.matchedNodeKeys.includes("01.2") &&
        resMulti.matchedNodeKeys.includes("02.1"),
    );
    check(
      "Multi-node commit: nodeUpdated is true",
      resMulti.nodeUpdated === true,
    );

    // Check DB: Both node 01.2 and 02.1 are now committed
    const [db01_2] = await db<Array<{ status: string }>>`
      SELECT status FROM nodes WHERE id = ${node01_2.id}
    `;
    const [db02_1] = await db<Array<{ status: string }>>`
      SELECT status FROM nodes WHERE id = ${node02_1.id}
    `;

    check(
      "Multi-node commit: node 01.2 becomes 'committed'",
      db01_2?.status === "committed",
    );
    check(
      "Multi-node commit: node 02.1 becomes 'committed'",
      db02_1?.status === "committed",
    );

    // ---------------------------------------------------------------------------
    // Part 8: Batch Helper applyCommits
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 8: Batch Helper applyCommits ---");

    const batchSha1 = "1111222233334444555566667777888899990001";
    const batchSha2 = "1111222233334444555566667777888899990002";

    const batchResults = await applyCommits(project.id, [
      {
        projectId: project.id,
        sha: batchSha1,
        message: "[02.2] First commit for E2E tests",
      },
      {
        projectId: project.id,
        sha: batchSha2,
        message: "[02.2] Final polish for E2E tests",
      },
    ]);

    check(
      "applyCommits: processes array of 2 commits",
      batchResults.length === 2 &&
        batchResults[0].matchedNodeKey === "02.2" &&
        batchResults[1].matchedNodeKey === "02.2",
    );

    const [db02_2] = await db<Array<{ status: string }>>`
      SELECT status FROM nodes WHERE id = ${node02_2.id}
    `;
    check(
      "applyCommits: node 02.2 becomes 'committed'",
      db02_2?.status === "committed",
    );

    // ---------------------------------------------------------------------------
    // Part 9: End-to-End Webhook Push Integration with Signature
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 9: Webhook Push Integration ---");

    // Connect a repo to the project with a secret
    const webhookSecret = "whsec_test_secret_for_apply_commit_06_4";
    await db`
      UPDATE projects
      SET repo_full_name = 'kalp-io/mark-committed-test',
          webhook_secret = ${webhookSecret}
      WHERE id = ${project.id}
    `;

    // Create a new node in the project to test webhook trigger
    const [node03] = await db<Array<{ id: string; node_key: string }>>`
      INSERT INTO nodes (project_id, node_key, phase, title, status)
      VALUES (${project.id}, '03.1', '03', 'Webhook Trigger Task', 'ready')
      RETURNING id, node_key
    `;

    const webhookSha = "abcdef0123456789abcdef0123456789abcdef01";
    const webhookPayload = JSON.stringify({
      ref: "refs/heads/main",
      repository: {
        full_name: "kalp-io/mark-committed-test",
        default_branch: "main",
      },
      commits: [
        {
          id: webhookSha,
          message: "[03.1] Implemented through webhook push",
          added: ["src/webhook_task.ts"],
          modified: [],
          removed: [],
          timestamp: "2026-10-06T15:00:00Z",
        },
      ],
    });

    const webhookSignature = signPayload(webhookSecret, webhookPayload);

    const webhookResult = await processWebhook({
      rawBody: webhookPayload,
      headers: {
        "x-hub-signature-256": webhookSignature,
        "x-github-event": "push",
      },
      findProjectsByRepoFullName: async (nameLower) => {
        const rows = await db<
          Array<{ id: string; webhook_secret: string | null }>
        >`
          SELECT id, webhook_secret
          FROM projects
          WHERE LOWER(repo_full_name) = ${nameLower}
        `;
        return rows
          .filter(
            (r): r is { id: string; webhook_secret: string } =>
              !!r.webhook_secret,
          )
          .map((r) => ({ id: r.id, webhook_secret: r.webhook_secret }));
      },
      onCommit: async (commitInput) => {
        await applyCommit(commitInput);
      },
    });

    check(
      "processWebhook with onCommit: returns 200 OK",
      webhookResult.status === 200 &&
        (webhookResult.body as { ok: boolean }).ok === true,
    );

    // Check that node 03.1 became committed
    const [dbNode03] = await db<Array<{ status: string }>>`
      SELECT status FROM nodes WHERE id = ${node03.id}
    `;
    check(
      "Webhook push: node 03.1 status in database transitioned to 'committed'",
      dbNode03?.status === "committed",
    );

    // Check that webhook commit was stored
    const [webhookCommitRow] = await db<
      Array<{ sha: string; node_id: string }>
    >`
      SELECT sha, node_id FROM commits
      WHERE project_id = ${project.id} AND sha = ${webhookSha}
    `;
    check(
      "Webhook push: commit stored in database matching node 03.1",
      webhookCommitRow?.sha === webhookSha &&
        webhookCommitRow?.node_id === node03.id,
    );
  } catch (err) {
    console.error("UNHANDLED ERROR IN TEST SUITE:", err);
    failed = true;
  } finally {
    // Cleanup created test projects (cascades to nodes, edges, commits)
    console.log("\n--- Cleaning up test projects ---");
    for (const projId of cleanupProjectIds) {
      try {
        await db`DELETE FROM projects WHERE id = ${projId}`;
        console.log(`Cleaned up project ${projId}`);
      } catch (cleanErr) {
        console.error(`Failed to cleanup project ${projId}:`, cleanErr);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================\n");

  if (failed || passedChecks < totalChecks) {
    console.error("❌ SOME CHECKS FAILED!");
    process.exit(1);
  } else {
    console.log("✅ ALL TASK 06.4 MARK COMMITTED CHECKS PASSED!");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
