/**
 * Test Suite for Task 03.3: Intake to requirements (backend/src/server/extract.ts)
 *
 * Verifies:
 * 1. Empty input errors (empty string, whitespace, empty object, null/undefined, too-short input)
 * 2. 3 sample ideas (offline mock generator testing full schema conformance & UUID IDs)
 * 3. Schema-valid requirements with IDs (UUID v4 validation & RequirementSchema validation)
 * 4. Input formats (string, { idea }, { prd }, { text })
 * 5. Project ID propagation
 * 6. Aliases (extract, intakeToRequirements)
 * 7. Optional live Gemini API execution when --live is passed
 */

import {
  extractRequirements,
  extract,
  intakeToRequirements,
  isValidUuid,
  type ExtractJsonGenerator,
  type ExtractedRequirements,
} from "../src/server/extract";
import { RequirementSchema, type Requirement } from "../src/lib/schema";
import { BadRequestError } from "../src/lib/errors";
import { PromptInputError } from "../src/server/prompts/shared";
import { type ExtractOutput } from "../src/server/prompts/extract";

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
// 3 Sample Ideas
// ---------------------------------------------------------------------------
const SAMPLE_IDEAS = [
  {
    name: "Habit Tracker for College Students",
    text: "A habit tracker for college students with streaks, reminders, and social accountability features to study together.",
    mockOutput: {
      project_name: "Campus Habit Tracker",
      assumptions: [
        "Assumes mobile-first responsive web or mobile client.",
        "Assumes users have email or student ID authentication.",
      ],
      requirements: [
        {
          key: "REQ-1",
          title: "User Registration and Profile",
          description:
            "College students can register using university email and create a profile.",
        },
        {
          key: "REQ-2",
          title: "Habit Definition and Scheduling",
          description:
            "Users can define habits with custom recurrence intervals, target goals, and reminders.",
        },
        {
          key: "REQ-3",
          title: "Streak Tracking and Progress Metrics",
          description:
            "Tracks completion streaks and computes daily completion percentages.",
        },
        {
          key: "REQ-4",
          title: "Study Group Social Accountability",
          description:
            "Allows students to join study circles and share habit streaks.",
        },
      ],
      users: ["College students", "Study group leaders", "Campus mentors"],
      constraints: [
        "Must be mobile-optimized.",
        "Push notifications must respect user timezone.",
      ],
      integrations: ["Firebase Cloud Messaging", "Supabase Auth"],
    },
  },
  {
    name: "AI Recipe Planner & Smart Pantry",
    text: "An AI-powered recipe planner and smart grocery list generator that reduces food waste by recommending meals based on available pantry items and dietary restrictions.",
    mockOutput: {
      project_name: "PantryChef AI",
      assumptions: [
        "Assumes users manually log or scan pantry items.",
        "Assumes standard measurement units (metric/imperial).",
      ],
      requirements: [
        {
          key: "REQ-1",
          title: "Pantry Inventory Management",
          description:
            "Users can track available food items, quantities, and expiration dates.",
        },
        {
          key: "REQ-2",
          title: "Dietary Preference Configuration",
          description:
            "Users can configure allergies, calorie targets, and dietary regimes (e.g. vegan, gluten-free).",
        },
        {
          key: "REQ-3",
          title: "AI Meal Recommendation",
          description:
            "Generates recipes utilizing expiring pantry ingredients with minimal missing items.",
        },
        {
          key: "REQ-4",
          title: "Smart Grocery Shopping List",
          description:
            "Automatically groups missing ingredients into a categorized shopping checklist.",
        },
      ],
      users: ["Home cooks", "Busy families", "Eco-conscious meal preppers"],
      constraints: [
        "Recipe generation must complete in under 5 seconds.",
        "Must handle offline pantry view.",
      ],
      integrations: ["USDA Food Data API", "Gemini 2.5 Flash LLM"],
    },
  },
  {
    name: "Developer Kubernetes CLI Dashboard",
    text: "A developer-focused lightweight terminal dashboard and CLI tool to monitor microservices health, container logs, and Kubernetes cluster resource metrics in real-time.",
    mockOutput: {
      project_name: "KubePulse CLI",
      assumptions: [
        "Assumes user has kubectl configured locally with valid cluster credentials.",
      ],
      requirements: [
        {
          key: "REQ-1",
          title: "Cluster Context Discovery",
          description:
            "Discovers current kubeconfig contexts, active namespaces, and node topology.",
        },
        {
          key: "REQ-2",
          title: "Pod Health and Status Monitor",
          description:
            "Displays live statuses, restart counts, and CPU/memory utilization across pods.",
        },
        {
          key: "REQ-3",
          title: "Multi-container Log Streaming",
          description:
            "Streams logs from multiple pod containers with fuzzy search and severity filters.",
        },
        {
          key: "REQ-4",
          title: "Interactive TUI Navigation",
          description:
            "Provides keyboard shortcuts for pod restart, exec shell, and port forwarding.",
        },
      ],
      users: ["Backend engineers", "DevOps engineers", "SREs"],
      constraints: [
        "Terminal binary size must be under 30MB.",
        "Read-only operations by default to prevent accidental cluster changes.",
      ],
      integrations: ["Kubernetes API", "Prometheus metrics server"],
    },
  },
];

async function runTests() {
  console.log("=== RUNNING TASK 03.3 INTAKE TO REQUIREMENTS TEST SUITE ===\n");

  // =========================================================================
  // Part 1: Empty Input Error Cases
  // =========================================================================
  console.log("--- Part 1: Empty & Invalid Input Error Cases ---");

  // 1.1 Empty string
  try {
    await extractRequirements("");
    check("Empty string throws error", false);
  } catch (err) {
    check(
      "Empty string throws BadRequestError",
      err instanceof BadRequestError &&
        err.message.includes("cannot be empty") &&
        err.statusCode === 400,
    );
  }

  // 1.2 Whitespace only string
  try {
    await extractRequirements("     \n\t   ");
    check("Whitespace-only string throws error", false);
  } catch (err) {
    check(
      "Whitespace-only string throws BadRequestError",
      err instanceof BadRequestError && err.message.includes("cannot be empty"),
    );
  }

  // 1.3 Null / Undefined
  try {
    await extractRequirements(null as unknown as string);
    check("Null throws error", false);
  } catch (err) {
    check(
      "Null throws BadRequestError",
      err instanceof BadRequestError && err.message.includes("cannot be empty"),
    );
  }

  try {
    await extractRequirements(undefined as unknown as string);
    check("Undefined throws error", false);
  } catch (err) {
    check(
      "Undefined throws BadRequestError",
      err instanceof BadRequestError && err.message.includes("cannot be empty"),
    );
  }

  // 1.4 Object with empty fields
  try {
    await extractRequirements({});
    check("Empty object {} throws error", false);
  } catch (err) {
    check(
      "Empty object {} throws BadRequestError",
      err instanceof BadRequestError && err.message.includes("cannot be empty"),
    );
  }

  try {
    await extractRequirements({ idea: "" });
    check("{ idea: '' } throws error", false);
  } catch (err) {
    check(
      "{ idea: '' } throws BadRequestError",
      err instanceof BadRequestError && err.message.includes("cannot be empty"),
    );
  }

  try {
    await extractRequirements({ idea: "   \t  " });
    check("{ idea: whitespace } throws error", false);
  } catch (err) {
    check(
      "{ idea: whitespace } throws BadRequestError",
      err instanceof BadRequestError && err.message.includes("cannot be empty"),
    );
  }

  // 1.5 Too-short idea (< 10 chars)
  try {
    await extractRequirements("short", {
      generator: async () => ({
        data: {} as ExtractOutput,
        model: "mock-model",
      }),
    });
    check("Idea shorter than 10 characters throws error", false);
  } catch (err) {
    check(
      "Idea shorter than 10 characters throws PromptInputError with INPUT_TOO_SHORT",
      err instanceof PromptInputError && err.code === "INPUT_TOO_SHORT",
    );
  }

  // 1.6 Invalid project_id format
  try {
    await extractRequirements("A valid project idea with enough length", {
      projectId: "not-a-valid-uuid",
      generator: async () => ({
        data: {} as ExtractOutput,
        model: "mock-model",
      }),
    });
    check("Invalid projectId throws error", false);
  } catch (err) {
    check(
      "Invalid projectId throws BadRequestError with INVALID_PROJECT_ID",
      err instanceof BadRequestError &&
        err.message.includes("must be a valid UUID"),
    );
  }

  // =========================================================================
  // Part 2: 3 Sample Ideas (Structured Requirements with UUID IDs)
  // =========================================================================
  console.log("\n--- Part 2: 3 Sample Ideas Structured Extraction ---");

  for (let idx = 0; idx < SAMPLE_IDEAS.length; idx++) {
    const sample = SAMPLE_IDEAS[idx];
    console.log(`\nTesting Sample Idea ${idx + 1}: ${sample.name}`);

    const mockGenerator: ExtractJsonGenerator = async (prompt, opts) => {
      // Verify prompt receives wrapped system guard and instructions
      check(
        `Sample ${idx + 1}: system instructions provided`,
        typeof opts?.system === "string" && opts.system.length > 50,
      );
      check(
        `Sample ${idx + 1}: prompt includes sanitized user input`,
        typeof prompt === "string" && prompt.includes("<user_input>"),
      );

      return {
        data: sample.mockOutput as ExtractOutput,
        model: "gemini-2.5-flash-mock",
      };
    };

    const result: ExtractedRequirements = await extractRequirements(
      sample.text,
      {
        generator: mockGenerator,
      },
    );

    // Verify project_name
    check(
      `Sample ${idx + 1}: project_name is "${sample.mockOutput.project_name}"`,
      result.project_name === sample.mockOutput.project_name,
    );
    check(
      `Sample ${idx + 1}: projectName alias matches project_name`,
      result.projectName === result.project_name,
    );

    // Verify assumptions
    check(
      `Sample ${idx + 1}: assumptions match count (${sample.mockOutput.assumptions.length})`,
      Array.isArray(result.assumptions) &&
        result.assumptions.length === sample.mockOutput.assumptions.length,
    );

    // Verify requirements & features arrays
    check(
      `Sample ${idx + 1}: requirements array has length ${sample.mockOutput.requirements.length}`,
      Array.isArray(result.requirements) &&
        result.requirements.length === sample.mockOutput.requirements.length,
    );
    check(
      `Sample ${idx + 1}: features property is identical to requirements`,
      result.features === result.requirements,
    );

    // Verify each requirement has a valid UUID ID and passes RequirementSchema
    const seenIds = new Set<string>();
    let allValid = true;
    for (let rIdx = 0; rIdx < result.requirements.length; rIdx++) {
      const req: Requirement = result.requirements[rIdx];

      // ID check: MUST have valid UUID id
      if (!req.id || !isValidUuid(req.id)) {
        allValid = false;
        console.error(`  Invalid UUID id on requirement ${req.key}: ${req.id}`);
      }
      if (seenIds.has(req.id!)) {
        allValid = false;
        console.error(`  Duplicate UUID id found: ${req.id}`);
      }
      seenIds.add(req.id!);

      // RequirementSchema conformance
      const parseResult = RequirementSchema.safeParse(req);
      if (!parseResult.success) {
        allValid = false;
        console.error(
          `  RequirementSchema validation failed for ${req.key}:`,
          parseResult.error,
        );
      }

      // Check key format
      if (!/^REQ-\d+$/.test(req.key)) {
        allValid = false;
        console.error(`  Invalid key format: ${req.key}`);
      }

      // Check title and description
      if (!req.title || req.title.trim().length === 0) {
        allValid = false;
        console.error(`  Missing title on requirement ${req.key}`);
      }
    }

    check(
      `Sample ${idx + 1}: all ${result.requirements.length} requirements have valid UUID IDs and conform to RequirementSchema`,
      allValid && seenIds.size === result.requirements.length,
    );

    // Verify users, constraints, integrations
    check(
      `Sample ${idx + 1}: users is non-empty array of strings`,
      Array.isArray(result.users) &&
        result.users.length === sample.mockOutput.users.length &&
        result.users.every((u) => typeof u === "string"),
    );
    check(
      `Sample ${idx + 1}: constraints is non-empty array of strings`,
      Array.isArray(result.constraints) &&
        result.constraints.length === sample.mockOutput.constraints.length &&
        result.constraints.every((c) => typeof c === "string"),
    );
    check(
      `Sample ${idx + 1}: integrations is non-empty array of strings`,
      Array.isArray(result.integrations) &&
        result.integrations.length === sample.mockOutput.integrations.length &&
        result.integrations.every((i) => typeof i === "string"),
    );

    // Verify model and version metadata
    check(
      `Sample ${idx + 1}: model is populated`,
      result.model === "gemini-2.5-flash-mock",
    );
    check(
      `Sample ${idx + 1}: version is non-empty string`,
      typeof result.version === "string" && result.version.length > 0,
    );
  }

  // =========================================================================
  // Part 3: Project ID Propagation & Input Variants
  // =========================================================================
  console.log("\n--- Part 3: Project ID & Input Format Variants ---");

  const sampleIdea = SAMPLE_IDEAS[0];
  const testProjectId = "a0000000-0000-4000-8000-000000000001";

  // 3.1 Via options.projectId
  const resWithOptionProj = await extractRequirements(sampleIdea.text, {
    projectId: testProjectId,
    generator: async () => ({
      data: sampleIdea.mockOutput as ExtractOutput,
      model: "mock-model",
    }),
  });
  check(
    "options.projectId attaches project_id to every requirement",
    resWithOptionProj.requirements.every((r) => r.project_id === testProjectId),
  );

  // 3.2 Via input object { idea, projectId }
  const resWithInputProj = await extractRequirements(
    { idea: sampleIdea.text, projectId: testProjectId },
    {
      generator: async () => ({
        data: sampleIdea.mockOutput as ExtractOutput,
        model: "mock-model",
      }),
    },
  );
  check(
    "input { idea, projectId } attaches project_id to every requirement",
    resWithInputProj.requirements.every((r) => r.project_id === testProjectId),
  );

  // 3.3 Via { prd: "..." }
  const resPrd = await extractRequirements(
    { prd: sampleIdea.text },
    {
      generator: async () => ({
        data: sampleIdea.mockOutput as ExtractOutput,
        model: "mock-model",
      }),
    },
  );
  check(
    "input { prd: '...' } successfully extracts requirements",
    resPrd.requirements.length === sampleIdea.mockOutput.requirements.length,
  );

  // 3.4 Via { text: "..." }
  const resText = await extractRequirements(
    { text: sampleIdea.text },
    {
      generator: async () => ({
        data: sampleIdea.mockOutput as ExtractOutput,
        model: "mock-model",
      }),
    },
  );
  check(
    "input { text: '...' } successfully extracts requirements",
    resText.requirements.length === sampleIdea.mockOutput.requirements.length,
  );

  // 3.5 Aliases: extract and intakeToRequirements
  const resAlias1 = await extract(sampleIdea.text, {
    generator: async () => ({
      data: sampleIdea.mockOutput as ExtractOutput,
      model: "mock-model",
    }),
  });
  const resAlias2 = await intakeToRequirements(sampleIdea.text, {
    generator: async () => ({
      data: sampleIdea.mockOutput as ExtractOutput,
      model: "mock-model",
    }),
  });
  check(
    "Alias `extract` works and returns valid requirements with IDs",
    resAlias1.requirements.length ===
      sampleIdea.mockOutput.requirements.length &&
      resAlias1.requirements.every((r) => isValidUuid(r.id)),
  );
  check(
    "Alias `intakeToRequirements` works and returns valid requirements with IDs",
    resAlias2.requirements.length ===
      sampleIdea.mockOutput.requirements.length &&
      resAlias2.requirements.every((r) => isValidUuid(r.id)),
  );

  // =========================================================================
  // Part 4: Optional Live LLM Verification (if --live is passed)
  // =========================================================================
  const isLive = process.argv.includes("--live");
  if (isLive) {
    console.log("\n--- Part 4: Live Gemini LLM Execution ---");
    if (!process.env.LLM_API_KEY) {
      console.warn(
        "  Skipping live test: LLM_API_KEY is not set in environment.",
      );
    } else {
      try {
        console.log("  Running live extract with real Gemini model...");
        const liveResult = await extractRequirements(SAMPLE_IDEAS[0].text);
        check(
          "Live extract: project_name is non-empty string",
          typeof liveResult.project_name === "string" &&
            liveResult.project_name.length > 0,
        );
        check(
          "Live extract: requirements returned with UUID IDs",
          liveResult.requirements.length >= 1 &&
            liveResult.requirements.every(
              (r) =>
                isValidUuid(r.id) && RequirementSchema.safeParse(r).success,
            ),
        );
        check(
          "Live extract: features equals requirements",
          liveResult.features === liveResult.requirements,
        );
        check(
          "Live extract: users, constraints, integrations populated",
          Array.isArray(liveResult.users) &&
            Array.isArray(liveResult.constraints) &&
            Array.isArray(liveResult.integrations),
        );
        console.log(`  Live extraction model: ${liveResult.model}`);
        console.log(`  Live project name: ${liveResult.project_name}`);
        console.log(
          `  Live requirements count: ${liveResult.requirements.length}`,
        );
      } catch (liveErr) {
        console.error("  Live extract failed:", liveErr);
        check("Live extract passed", false, liveErr);
      }
    }
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
    console.log("\nALL INTAKE TO REQUIREMENTS CHECKS PASSED!");
  }
}

runTests().catch((err) => {
  console.error("Unhandled error in test-extract:", err);
  process.exit(1);
});
