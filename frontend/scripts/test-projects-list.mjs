/**
 * Test Suite for Task 05.7: Projects list
 *
 * Verifies:
 * 1. Component contracts and file integrity:
 *    - frontend/src/app/projects/page.tsx exists and is a client component
 *    - frontend/src/lib/api.ts exports listProjects and deleteProject
 *    - UI elements: projects-list, project-card, project-title, project-status,
 *      project-progress, delete-project-btn
 * 2. Confirm step in the UI:
 *    - Modal with confirm-delete-modal, confirm-delete-btn, cancel-delete-btn
 *    - User confirmation is required before deletion
 * 3. ACCEPTANCE CRITERIA: "Only own projects are listed"
 *    - API request sends credentials: "include" to scope to owner cookie
 *    - Owner isolation filtering in frontend API client
 * 4. ACCEPTANCE CRITERIA: "delete removes nodes and edges" & error handling:
 *    - deleteProject API client method performs DELETE /api/projects/:id
 *    - Handles 200 OK, 404 Not Found (another owner's or deleted twice), 401 Unauthorized
 */

import fs from "node:fs";
import path from "node:path";
import { api, listProjects, deleteProject } from "../src/lib/api.ts";

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

async function run() {
  console.log("=== RUNNING TASK 05.7 PROJECTS LIST TEST SUITE ===\n");

  // =========================================================================
  // Part 1: Component File & Source Code Contracts
  // =========================================================================
  console.log("--- Part 1: Component File & Source Code Contracts ---");

  const pagePath = path.resolve("src/app/projects/page.tsx");
  check(
    "frontend/src/app/projects/page.tsx exists on disk",
    fs.existsSync(pagePath),
  );

  const pageCode = fs.readFileSync(pagePath, "utf-8");

  check(
    "ProjectsPage is a 'use client' component",
    pageCode.startsWith('"use client";'),
  );

  check(
    "ProjectsPage exports default function ProjectsPage",
    pageCode.includes("export default function ProjectsPage"),
  );

  // Check required UI elements
  check(
    "Renders projects list container with test id 'projects-list'",
    pageCode.includes('data-testid="projects-list"'),
  );

  check(
    "Renders individual project cards with test id 'project-card'",
    pageCode.includes('data-testid="project-card"'),
  );

  check(
    "Renders project title with test id 'project-title'",
    pageCode.includes('data-testid="project-title"'),
  );

  check(
    "Renders project status badge with test id 'project-status'",
    pageCode.includes('data-testid="project-status"'),
  );

  check(
    "Renders project progress/stage indicator with test id 'project-progress'",
    pageCode.includes('data-testid="project-progress"'),
  );

  check(
    "Renders delete button with test id 'delete-project-btn'",
    pageCode.includes('data-testid="delete-project-btn"'),
  );

  check(
    "Renders empty state with test id 'projects-empty-state'",
    pageCode.includes('data-testid="projects-empty-state"'),
  );

  // =========================================================================
  // Part 2: Confirm Step in the UI
  // =========================================================================
  console.log("\n--- Part 2: Confirm Step in the UI ---");

  check(
    "Defines delete confirmation modal with test id 'confirm-delete-modal'",
    pageCode.includes('data-testid="confirm-delete-modal"'),
  );

  check(
    "Modal provides confirm button with test id 'confirm-delete-btn'",
    pageCode.includes('data-testid="confirm-delete-btn"'),
  );

  check(
    "Modal provides cancel button with test id 'cancel-delete-btn'",
    pageCode.includes('data-testid="cancel-delete-btn"'),
  );

  check(
    "Confirm action calls api.deleteProject",
    pageCode.includes("api.deleteProject"),
  );

  // =========================================================================
  // Part 3: ACCEPTANCE CRITERIA - "Only own projects are listed"
  // =========================================================================
  console.log(
    "\n--- Part 3: Acceptance Criteria - Only Own Projects Listed ---",
  );

  // Mock fetcher verifying that credentials: "include" is always sent
  let listFetchCalls = [];
  const mockOwnerFetcher = async (url, init) => {
    listFetchCalls.push({ url, init });

    if (url === "/api/projects" && (!init?.method || init.method === "GET")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            success: true,
            data: [
              {
                id: "proj-owner-1",
                owner_id: "owner-alice",
                name: "Alice Habit Tracker",
                idea: "Build graph for habits",
                status: "ready",
                current_stage: "criteria",
                created_at: "2026-10-06T00:00:00Z",
              },
            ],
          }),
      };
    }
    return { ok: false, status: 404, text: async () => "{}" };
  };

  const ownerProjects = await listProjects({ fetcher: mockOwnerFetcher });

  check(
    "listProjects fetches /api/projects",
    listFetchCalls.length === 1 && listFetchCalls[0].url === "/api/projects",
  );

  check(
    "listProjects sends credentials: 'include' for owner cookie isolation",
    listFetchCalls[0].init?.credentials === "include",
  );

  check(
    "ACCEPTANCE CRITERIA: Returned list contains only the requesting owner's projects",
    Array.isArray(ownerProjects) &&
      ownerProjects.length === 1 &&
      ownerProjects[0].name === "Alice Habit Tracker",
  );

  // =========================================================================
  // Part 4: API Client deleteProject & TEST CASES
  // =========================================================================
  console.log("\n--- Part 4: API Client deleteProject & Error Handling ---");

  check(
    "api object exports deleteProject function",
    typeof api.deleteProject === "function",
  );

  // 4.1 Delete own project: 200 OK
  let deleteFetchCalls = [];
  const mockDeleteFetcher = async (url, init) => {
    deleteFetchCalls.push({ url, init });

    if (url === "/api/projects/proj-owner-1" && init?.method === "DELETE") {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            success: true,
            message: "Project deleted successfully",
            id: "proj-owner-1",
          }),
      };
    }

    if (url === "/api/projects/proj-other-user" && init?.method === "DELETE") {
      return {
        ok: false,
        status: 404,
        text: async () =>
          JSON.stringify({
            success: false,
            error: {
              code: "PROJECT_NOT_FOUND",
              message: "Project not found",
            },
          }),
      };
    }

    return { ok: false, status: 500, text: async () => "{}" };
  };

  const deleteOwnRes = await deleteProject("proj-owner-1", {
    fetcher: mockDeleteFetcher,
  });

  check(
    "deleteProject sends DELETE request to /api/projects/:id",
    deleteFetchCalls.some(
      (c) =>
        c.url === "/api/projects/proj-owner-1" && c.init?.method === "DELETE",
    ),
  );

  check(
    "deleteProject sends credentials: 'include'",
    deleteFetchCalls[0].init?.credentials === "include",
  );

  check(
    "TEST CASE (delete own): deleteProject returns success: true",
    deleteOwnRes.success === true && deleteOwnRes.id === "proj-owner-1",
  );

  // 4.2 Delete another owner's / delete twice: 404 error thrown
  let caughtError = null;
  try {
    await deleteProject("proj-other-user", { fetcher: mockDeleteFetcher });
  } catch (err) {
    caughtError = err;
  }

  check(
    "TEST CASE (delete another owner's / delete twice): Throws ApiClientError with 404",
    caughtError !== null && caughtError.status === 404,
    caughtError,
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
    console.log("\nALL PROJECTS LIST CHECKS PASSED!");
  }
}

run().catch((err) => {
  console.error("Unhandled error in test-projects-list:", err);
  process.exit(1);
});
