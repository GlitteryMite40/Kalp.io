/**
 * Test Suite: Task 06.6 Drift Flag
 *
 * Verifies that:
 * 1. compareFiles / detectDrift correctly classifies:
 *    - exact: All expected files matched, no unexpected files (driftScore 0.0, hasDrift false)
 *    - partial: Partial overlap (driftScore > 0, hasDrift false for moderate, true for big difference)
 *    - unrelated: Zero overlap (driftScore 1.0, hasDrift true)
 * 2. applyCommit integrates drift detection:
 *    - Stores has_drift, drift_score, drift_reason on commits and nodes
 *    - Acceptance Criteria: Drift is flagged on big differences
 * 3. checkNodeDrift, recordNodeDrift, and checkProjectDrift accurately report project drift
 */

import { getDb } from "../src/lib/db";
import {
  compareFiles,
  detectDrift,
  checkNodeDrift,
  recordNodeDrift,
  checkProjectDrift,
  DEFAULT_DRIFT_THRESHOLD,
} from "../src/server/drift";
import { applyCommit } from "../src/server/applyCommit";

let totalChecks = 0;
let passedChecks = 0;

function assert(condition: boolean, message: string): void {
  totalChecks++;
  if (!condition) {
    console.error(`FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedChecks++;
  console.log(`PASS: ${message}`);
}

async function runDriftTestSuite(): Promise<void> {
  console.log("=== RUNNING TASK 06.6 DRIFT FLAG TEST SUITE ===\n");
  const db = getDb();

  // =========================================================================
  // PART 1: PURE UNIT TESTS (EXACT, PARTIAL, UNRELATED)
  // =========================================================================
  console.log("--- Part 1: Pure Unit Tests (exact, partial, unrelated) ---");

  // --- Test Case 1: Exact Matches ---
  const exact1 = compareFiles(["src/server/auth.ts"], ["src/server/auth.ts"]);
  assert(
    exact1.classification === "exact",
    "exact1: classification is 'exact'",
  );
  assert(exact1.driftScore === 0.0, "exact1: driftScore is 0.0");
  assert(exact1.hasDrift === false, "exact1: hasDrift is false");
  assert(exact1.drift === false, "exact1: drift alias is false");
  assert(exact1.matchedFiles.length === 1, "exact1: 1 matched file");
  assert(exact1.missingFiles.length === 0, "exact1: 0 missing files");
  assert(exact1.unexpectedFiles.length === 0, "exact1: 0 unexpected files");

  // Path normalization: backslashes, leading ./, case
  const exactNorm = compareFiles(
    [".\\src\\server\\auth.ts", "src/server/session.ts/"],
    ["src/server/auth.ts", "SRC/SERVER/SESSION.TS"],
  );
  assert(
    exactNorm.classification === "exact",
    "exactNorm: normalizes paths and matches exact",
  );
  assert(exactNorm.hasDrift === false, "exactNorm: hasDrift is false");

  // Subdirectory prefix matching
  const exactSubdir = compareFiles(
    ["backend/src/server/auth.ts"],
    ["src/server/auth.ts"],
  );
  assert(
    exactSubdir.classification === "exact",
    "exactSubdir: matches subdirectory prefix",
  );
  assert(exactSubdir.hasDrift === false, "exactSubdir: hasDrift is false");

  // Empty lists
  const exactEmpty = compareFiles([], []);
  assert(
    exactEmpty.classification === "exact",
    "exactEmpty: empty lists classify as exact",
  );
  assert(
    exactEmpty.hasDrift === false,
    "exactEmpty: empty lists have no drift",
  );

  // --- Test Case 2: Partial Matches ---
  // Subcase 2A: Subset of expected files committed (1 of 2)
  const partialSubset = compareFiles(
    ["src/server/auth.ts"],
    ["src/server/auth.ts", "src/server/session.ts"],
  );
  assert(
    partialSubset.classification === "partial",
    "partialSubset: classification is 'partial'",
  );
  assert(
    partialSubset.driftScore === 0.5,
    "partialSubset: driftScore is 0.50 (1/2 Jaccard difference)",
  );
  assert(
    partialSubset.hasDrift === false,
    "partialSubset: hasDrift is false (within default tolerance)",
  );
  assert(
    partialSubset.matchedFiles.length === 1,
    "partialSubset: matchedFiles has 1 item",
  );
  assert(
    partialSubset.missingFiles.includes("src/server/session.ts"),
    "partialSubset: session.ts is in missingFiles",
  );
  assert(
    partialSubset.unexpectedFiles.length === 0,
    "partialSubset: unexpectedFiles is empty",
  );

  // Subcase 2B: Expected files plus extra related file
  const partialExtra = compareFiles(
    ["src/server/auth.ts", "src/server/auth.test.ts"],
    ["src/server/auth.ts"],
  );
  assert(
    partialExtra.classification === "partial",
    "partialExtra: classification is 'partial'",
  );
  assert(partialExtra.driftScore === 0.5, "partialExtra: driftScore is 0.50");
  assert(
    partialExtra.hasDrift === false,
    "partialExtra: hasDrift is false (not a big difference)",
  );
  assert(
    partialExtra.unexpectedFiles.includes("src/server/auth.test.ts"),
    "partialExtra: unexpectedFiles tracked",
  );

  // Subcase 2C: High overlap (2 of 3)
  const partialHighOverlap = compareFiles(
    ["src/a.ts", "src/b.ts"],
    ["src/a.ts", "src/b.ts", "src/c.ts"],
  );
  assert(
    partialHighOverlap.classification === "partial",
    "partialHighOverlap: classification is 'partial'",
  );
  assert(
    partialHighOverlap.driftScore === 0.33,
    "partialHighOverlap: driftScore is 0.33",
  );
  assert(
    partialHighOverlap.hasDrift === false,
    "partialHighOverlap: hasDrift is false",
  );

  // Subcase 2D: Extreme partial (big difference - 1 match + 4 unexpected files)
  const partialBigDiff = compareFiles(
    ["src/core.ts", "extra1.ts", "extra2.ts", "extra3.ts", "extra4.ts"],
    ["src/core.ts"],
  );
  assert(
    partialBigDiff.classification === "partial",
    "partialBigDiff: classification is 'partial'",
  );
  assert(
    partialBigDiff.driftScore === 0.8,
    "partialBigDiff: driftScore is 0.80",
  );
  assert(
    partialBigDiff.hasDrift === true,
    "ACCEPTANCE CRITERIA: Drift flagged on big differences (partial with large unexpected file additions)",
  );

  // Custom sensitivity threshold
  const partialCustomThresh = compareFiles(
    ["src/server/auth.ts"],
    ["src/server/auth.ts", "src/server/session.ts"],
    { threshold: 0.3 },
  );
  assert(
    partialCustomThresh.hasDrift === true,
    "partialCustomThresh: threshold 0.3 flags 0.5 driftScore",
  );

  // --- Test Case 3: Unrelated Matches ---
  const unrelated = compareFiles(
    ["docs/README.md", "images/logo.png"],
    ["src/server/auth.ts"],
  );
  assert(
    unrelated.classification === "unrelated",
    "unrelated: classification is 'unrelated'",
  );
  assert(
    unrelated.driftScore === 1.0,
    "unrelated: driftScore is 1.0 (100% difference)",
  );
  assert(
    unrelated.hasDrift === true,
    "ACCEPTANCE CRITERIA: Drift flagged on unrelated files (hasDrift = true)",
  );
  assert(unrelated.drift === true, "unrelated: drift alias is true");
  assert(
    unrelated.matchedFiles.length === 0,
    "unrelated: matchedFiles is empty",
  );
  assert(
    unrelated.missingFiles.length === 1,
    "unrelated: missingFiles contains expected",
  );
  assert(
    unrelated.unexpectedFiles.length === 2,
    "unrelated: unexpectedFiles contains all committed",
  );

  // detectDrift alias check
  const aliasRes = detectDrift(["a.ts"], ["b.ts"]);
  assert(
    aliasRes.hasDrift === true,
    "detectDrift alias works identically to compareFiles",
  );

  // Empty committed for non-empty expected
  const emptyCommitted = compareFiles([], ["src/index.ts"]);
  assert(
    emptyCommitted.classification === "unrelated",
    "emptyCommitted: classifies as unrelated",
  );
  assert(
    emptyCommitted.hasDrift === true,
    "emptyCommitted: drift flagged when committed files is empty",
  );

  // Non-empty committed for empty expected
  const emptyExpected = compareFiles(["src/index.ts"], []);
  assert(
    emptyExpected.classification === "unrelated",
    "emptyExpected: classifies as unrelated",
  );
  assert(
    emptyExpected.hasDrift === true,
    "emptyExpected: drift flagged when expected files is empty",
  );

  // =========================================================================
  // PART 2: DATABASE SETUP
  // =========================================================================
  console.log("\n--- Part 2: Database Setup ---");
  const testOwnerId = "11111111-2222-3333-4444-555555555555";

  const [project] = await db<Array<{ id: string }>>`
    INSERT INTO projects (owner_id, name, idea, status)
    VALUES (${testOwnerId}, 'Drift Test Project', 'Testing drift flag', 'ready')
    RETURNING id
  `;
  const projectId = project.id;

  // Insert 3 test nodes with expected files
  const [node1] = await db<Array<{ id: string; node_key: string }>>`
    INSERT INTO nodes (project_id, node_key, phase, title, status, files)
    VALUES (${projectId}, '01.1', 'Phase 1', 'Config Node', 'ready', ${["package.json", "tsconfig.json"]})
    RETURNING id, node_key
  `;

  const [node2] = await db<Array<{ id: string; node_key: string }>>`
    INSERT INTO nodes (project_id, node_key, phase, title, status, files)
    VALUES (${projectId}, '01.2', 'Phase 1', 'Auth Node', 'ready', ${["src/auth.ts", "src/session.ts"]})
    RETURNING id, node_key
  `;

  const [node3] = await db<Array<{ id: string; node_key: string }>>`
    INSERT INTO nodes (project_id, node_key, phase, title, status, files)
    VALUES (${projectId}, '01.3', 'Phase 1', 'DB Node', 'ready', ${["src/database.ts"]})
    RETURNING id, node_key
  `;

  assert(node1.node_key === "01.1", "Setup: node 01.1 created");
  assert(node2.node_key === "01.2", "Setup: node 01.2 created");
  assert(node3.node_key === "01.3", "Setup: node 01.3 created");

  // =========================================================================
  // PART 3: TEST CASE - EXACT MATCH IN DATABASE
  // =========================================================================
  console.log("\n--- Part 3: TEST CASE (exact) in applyCommit & Database ---");

  const commitExact = await applyCommit({
    projectId,
    sha: "1111111111111111111111111111111111111111",
    message: "feat: [01.1] Setup config files",
    files: ["package.json", "tsconfig.json"],
  });

  assert(
    commitExact.matchedNodeKey === "01.1",
    "commitExact: matched node 01.1",
  );
  assert(
    commitExact.hasDrift === false,
    "commitExact: hasDrift returned false",
  );
  assert(
    commitExact.driftScore === 0.0,
    "commitExact: driftScore returned 0.0",
  );
  assert(
    commitExact.driftClassification === "exact",
    "commitExact: driftClassification is 'exact'",
  );

  // Verify in database
  const [dbCommitExact] = await db<
    Array<{ has_drift: boolean; drift_score: number }>
  >`
    SELECT has_drift, drift_score
    FROM commits
    WHERE id = ${commitExact.commitId}
  `;
  assert(
    dbCommitExact.has_drift === false,
    "DB commit: has_drift is false for exact match",
  );
  assert(
    dbCommitExact.drift_score === 0.0,
    "DB commit: drift_score is 0.0 for exact match",
  );

  const [dbNodeExact] = await db<
    Array<{ has_drift: boolean; drift_score: number; status: string }>
  >`
    SELECT has_drift, drift_score, status
    FROM nodes
    WHERE id = ${node1.id}
  `;
  assert(dbNodeExact.status === "committed", "DB node: status is 'committed'");
  assert(
    dbNodeExact.has_drift === false,
    "DB node: has_drift is false for exact match",
  );
  assert(
    dbNodeExact.drift_score === 0.0,
    "DB node: drift_score is 0.0 for exact match",
  );

  // =========================================================================
  // PART 4: TEST CASE - PARTIAL MATCH IN DATABASE
  // =========================================================================
  console.log(
    "\n--- Part 4: TEST CASE (partial) in applyCommit & Database ---",
  );

  const commitPartial = await applyCommit({
    projectId,
    sha: "2222222222222222222222222222222222222222",
    message: "feat: [01.2] Implement auth logic",
    files: ["src/auth.ts"], // 1 of 2 expected files
  });

  assert(
    commitPartial.matchedNodeKey === "01.2",
    "commitPartial: matched node 01.2",
  );
  assert(
    commitPartial.hasDrift === false,
    "commitPartial: hasDrift returned false (acceptable partial difference)",
  );
  assert(
    commitPartial.driftScore === 0.5,
    "commitPartial: driftScore returned 0.50",
  );
  assert(
    commitPartial.driftClassification === "partial",
    "commitPartial: driftClassification is 'partial'",
  );

  const [dbCommitPartial] = await db<
    Array<{ has_drift: boolean; drift_score: number }>
  >`
    SELECT has_drift, drift_score
    FROM commits
    WHERE id = ${commitPartial.commitId}
  `;
  assert(
    dbCommitPartial.has_drift === false,
    "DB commit: has_drift is false for moderate partial match",
  );
  assert(dbCommitPartial.drift_score === 0.5, "DB commit: drift_score is 0.50");

  const [dbNodePartial] = await db<
    Array<{ has_drift: boolean; drift_score: number }>
  >`
    SELECT has_drift, drift_score
    FROM nodes
    WHERE id = ${node2.id}
  `;
  assert(
    dbNodePartial.has_drift === false,
    "DB node: has_drift is false for moderate partial match",
  );
  assert(dbNodePartial.drift_score === 0.5, "DB node: drift_score is 0.50");

  // =========================================================================
  // PART 5: TEST CASE - UNRELATED MATCH (BIG DIFFERENCE FLAGGED)
  // =========================================================================
  console.log(
    "\n--- Part 5: TEST CASE (unrelated) in applyCommit & Database ---",
  );

  const commitUnrelated = await applyCommit({
    projectId,
    sha: "3333333333333333333333333333333333333333",
    message: "feat: [01.3] Database setup with unexpected assets",
    files: ["docs/architecture.png", "notes.md", "icons/fav.ico"], // 0 match with src/database.ts
  });

  assert(
    commitUnrelated.matchedNodeKey === "01.3",
    "commitUnrelated: matched node 01.3",
  );
  assert(
    commitUnrelated.hasDrift === true,
    "ACCEPTANCE CRITERIA: Drift flagged on big differences (unrelated files)",
  );
  assert(
    commitUnrelated.driftScore === 1.0,
    "commitUnrelated: driftScore is 1.0",
  );
  assert(
    commitUnrelated.driftClassification === "unrelated",
    "commitUnrelated: classification is 'unrelated'",
  );

  const [dbCommitUnrelated] = await db<
    Array<{ has_drift: boolean; drift_score: number; drift_reason: string }>
  >`
    SELECT has_drift, drift_score, drift_reason
    FROM commits
    WHERE id = ${commitUnrelated.commitId}
  `;
  assert(
    dbCommitUnrelated.has_drift === true,
    "ACCEPTANCE CRITERIA: DB commit has_drift is true",
  );
  assert(
    dbCommitUnrelated.drift_score === 1.0,
    "DB commit: drift_score is 1.0",
  );
  assert(
    typeof dbCommitUnrelated.drift_reason === "string",
    "DB commit: drift_reason is stored",
  );

  const [dbNodeUnrelated] = await db<
    Array<{ has_drift: boolean; drift_score: number; drift_reason: string }>
  >`
    SELECT has_drift, drift_score, drift_reason
    FROM nodes
    WHERE id = ${node3.id}
  `;
  assert(
    dbNodeUnrelated.has_drift === true,
    "ACCEPTANCE CRITERIA: DB node has_drift is true",
  );
  assert(dbNodeUnrelated.drift_score === 1.0, "DB node: drift_score is 1.0");
  assert(
    typeof dbNodeUnrelated.drift_reason === "string",
    "DB node: drift_reason is stored",
  );

  // =========================================================================
  // PART 6: SERVICE FUNCTIONS (checkNodeDrift, recordNodeDrift, checkProjectDrift)
  // =========================================================================
  console.log(
    "\n--- Part 6: Service Functions (checkNodeDrift, recordNodeDrift, checkProjectDrift) ---",
  );

  const node1Check = await checkNodeDrift({ projectId, nodeId: node1.id });
  assert(
    node1Check.hasDrift === false,
    "checkNodeDrift 01.1: hasDrift is false (exact)",
  );
  assert(
    node1Check.classification === "exact",
    "checkNodeDrift 01.1: classification is exact",
  );
  assert(node1Check.commitCount === 1, "checkNodeDrift 01.1: commitCount is 1");

  const node2Check = await checkNodeDrift({ projectId, nodeId: node2.id });
  assert(
    node2Check.hasDrift === false,
    "checkNodeDrift 01.2: hasDrift is false (partial)",
  );
  assert(
    node2Check.classification === "partial",
    "checkNodeDrift 01.2: classification is partial",
  );

  const node3Check = await checkNodeDrift({ projectId, nodeId: node3.id });
  assert(
    node3Check.hasDrift === true,
    "checkNodeDrift 01.3: hasDrift is true (unrelated)",
  );
  assert(
    node3Check.classification === "unrelated",
    "checkNodeDrift 01.3: classification is unrelated",
  );

  assert(DEFAULT_DRIFT_THRESHOLD === 0.5, "DEFAULT_DRIFT_THRESHOLD is 0.5");

  const recordRes = await recordNodeDrift({ projectId, nodeId: node3.id });
  assert(
    recordRes.hasDrift === true,
    "recordNodeDrift 01.3: successfully updates node drift in DB",
  );
  assert(
    recordRes.driftScore === 1.0,
    "recordNodeDrift 01.3: driftScore is 1.0",
  );

  // Project drift summary
  const projectSummary = await checkProjectDrift({ projectId });
  assert(projectSummary.totalNodes === 3, "checkProjectDrift: totalNodes is 3");
  assert(
    projectSummary.evaluatedNodes === 3,
    "checkProjectDrift: evaluatedNodes is 3",
  );
  assert(
    projectSummary.driftedNodesCount === 1,
    "checkProjectDrift: driftedNodesCount is 1",
  );
  assert(
    projectSummary.driftedNodes[0].nodeKey === "01.3",
    "checkProjectDrift: drifted node is 01.3",
  );
  assert(
    projectSummary.driftedNodes[0].hasDrift === true,
    "checkProjectDrift: drifted node hasDrift is true",
  );

  // =========================================================================
  // CLEANUP
  // =========================================================================
  console.log("\n--- Cleaning up test projects ---");
  await db`DELETE FROM projects WHERE id = ${projectId}`;
  console.log(`Cleaned up project ${projectId}`);

  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");
  console.log("\n✅ ALL TASK 06.6 DRIFT FLAG CHECKS PASSED!\n");
}

runDriftTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test suite failed:", err);
    process.exit(1);
  });
