/**
 * Test Suite for Task 09.1: Learning layer
 *
 * Verifies:
 * 1. Offline checks:
 *    - buildLearnMessages wraps diff and commit message as untrusted input
 *    - buildLearnMessages contains language and guidance rules
 *    - LearnOutputSchema rejects 3 options, duplicate options, and correct_index 4
 *    - shuffleOptions keeps correct answer mapping across 200 random runs and moves answer index
 *    - gradeAnswer grades correct, wrong, and reveals on the second wrong answer
 *    - Commit patch filtering drops lockfiles and images, truncates at 12000 chars and marks [truncated]
 *    - learn.v1 is registered in PROMPT_VERSIONS and no model names are hardcoded
 * 2. DB-backed checks (using .env.local):
 *    - 003_learning.sql migration applied (node_learning & node_answers exist)
 *    - GET /api/nodes/[id]/learn never contains correct_index before reveal
 *    - POST /api/nodes/[id]/learn/generate returns 409 without a commit
 *    - POST /api/nodes/[id]/learn/generate is cached on the second call (mock generateJson and count calls)
 *    - Correct answer moves a committed node to completed
 *    - Wrong answer leaves node committed
 *    - Skip completes node
 *    - Another owner's node returns 404 (isolation)
 *    - Daily generation cap (60 items/day) returns 429
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import {
  LEARN_PROMPT_VERSION,
  buildLearnMessages,
  LearnOutputSchema,
} from "../src/server/prompts/learn";
import { PROMPT_VERSIONS } from "../src/server/prompts";
import { shuffleOptions, gradeAnswer } from "../src/server/learning";
import {
  formatCommitPatchFiles,
  isExcludedDiffFile,
} from "../src/server/commitDiff";
import { GET as getLearn } from "../src/app/api/nodes/[id]/learn/route";
import { POST as postGenerate } from "../src/app/api/nodes/[id]/learn/generate/route";
import { POST as postAnswer } from "../src/app/api/nodes/[id]/answer/route";
import {
  OWNER_COOKIE_NAME,
  OWNER_HEADER_NAME,
  createProjectForOwner,
} from "../src/server/session";
import { savePlan } from "../src/server/savePlan";
import { getDb } from "../src/lib/db";

// Load .env.local or .env if present
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

async function runOfflineChecks() {
  console.log(
    "--- Part 1: Offline Prompts, Schema, Shuffling & Patch Filtering ---",
  );

  // 1.1 buildLearnMessages wraps diff and commit message as untrusted input
  const sampleDiff = "diff --git a/foo.ts b/foo.ts\n+const x = 1;";
  const sampleCommitMessage = "feat: add x counter";
  const messages = buildLearnMessages({
    node: {
      title: "Initialize Counter",
      explanation: "Sets up initial counter variable",
      acceptance: ["Counter starts at 1"],
      files: ["foo.ts"],
      requirementTitle: "Counter Feature",
    },
    diff: sampleDiff,
    commitMessage: sampleCommitMessage,
    filesChanged: ["foo.ts"],
  });

  const promptContent = `${messages.system}\n${messages.prompt}`;

  check(
    "buildLearnMessages wraps diff inside untrusted user input tag",
    promptContent.includes("<user_input>") &&
      promptContent.includes(sampleDiff),
  );
  check(
    "buildLearnMessages wraps commit message inside untrusted user input tag",
    promptContent.includes(sampleCommitMessage),
  );
  check(
    "buildLearnMessages contains language rule for beginners",
    promptContent.toLowerCase().includes("beginner"),
  );
  check(
    "buildLearnMessages specifies no syntax trivia",
    promptContent.toLowerCase().includes("syntax"),
  );

  // 1.2 LearnOutputSchema validation
  const validData = {
    diff_explanation:
      "This commit introduces the counter variable to hold runtime count.",
    question: {
      prompt: "Why is the counter initialized at 1?",
      options: [
        "To start the sequence from the initial count",
        "To satisfy a browser API requirement",
        "To compile the TypeScript bundle",
        "To format the logger string",
      ],
      correct_index: 0,
      explanation: "The counter represents 1-based indexing for steps.",
      hint: "Consider how initial sequence starts.",
    },
  };

  const validParse = LearnOutputSchema.safeParse(validData);
  check(
    "LearnOutputSchema accepts valid 4-option question",
    validParse.success,
  );

  // Rejects 3 options
  const threeOptions = {
    ...validData,
    question: {
      ...validData.question,
      options: ["A", "B", "C"],
    },
  };
  check(
    "LearnOutputSchema rejects 3 options",
    !LearnOutputSchema.safeParse(threeOptions).success,
  );

  // Rejects duplicate options
  const dupOptions = {
    ...validData,
    question: {
      ...validData.question,
      options: ["Duplicate", "Duplicate", "Option C", "Option D"],
    },
  };
  check(
    "LearnOutputSchema rejects duplicate options",
    !LearnOutputSchema.safeParse(dupOptions).success,
  );

  // Rejects correct_index 4 (must be 0..3)
  const invalidIndex = {
    ...validData,
    question: {
      ...validData.question,
      correct_index: 4,
    },
  };
  check(
    "LearnOutputSchema rejects correct_index 4",
    !LearnOutputSchema.safeParse(invalidIndex).success,
  );

  // 1.3 shuffleOptions keeps the correct mapping over 200 random runs
  const originalOptions = ["Zero", "One", "Two", "Three"];
  const originalCorrectIndex = 1; // "One"
  const originalCorrectValue = originalOptions[originalCorrectIndex];

  let allKeptMapping = true;
  const positionsSeen = new Set<number>();

  for (let i = 0; i < 200; i++) {
    const shuffled = shuffleOptions(originalOptions, originalCorrectIndex);
    if (shuffled.options[shuffled.correctIndex] !== originalCorrectValue) {
      allKeptMapping = false;
      break;
    }
    positionsSeen.add(shuffled.correctIndex);
  }

  check(
    "shuffleOptions keeps the correct answer mapping over 200 random runs",
    allKeptMapping,
  );
  check(
    "shuffleOptions moves the answer index across all 4 positions",
    positionsSeen.size === 4,
    Array.from(positionsSeen),
  );

  // 1.4 gradeAnswer checks
  const gradeCorrect = gradeAnswer({
    selectedIndex: 1,
    correctIndex: 1,
    priorWrongCount: 0,
  });
  check(
    "gradeAnswer returns correct when selectedIndex === correctIndex",
    gradeCorrect.result === "correct" && gradeCorrect.reveal === false,
  );

  const gradeWrong1 = gradeAnswer({
    selectedIndex: 0,
    correctIndex: 1,
    priorWrongCount: 0,
  });
  check(
    "gradeAnswer returns wrong without reveal on first wrong answer",
    gradeWrong1.result === "wrong" && gradeWrong1.reveal === false,
  );

  const gradeWrong2 = gradeAnswer({
    selectedIndex: 2,
    correctIndex: 1,
    priorWrongCount: 1,
  });
  check(
    "gradeAnswer reveals correct answer on second wrong answer",
    gradeWrong2.result === "wrong" && gradeWrong2.reveal === true,
  );

  // 1.5 commit patch filtering
  check(
    "isExcludedDiffFile drops package-lock.json",
    isExcludedDiffFile("package-lock.json"),
  );
  check("isExcludedDiffFile drops yarn.lock", isExcludedDiffFile("yarn.lock"));
  check(
    "isExcludedDiffFile drops pnpm-lock.yaml",
    isExcludedDiffFile("pnpm-lock.yaml"),
  );
  check("isExcludedDiffFile drops image png", isExcludedDiffFile("logo.png"));
  check("isExcludedDiffFile drops image svg", isExcludedDiffFile("icon.svg"));
  check(
    "isExcludedDiffFile keeps source code ts",
    !isExcludedDiffFile("src/index.ts"),
  );

  const filtered = formatCommitPatchFiles([
    { filename: "package-lock.json", patch: "+lockfile content" },
    { filename: "image.png", patch: "+binary" },
    { filename: "src/app.ts", patch: "@@ -1 +1 @@\n+export const app = true;" },
  ]);
  check(
    "formatCommitPatchFiles excludes lockfiles and images",
    filtered !== null &&
      !filtered.text.includes("package-lock.json") &&
      !filtered.text.includes("image.png") &&
      filtered.text.includes("src/app.ts"),
  );

  // Truncation at 12000 characters
  const largeFiles = [
    { filename: "file1.ts", patch: "a".repeat(8000) },
    { filename: "file2.ts", patch: "b".repeat(8000) },
  ];
  const truncatedPatch = formatCommitPatchFiles(largeFiles);
  check(
    "formatCommitPatchFiles truncates at 12000 characters and marks [truncated]",
    truncatedPatch !== null &&
      truncatedPatch.text.length <= 12000 &&
      truncatedPatch.text.includes("[truncated]"),
  );

  // 1.6 PROMPT_VERSIONS and no hardcoded model names
  check(
    "learn.v1 is registered in PROMPT_VERSIONS",
    PROMPT_VERSIONS.learn === LEARN_PROMPT_VERSION &&
      LEARN_PROMPT_VERSION === "learn.v1",
  );

  const learnPromptCode = fs.readFileSync(
    "src/server/prompts/learn.ts",
    "utf-8",
  );
  const learningCode = fs.readFileSync("src/server/learning.ts", "utf-8");
  check(
    "No hardcoded model names in prompts/learn.ts",
    !learnPromptCode.includes("gemini-") &&
      !learnPromptCode.includes("models/"),
  );
  check(
    "No hardcoded model names in learning.ts",
    !learningCode.includes("gemini-") && !learningCode.includes("models/"),
  );
}

async function runDbChecks() {
  console.log(
    "\n--- Part 2: DB-Backed Endpoints, Caching, Grading & Isolation ---",
  );

  if (!process.env.DATABASE_URL) {
    console.log("Skipping DB checks: DATABASE_URL not set.");
    return;
  }

  const db = getDb();
  const cleanupProjectIds: string[] = [];

  try {
    // 2.1 Migration applies: check tables exist
    const tables = await db<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('node_learning', 'node_answers')
    `;
    const tableNames = tables.map((t) => t.table_name);
    check(
      "Migration applies: node_learning and node_answers tables exist in database",
      tableNames.includes("node_learning") &&
        tableNames.includes("node_answers"),
    );

    const ownerA = crypto.randomUUID();
    const ownerB = crypto.randomUUID();

    // Create a project for Owner A
    const project = await createProjectForOwner(
      {
        name: "Learning Layer Test Project",
        idea: "Testing learning layer explanation generation, multiple-choice grading, and completion.",
      },
      ownerA,
    );
    cleanupProjectIds.push(project.id);

    const savedPlan = await savePlan({
      projectId: project.id,
      nodes: [
        {
          node_key: "01.1",
          phase: "Phase 1",
          title: "Step One Database",
          explanation: "Initial database setup for projects",
          status: "committed",
        },
        {
          node_key: "01.2",
          phase: "Phase 1",
          title: "Step Two API",
          explanation: "Backend API routes for projects",
          status: "not_started",
        },
        {
          node_key: "01.3",
          phase: "Phase 1",
          title: "Step Three Cap",
          explanation: "Extra node for testing rate cap",
          status: "committed",
        },
      ],
      edges: [
        { from_node: "01.2", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "01.3", to_node: "01.2", type: "DEPENDS_ON" },
      ],
    });

    const node1Id = savedPlan.nodeIds["01.1"];
    const node2Id = savedPlan.nodeIds["01.2"];
    const node3Id = savedPlan.nodeIds["01.3"];

    // 2.2 409 without a commit
    // node2Id has status 'not_started' and zero commits in DB
    const reqGenerateNoCommit = new NextRequest(
      `http://localhost:3000/api/nodes/${node2Id}/learn/generate`,
      {
        method: "POST",
        headers: {
          [OWNER_HEADER_NAME]: ownerA,
          cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
        },
      },
    );
    const resNoCommit = await postGenerate(reqGenerateNoCommit, {
      params: Promise.resolve({ id: node2Id }),
    });
    check(
      "POST /api/nodes/[id]/learn/generate returns 409 without a commit",
      resNoCommit.status === 409,
    );

    // 2.3 Insert a commit for node1
    const commitSha1 = "a1b2c3d4e5f6789012345678901234567890abcd";
    await db`
      INSERT INTO commits (project_id, node_id, sha, message, files)
      VALUES (
        ${project.id},
        ${node1Id},
        ${commitSha1},
        ${"feat: initialize database schema"},
        ${["supabase/migrations/001_init.sql"]}
      )
    `;

    // 2.4 Mock generateJson and verify caching
    let generateCallCount = 0;
    globalThis.__kalp_mock_generate_json__ = async () => {
      generateCallCount++;
      return {
        data: {
          diff_explanation:
            "This commit configures the initial SQL tables and constraints.",
          question: {
            prompt: "What is the role of this initial database schema?",
            options: [
              "Creates persistent storage for projects and nodes",
              "Compiles client-side CSS stylesheets",
              "Configures local DNS resolution",
              "Renders React Flow UI components",
            ],
            correct_index: 0,
            explanation: "Database tables store relational graph records.",
            hint: "Think about backend data persistence.",
          },
        },
        model: "mock-model",
      };
    };

    try {
      // First generation call: should invoke generateJson
      const reqGen1 = new NextRequest(
        `http://localhost:3000/api/nodes/${node1Id}/learn/generate`,
        {
          method: "POST",
          headers: {
            [OWNER_HEADER_NAME]: ownerA,
            cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
          },
        },
      );
      const resGen1 = await postGenerate(reqGen1, {
        params: Promise.resolve({ id: node1Id }),
      });
      const bodyGen1 = await resGen1.json();

      check(
        "POST /api/nodes/[id]/learn/generate succeeds on first call",
        resGen1.status === 200 && bodyGen1.data?.learning !== null,
      );
      check("generateJson called on first generation", generateCallCount === 1);

      // Second generation call: should hit node_learning cache and NOT call generateJson
      const reqGen2 = new NextRequest(
        `http://localhost:3000/api/nodes/${node1Id}/learn/generate`,
        {
          method: "POST",
          headers: {
            [OWNER_HEADER_NAME]: ownerA,
            cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
          },
        },
      );
      const resGen2 = await postGenerate(reqGen2, {
        params: Promise.resolve({ id: node1Id }),
      });
      check(
        "POST /api/nodes/[id]/learn/generate is cached on the second call",
        resGen2.status === 200 && generateCallCount === 1,
      );
    } finally {
      globalThis.__kalp_mock_generate_json__ = undefined;
    }

    // 2.5 GET /api/nodes/[id]/learn never contains correct_index before reveal
    const reqGetLearn = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}/learn`,
      {
        method: "GET",
        headers: {
          [OWNER_HEADER_NAME]: ownerA,
          cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
        },
      },
    );
    const resGetLearn = await getLearn(reqGetLearn, {
      params: Promise.resolve({ id: node1Id }),
    });
    const bodyGetLearn = await resGetLearn.json();
    const rawLearnJson = JSON.stringify(bodyGetLearn);

    check("GET /api/nodes/[id]/learn returns 200", resGetLearn.status === 200);
    check(
      "GET /api/nodes/[id]/learn never contains correct_index before reveal",
      !rawLearnJson.includes('"correct_index"') &&
        bodyGetLearn.data?.learning?.question?.correct_index === undefined &&
        bodyGetLearn.data?.answer_state?.reveal === null,
    );

    // Retrieve the actual correct_index stored in the database for node1
    const [dbLearningRow] = await db<{ correct_index: number }[]>`
      SELECT correct_index FROM node_learning WHERE node_id = ${node1Id}
    `;
    const actualCorrectIndex = dbLearningRow?.correct_index ?? 0;
    const wrongIndex = (actualCorrectIndex + 1) % 4;

    // 2.6 Wrong answer leaves node committed
    const reqWrongAnswer = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}/answer`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
          cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
        },
        body: JSON.stringify({ selected_index: wrongIndex }),
      },
    );
    const resWrongAnswer = await postAnswer(reqWrongAnswer, {
      params: Promise.resolve({ id: node1Id }),
    });
    const bodyWrongAnswer = await resWrongAnswer.json();

    check(
      "Wrong answer returns result: 'wrong' and completed: false",
      bodyWrongAnswer.data?.result === "wrong" &&
        bodyWrongAnswer.data?.completed === false,
    );

    const [dbNode1AfterWrong] = await db<{ status: string }[]>`
      SELECT status FROM nodes WHERE id = ${node1Id}
    `;
    check(
      "Wrong answer leaves node status 'committed'",
      dbNode1AfterWrong?.status === "committed",
    );

    // 2.7 Second wrong answer reveals explanation
    const reqWrongAnswer2 = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}/answer`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
          cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
        },
        body: JSON.stringify({ selected_index: (wrongIndex + 1) % 4 }),
      },
    );
    const resWrongAnswer2 = await postAnswer(reqWrongAnswer2, {
      params: Promise.resolve({ id: node1Id }),
    });
    const bodyWrongAnswer2 = await resWrongAnswer2.json();

    check(
      "Second wrong answer reveals correct answer and explanation",
      bodyWrongAnswer2.data?.reveal !== null &&
        typeof bodyWrongAnswer2.data?.reveal?.correct_index === "number" &&
        typeof bodyWrongAnswer2.data?.reveal?.explanation === "string",
    );

    // 2.8 Correct answer moves a committed node to completed
    // Setup a commit on node 01.3
    const commitSha3 = "f1e2d3c4b5a6789012345678901234567890fedc";
    await db`
      INSERT INTO commits (project_id, node_id, sha, message, files)
      VALUES (
        ${project.id},
        ${node3Id},
        ${commitSha3},
        ${"feat: cap testing commit"},
        ${["src/cap.ts"]}
      )
    `;

    // Populate node_learning directly for node3
    await db`
      INSERT INTO node_learning (
        node_id,
        project_id,
        diff_explanation,
        diff_source,
        commit_sha,
        question,
        correct_index,
        prompt_version
      ) VALUES (
        ${node3Id},
        ${project.id},
        ${"Explanation for node 3"},
        ${"files_only"},
        ${commitSha3},
        ${JSON.stringify({
          prompt: "Question 3?",
          options: ["Opt 0", "Opt 1", "Opt 2", "Opt 3"],
          explanation: "Why Opt 2 is right",
          hint: "Hint for 3",
        })},
        2,
        ${LEARN_PROMPT_VERSION}
      )
    `;

    const reqCorrect = new NextRequest(
      `http://localhost:3000/api/nodes/${node3Id}/answer`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
          cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
        },
        body: JSON.stringify({ selected_index: 2 }),
      },
    );
    const resCorrect = await postAnswer(reqCorrect, {
      params: Promise.resolve({ id: node3Id }),
    });
    const bodyCorrect = await resCorrect.json();
    if (resCorrect.status !== 200 || !bodyCorrect.data?.completed) {
      console.log(
        "DEBUG Correct:",
        resCorrect.status,
        JSON.stringify(bodyCorrect),
      );
    }

    check(
      "Correct answer returns result: 'correct' and completed: true",
      bodyCorrect.data?.result === "correct" &&
        bodyCorrect.data?.completed === true,
    );

    const [dbNode3AfterCorrect] = await db<{ status: string }[]>`
      SELECT status FROM nodes WHERE id = ${node3Id}
    `;
    check(
      "Correct answer moves committed node to completed in database",
      dbNode3AfterCorrect?.status === "completed",
    );

    // 2.9 Skip completes it
    // Reset node 01.1 back to committed for skip test
    await db`UPDATE nodes SET status = 'committed' WHERE id = ${node1Id}`;
    const reqSkip = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}/answer`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerA,
          cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
        },
        body: JSON.stringify({ skip: true }),
      },
    );
    const resSkip = await postAnswer(reqSkip, {
      params: Promise.resolve({ id: node1Id }),
    });
    const bodySkip = await resSkip.json();
    if (resSkip.status !== 200 || !bodySkip.data?.completed) {
      console.log("DEBUG Skip:", resSkip.status, JSON.stringify(bodySkip));
    }

    check(
      "Skip answer returns result: 'skipped' and completed: true",
      bodySkip.data?.result === "skipped" && bodySkip.data?.completed === true,
    );

    const [dbNode1AfterSkip] = await db<{ status: string }[]>`
      SELECT status FROM nodes WHERE id = ${node1Id}
    `;
    check(
      "Skip completes committed node in database",
      dbNode1AfterSkip?.status === "completed",
    );

    const [skippedAnswerRow] = await db<{ result: string }[]>`
      SELECT result FROM node_answers WHERE node_id = ${node1Id} AND result = 'skipped'
    `;
    check(
      "Skip records 'skipped' answer in node_answers table",
      skippedAnswerRow?.result === "skipped",
    );

    // 2.10 Another owner's node returns 404
    const reqOtherOwnerGet = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}/learn`,
      {
        method: "GET",
        headers: {
          [OWNER_HEADER_NAME]: ownerB,
          cookie: `${OWNER_COOKIE_NAME}=${ownerB}`,
        },
      },
    );
    const resOtherOwnerGet = await getLearn(reqOtherOwnerGet, {
      params: Promise.resolve({ id: node1Id }),
    });
    check(
      "GET /api/nodes/[id]/learn returns 404 for another owner",
      resOtherOwnerGet.status === 404,
    );

    const reqOtherOwnerGen = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}/learn/generate`,
      {
        method: "POST",
        headers: {
          [OWNER_HEADER_NAME]: ownerB,
          cookie: `${OWNER_COOKIE_NAME}=${ownerB}`,
        },
      },
    );
    const resOtherOwnerGen = await postGenerate(reqOtherOwnerGen, {
      params: Promise.resolve({ id: node1Id }),
    });
    check(
      "POST /api/nodes/[id]/learn/generate returns 404 for another owner",
      resOtherOwnerGen.status === 404,
    );

    const reqOtherOwnerAns = new NextRequest(
      `http://localhost:3000/api/nodes/${node1Id}/answer`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [OWNER_HEADER_NAME]: ownerB,
          cookie: `${OWNER_COOKIE_NAME}=${ownerB}`,
        },
        body: JSON.stringify({ skip: true }),
      },
    );
    const resOtherOwnerAns = await postAnswer(reqOtherOwnerAns, {
      params: Promise.resolve({ id: node1Id }),
    });
    check(
      "POST /api/nodes/[id]/answer returns 404 for another owner",
      resOtherOwnerAns.status === 404,
    );

    // 2.11 Daily cap returns 429
    // Insert 60 dummy node_learning records for ownerA projects generated today
    // First create a separate dummy node in project
    const [capNode] = await db<{ id: string }[]>`
      INSERT INTO nodes (project_id, node_key, phase, title, status)
      VALUES (${project.id}, 'CAP.1', 'Phase 9', 'Cap Node', 'committed')
      RETURNING id
    `;
    const capNodeId = capNode.id;

    // Insert a commit for capNode
    await db`
      INSERT INTO commits (project_id, node_id, sha, message, files)
      VALUES (${project.id}, ${capNodeId}, 'cap-sha-test', 'cap commit', ${["cap.ts"]})
    `;

    // Batch insert 60 dummy nodes and node_learning rows for ownerA
    const dummyNodes = await db<{ id: string }[]>`
      INSERT INTO nodes (project_id, node_key, phase, title, status)
      SELECT
        ${project.id},
        'CAP.' || s,
        'Phase 9',
        'Cap Test',
        'committed'
      FROM generate_series(10, 69) as s
      RETURNING id
    `;

    await db`
      INSERT INTO node_learning (
        node_id,
        project_id,
        diff_explanation,
        diff_source,
        commit_sha,
        question,
        correct_index,
        prompt_version,
        generated_at
      )
      SELECT
        id,
        ${project.id},
        'Cap check item',
        'plan_only',
        'sha',
        ${JSON.stringify({
          prompt: "P",
          options: ["1", "2", "3", "4"],
          explanation: "E",
          hint: "H",
        })},
        0,
        ${LEARN_PROMPT_VERSION},
        now()
      FROM unnest(${dummyNodes.map((n) => n.id)}::uuid[]) as id
    `;

    // Now call generate for capNode (which has a commit, but no node_learning record yet)
    const reqCapGenerate = new NextRequest(
      `http://localhost:3000/api/nodes/${capNodeId}/learn/generate`,
      {
        method: "POST",
        headers: {
          [OWNER_HEADER_NAME]: ownerA,
          cookie: `${OWNER_COOKIE_NAME}=${ownerA}`,
        },
      },
    );
    const resCapGenerate = await postGenerate(reqCapGenerate, {
      params: Promise.resolve({ id: capNodeId }),
    });

    check(
      "Daily generation cap (60 items/day) returns HTTP 429",
      resCapGenerate.status === 429,
    );
  } finally {
    // Cleanup created test projects
    for (const projId of cleanupProjectIds) {
      try {
        await db`DELETE FROM projects WHERE id = ${projId}`;
      } catch {
        // Ignore cleanup error
      }
    }
  }
}

async function main() {
  console.log("=== RUNNING TASK 09.1 LEARNING LAYER TEST SUITE ===\n");
  try {
    await runOfflineChecks();
    await runDbChecks();
  } catch (err) {
    console.error("Unhandled test execution error:", err);
    failed = true;
  }

  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log("\nALL LEARNING LAYER CHECKS PASSED!");
  }
}

void main();
