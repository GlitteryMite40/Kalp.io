/**
 * Test Suite for Task 06.5: File fallback
 *
 * Requirements & Acceptance Criteria:
 * 1. If no node ID, match changed files to nodes' expected files and store a suggested match.
 * 2. Suggestion stored with confidence (ACCEPTANCE CRITERIA).
 * 3. Test Cases:
 *    - no match: changed files do not match any node; no suggestion stored.
 *    - multiple matches: changed files match multiple nodes; all candidates stored with confidence.
 * 4. Priority: explicit node ID in message takes precedence over file matching.
 * 5. Webhook end-to-end integration: push payload without node ID stores suggestion.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { getDb } from "../src/lib/db";
import {
  normalizeFilePath,
  areFilesMatching,
  calculateFileMatchConfidence,
  matchFilesToNodesInMemory,
  matchFilesToNodes,
  storeCommitSuggestions,
  getCommitSuggestions,
} from "../src/server/fileMatch";
import { applyCommit } from "../src/server/applyCommit";
import { createProjectForOwner } from "../src/server/session";
import { savePlan } from "../src/server/savePlan";
import { processWebhook } from "../src/server/webhook";

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
  console.log("=== RUNNING TASK 06.5 FILE FALLBACK TEST SUITE ===\n");

  const cleanupProjectIds: string[] = [];
  const db = getDb();

  // Warm up connection pool
  if (process.env.DATABASE_URL) {
    await Promise.all([db`SELECT 1`, db`SELECT 1`]);
  }

  try {
    // ---------------------------------------------------------------------------
    // Part 1: Normalization & Matching Logic Unit Tests
    // ---------------------------------------------------------------------------
    console.log("--- Part 1: File Path Matching & Confidence Unit Tests ---");

    check(
      "normalizeFilePath: strips leading ./ and backslashes",
      normalizeFilePath(".\\src\\auth.ts") === "src/auth.ts",
    );
    check(
      "normalizeFilePath: trims whitespace and collapses multiple slashes",
      normalizeFilePath("  src///server//db.ts  ") === "src/server/db.ts",
    );
    check(
      "areFilesMatching: exact matches return true",
      areFilesMatching("src/auth.ts", "src/auth.ts") === true,
    );
    check(
      "areFilesMatching: case-insensitive match returns true",
      areFilesMatching("src/Auth.ts", "src/auth.ts") === true,
    );
    check(
      "areFilesMatching: subdirectory prefix returns true",
      areFilesMatching("backend/src/auth.ts", "src/auth.ts") === true &&
        areFilesMatching("src/auth.ts", "backend/src/auth.ts") === true,
    );
    check(
      "areFilesMatching: distinct files return false",
      areFilesMatching("src/auth.ts", "src/db.ts") === false,
    );

    // Confidence calculations
    const confExact = calculateFileMatchConfidence(
      ["src/auth.ts"],
      ["src/auth.ts"],
    );
    check(
      "calculateFileMatchConfidence: 100% exact match gives confidence 1.0",
      confExact.confidence === 1.0 && confExact.matchedFiles.length === 1,
    );

    const confPartial = calculateFileMatchConfidence(
      ["src/auth.ts"],
      ["src/auth.ts", "src/types.ts"],
    );
    check(
      "calculateFileMatchConfidence: 1 of 2 expected files gives 0.50 confidence",
      confPartial.confidence === 0.5 && confPartial.matchedFiles.length === 1,
    );

    const confNoMatch = calculateFileMatchConfidence(
      ["docs/README.md"],
      ["src/auth.ts"],
    );
    check(
      "calculateFileMatchConfidence: no match gives confidence 0",
      confNoMatch.confidence === 0 && confNoMatch.matchedFiles.length === 0,
    );

    // In-memory multiple matches sorting
    const mockNodes = [
      { id: "1", node_key: "01.1", files: ["src/a.ts", "src/b.ts"] },
      { id: "2", node_key: "01.2", files: ["src/a.ts"] },
      { id: "3", node_key: "01.3", files: ["src/c.ts"] },
    ];
    const memSuggestions = matchFilesToNodesInMemory(mockNodes, ["src/a.ts"]);
    check(
      "matchFilesToNodesInMemory: finds both matching nodes (multiple matches)",
      memSuggestions.length === 2,
    );
    check(
      "matchFilesToNodesInMemory: ranks highest confidence first (01.2 conf 1.0 > 01.1 conf 0.5)",
      memSuggestions[0].nodeKey === "01.2" &&
        memSuggestions[0].confidence === 1.0 &&
        memSuggestions[1].nodeKey === "01.1" &&
        memSuggestions[1].confidence === 0.5,
    );

    // ---------------------------------------------------------------------------
    // Part 2: Setup Database Test Project & Graph Plan
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 2: Setup Database Test Project ---");

    const ownerId = crypto.randomUUID();
    const project = await createProjectForOwner(
      {
        name: "Task 06.5 File Fallback Test Project",
        idea: "Testing file fallback matching, confidence scoring, and suggestions.",
      },
      ownerId,
    );
    cleanupProjectIds.push(project.id);

    // Create 4 nodes:
    // 01.1: files: ["src/auth.ts", "src/auth.test.ts"]
    // 01.2: files: ["src/db.ts"]
    // 02.1: files: ["src/api.ts", "src/db.ts"] (shares src/db.ts with 01.2)
    // 02.2: files: ["src/components/Button.tsx"]
    await savePlan({
      projectId: project.id,
      requirements: [
        {
          key: "REQ-1",
          title: "System Requirements",
          description: "Testing fileMatch fallback",
          category: "functional",
        },
      ],
      nodes: [
        {
          key: "01.1",
          phase: "01",
          title: "Auth Module",
          requirement_key: "REQ-1",
          files: ["src/auth.ts", "src/auth.test.ts"],
          status: "ready",
        },
        {
          key: "01.2",
          phase: "01",
          title: "Database Client",
          requirement_key: "REQ-1",
          files: ["src/db.ts"],
          status: "not_started",
        },
        {
          key: "02.1",
          phase: "02",
          title: "API Router",
          requirement_key: "REQ-1",
          files: ["src/api.ts", "src/db.ts"],
          status: "not_started",
        },
        {
          key: "02.2",
          phase: "02",
          title: "UI Components",
          requirement_key: "REQ-1",
          files: ["src/components/Button.tsx"],
          status: "not_started",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "01.2", type: "DEPENDS_ON" },
      ],
    });

    const projectNodes = await db<
      Array<{ id: string; node_key: string; status: string; files: string[] }>
    >`
      SELECT id, node_key, status, files
      FROM nodes
      WHERE project_id = ${project.id}
      ORDER BY node_key ASC
    `;

    check("Setup: 4 nodes created in DB", projectNodes.length === 4);

    const node01_1 = projectNodes.find((n) => n.node_key === "01.1")!;
    const node01_2 = projectNodes.find((n) => n.node_key === "01.2")!;
    const node02_1 = projectNodes.find((n) => n.node_key === "02.1")!;
    const node02_2 = projectNodes.find((n) => n.node_key === "02.2")!;

    // ---------------------------------------------------------------------------
    // Part 3: ACCEPTANCE CRITERIA - Suggestion stored with confidence
    // ---------------------------------------------------------------------------
    console.log(
      "\n--- Part 3: Standard File Fallback (Suggestion Stored with Confidence) ---",
    );

    // Commit has NO node key in message! (e.g. "Implement user authentication credentials")
    const sha1 = "aaa1111111111111111111111111111111111111";
    const msg1 = "Implement user authentication credentials";
    const files1 = ["src/auth.ts", "src/auth.test.ts"];

    const res1 = await applyCommit({
      projectId: project.id,
      sha: sha1,
      message: msg1,
      files: files1,
    });

    check("res1: no direct node ID matched", res1.matchedNodeId === null);
    check(
      "res1: node status is NOT automatically set to committed (it is a suggestion)",
      res1.nodeUpdated === false,
    );
    check(
      "res1: suggestedNodeId points to node 01.1",
      res1.suggestedNodeId === node01_1.id,
    );
    check("res1: suggestedNodeKey is '01.1'", res1.suggestedNodeKey === "01.1");
    check(
      "res1: confidence is 1.0 (exact match on all files)",
      res1.confidence === 1.0,
    );
    check(
      "res1: suggestions array contains 1 match",
      res1.suggestions?.length === 1,
    );

    // Verify DB commits table row
    const [dbCommit1] = await db<
      Array<{
        node_id: string | null;
        suggested_node_id: string | null;
        confidence: number | null;
        matched_by: string | null;
      }>
    >`
      SELECT node_id, suggested_node_id, confidence, matched_by
      FROM commits
      WHERE project_id = ${project.id} AND sha = ${sha1}
    `;

    check(
      "ACCEPTANCE CRITERIA: commit in DB stores suggested_node_id",
      dbCommit1?.suggested_node_id === node01_1.id,
    );
    check(
      "ACCEPTANCE CRITERIA: commit in DB stores confidence (1.0)",
      Number(dbCommit1?.confidence) === 1.0,
    );
    check(
      "ACCEPTANCE CRITERIA: commit in DB marks matched_by as 'files'",
      dbCommit1?.matched_by === "files",
    );
    check(
      "ACCEPTANCE CRITERIA: commit in DB leaves node_id null (unconfirmed)",
      dbCommit1?.node_id === null,
    );

    // Verify DB commit_suggestions table
    const storedSuggestions1 = await getCommitSuggestions(res1.commitId);
    check(
      "ACCEPTANCE CRITERIA: commit_suggestions table stores suggestion with confidence",
      storedSuggestions1.length === 1 &&
        storedSuggestions1[0].nodeId === node01_1.id &&
        storedSuggestions1[0].confidence === 1.0 &&
        storedSuggestions1[0].matchedFiles.includes("src/auth.ts"),
    );

    // Verify node 01.1 status was NOT mutated
    const [dbNode01_1] = await db<Array<{ status: string }>>`
      SELECT status FROM nodes WHERE id = ${node01_1.id}
    `;
    check(
      "Node 01.1 status in database remains 'ready'",
      dbNode01_1?.status === "ready",
    );

    // Direct standalone service calls
    const directMatches = await matchFilesToNodes({
      projectId: project.id,
      changedFiles: ["src/auth.ts"],
    });
    check(
      "matchFilesToNodes: directly queries nodes and returns match for 01.1",
      directMatches.length >= 1 && directMatches[0].nodeKey === "01.1",
    );

    await storeCommitSuggestions(res1.commitId, directMatches);
    const refreshedSuggestions = await getCommitSuggestions(res1.commitId);
    check(
      "storeCommitSuggestions: directly updates suggestions in database",
      refreshedSuggestions.length >= 1 &&
        refreshedSuggestions[0].nodeKey === "01.1",
    );

    // ---------------------------------------------------------------------------
    // Part 4: TEST CASE - no match
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 4: TEST CASE - no match ---");

    const noMatchSha = "bbb2222222222222222222222222222222222222";
    const noMatchMsg = "Update project documentation and legal notice";
    const noMatchFiles = ["docs/README.md", "LICENSE.txt"];

    const resNoMatch = await applyCommit({
      projectId: project.id,
      sha: noMatchSha,
      message: noMatchMsg,
      files: noMatchFiles,
    });

    check(
      "TEST CASE no match: succeeds without error",
      typeof resNoMatch.commitId === "string",
    );
    check(
      "TEST CASE no match: suggestedNodeId is null",
      resNoMatch.suggestedNodeId === null,
    );
    check(
      "TEST CASE no match: confidence is null",
      resNoMatch.confidence === null,
    );
    check(
      "TEST CASE no match: suggestions array is empty",
      resNoMatch.suggestions?.length === 0,
    );

    // Verify DB state
    const [dbNoMatchCommit] = await db<
      Array<{
        suggested_node_id: string | null;
        confidence: number | null;
        matched_by: string | null;
      }>
    >`
      SELECT suggested_node_id, confidence, matched_by
      FROM commits
      WHERE project_id = ${project.id} AND sha = ${noMatchSha}
    `;

    check(
      "TEST CASE no match: commit in DB has suggested_node_id = null",
      dbNoMatchCommit?.suggested_node_id === null,
    );
    check(
      "TEST CASE no match: commit in DB has confidence = null",
      dbNoMatchCommit?.confidence === null,
    );
    check(
      "TEST CASE no match: commit in DB has matched_by = null",
      dbNoMatchCommit?.matched_by === null,
    );

    const storedNoMatchSuggestions = await getCommitSuggestions(
      resNoMatch.commitId,
    );
    check(
      "TEST CASE no match: 0 rows in commit_suggestions table",
      storedNoMatchSuggestions.length === 0,
    );

    // ---------------------------------------------------------------------------
    // Part 5: TEST CASE - multiple matches
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 5: TEST CASE - multiple matches ---");

    // Commit changes 'src/db.ts'
    // Node 01.2 has files: ["src/db.ts"] (1 expected, 1 matched => conf = 1.0)
    // Node 02.1 has files: ["src/api.ts", "src/db.ts"] (2 expected, 1 matched => conf = 0.5)
    const multiMatchSha = "ccc3333333333333333333333333333333333333";
    const multiMatchMsg = "Refactor connection pooling";
    const multiMatchFiles = ["src/db.ts"];

    const resMulti = await applyCommit({
      projectId: project.id,
      sha: multiMatchSha,
      message: multiMatchMsg,
      files: multiMatchFiles,
    });

    check(
      "TEST CASE multiple matches: returns 2 suggested matches",
      resMulti.suggestions?.length === 2,
    );

    const topSuggestion = resMulti.suggestions?.[0];
    const secondSuggestion = resMulti.suggestions?.[1];

    check(
      "TEST CASE multiple matches: top suggestion is node 01.2 with higher confidence (1.0)",
      topSuggestion?.nodeKey === "01.2" && topSuggestion?.confidence === 1.0,
    );
    check(
      "TEST CASE multiple matches: second suggestion is node 02.1 with confidence (0.50)",
      secondSuggestion?.nodeKey === "02.1" &&
        secondSuggestion?.confidence === 0.5,
    );

    // Verify DB commit row has top suggestion
    const [dbMultiCommit] = await db<
      Array<{
        suggested_node_id: string | null;
        confidence: number | null;
        matched_by: string | null;
      }>
    >`
      SELECT suggested_node_id, confidence, matched_by
      FROM commits
      WHERE project_id = ${project.id} AND sha = ${multiMatchSha}
    `;

    check(
      "TEST CASE multiple matches: commit row points to top suggested node (01.2)",
      dbMultiCommit?.suggested_node_id === node01_2.id,
    );
    check(
      "TEST CASE multiple matches: commit row stores top confidence (1.0)",
      Number(dbMultiCommit?.confidence) === 1.0,
    );

    // Verify DB commit_suggestions table stores BOTH candidate matches with their respective confidence
    const storedMultiSuggestions = await getCommitSuggestions(
      resMulti.commitId,
    );
    check(
      "TEST CASE multiple matches: commit_suggestions stores all matching nodes (2 rows)",
      storedMultiSuggestions.length === 2,
    );
    check(
      "TEST CASE multiple matches: first stored row has node 01.2 and confidence 1.0",
      storedMultiSuggestions[0].nodeId === node01_2.id &&
        storedMultiSuggestions[0].confidence === 1.0 &&
        storedMultiSuggestions[0].matchedFiles.includes("src/db.ts"),
    );
    check(
      "TEST CASE multiple matches: second stored row has node 02.1 and confidence 0.5",
      storedMultiSuggestions[1].nodeId === node02_1.id &&
        storedMultiSuggestions[1].confidence === 0.5 &&
        storedMultiSuggestions[1].matchedFiles.includes("src/db.ts"),
    );

    // ---------------------------------------------------------------------------
    // Part 6: Explicit Node ID takes precedence over file matching
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 6: Node ID Precedence Over File Matching ---");

    // Commit has [01.2] in message, but modified files belong to node 02.2 ("src/components/Button.tsx")
    const overrideSha = "ddd4444444444444444444444444444444444444";
    const overrideMsg = "[01.2] Finish db client task";
    const overrideFiles = ["src/components/Button.tsx"];

    const resOverride = await applyCommit({
      projectId: project.id,
      sha: overrideSha,
      message: overrideMsg,
      files: overrideFiles,
    });

    check(
      "Node ID precedence: matched by message (node 01.2)",
      resOverride.matchedNodeId === node01_2.id &&
        resOverride.matchedNodeKey === "01.2",
    );
    check(
      "Node ID precedence: node 01.2 is updated to committed",
      resOverride.nodeUpdated === true,
    );
    check(
      "Node ID precedence: suggestedNodeId is null because explicit ID matched",
      resOverride.suggestedNodeId === null,
    );

    const [dbOverrideCommit] = await db<Array<{ matched_by: string }>>`
      SELECT matched_by FROM commits WHERE id = ${resOverride.commitId}
    `;
    check(
      "Node ID precedence: matched_by is 'message'",
      dbOverrideCommit?.matched_by === "message",
    );

    // ---------------------------------------------------------------------------
    // Part 7: Webhook Push End-to-End Integration
    // ---------------------------------------------------------------------------
    console.log("\n--- Part 7: Webhook Push End-to-End with File Fallback ---");

    const webhookSecret = "whsec_file_fallback_test_secret_06_5";
    await db`
      UPDATE projects
      SET repo_full_name = 'kalp-io/file-fallback-test',
          webhook_secret = ${webhookSecret}
      WHERE id = ${project.id}
    `;

    const webhookSha = "eee5555555555555555555555555555555555555";
    const webhookPayload = JSON.stringify({
      ref: "refs/heads/main",
      repository: {
        full_name: "kalp-io/file-fallback-test",
        default_branch: "main",
      },
      commits: [
        {
          id: webhookSha,
          message: "Updated UI design and button styling", // No node ID!
          added: ["src/components/Button.tsx"],
          modified: [],
          removed: [],
          timestamp: "2026-10-06T15:30:00Z",
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
      "Webhook push returns 200 OK",
      webhookResult.status === 200 &&
        (webhookResult.body as { ok: boolean }).ok === true,
    );

    // Verify commit suggestion stored from webhook push
    const [webhookCommitRow] = await db<
      Array<{ id: string; suggested_node_id: string; confidence: number }>
    >`
      SELECT id, suggested_node_id, confidence
      FROM commits
      WHERE project_id = ${project.id} AND sha = ${webhookSha}
    `;

    check(
      "Webhook push: commit stored with suggested_node_id matching node 02.2",
      webhookCommitRow?.suggested_node_id === node02_2.id,
    );
    check(
      "Webhook push: commit stored with confidence (1.0)",
      Number(webhookCommitRow?.confidence) === 1.0,
    );

    const webhookSuggestions = await getCommitSuggestions(webhookCommitRow.id);
    check(
      "Webhook push: suggestion persisted in commit_suggestions table",
      webhookSuggestions.length === 1 &&
        webhookSuggestions[0].nodeId === node02_2.id &&
        webhookSuggestions[0].confidence === 1.0,
    );
  } catch (err) {
    console.error("UNHANDLED ERROR IN FILE FALLBACK TEST SUITE:", err);
    failed = true;
  } finally {
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
    console.log("✅ ALL TASK 06.5 FILE FALLBACK CHECKS PASSED!");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
