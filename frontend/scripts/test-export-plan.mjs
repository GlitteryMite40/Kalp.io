/**
 * Test Suite for Task 05.8: Export plan
 *
 * Verifies:
 * 1. Component contracts and file integrity for:
 *    - frontend/src/lib/export.ts
 *    - frontend/src/components/ExportMenu.tsx
 *    - Integration inside frontend/src/app/p/[id]/page.tsx
 *    - Integration inside frontend/src/components/NodePanel.tsx
 * 2. ACCEPTANCE CRITERIA: "Files contain every node and its dependencies"
 *    - Machine-readable JSON export contains all nodes and full dependency lists
 *    - Markdown checklist contains every node with checkbox and explicit dependency line
 * 3. TEST CASES:
 *    - "50-node plan": 50-node complex DAG with multi-tier dependencies, diamond patterns, and fan-outs
 *    - "special characters in titles": quotes, HTML tags, markdown delimiters, backslashes, unicode, emojis, newlines
 * 4. Filename sanitization across operating systems (Windows/Linux/macOS)
 * 5. Browser download dispatch via Blob and anchor trigger with mock DOM
 * 6. Edge cases: empty plan, unphased nodes, missing metadata
 */

import fs from "node:fs";
import path from "node:path";
import {
  generatePlanJson,
  generatePlanMarkdown,
  downloadPlanJson,
  downloadPlanMarkdown,
  downloadFile,
  resolveNodeDependencies,
  sanitizeFilename,
  getDefaultFilename,
} from "../src/lib/export.ts";

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

console.log("\n=== RUNNING TASK 05.8 EXPORT PLAN TEST SUITE ===\n");

// ---------------------------------------------------------------------------
// Part 1: Component File & Source Code Contracts
// ---------------------------------------------------------------------------
console.log("--- Part 1: Component File & Source Code Contracts ---");

const exportLibPath = path.resolve("src/lib/export.ts");
check("src/lib/export.ts exists on disk", fs.existsSync(exportLibPath));

const exportLibContent = fs.readFileSync(exportLibPath, "utf-8");
check(
  "export.ts exports generatePlanJson",
  exportLibContent.includes("export function generatePlanJson"),
);
check(
  "export.ts exports generatePlanMarkdown",
  exportLibContent.includes("export function generatePlanMarkdown"),
);
check(
  "export.ts exports downloadPlanJson",
  exportLibContent.includes("export function downloadPlanJson"),
);
check(
  "export.ts exports downloadPlanMarkdown",
  exportLibContent.includes("export function downloadPlanMarkdown"),
);
check(
  "export.ts exports downloadFile",
  exportLibContent.includes("export function downloadFile"),
);
check(
  "export.ts exports resolveNodeDependencies",
  exportLibContent.includes("export function resolveNodeDependencies"),
);
check(
  "export.ts exports sanitizeFilename",
  exportLibContent.includes("export function sanitizeFilename"),
);

const exportMenuPath = path.resolve("src/components/ExportMenu.tsx");
check("src/components/ExportMenu.tsx exists on disk", fs.existsSync(exportMenuPath));

const exportMenuContent = fs.readFileSync(exportMenuPath, "utf-8");
check("ExportMenu is a 'use client' component", exportMenuContent.includes('"use client"'));
check(
  "ExportMenu exports default function",
  exportMenuContent.includes("export default function ExportMenu"),
);
check(
  "ExportMenu defines trigger with test id 'export-menu-trigger'",
  exportMenuContent.includes('data-testid="export-menu-trigger"'),
);
check(
  "ExportMenu defines dropdown panel with test id 'export-dropdown'",
  exportMenuContent.includes('data-testid="export-dropdown"'),
);
check(
  "ExportMenu defines JSON download button with test id 'export-json-button'",
  exportMenuContent.includes('data-testid="export-json-button"'),
);
check(
  "ExportMenu defines Markdown download button with test id 'export-markdown-button'",
  exportMenuContent.includes('data-testid="export-markdown-button"'),
);
check(
  "ExportMenu defines copy checklist button with test id 'export-copy-button'",
  exportMenuContent.includes('data-testid="export-copy-button"'),
);

const pagePath = path.resolve("src/app/p/[id]/page.tsx");
const pageContent = fs.readFileSync(pagePath, "utf-8");
check(
  "Project page imports ExportMenu component",
  pageContent.includes('import ExportMenu from "@/components/ExportMenu"'),
);
check(
  "Project page mounts <ExportMenu /> in header action controls",
  pageContent.includes("<ExportMenu"),
);

const panelPath = path.resolve("src/components/NodePanel.tsx");
const panelContent = fs.readFileSync(panelPath, "utf-8");
check(
  "NodePanel imports ExportMenu component",
  panelContent.includes('import ExportMenu from "@/components/ExportMenu"'),
);
check(
  "NodePanel mounts <ExportMenu /> in node-panel-export section",
  panelContent.includes('data-testid="node-panel-export"') &&
    panelContent.includes("<ExportMenu"),
);

// ---------------------------------------------------------------------------
// Part 2: TEST CASE: 50-Node Plan & Acceptance Criteria
// ---------------------------------------------------------------------------
console.log("\n--- Part 2: TEST CASE: 50-Node Plan & Acceptance Criteria ---");

// Build a 50-node realistic build graph across 5 phases
const FIFTY_NODES = [];
const FIFTY_EDGES = [];

const PHASES = ["01", "02", "03", "04", "05"];
const PHASE_NAMES = {
  "01": "Setup & Scaffolding",
  "02": "Data Model & Storage",
  "03": "Core Engine & APIs",
  "04": "Frontend & Interactive UI",
  "05": "Integration & Production",
};

for (let i = 1; i <= 50; i++) {
  const phaseIndex = Math.floor((i - 1) / 10);
  const phase = PHASES[phaseIndex];
  const phaseSubIndex = ((i - 1) % 10) + 1;
  const nodeKey = `${phase}.${phaseSubIndex}`;
  const id = `node-uuid-${i.toString().padStart(3, "0")}`;

  // Establish dependency relationships:
  // - Node 1 is root
  // - Linear dependencies: i depends on i-1 within phase
  // - Cross-phase dependencies: phase start depends on last node of prior phase
  // - Diamond/fan-out patterns: node 25 depends on 20, 21; node 50 depends on 40, 45, 49
  const deps = [];
  if (i > 1 && phaseSubIndex > 1) {
    deps.push(`${phase}.${phaseSubIndex - 1}`);
  } else if (phaseIndex > 0 && phaseSubIndex === 1) {
    const priorPhase = PHASES[phaseIndex - 1];
    deps.push(`${priorPhase}.10`);
  }

  // Cross-cutting diamond dependencies
  if (i === 25) {
    deps.push("02.5", "02.8");
  }
  if (i === 50) {
    deps.push("04.10", "05.5");
  }

  const uniqueDeps = [...new Set(deps)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  const status =
    i <= 15 ? "completed" : i <= 20 ? "in_progress" : i <= 28 ? "ready" : "blocked";

  FIFTY_NODES.push({
    id,
    project_id: "project-uuid-50",
    node_key: nodeKey,
    phase,
    title: `Task ${nodeKey}: Implement ${PHASE_NAMES[phase]} Step ${phaseSubIndex}`,
    type: phaseSubIndex === 1 ? "setup" : phaseSubIndex % 2 === 0 ? "api" : "ui",
    status,
    dependencies: uniqueDeps,
    files: [`src/modules/${phase}/step-${phaseSubIndex}.ts`, `tests/${phase}/step-${phaseSubIndex}.test.ts`],
    explanation: `Detailed implementation specification for build graph task ${nodeKey}.`,
    acceptance: [
      `Unit tests pass for ${nodeKey}`,
      `Module compiles cleanly without TypeScript errors`,
    ],
    tests: [`npm run test:${phase}-${phaseSubIndex}`, "npm run typecheck"],
    requirement_key: `REQ-${phaseIndex + 1}`,
  });

  for (const d of uniqueDeps) {
    FIFTY_EDGES.push({
      from_node_key: d,
      to_node_key: nodeKey,
      type: "dependency",
    });
  }
}

const FIFTY_PLAN_INPUT = {
  project: {
    id: "project-uuid-50",
    name: "Enterprise Dependency Orchestrator",
    idea: "A 50-node automated pipeline system for multi-stage microservices.",
    status: "ready",
    repo_url: "https://github.com/kalp-io/orchestrator",
  },
  nodes: FIFTY_NODES,
  edges: FIFTY_EDGES,
  requirements: [
    { key: "REQ-1", title: "Setup Infrastructure" },
    { key: "REQ-2", title: "Storage Layer" },
    { key: "REQ-3", title: "Core Execution Engine" },
    { key: "REQ-4", title: "User Interfaces" },
    { key: "REQ-5", title: "CI/CD & Monitoring" },
  ],
  exportedAt: "2026-10-06T12:00:00.000Z",
};

// 1. JSON Export Verification for 50-Node Plan
const json50Str = generatePlanJson(FIFTY_PLAN_INPUT);
let parsed50 = null;
try {
  parsed50 = JSON.parse(json50Str);
} catch (e) {
  console.error("JSON parse failed:", e);
}

check("50-node plan exports valid parseable JSON", parsed50 !== null);
check("JSON export version is '1.0'", parsed50?.version === "1.0");
check("JSON export format is 'kalp-plan-v1'", parsed50?.format === "kalp-plan-v1");
check("JSON export project name matches", parsed50?.project?.name === "Enterprise Dependency Orchestrator");
check("JSON export summary reports 50 total nodes", parsed50?.summary?.total_nodes === 50);
check("ACCEPTANCE CRITERIA: JSON contains all 50 nodes", parsed50?.nodes?.length === 50);

// Check that EVERY node is present with its exact node_key and title
let all50NodesPresentInJson = true;
let all50DepsAccurateInJson = true;

for (const expectedNode of FIFTY_NODES) {
  const found = parsed50?.nodes?.find((n) => n.node_key === expectedNode.node_key);
  if (!found || found.title !== expectedNode.title) {
    all50NodesPresentInJson = false;
  }
  // Check dependencies
  const sortedExpectedDeps = [...expectedNode.dependencies].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const sortedActualDeps = [...(found?.dependencies || [])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  if (JSON.stringify(sortedExpectedDeps) !== JSON.stringify(sortedActualDeps)) {
    all50DepsAccurateInJson = false;
  }
}

check(
  "ACCEPTANCE CRITERIA: JSON contains every node without omission",
  all50NodesPresentInJson,
);
check(
  "ACCEPTANCE CRITERIA: JSON contains accurate dependencies for every node",
  all50DepsAccurateInJson,
);

// Verify edge list in JSON
check(
  "JSON export edges array has all dependencies mapped",
  parsed50?.edges?.length === FIFTY_EDGES.length,
);

// Verify diamond node 50 dependencies in JSON
const node50Json = parsed50?.nodes?.find((n) => n.node_key === "05.10");
check(
  "Complex fan-in node 05.10 has all 3 upstream dependencies in JSON",
  node50Json?.dependencies?.includes("04.10") &&
    node50Json?.dependencies?.includes("05.5") &&
    node50Json?.dependencies?.includes("05.9"),
);

// 2. Markdown Checklist Verification for 50-Node Plan
const md50Str = generatePlanMarkdown(FIFTY_PLAN_INPUT);

check(
  "Markdown export contains project title header",
  md50Str.includes("# Enterprise Dependency Orchestrator - Build Plan Checklist"),
);
check(
  "Markdown export contains project idea quote",
  md50Str.includes("> A 50-node automated pipeline system for multi-stage microservices."),
);
check(
  "Markdown export contains summary stats with 50 nodes",
  md50Str.includes("Total Nodes**: 50"),
);

// Verify all 5 phase headings exist
let allPhasesPresentInMd = true;
for (const p of PHASES) {
  if (!md50Str.includes(`## Phase ${p}`)) {
    allPhasesPresentInMd = false;
  }
}
check("Markdown export groups nodes into all 5 phases", allPhasesPresentInMd);

// Verify that EVERY one of the 50 nodes has a checklist item and dependencies line in Markdown
let all50NodesInMarkdown = true;
let all50DepsInMarkdown = true;

for (const expectedNode of FIFTY_NODES) {
  // Checkbox presence: e.g. - [x] **[01.1] ...** or - [ ] **[01.1] ...**
  const checkboxRegex = new RegExp(`- \\[([ x])\\] \\*\\*\\[${expectedNode.node_key}\\]`);
  if (!checkboxRegex.test(md50Str)) {
    all50NodesInMarkdown = false;
  }

  // Dependencies presence: - **Dependencies**: ...
  if (expectedNode.dependencies.length > 0) {
    const depsExpectedString = expectedNode.dependencies.join(", ");
    if (!md50Str.includes(depsExpectedString)) {
      all50DepsInMarkdown = false;
    }
  } else {
    // Root task should indicate None
    const rootSnippet = `**[${expectedNode.node_key}]`;
    const snippetIndex = md50Str.indexOf(rootSnippet);
    const sliceAfter = md50Str.slice(snippetIndex, snippetIndex + 250);
    if (!sliceAfter.includes("Dependencies**: None")) {
      all50DepsInMarkdown = false;
    }
  }
}

check(
  "ACCEPTANCE CRITERIA: Markdown checklist contains every single node (50/50)",
  all50NodesInMarkdown,
);
check(
  "ACCEPTANCE CRITERIA: Markdown checklist explicitly contains every node's dependencies",
  all50DepsInMarkdown,
);

// Completed vs Pending checkboxes in Markdown (top-level task items)
const completedCheckboxes = (md50Str.match(/^- \[x\] \*\*\[/gm) || []).length;
const pendingCheckboxes = (md50Str.match(/^- \[ \] \*\*\[/gm) || []).length;
check(
  "Markdown checklist marks completed nodes with [x] (15 completed)",
  completedCheckboxes === 15,
  { completedCheckboxes },
);
check(
  "Markdown checklist marks non-completed nodes with [ ] (35 pending)",
  pendingCheckboxes === 35,
  { pendingCheckboxes },
);

// ---------------------------------------------------------------------------
// Part 3: TEST CASE: Special Characters in Titles
// ---------------------------------------------------------------------------
console.log("\n--- Part 3: TEST CASE: Special Characters in Titles ---");

const SPECIAL_CHAR_NODES = [
  {
    id: "spec-1",
    node_key: "01.1",
    title: 'Setup "Double Quotes" & \'Single Quotes\' In Title',
    phase: "01",
    type: "setup",
    status: "completed",
    dependencies: [],
    files: ['src/"config".ts'],
    acceptance: ['Must handle "quotes" cleanly'],
  },
  {
    id: "spec-2",
    node_key: "01.2",
    title: "Render <HeaderComponent id={42} /> & <Navbar /> Tags",
    phase: "01",
    type: "ui",
    status: "ready",
    dependencies: ["01.1"],
    files: ["src/Header<Component>.tsx"],
    acceptance: ["Angle brackets < > do not break XML or HTML parser"],
  },
  {
    id: "spec-3",
    node_key: "02.1",
    title: "Support *Markdown* **Bold** `code` ~~strikethrough~~ #hashtag",
    phase: "02",
    type: "core",
    status: "in_progress",
    dependencies: ["01.2"],
    files: ["src/markdown-parser.ts"],
    acceptance: ["Markdown asterisks * and backticks ` do not corrupt checklist"],
  },
  {
    id: "spec-4",
    node_key: "02.2",
    title: "File Paths: C:\\Users\\kalp\\repo & /api/v1/projects/:id",
    phase: "02",
    type: "api",
    status: "not_started",
    dependencies: ["02.1"],
    files: ["src/routes/projects/[id]/route.ts"],
    acceptance: ["Backslashes \\ and slashes / preserved cleanly"],
  },
  {
    id: "spec-5",
    node_key: "03.1",
    title: "Performance: score >= 95% && latency < 50ms (O(N*log(N)))",
    phase: "03",
    type: "eval",
    status: "blocked",
    dependencies: ["02.2"],
    files: ["src/benchmarks.ts"],
    acceptance: ["Ampersands && and inequalities < > preserved"],
  },
  {
    id: "spec-6",
    node_key: "03.2",
    title: "Unicode & Internationalization: Café résumé Über-API 日本語 🚀 ⚡ 🎯",
    phase: "03",
    type: "i18n",
    status: "not_started",
    dependencies: ["03.1"],
    files: ["src/i18n.ts"],
    acceptance: ["Non-ASCII unicode, accents, and emojis preserved lossless"],
  },
  {
    id: "spec-7",
    node_key: "04.1",
    title: "Multiline Title\r\nWith Carriage Return\nAnd Newline Characters",
    phase: "04",
    type: "edge",
    status: "not_started",
    dependencies: ["03.2"],
    files: ["src/multiline.ts"],
    acceptance: ["Multiline titles sanitized into single-line checklist headers"],
  },
];

const SPECIAL_EDGES = [
  { from_node_key: "01.1", to_node_key: "01.2", type: "dependency" },
  { from_node_key: "01.2", to_node_key: "02.1", type: "dependency" },
  { from_node_key: "02.1", to_node_key: "02.2", type: "dependency" },
  { from_node_key: "02.2", to_node_key: "03.1", type: "dependency" },
  { from_node_key: "03.1", to_node_key: "03.2", type: "dependency" },
  { from_node_key: "03.2", to_node_key: "04.1", type: "dependency" },
];

const SPECIAL_PLAN_INPUT = {
  project: {
    id: "spec-proj-1",
    name: 'Special: Characters / "Project" <v1.0> *MVP*',
    idea: 'Project with "quotes", <tags>, & ampersands.',
    status: "ready",
  },
  nodes: SPECIAL_CHAR_NODES,
  edges: SPECIAL_EDGES,
};

// 1. JSON Export with Special Characters
const specialJsonStr = generatePlanJson(SPECIAL_PLAN_INPUT);
let parsedSpecial = null;
try {
  parsedSpecial = JSON.parse(specialJsonStr);
} catch (err) {
  console.error("Special characters JSON parse failed:", err);
}

check("Special characters plan produces valid parseable JSON", parsedSpecial !== null);
check(
  "JSON preserves project name with quotes and symbols",
  parsedSpecial?.project?.name === 'Special: Characters / "Project" <v1.0> *MVP*',
);

// Verify exact title equality in JSON for every special node
let allSpecialTitlesLosslessInJson = true;
for (const node of SPECIAL_CHAR_NODES) {
  const found = parsedSpecial?.nodes?.find((n) => n.node_key === node.node_key);
  if (!found || found.title !== node.title) {
    allSpecialTitlesLosslessInJson = false;
  }
}
check(
  "TEST CASE: JSON preserves exact title bytes for quotes, HTML tags, backslashes, emojis, unicode",
  allSpecialTitlesLosslessInJson,
);

// 2. Markdown Checklist with Special Characters
const specialMdStr = generatePlanMarkdown(SPECIAL_PLAN_INPUT);

check(
  "Markdown includes quotes title without syntax breakdown",
  specialMdStr.includes('Setup "Double Quotes" & \'Single Quotes\' In Title'),
);
check(
  "Markdown includes angle bracket component tags",
  specialMdStr.includes("Render <HeaderComponent id={42} /> & <Navbar /> Tags"),
);
check(
  "Markdown includes markdown symbols asterisks and backticks",
  specialMdStr.includes("Support *Markdown* **Bold** `code` ~~strikethrough~~ #hashtag"),
);
check(
  "Markdown includes backslashes and forward slashes",
  specialMdStr.includes("File Paths: C:\\Users\\kalp\\repo & /api/v1/projects/:id"),
);
check(
  "Markdown includes ampersands and inequalities",
  specialMdStr.includes("score >= 95% && latency < 50ms (O(N*log(N)))"),
);
check(
  "Markdown includes unicode accents and emojis",
  specialMdStr.includes("Café résumé Über-API 日本語 🚀 ⚡ 🎯"),
);

// Check that multiline title was collapsed onto single line in markdown checklist
const multilineNodeLine = specialMdStr
  .split("\n")
  .find((line) => line.includes("[04.1]"));
check(
  "TEST CASE: Multiline title sanitized into single checklist line without orphaned lines",
  multilineNodeLine !== undefined &&
    multilineNodeLine.includes("Multiline Title With Carriage Return And Newline Characters"),
);

// ---------------------------------------------------------------------------
// Part 4: Filename Sanitization & Cross-Platform Naming
// ---------------------------------------------------------------------------
console.log("\n--- Part 4: Filename Sanitization & Cross-Platform Naming ---");

check(
  "sanitizeFilename strips illegal Windows / UNIX characters (: * ? \" < > | / \\)",
  sanitizeFilename('My: Cool * "Project" <v2.0> / Test \\ Plan ?') ===
    "My-Cool-Project-v2.0-Test-Plan",
);
check(
  "sanitizeFilename collapses multiple spaces and dashes",
  sanitizeFilename("   Project    ---   Awesome   ") === "Project-Awesome",
);
check(
  "sanitizeFilename provides fallback for empty or whitespace-only names",
  sanitizeFilename("   \t\n   ") === "kalp-project-plan",
);
check(
  "sanitizeFilename provides fallback for null/undefined",
  sanitizeFilename(null) === "kalp-project-plan",
);

const defaultJsonFilename = getDefaultFilename(SPECIAL_PLAN_INPUT, "json");
check(
  "getDefaultFilename generates sanitized .json filename with date stamp",
  defaultJsonFilename.startsWith("Special-Characters-Project-v1.0-MVP-") &&
    defaultJsonFilename.endsWith(".json"),
);

const defaultMdFilename = getDefaultFilename(SPECIAL_PLAN_INPUT, "md");
check(
  "getDefaultFilename generates sanitized .md filename with date stamp",
  defaultMdFilename.startsWith("Special-Characters-Project-v1.0-MVP-") &&
    defaultMdFilename.endsWith(".md"),
);

// ---------------------------------------------------------------------------
// Part 5: Dependency Resolution & Edge Merging
// ---------------------------------------------------------------------------
console.log("\n--- Part 5: Dependency Resolution & Edge Merging ---");

// Node with dependencies in edge array only (not declared on node itself)
const nodeWithEdgeOnly = {
  id: "node-b-id",
  node_key: "02.2",
  title: "Derived Node B",
};
const allNodesFixture = [
  { id: "node-a-id", node_key: "02.1", title: "Source Node A" },
  nodeWithEdgeOnly,
];
const edgesFixture = [
  { from_node: "node-a-id", to_node: "node-b-id", type: "dependency" },
];

const resolved = resolveNodeDependencies(nodeWithEdgeOnly, edgesFixture, allNodesFixture);
check(
  "resolveNodeDependencies maps incoming edges from node UUID to source node_key",
  resolved.length === 1 && resolved[0] === "02.1",
);

// Node with both direct dependencies and incoming edges (deduplication)
const nodeWithBoth = {
  id: "node-c-id",
  node_key: "03.1",
  title: "Node C",
  dependencies: ["02.1", "02.2"],
};
const edgesDuplicate = [
  { from_node_key: "02.1", to_node_key: "03.1", type: "dependency" },
  { from_node_key: "02.3", to_node_key: "03.1", type: "dependency" },
];

const resolvedMerged = resolveNodeDependencies(nodeWithBoth, edgesDuplicate, []);
check(
  "resolveNodeDependencies merges and deduplicates dependencies from both sources",
  resolvedMerged.length === 3 &&
    resolvedMerged.includes("02.1") &&
    resolvedMerged.includes("02.2") &&
    resolvedMerged.includes("02.3"),
);

// ---------------------------------------------------------------------------
// Part 6: Browser Download Dispatch (Mock DOM)
// ---------------------------------------------------------------------------
console.log("\n--- Part 6: Browser Download Dispatch (Mock DOM) ---");

// Test downloadFile in SSR environment (no document) -> returns false gracefully
const ssrDownloadResult = downloadFile("content", "file.json", "application/json", {
  documentObj: null,
});
check("downloadFile gracefully returns false in SSR / non-browser context", ssrDownloadResult === false);

// Mock DOM elements to test browser download simulation
let createdElement = null;
let clicked = false;
let appendedChild = null;
let removedChild = null;
let createdBlobParts = null;
let createdUrl = null;
let revokedUrl = null;

const mockLink = {
  href: "",
  download: "",
  style: {},
  click() {
    clicked = true;
  },
  parentNode: {
    removeChild(child) {
      removedChild = child;
    },
  },
};

const mockDoc = {
  createElement(tag) {
    if (tag === "a") {
      createdElement = mockLink;
      return mockLink;
    }
    return {};
  },
  body: {
    appendChild(child) {
      appendedChild = child;
    },
    removeChild(child) {
      removedChild = child;
    },
  },
};

const mockBlob = (parts, opts) => {
  createdBlobParts = parts;
  return { parts, type: opts?.type };
};

const downloadSuccess = downloadFile("export test content", "plan.json", "application/json", {
  documentObj: mockDoc,
  createBlobFn: mockBlob,
  createObjectURLFn: (b) => {
    createdUrl = "blob:http://localhost/test-uuid";
    return createdUrl;
  },
  revokeObjectURLFn: (u) => {
    revokedUrl = u;
  },
  revokeTimeoutMs: 10,
});

check("downloadFile returns true when mock DOM is available", downloadSuccess === true);
check("downloadFile creates an <a> anchor tag", createdElement !== null);
check("downloadFile sets anchor download attribute to 'plan.json'", mockLink.download === "plan.json");
check("downloadFile sets anchor href to blob URL", mockLink.href === "blob:http://localhost/test-uuid");
check("downloadFile triggers synthetic click on link", clicked === true);

// Test downloadPlanJson and downloadPlanMarkdown wrapper functions
const dlJsonResult = downloadPlanJson(SPECIAL_PLAN_INPUT, "custom-plan.json", {
  documentObj: mockDoc,
  createBlobFn: mockBlob,
  createObjectURLFn: () => "blob:custom",
  revokeObjectURLFn: () => {},
});
check(
  "downloadPlanJson returns generated JSON string and initiates download",
  typeof dlJsonResult === "string" && dlJsonResult.includes("kalp-plan-v1"),
);

const dlMdResult = downloadPlanMarkdown(SPECIAL_PLAN_INPUT, "custom-plan.md", {
  documentObj: mockDoc,
  createBlobFn: mockBlob,
  createObjectURLFn: () => "blob:custom",
  revokeObjectURLFn: () => {},
});
check(
  "downloadPlanMarkdown returns generated Markdown checklist string and initiates download",
  typeof dlMdResult === "string" && dlMdResult.includes("Build Plan Checklist"),
);

// ---------------------------------------------------------------------------
// Part 7: Edge Cases
// ---------------------------------------------------------------------------
console.log("\n--- Part 7: Edge Cases ---");

// Empty nodes plan
const emptyPlan = { project: { name: "Empty Project" }, nodes: [] };
const emptyJson = generatePlanJson(emptyPlan);
const parsedEmpty = JSON.parse(emptyJson);
check("Empty plan generates valid JSON with total_nodes = 0", parsedEmpty.summary.total_nodes === 0);

const emptyMd = generatePlanMarkdown(emptyPlan);
check("Empty plan generates Markdown noting no nodes present", emptyMd.includes("_No nodes present in this plan._"));

// Plan with null/undefined project
const nullProjPlan = { nodes: [{ node_key: "01.1", title: "Solitary Task", phase: "01" }] };
const nullProjJson = generatePlanJson(nullProjPlan);
const parsedNullProj = JSON.parse(nullProjJson);
check(
  "Plan with null project defaults to 'Untitled Project'",
  parsedNullProj.project.name === "Untitled Project",
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
  console.error("SOME EXPORT PLAN CHECKS FAILED!");
  process.exit(1);
} else {
  console.log("ALL EXPORT PLAN CHECKS PASSED!");
  process.exit(0);
}
