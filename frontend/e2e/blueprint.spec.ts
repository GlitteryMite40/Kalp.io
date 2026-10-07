import { test, expect } from "@playwright/test";

test.describe("Graph Preview - View Step Blueprint Flow", () => {
  test("opens step blueprint modal, verifies specification, switches tabs, and copies prompt", async ({
    page,
  }) => {
    // 1. Load homepage and scroll to graph preview
    await page.goto("http://localhost:3000/");
    await expect(page).toHaveTitle(/Kalp\.io/i);

    // 2. Locate the 'View Step Blueprint' button and click it
    const blueprintBtn = page.locator("#view-step-blueprint-btn");
    await blueprintBtn.scrollIntoViewIfNeeded();
    await expect(blueprintBtn).toBeVisible();
    await blueprintBtn.click();

    // 3. Verify the Step Blueprint modal appears
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();

    // Verify modal header has the title and key
    const modalTitle = page.locator("#blueprint-modal-title");
    await expect(modalTitle).toBeVisible();
    await expect(modalTitle).toContainText("LLM Graph Decomposition Engine");

    // Verify specification section is visible by default
    await expect(page.getByText("Purpose & Architecture Context")).toBeVisible();
    await expect(page.getByText("Acceptance Criteria")).toBeVisible();
    await expect(page.getByText("Target Files / Modules")).toBeVisible();

    // 4. Switch to Agent Prompt (Markdown) tab
    const promptTab = page.getByRole("button", { name: "Agent Prompt (Markdown)" });
    await promptTab.click();

    // Verify markdown pre block is visible
    const preBlock = modal.locator("pre");
    await expect(preBlock).toBeVisible();
    await expect(preBlock).toContainText("# TASK: [02.1] LLM Graph Decomposition Engine");

    // 5. Test Copy Blueprint Prompt button
    const copyBtn = modal.getByRole("button", { name: /Copy Blueprint Prompt/i });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Verify copied feedback
    await expect(modal.getByText(/Copied Prompt!|Copied Blueprint!/i)).toBeVisible();

    // 6. Close the modal
    const closeBtn = modal.getByRole("button", { name: "Close modal" });
    await closeBtn.click();
    await expect(modal).not.toBeVisible();

    // 7. Click another node in the graph and verify its blueprint
    const node1 = page.getByRole("heading", { name: "Supabase Schema & RLS" });
    await node1.click();
    await blueprintBtn.click();

    await expect(modal).toBeVisible();
    await expect(page.locator("#blueprint-modal-title")).toContainText("Supabase Schema & RLS");

    // Close via Close button in footer
    const footerCloseBtn = modal.getByRole("button", { name: "Close", exact: true });
    await footerCloseBtn.click();
    await expect(modal).not.toBeVisible();
  });
});
