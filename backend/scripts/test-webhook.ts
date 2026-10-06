/**
 * Test Suite for Feature 06: GitHub Tracking (Tasks 06.1, 06.2, 06.3)
 *
 * Verifies:
 * 1. parseNodeKeys (Task 06.3):
 *    - "[03.5] Decompose" -> ["03.5"]
 *    - "[02.2] [02.3] Tables" and "[02.2][02.3] x" -> both
 *    - duplicates removed
 *    - no brackets -> []
 *    - "[3.5]", "[01.1.2]", and "[abc]" ignored
 *    - ids on the second line ignored
 * 2. verifySignature (Task 06.2):
 *    - valid HMAC signature
 *    - wrong secret returns false
 *    - tampered body returns false
 *    - missing header returns false
 *    - header without "sha256=" prefix returns false
 *    - wrong-length hex does not throw and returns false
 * 3. normalizeRepoUrl & checkRepoPublic (Task 06.1):
 *    - accepts https://github.com/o/r, with .git, trailing slash, /tree/main/x, www, ?tab=x
 *    - rejects gitlab, http://, git@github.com:o/r.git, missing repo, ".."
 *    - checkRepoPublic returns 'public' on 200, throws REPO_NOT_FOUND_OR_PRIVATE on 404, 'skipped' on other status
 * 4. processWebhook (Task 06.2):
 *    - valid ping -> 200 { ok: true, event: 'ping' }
 *    - bad signature -> 401 { ok: false, error: 'invalid signature' }
 *    - unknown repo -> 401 with identical body ({ ok: false, error: 'invalid signature' })
 *    - missing signature header -> 401 { ok: false, error: 'missing signature' }
 *    - invalid JSON -> 400 { ok: false, error: 'invalid json' }
 *    - body over 1,000,000 characters -> 413 { ok: false, error: 'payload too large' }
 *    - push on default branch -> 200 with commits containing node_keys and files
 *    - push on another branch -> 200 { ok: true, event: 'push', ignored: true }
 *    - unknown event -> 200 { ok: true, ignored: true }
 *    - two projects sharing one repo with different secrets: only matching one is counted
 */

import crypto from "node:crypto";
import { parseNodeKeys } from "../src/server/commitParser";
import { verifySignature, processWebhook } from "../src/server/webhook";
import {
  normalizeRepoUrl,
  checkRepoPublic,
  generateWebhookSecret,
} from "../src/server/repo";
import { BadRequestError } from "../src/lib/errors";

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

console.log(
  "\n=== RUNNING TASK 06.1 / 06.2 / 06.3 GITHUB WEBHOOK TEST SUITE ===\n",
);

// ---------------------------------------------------------------------------
// Part 1: Commit Message Node ID Parser (parseNodeKeys)
// ---------------------------------------------------------------------------
console.log("--- Part 1: parseNodeKeys Tests ---");

check(
  "parseNodeKeys: '[03.5] Decompose' returns ['03.5']",
  JSON.stringify(parseNodeKeys("[03.5] Decompose to nodes")) ===
    JSON.stringify(["03.5"]),
);

check(
  "parseNodeKeys: '[02.2] [02.3] Tables' returns both in order",
  JSON.stringify(parseNodeKeys("[02.2] [02.3] Tables setup")) ===
    JSON.stringify(["02.2", "02.3"]),
);

check(
  "parseNodeKeys: '[02.2][02.3] x' returns both without spacing",
  JSON.stringify(parseNodeKeys("[02.2][02.3] x")) ===
    JSON.stringify(["02.2", "02.3"]),
);

check(
  "parseNodeKeys: duplicates removed while preserving order",
  JSON.stringify(
    parseNodeKeys("[01.1] Setup auth [01.2] and repeat [01.1]"),
  ) === JSON.stringify(["01.1", "01.2"]),
);

check(
  "parseNodeKeys: no brackets returns empty array",
  parseNodeKeys("Regular commit message without tokens").length === 0,
);

check(
  "parseNodeKeys: '[3.5]' single digit phase is ignored",
  parseNodeKeys("[3.5] Invalid phase number").length === 0,
);

check(
  "parseNodeKeys: '[01.1.2]' three level key is ignored",
  parseNodeKeys("[01.1.2] Invalid three segment key").length === 0,
);

check(
  "parseNodeKeys: '[abc]' alphabetic bracket is ignored",
  parseNodeKeys("[abc] Non-numeric bracket tag").length === 0,
);

check(
  "parseNodeKeys: node ids on later lines are ignored",
  JSON.stringify(
    parseNodeKeys("First line without ids\n[05.2] Graph render on second line"),
  ) === JSON.stringify([]),
);

check(
  "parseNodeKeys: node ids on first line extracted, second line ignored",
  JSON.stringify(
    parseNodeKeys("[01.1] Init project\n[02.1] Later step on line 2"),
  ) === JSON.stringify(["01.1"]),
);

// ---------------------------------------------------------------------------
// Part 2: HMAC-SHA256 Signature Verification (verifySignature)
// ---------------------------------------------------------------------------
console.log("\n--- Part 2: verifySignature Tests ---");

const TEST_SECRET = generateWebhookSecret();
const SAMPLE_BODY = JSON.stringify({
  action: "completed",
  repository: { full_name: "kalp-io/kalp" },
});
const VALID_SIG = signPayload(TEST_SECRET, SAMPLE_BODY);

check(
  "verifySignature: valid signature matches",
  verifySignature(TEST_SECRET, SAMPLE_BODY, VALID_SIG) === true,
);

check(
  "verifySignature: wrong secret returns false",
  verifySignature("wrong_secret_12345", SAMPLE_BODY, VALID_SIG) === false,
);

check(
  "verifySignature: tampered body returns false",
  verifySignature(TEST_SECRET, SAMPLE_BODY + " ", VALID_SIG) === false,
);

check(
  "verifySignature: missing header returns false",
  verifySignature(TEST_SECRET, SAMPLE_BODY, undefined) === false,
);

check(
  "verifySignature: header without 'sha256=' prefix returns false",
  verifySignature(
    TEST_SECRET,
    SAMPLE_BODY,
    VALID_SIG.replace("sha256=", ""),
  ) === false,
);

check(
  "verifySignature: wrong-length hex does not throw and returns false",
  verifySignature(TEST_SECRET, SAMPLE_BODY, "sha256=abcd1234") === false,
);

check(
  "verifySignature: empty secret returns false",
  verifySignature("", SAMPLE_BODY, VALID_SIG) === false,
);

check(
  "verifySignature: malformed non-hex string does not throw",
  verifySignature(
    TEST_SECRET,
    SAMPLE_BODY,
    "sha256=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
  ) === false,
);

// ---------------------------------------------------------------------------
// Part 3: GitHub Repo URL Normalization (normalizeRepoUrl) & Public Checker
// ---------------------------------------------------------------------------
console.log("\n--- Part 3: normalizeRepoUrl & checkRepoPublic Tests ---");

// Valid cases
const c1 = normalizeRepoUrl("https://github.com/facebook/react");
check(
  "normalizeRepoUrl: accepts standard https://github.com/owner/repo",
  c1.url === "https://github.com/facebook/react" &&
    c1.owner === "facebook" &&
    c1.repo === "react" &&
    c1.fullNameLower === "facebook/react",
);

const c2 = normalizeRepoUrl("https://github.com/vercel/next.js.git");
check(
  "normalizeRepoUrl: strips .git suffix",
  c2.url === "https://github.com/vercel/next.js" && c2.repo === "next.js",
);

const c3 = normalizeRepoUrl("https://github.com/tailwindlabs/tailwindcss/");
check(
  "normalizeRepoUrl: handles trailing slash",
  c3.url === "https://github.com/tailwindlabs/tailwindcss" &&
    c3.fullNameLower === "tailwindlabs/tailwindcss",
);

const c4 = normalizeRepoUrl(
  "https://github.com/GlitteryMite40/Kalp.io/tree/main/src",
);
check(
  "normalizeRepoUrl: strips /tree/... extra paths",
  c4.url === "https://github.com/GlitteryMite40/Kalp.io" &&
    c4.fullNameLower === "glitterymite40/kalp.io",
);

const c5 = normalizeRepoUrl("https://www.github.com/owner/repo");
check(
  "normalizeRepoUrl: handles www. prefix",
  c5.url === "https://github.com/owner/repo",
);

const c6 = normalizeRepoUrl(
  "https://github.com/owner/repo?tab=repositories#readme",
);
check(
  "normalizeRepoUrl: strips query parameters and hash",
  c6.url === "https://github.com/owner/repo",
);

// Rejection cases
function expectInvalidRepo(input: string, label: string) {
  let threw = false;
  let codeMatch = false;
  try {
    normalizeRepoUrl(input);
  } catch (err) {
    threw = true;
    if (err instanceof BadRequestError) {
      codeMatch = err.code === "INVALID_REPO_URL";
    }
  }
  check(`normalizeRepoUrl: rejects ${label}`, threw && codeMatch);
}

expectInvalidRepo("https://gitlab.com/owner/repo", "gitlab host");
expectInvalidRepo("http://github.com/owner/repo", "insecure http://");
expectInvalidRepo("git@github.com:owner/repo.git", "SSH format");
expectInvalidRepo("https://github.com/owner", "missing repo name");
expectInvalidRepo("https://github.com/owner/..", "reserved '..' repo name");
expectInvalidRepo("https://github.com/owner/.", "reserved '.' repo name");
expectInvalidRepo("not a url at all", "malformed non-URL text");

// checkRepoPublic tests with mock fetcher
const mockFetch200 = async () => new Response("{}", { status: 200 });
const mockFetch404 = async () => new Response("{}", { status: 404 });
const mockFetch403 = async () => new Response("{}", { status: 403 });
const mockFetchError = async () => {
  throw new Error("DNS failure");
};

async function testCheckRepoPublic() {
  const res200 = await checkRepoPublic("facebook", "react", {
    fetcher: mockFetch200 as unknown as typeof fetch,
  });
  check(
    "checkRepoPublic: returns 'public' for 200 response",
    res200 === "public",
  );

  let threw404 = false;
  let code404 = false;
  try {
    await checkRepoPublic("private-org", "secret-repo", {
      fetcher: mockFetch404 as unknown as typeof fetch,
    });
  } catch (err) {
    threw404 = true;
    if (err instanceof BadRequestError) {
      code404 = err.code === "REPO_NOT_FOUND_OR_PRIVATE";
    }
  }
  check(
    "checkRepoPublic: throws REPO_NOT_FOUND_OR_PRIVATE on 404",
    threw404 && code404,
  );

  const res403 = await checkRepoPublic("rate-limited", "repo", {
    fetcher: mockFetch403 as unknown as typeof fetch,
  });
  check(
    "checkRepoPublic: returns 'skipped' on 403 rate limit to avoid blocking user",
    res403 === "skipped",
  );

  const resError = await checkRepoPublic("offline", "repo", {
    fetcher: mockFetchError as unknown as typeof fetch,
  });
  check(
    "checkRepoPublic: returns 'skipped' on network failure to avoid blocking user",
    resError === "skipped",
  );
}

// ---------------------------------------------------------------------------
// Part 4: GitHub Webhook Processing (processWebhook)
// ---------------------------------------------------------------------------
console.log("\n--- Part 4: processWebhook Tests ---");

async function runWebhookTests() {
  await testCheckRepoPublic();

  const SECRET_A = "secret_project_a_abcdef1234567890abcdef1234567890";
  const SECRET_B = "secret_project_b_9876543210fedcba9876543210fedcba";

  // In-memory project lookup repository
  const mockCandidates = [
    { id: "proj-1", webhook_secret: SECRET_A },
    { id: "proj-2", webhook_secret: SECRET_B },
  ];

  const inMemoryLookup = (repo: string) => {
    if (repo === "kalp-io/demo") {
      return mockCandidates;
    }
    return [];
  };

  // 1. Valid ping
  const pingPayload = JSON.stringify({
    zen: "Design for failure.",
    hook_id: 123456,
    repository: { full_name: "kalp-io/demo" },
  });
  const pingSig = signPayload(SECRET_A, pingPayload);

  const pingResult = await processWebhook({
    rawBody: pingPayload,
    headers: {
      "x-hub-signature-256": pingSig,
      "x-github-event": "ping",
    },
    findProjectsByRepoFullName: inMemoryLookup,
  });

  check(
    "processWebhook: valid ping returns 200 with ok: true and event: 'ping'",
    pingResult.status === 200 &&
      (pingResult.body as { ok: boolean; event: string }).ok === true &&
      (pingResult.body as { ok: boolean; event: string }).event === "ping",
  );

  // 2. Bad signature
  const badSigResult = await processWebhook({
    rawBody: pingPayload,
    headers: {
      "x-hub-signature-256": "sha256=" + "00".repeat(32),
      "x-github-event": "ping",
    },
    findProjectsByRepoFullName: inMemoryLookup,
  });

  check(
    "processWebhook: bad signature returns 401 with error 'invalid signature'",
    badSigResult.status === 401 &&
      (badSigResult.body as { ok: boolean; error: string }).error ===
        "invalid signature",
  );

  // 3. Unknown repo returns identical 401 body as bad signature
  const unknownRepoPayload = JSON.stringify({
    repository: { full_name: "unknown/unregistered-repo" },
  });
  const unknownRepoSig = signPayload("some_secret", unknownRepoPayload);

  const unknownRepoResult = await processWebhook({
    rawBody: unknownRepoPayload,
    headers: {
      "x-hub-signature-256": unknownRepoSig,
      "x-github-event": "ping",
    },
    findProjectsByRepoFullName: inMemoryLookup,
  });

  check(
    "processWebhook: unknown repo returns 401 with IDENTICAL body to bad signature (anti-enumeration)",
    unknownRepoResult.status === 401 &&
      JSON.stringify(unknownRepoResult.body) ===
        JSON.stringify(badSigResult.body),
  );

  // 4. Missing signature header
  const missingSigResult = await processWebhook({
    rawBody: pingPayload,
    headers: {
      "x-github-event": "ping",
    },
    findProjectsByRepoFullName: inMemoryLookup,
  });

  check(
    "processWebhook: missing signature header returns 401",
    missingSigResult.status === 401 &&
      (missingSigResult.body as { error: string }).error ===
        "missing signature",
  );

  // 5. Invalid JSON payload
  const invalidJsonResult = await processWebhook({
    rawBody: "not json at all {",
    headers: {
      "x-hub-signature-256": "sha256=" + "11".repeat(32),
    },
    findProjectsByRepoFullName: inMemoryLookup,
  });

  check(
    "processWebhook: invalid JSON returns 400",
    invalidJsonResult.status === 400 &&
      (invalidJsonResult.body as { error: string }).error === "invalid json",
  );

  // 6. Body over 1,000,000 characters
  const giantBody = "x".repeat(1_000_001);
  const giantResult = await processWebhook({
    rawBody: giantBody,
    headers: {
      "x-hub-signature-256": "sha256=" + "22".repeat(32),
    },
    findProjectsByRepoFullName: inMemoryLookup,
  });

  check(
    "processWebhook: body over 1,000,000 chars returns 413 payload too large",
    giantResult.status === 413 &&
      (giantResult.body as { error: string }).error === "payload too large",
  );

  // 7. Push on default branch with commits
  const pushPayload = JSON.stringify({
    ref: "refs/heads/main",
    repository: {
      full_name: "kalp-io/demo",
      default_branch: "main",
    },
    commits: [
      {
        id: "sha-001",
        message: "[01.1] Setup scaffolding\nMore details on line 2",
        added: ["src/index.ts", "package.json"],
        modified: [],
        removed: [],
      },
      {
        id: "sha-002",
        message: "[01.2] [02.1] Database schema & models",
        added: ["src/db.ts"],
        modified: ["src/index.ts"],
        removed: ["temp.txt"],
      },
    ],
  });

  const pushSig = signPayload(SECRET_A, pushPayload);
  const pushResult = await processWebhook({
    rawBody: pushPayload,
    headers: {
      "x-hub-signature-256": pushSig,
      "x-github-event": "push",
    },
    findProjectsByRepoFullName: inMemoryLookup,
  });

  const pushBody = pushResult.body as {
    ok: boolean;
    event: string;
    projects: number;
    commits: Array<{ sha: string; node_keys: string[]; files: string[] }>;
  };

  check(
    "processWebhook: push on default branch returns 200 OK",
    pushResult.status === 200 &&
      pushBody.ok === true &&
      pushBody.event === "push",
  );

  check(
    "processWebhook: push returns exactly verified projects count (1 project matched secret)",
    pushBody.projects === 1,
  );

  check(
    "processWebhook: push parses commit 1 node_keys as ['01.1']",
    pushBody.commits?.length === 2 &&
      JSON.stringify(pushBody.commits[0]?.node_keys) ===
        JSON.stringify(["01.1"]),
  );

  check(
    "processWebhook: push aggregates added, modified, and removed files",
    pushBody.commits[0]?.files.includes("src/index.ts") &&
      pushBody.commits[1]?.files.includes("temp.txt"),
  );

  check(
    "processWebhook: push parses multi-node commit 2 as ['01.2', '02.1']",
    JSON.stringify(pushBody.commits[1]?.node_keys) ===
      JSON.stringify(["01.2", "02.1"]),
  );

  // 8. Push on a feature branch (not default branch)
  const featurePushPayload = JSON.stringify({
    ref: "refs/heads/feature/login",
    repository: {
      full_name: "kalp-io/demo",
      default_branch: "main",
    },
    commits: [{ id: "sha-003", message: "[01.1] work" }],
  });
  const featurePushSig = signPayload(SECRET_A, featurePushPayload);

  const featurePushResult = await processWebhook({
    rawBody: featurePushPayload,
    headers: {
      "x-hub-signature-256": featurePushSig,
      "x-github-event": "push",
    },
    findProjectsByRepoFullName: inMemoryLookup,
  });

  check(
    "processWebhook: push on non-default branch returns 200 ignored: true",
    featurePushResult.status === 200 &&
      (featurePushResult.body as { ignored: boolean }).ignored === true,
  );

  // 9. Unknown event returns 200 ignored: true
  const issueResult = await processWebhook({
    rawBody: pingPayload,
    headers: {
      "x-hub-signature-256": pingSig,
      "x-github-event": "issues",
    },
    findProjectsByRepoFullName: inMemoryLookup,
  });

  check(
    "processWebhook: unknown event returns 200 ignored: true",
    issueResult.status === 200 &&
      (issueResult.body as { ignored: boolean }).ignored === true,
  );

  // 10. Two projects sharing same repo: both verify if signed with their respective secret
  const pushSigB = signPayload(SECRET_B, pushPayload);
  const pushResultB = await processWebhook({
    rawBody: pushPayload,
    headers: {
      "x-hub-signature-256": pushSigB,
      "x-github-event": "push",
    },
    findProjectsByRepoFullName: inMemoryLookup,
  });

  check(
    "processWebhook: project B secret verifies and counts only matching project (1)",
    pushResultB.status === 200 &&
      (pushResultB.body as { projects: number }).projects === 1,
  );

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================\n");

  if (failed) {
    console.error("SOME WEBHOOK CHECKS FAILED!");
    process.exit(1);
  } else {
    console.log("ALL WEBHOOK CHECKS PASSED!");
    process.exit(0);
  }
}

void runWebhookTests();
