/**
 * Test Suite for Task 05.4: Copy prompt
 *
 * Verifies:
 * 1. Component contracts and file integrity for:
 *    - frontend/src/components/CopyPrompt.tsx
 *    - frontend/src/lib/clipboard.ts
 *    - Integration inside frontend/src/components/NodePanel.tsx
 * 2. ACCEPTANCE CRITERIA: "Clipboard holds the full prompt"
 *    - Modern clipboard writeText receives complete, un-truncated prompt
 *    - Golden prompt snapshot with all markdown sections preserved character-by-character
 * 3. TEST CASES: "clipboard denied fallback"
 *    - Permission denied on navigator.clipboard falls back to document.execCommand('copy')
 *    - Permission denied on both clipboard APIs triggers manual fallback UI
 *    - Fallback textarea holds the FULL prompt for manual selection
 * 4. Node fallback prompt generator (formatNodePromptFallback)
 * 5. Edge cases: empty text, large prompt preservation, status confirmation timing
 */

import fs from "node:fs";
import path from "node:path";
import {
  copyToClipboard,
  formatNodePromptFallback,
} from "../src/lib/clipboard.ts";

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

// ---------------------------------------------------------------------------
// Realistic Full Prompt Fixture (from Task 03.8 Prompt Generator)
// ---------------------------------------------------------------------------
const FULL_PROMPT_FIXTURE = `# TASK: [01.1] Scaffolding & Next.js Setup
**Phase**: 01 | **Type**: setup | **Status**: not_started
Initial workspace scaffolding and configuration.

## Project Context
- **Project**: Kalp Habit Tracker
- **Overview**: A dependency-aware habit tracking platform.
- **Stack**: Next.js (App Router), TypeScript, Tailwind CSS, Supabase Postgres, zod
- **Repo Layout**: kalp-io/frontend and kalp-io/backend

## Requirement
- **Key**: REQ-1
- **Title**: User Authentication & Scaffolding
- **Description**: Core setup and user authentication infrastructure.

## Dependencies
- None (this is an initial setup / root node with no prerequisites).

## Files
Target files to create, modify, or test:
- \`package.json\`
- \`tsconfig.json\`
- \`src/app/layout.tsx\`

## Acceptance Criteria
The implementation must satisfy the following criteria:
- [ ] Repository initializes cleanly with package.json and tsconfig.json.
- [ ] TypeScript compiler runs without errors on clean repository.

## Tests
Verify the implementation with the following test cases:
- [ ] Verify \`npm run build\` succeeds.
- [ ] Verify \`npm run typecheck\` produces zero warnings or errors.
- [ ] Assert workspace dependencies match specification.

## Commit Rule
Rule: Commit as '[node-ID] message'.
All commits for this task must follow the format:
\`[01.1] <message>\`

Example:
\`git commit -m "[01.1] Scaffolding & Next.js Setup"\`
`;

async function run() {
  console.log("=== RUNNING TASK 05.4 COPY PROMPT TEST SUITE ===\n");

  // =========================================================================
  // Part 1: Component File & Source Code Contracts
  // =========================================================================
  console.log("--- Part 1: Component File & Source Code Contracts ---");

  const copyPromptPath = path.resolve("src/components/CopyPrompt.tsx");
  check(
    "frontend/src/components/CopyPrompt.tsx exists on disk",
    fs.existsSync(copyPromptPath),
  );

  const copyPromptCode = fs.readFileSync(copyPromptPath, "utf-8");

  // Verify client component directive
  check(
    "CopyPrompt is a 'use client' component",
    copyPromptCode.startsWith('"use client";'),
  );

  // Verify exported default component
  check(
    "CopyPrompt.tsx exports default function CopyPrompt",
    copyPromptCode.includes("export default function CopyPrompt"),
  );

  // Verify copy button and confirmation states
  check(
    "CopyPrompt defines copy button with test id 'copy-prompt-btn'",
    copyPromptCode.includes('data-testid="copy-prompt-btn"'),
  );

  check(
    "CopyPrompt displays 'Copied!' confirmation state",
    copyPromptCode.includes("Copied!") &&
      copyPromptCode.includes("copied-icon"),
  );

  check(
    "CopyPrompt defines accessible live status region with role='status' and aria-live='polite'",
    copyPromptCode.includes('role="status"') &&
      copyPromptCode.includes('aria-live="polite"'),
  );

  // Verify fallback UI elements
  check(
    "CopyPrompt defines fallback container with test id 'copy-prompt-fallback'",
    copyPromptCode.includes('data-testid="copy-prompt-fallback"'),
  );

  check(
    "CopyPrompt renders fallback readonly textarea with test id 'copy-prompt-textarea'",
    copyPromptCode.includes('data-testid="copy-prompt-textarea"') &&
      copyPromptCode.includes("readOnly") &&
      copyPromptCode.includes("value={prompt}"),
  );

  check(
    "CopyPrompt provides Select All button for manual copy fallback",
    copyPromptCode.includes('data-testid="copy-prompt-select-btn"'),
  );

  // Verify integration in NodePanel.tsx
  const panelPath = path.resolve("src/components/NodePanel.tsx");
  const panelCode = fs.readFileSync(panelPath, "utf-8");
  check(
    "NodePanel.tsx imports CopyPrompt component",
    panelCode.includes('import CopyPrompt from "@/components/CopyPrompt"'),
  );

  check(
    "NodePanel.tsx mounts <CopyPrompt /> in node-panel-prompt section",
    panelCode.includes("<CopyPrompt") &&
      panelCode.includes('data-testid="node-panel-prompt"'),
  );

  // =========================================================================
  // Part 2: ACCEPTANCE CRITERIA - "Clipboard holds the full prompt"
  // =========================================================================
  console.log(
    "\n--- Part 2: Acceptance Criteria - Clipboard Holds Full Prompt ---",
  );

  let clipboardStorage = "";
  const mockClipboardApi = {
    writeText: async (text) => {
      clipboardStorage = text;
    },
  };

  // Test 2.1: Basic copy operation
  const result1 = await copyToClipboard(FULL_PROMPT_FIXTURE, {
    clipboardApi: mockClipboardApi,
  });

  check(
    "copyToClipboard reports success: true via 'clipboard' method",
    result1.success === true && result1.method === "clipboard",
  );

  check(
    "ACCEPTANCE CRITERIA: Clipboard holds the full prompt without truncation",
    clipboardStorage === FULL_PROMPT_FIXTURE,
    {
      expectedLength: FULL_PROMPT_FIXTURE.length,
      actualLength: clipboardStorage.length,
    },
  );

  // Verify prompt structure fidelity inside clipboardStorage
  check(
    "Clipboard prompt contains '# TASK: [01.1]' header",
    clipboardStorage.includes("# TASK: [01.1] Scaffolding & Next.js Setup"),
  );
  check(
    "Clipboard prompt contains '## Project Context' section",
    clipboardStorage.includes("## Project Context"),
  );
  check(
    "Clipboard prompt contains '## Requirement' section",
    clipboardStorage.includes("## Requirement"),
  );
  check(
    "Clipboard prompt contains '## Dependencies' section",
    clipboardStorage.includes("## Dependencies"),
  );
  check(
    "Clipboard prompt contains '## Files' section",
    clipboardStorage.includes("## Files"),
  );
  check(
    "Clipboard prompt contains '## Acceptance Criteria' checkboxes",
    clipboardStorage.includes(
      "- [ ] Repository initializes cleanly with package.json",
    ),
  );
  check(
    "Clipboard prompt contains '## Tests' section",
    clipboardStorage.includes("- [ ] Verify `npm run build` succeeds."),
  );
  check(
    "Clipboard prompt contains '## Commit Rule' with format and example",
    clipboardStorage.includes("`[01.1] <message>`") &&
      clipboardStorage.includes(
        'git commit -m "[01.1] Scaffolding & Next.js Setup"',
      ),
  );

  // Test 2.2: Large multi-thousand character prompt preservation
  const largePrompt =
    FULL_PROMPT_FIXTURE + "\n" + "EXTRA_CONTEXT_LINE\n".repeat(500);
  clipboardStorage = "";
  const largeResult = await copyToClipboard(largePrompt, {
    clipboardApi: mockClipboardApi,
  });
  check(
    "Clipboard preserves large prompt (> 10KB) without truncation",
    largeResult.success &&
      clipboardStorage.length === largePrompt.length &&
      clipboardStorage === largePrompt,
    { length: clipboardStorage.length },
  );

  // =========================================================================
  // Part 3: TEST CASES - "clipboard denied fallback"
  // =========================================================================
  console.log("\n--- Part 3: Test Cases - Clipboard Denied Fallback ---");

  // Scenario 3.1: navigator.clipboard.writeText is denied (throws NotAllowedError)
  // Should fall back to document.execCommand('copy') via offscreen textarea
  let execCommandCalled = false;
  let execCommandTargetValue = "";
  const createdElements = [];

  const mockDomDocument = {
    body: {
      appendChild: (el) => {
        createdElements.push(el);
      },
      removeChild: (el) => {
        const idx = createdElements.indexOf(el);
        if (idx !== -1) createdElements.splice(idx, 1);
      },
    },
    createElement: (tag) => {
      const el = {
        tagName: tag,
        value: "",
        style: {},
        setAttribute: (k, v) => {
          el[k] = v;
        },
        select: () => {
          execCommandTargetValue = el.value;
        },
        setSelectionRange: (start, end) => {
          el.selectionStart = start;
          el.selectionEnd = end;
        },
      };
      return el;
    },
    execCommand: (cmd) => {
      if (cmd === "copy") {
        execCommandCalled = true;
        return true;
      }
      return false;
    },
  };

  const deniedClipboardApi = {
    writeText: async () => {
      const err = new Error(
        "NotAllowedError: Clipboard permission denied by user or iframe policy",
      );
      err.name = "NotAllowedError";
      throw err;
    },
  };

  const fallbackResult1 = await copyToClipboard(FULL_PROMPT_FIXTURE, {
    clipboardApi: deniedClipboardApi,
    targetDocument: mockDomDocument,
  });

  check(
    "TEST CASE: When clipboard API is denied, falls back to execCommand",
    fallbackResult1.success === true &&
      fallbackResult1.method === "execCommand",
    fallbackResult1,
  );

  check(
    "TEST CASE: execCommand copy fallback holds the full prompt in textarea selection",
    execCommandCalled && execCommandTargetValue === FULL_PROMPT_FIXTURE,
    { length: execCommandTargetValue.length },
  );

  check(
    "Temporary textarea element is cleaned up from document body after execCommand",
    createdElements.length === 0,
  );

  // Scenario 3.2: BOTH navigator.clipboard and execCommand are denied/blocked
  // Should return manual fallback with error message and full text ready for user selection
  const strictlyDeniedDocument = {
    body: mockDomDocument.body,
    createElement: mockDomDocument.createElement,
    execCommand: () => {
      // execCommand fails or is disallowed by feature policy
      return false;
    },
  };

  const fallbackResult2 = await copyToClipboard(FULL_PROMPT_FIXTURE, {
    clipboardApi: deniedClipboardApi,
    targetDocument: strictlyDeniedDocument,
  });

  check(
    "TEST CASE: When both APIs denied, returns method 'manual' with success: false",
    fallbackResult2.success === false && fallbackResult2.method === "manual",
    fallbackResult2,
  );

  check(
    "TEST CASE: Returns clear user guidance when clipboard access denied",
    fallbackResult2.error?.includes("Clipboard access was denied") ||
      fallbackResult2.error?.includes("manually"),
    fallbackResult2.error,
  );

  // Scenario 3.3: In manual fallback mode, the full prompt is preserved in UI
  // Component textarea value is bound directly to prompt prop, so it holds the exact text
  const textareaMatchesPrompt = copyPromptCode.includes("value={prompt}");
  check(
    "TEST CASE: Fallback UI textarea renders the complete prompt for manual Ctrl+C",
    textareaMatchesPrompt,
  );

  // =========================================================================
  // Part 4: Fallback Prompt Formatter (formatNodePromptFallback)
  // =========================================================================
  console.log("\n--- Part 4: Fallback Prompt Formatter ---");

  const sampleNode = {
    node_key: "02.1",
    title: "Database Migrations & Schemas",
    phase: "Phase 2: Database",
    requirement_key: "REQ-02",
    explanation: "Migrate Postgres tables with row-level security.",
    dependencies: ["01.1"],
    files: ["supabase/migrations/001_init.sql"],
    acceptance: ["Tables created cleanly", "Foreign keys validated"],
    tests: ["npm run test:db"],
  };

  const formattedPrompt = formatNodePromptFallback(sampleNode);

  check(
    "formatNodePromptFallback produces task header with node key and title",
    formattedPrompt.includes("# TASK: [02.1] Database Migrations & Schemas"),
  );

  check(
    "formatNodePromptFallback includes phase and requirement",
    formattedPrompt.includes("PHASE: Phase 2: Database") &&
      formattedPrompt.includes("REQUIREMENT: REQ-02"),
  );

  check(
    "formatNodePromptFallback includes dependencies",
    formattedPrompt.includes("## PREREQUISITES & DEPENDENCIES") &&
      formattedPrompt.includes("- 01.1"),
  );

  check(
    "formatNodePromptFallback includes target files",
    formattedPrompt.includes("## TARGET FILES") &&
      formattedPrompt.includes("- supabase/migrations/001_init.sql"),
  );

  check(
    "formatNodePromptFallback includes acceptance criteria",
    formattedPrompt.includes("## ACCEPTANCE CRITERIA") &&
      formattedPrompt.includes("- [ ] Tables created cleanly"),
  );

  check(
    "formatNodePromptFallback includes verification tests",
    formattedPrompt.includes("## VERIFICATION & TESTS") &&
      formattedPrompt.includes("$ npm run test:db"),
  );

  check(
    "formatNodePromptFallback includes commit rule with [node_key]",
    formattedPrompt.includes("[02.1] Database Migrations & Schemas"),
  );

  // Root node without dependencies
  const rootNode = {
    node_key: "01.1",
    title: "Project Root Scaffolding",
    dependencies: [],
  };
  const rootPrompt = formatNodePromptFallback(rootNode);
  check(
    "Root node with no dependencies is described as 'None (Root Foundation)'",
    rootPrompt.includes("None (Root Foundation)"),
  );

  // =========================================================================
  // Part 5: Edge Cases & Robustness
  // =========================================================================
  console.log("\n--- Part 5: Edge Cases & Robustness ---");

  // Empty string handling
  const emptyResult = await copyToClipboard("");
  check(
    "Empty string input returns success: false with informative message",
    emptyResult.success === false &&
      emptyResult.error?.includes("No text provided"),
  );

  // Non-string input handling
  const nullResult = await copyToClipboard(null);
  check(
    "Null text input safely returns success: false without throwing",
    nullResult.success === false,
  );

  // Node with empty fields in formatNodePromptFallback
  const sparseNodePrompt = formatNodePromptFallback({});
  check(
    "formatNodePromptFallback with empty object produces valid string without throwing",
    typeof sparseNodePrompt === "string" &&
      sparseNodePrompt.includes("# TASK: [TASK]"),
  );

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n==========================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${totalChecks - passedChecks}`);
  console.log("==========================================");

  if (failed) {
    console.error("\nTEST SUITE FAILED!");
    process.exit(1);
  } else {
    console.log("\nALL COPY PROMPT CHECKS PASSED!");
  }
}

run().catch((err) => {
  console.error("Unhandled error in test-copy-prompt:", err);
  process.exit(1);
});
