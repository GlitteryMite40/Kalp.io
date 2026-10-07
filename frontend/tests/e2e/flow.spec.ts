/**
 * Task 07.3: E2E Test (Playwright)
 *
 * Requirements & Acceptance Criteria:
 * - Playwright: submit an idea, graph appears, simulate a webhook, node status changes.
 * - Acceptance Criteria: Full flow passes
 * - Test Cases: One end-to-end scenario
 * - Dependencies: 06.4 Mark Committed, 05.5 Status controls
 */

import { test, expect } from "@playwright/test";
import type { ComputedNode } from "@/types/api";

test.describe("Task 07.3: End-to-End Build Graph Flow", () => {
  test("submits an idea, displays graph, simulates webhook commit, and transitions node status", async ({
    page,
  }) => {
    // -------------------------------------------------------------------------
    // 1. Setup Mock State & Network Interceptors
    // -------------------------------------------------------------------------
    const projectId = "11111111-2222-4000-8000-333333333333";
    let currentStageIndex = 0;
    const stages = [
      "requirements",
      "architecture",
      "decomposition",
      "criteria",
    ] as const;

    // Initial node graph: Node 01.1 is Ready, 02.1 is Blocked by 01.1
    const nodes: ComputedNode[] = [
      {
        id: "node-01-1-uuid",
        project_id: projectId,
        node_key: "01.1",
        phase: "01",
        title: "Initial Scaffolding & Setup",
        type: "setup",
        status: "ready" as const,
        computed_status: "ready" as const,
        is_ready: true,
        is_blocked: false,
        blocked_by: [] as string[],
        dependencies: [] as string[],
        files: ["package.json", "tsconfig.json"],
        explanation: "Initial workspace scaffolding and configuration.",
        acceptance: [
          "Workspace initializes with clean dependencies",
          "TypeScript compiler passes in strict mode",
        ],
        tests: [
          "npm install succeeds",
          "tsc --noEmit reports 0 errors",
          "ESLint validates clean tree",
        ],
        prompt: "# TASK: [01.1] Initial Scaffolding & Setup",
        requirement_id: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "node-02-1-uuid",
        project_id: projectId,
        node_key: "02.1",
        phase: "02",
        title: "GitHub Webhook & Commit Processing API",
        type: "backend",
        status: "blocked" as const,
        computed_status: "blocked" as const,
        is_ready: false,
        is_blocked: true,
        blocked_by: ["01.1"],
        dependencies: ["01.1"],
        files: ["src/app/api/webhook/github/route.ts"],
        explanation: "Receives GitHub webhook payloads and parses commits.",
        acceptance: [
          "POST /api/webhook/github accepts valid push events",
          "Validates HMAC-SHA256 signature header",
        ],
        tests: [
          "Webhook HMAC verification passes",
          "Unsigned payloads return 401",
          "Valid commit message marks node committed",
        ],
        prompt: "# TASK: [02.1] GitHub Webhook & Commit Processing API",
        requirement_id: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "node-03-1-uuid",
        project_id: projectId,
        node_key: "03.1",
        phase: "03",
        title: "PR Code Review Dashboard UI",
        type: "frontend",
        status: "not_started" as const,
        computed_status: "blocked" as const,
        is_ready: false,
        is_blocked: true,
        blocked_by: ["02.1"],
        dependencies: ["02.1"],
        files: ["src/app/reviews/page.tsx"],
        explanation: "Displays real-time code review status.",
        acceptance: [
          "Dashboard mounts with active PR reviews",
          "Shows real-time commit statuses",
        ],
        tests: [
          "Component mounts correctly",
          "Live updates reflect commit state",
          "Review details panel renders comments",
        ],
        prompt: "# TASK: [03.1] PR Code Review Dashboard UI",
        requirement_id: null,
        created_at: new Date().toISOString(),
      },
    ];

    const edges = [
      {
        id: "edge-02-01-uuid",
        project_id: projectId,
        from_node: "02.1",
        to_node: "01.1",
        type: "DEPENDS_ON",
      },
      {
        id: "edge-03-02-uuid",
        project_id: projectId,
        from_node: "03.1",
        to_node: "02.1",
        type: "DEPENDS_ON",
      },
    ];

    const requirements = [
      {
        id: "req-01-uuid",
        project_id: projectId,
        key: "REQ-1",
        title: "Autonomous Webhook Code Reviews",
        description: "Parse commits from GitHub and update build nodes.",
      },
    ];

    let projectRecord = {
      id: projectId,
      name: "AI Code Reviewer Agent",
      idea: "An AI-powered code review agent with GitHub webhook integration and automated PR checks",
      status: "generating",
      current_stage: "requirements",
      repo_url: "https://github.com/kalp-team/ai-code-reviewer",
    };

    // Route interceptor for all /api/** calls
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      // 1. POST /api/projects
      if (path === "/api/projects" && method === "POST") {
        const body = route.request().postDataJSON() || {};
        projectRecord = {
          ...projectRecord,
          idea: body.idea || projectRecord.idea,
          status: "generating",
          current_stage: "requirements",
        };
        currentStageIndex = 0;
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: projectRecord }),
        });
      }

      // 2. POST /api/projects/:id/run
      if (
        path.startsWith("/api/projects/") &&
        path.endsWith("/run") &&
        method === "POST"
      ) {
        const stage = stages[currentStageIndex] || "criteria";
        currentStageIndex++;
        const isDone = currentStageIndex >= stages.length;

        if (isDone) {
          projectRecord.status = "ready";
          projectRecord.current_stage = "criteria";
        } else {
          projectRecord.current_stage = stages[currentStageIndex] || "criteria";
        }

        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            stage,
            done: isDone,
            data: { stage, done: isDone },
          }),
        });
      }

      // 3. GET /api/projects/:id/graph
      if (
        path.startsWith("/api/projects/") &&
        path.endsWith("/graph") &&
        method === "GET"
      ) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              project_id: projectId,
              project: projectRecord,
              nodes,
              edges,
              requirements,
            },
          }),
        });
      }

      // 4. GET /api/projects/:id/repo
      if (
        path.startsWith("/api/projects/") &&
        path.endsWith("/repo") &&
        method === "GET"
      ) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              connected: true,
              repo_url: projectRecord.repo_url,
              repo_full_name: "kalp-team/ai-code-reviewer",
              webhook_secret: "test_secret_1234567890",
              webhook_path: "/api/webhook/github",
            },
          }),
        });
      }

      // 5. PATCH /api/nodes/:id
      if (path.startsWith("/api/nodes/") && method === "PATCH") {
        const body = route.request().postDataJSON() || {};
        const nodeId = path.split("/").pop();
        const targetNode = nodes.find(
          (n) => n.id === nodeId || n.node_key === nodeId,
        );

        if (targetNode && body.status) {
          targetNode.status = body.status;
          targetNode.computed_status = body.status;
          if (body.status === "completed" || body.status === "committed") {
            // Unblock downstream nodes
            nodes.forEach((n) => {
              if (n.dependencies.includes(targetNode.node_key)) {
                n.blocked_by = n.blocked_by.filter(
                  (k) => k !== targetNode.node_key,
                );
                if (n.blocked_by.length === 0) {
                  n.status = "ready";
                  n.computed_status = "ready";
                  n.is_ready = true;
                  n.is_blocked = false;
                }
              }
            });
          }
        }

        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: targetNode }),
        });
      }

      // 6. POST /api/webhook/github (Simulated Webhook endpoint)
      if (path === "/api/webhook/github" && method === "POST") {
        const payload = route.request().postDataJSON() || {};
        const commits = payload.commits || [];
        const matchedKeys: string[] = [];

        // Parse commit messages for [node_key]
        for (const commit of commits) {
          const match = (commit.message || "").match(/\[(\d{2}\.\d+)\]/);
          if (match && match[1]) {
            const key = match[1];
            matchedKeys.push(key);
            const targetNode = nodes.find((n) => n.node_key === key);
            if (targetNode) {
              // Task 06.4: Mark Committed
              targetNode.status = "committed";
              targetNode.computed_status = "committed";
              targetNode.is_ready = false;
              targetNode.is_blocked = false;

              // Unblock dependents
              nodes.forEach((n) => {
                if (n.dependencies.includes(key)) {
                  n.blocked_by = n.blocked_by.filter((k) => k !== key);
                  if (n.blocked_by.length === 0) {
                    n.status = "ready";
                    n.computed_status = "ready";
                    n.is_ready = true;
                    n.is_blocked = false;
                  }
                }
              });
            }
          }
        }

        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            matched_node_keys: matchedKeys,
            commits_processed: commits.length,
          }),
        });
      }

      return route.continue();
    });

    // -------------------------------------------------------------------------
    // Step 1: Submit an Idea
    // -------------------------------------------------------------------------
    await page.goto("/");
    await expect(page).toHaveTitle(/Kalp\.io/i);

    // Locate the idea textarea
    const ideaInput = page.locator("#idea-input");
    await expect(ideaInput).toBeVisible();

    // Type the project idea
    const testIdea =
      "An AI-powered code review agent with GitHub webhook integration and automated PR checks";
    await ideaInput.fill(testIdea);

    // Submit the form
    const generateBtn = page.locator('button:has-text("Generate Graph")');
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    // -------------------------------------------------------------------------
    // Step 2: Graph Appears
    // -------------------------------------------------------------------------
    // The pipeline progresses and build graph appears
    await expect(page.locator("text=Build Graph Ready")).toBeVisible({
      timeout: 15000,
    });

    // Verify nodes are displayed in the dashboard graph layout
    const node01Card = page
      .locator("div")
      .filter({ hasText: "01.1" })
      .filter({ hasText: "Initial Scaffolding & Setup" })
      .first();
    await expect(node01Card).toBeVisible();
    await expect(node01Card).toContainText("Ready");

    const node02Card = page
      .locator("div")
      .filter({ hasText: "02.1" })
      .filter({ hasText: "GitHub Webhook" })
      .first();
    await expect(node02Card).toBeVisible();
    await expect(node02Card).toContainText("Blocked");

    // Navigate to full graph view (/p/:id) to verify React Flow workspace & status controls
    const openFullGraphLink = page.locator('text="Open Full Graph →"');
    await expect(openFullGraphLink).toBeVisible();
    await openFullGraphLink.click();

    // Wait for the full graph route to load
    await page.waitForURL(`**/p/${projectId}*`);

    // Verify Node Inspector shows details
    const nodePanel = page.locator('[data-testid="node-panel"]');
    await expect(nodePanel).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="node-panel-key"]')).toHaveText(
      "01.1",
    );

    // Task 05.5: Status Controls component shows Ready status
    const statusControls = page.locator('[data-testid="status-controls"]');
    await expect(statusControls).toBeVisible();
    await expect(
      page.locator('[data-testid="status-controls-current"]'),
    ).toContainText("Ready");

    // -------------------------------------------------------------------------
    // Step 3: Simulate a Webhook
    // -------------------------------------------------------------------------
    // Simulate GitHub push webhook event containing commit message "[01.1]"
    const webhookResponse = await page.evaluate(async () => {
      const res = await fetch("/api/webhook/github", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "push",
          "x-hub-signature-256": "sha256=mocked_valid_hmac_signature",
        },
        body: JSON.stringify({
          ref: "refs/heads/main",
          repository: { full_name: "kalp-team/ai-code-reviewer" },
          commits: [
            {
              id: "c0ffee1111111111111111111111111111111111",
              message: "[01.1] Setup scaffolding and initial configuration",
              timestamp: new Date().toISOString(),
              added: ["package.json", "tsconfig.json"],
              modified: [],
              removed: [],
            },
          ],
        }),
      });
      return res.json();
    });

    expect(webhookResponse.ok).toBe(true);
    expect(webhookResponse.matched_node_keys).toContain("01.1");

    // -------------------------------------------------------------------------
    // Step 4: Node Status Changes
    // -------------------------------------------------------------------------
    // Refresh the graph page to sync with latest backend state
    await page.reload();

    // Wait for the graph and node panel to mount
    await expect(page.locator('[data-testid="node-panel"]')).toBeVisible({
      timeout: 10000,
    });

    // Node 01.1 is selected by default
    await expect(page.locator('[data-testid="node-panel-key"]')).toHaveText(
      "01.1",
    );

    // Task 06.4: Verify node status transitioned to Committed!
    await expect(
      page.locator('[data-testid="status-controls-current"]'),
    ).toContainText("Committed", { timeout: 10000 });

    // Verify downstream node 02.1 is now unblocked and Ready to build
    // Select node 02.1 via downstream dependency navigation button or React Flow node
    const node02NavBtn = page.locator('button:has-text("02.1 →")');
    if (await node02NavBtn.isVisible()) {
      await node02NavBtn.click();
    } else {
      await page.locator('.react-flow__node:has-text("02.1")').click();
    }

    await expect(page.locator('[data-testid="node-panel-key"]')).toHaveText(
      "02.1",
    );
    await expect(
      page.locator('[data-testid="status-controls-current"]'),
    ).toContainText("Ready");

    // Test Task 05.5: Manual status control transition (click In Progress)
    const inProgressBtn = page.locator(
      '[data-testid="status-btn-in-progress"]',
    );
    await expect(inProgressBtn).toBeEnabled();
    await inProgressBtn.click();

    // Verify node 02.1 transitioned to In Progress
    await expect(
      page.locator('[data-testid="status-controls-current"]'),
    ).toContainText("In Progress");
  });
});
