import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import LearningCheck from "./LearningCheck";
import type { ComputedNode, NodeLearnData } from "@/types/api";

const mockNode: ComputedNode = {
  id: "node-101",
  project_id: "proj-1",
  node_key: "01.1",
  phase: "Phase 1: Foundation",
  title: "Initialize Database Schema",
  type: "database",
  status: "committed",
  computed_status: "committed",
  is_ready: false,
  is_blocked: false,
  dependencies: [],
  blocked_by: [],
  files: ["supabase/migrations/001_init.sql"],
  explanation: "Creates initial tables for projects and nodes.",
  acceptance: ["Tables migrate cleanly"],
  tests: ["npm run db:migrate"],
  prompt: "Create initial SQL migrations",
  created_at: "2026-10-08T00:00:00Z",
  requirement_id: null,
};

describe("LearningCheck component", () => {
  it("renders no-commit state when no commit exists yet", () => {
    const uncommittedNode: ComputedNode = {
      ...mockNode,
      status: "not_started",
      computed_status: "not_started",
    };

    const emptyLearnData: NodeLearnData = {
      explanation: "Creates initial tables for projects and nodes.",
      has_commit: false,
      commit_sha: null,
      learning: null,
      answer_state: {
        wrong_count: 0,
        resolved: false,
        result: null,
        reveal: null,
      },
    };

    const html = renderToString(
      <LearningCheck
        node={uncommittedNode}
        initialLearnData={emptyLearnData}
        initialLoading={false}
      />,
    );

    expect(html).toContain(
      "Build this step, then come back to explain and check it",
    );
    expect(html).toContain("learning-check-no-commit");
  });

  it("renders explanation shown with diff source label and 4 question options", () => {
    const populatedLearnData: NodeLearnData = {
      explanation: "Creates initial tables for projects and nodes.",
      has_commit: true,
      commit_sha: "abc1234",
      learning: {
        diff_explanation:
          "This commit creates the initial database tables and establishes primary keys.",
        diff_source: "patch",
        commit_sha: "abc1234",
        stale: false,
        question: {
          prompt: "Why is the primary key required on the projects table?",
          options: [
            "To uniquely identify each project record",
            "To speed up browser rendering",
            "To format the markdown text",
            "To generate CSS classnames",
          ],
        },
      },
      answer_state: {
        wrong_count: 0,
        resolved: false,
        result: null,
        reveal: null,
      },
    };

    const html = renderToString(
      <LearningCheck
        node={mockNode}
        initialLearnData={populatedLearnData}
        initialLoading={false}
      />,
    );

    expect(html).toContain("This commit creates the initial database tables");
    expect(html).toContain("based on your code changes");
    expect(html).toContain(
      "Why is the primary key required on the projects table?",
    );
    expect(html).toContain("To uniquely identify each project record");
    expect(html).toContain("To speed up browser rendering");
    expect(html).toContain("To format the markdown text");
    expect(html).toContain("To generate CSS classnames");
    expect(html).toContain("Submit Answer");
    expect(html).toContain("Skip check");
  });

  it("renders wrong answer state with hint and retry capability", () => {
    const wrongLearnData: NodeLearnData = {
      explanation: "Creates initial tables for projects and nodes.",
      has_commit: true,
      commit_sha: "abc1234",
      learning: {
        diff_explanation: "This commit creates tables.",
        diff_source: "files_only",
        commit_sha: "abc1234",
        stale: false,
        question: {
          prompt: "What does this migration do?",
          options: ["Opt 1", "Opt 2", "Opt 3", "Opt 4"],
        },
      },
      answer_state: {
        wrong_count: 1,
        resolved: false,
        result: null,
        reveal: null,
        hint: "Think about relational database uniqueness constraints.",
      },
    };

    const html = renderToString(
      <LearningCheck
        node={mockNode}
        initialLearnData={wrongLearnData}
        initialLoading={false}
      />,
    );

    expect(html).toContain("Not quite");
    expect(html).toContain(
      "Think about relational database uniqueness constraints.",
    );
    expect(html).toContain("Submit Answer");
  });

  it("renders reveal state after two wrong answers showing correct explanation", () => {
    const revealLearnData: NodeLearnData = {
      explanation: "Creates initial tables.",
      has_commit: true,
      commit_sha: "abc1234",
      learning: {
        diff_explanation: "This commit creates tables.",
        diff_source: "patch",
        commit_sha: "abc1234",
        stale: false,
        question: {
          prompt: "What does this migration do?",
          options: ["Wrong A", "Correct Answer B", "Wrong C", "Wrong D"],
        },
      },
      answer_state: {
        wrong_count: 2,
        resolved: false,
        result: null,
        reveal: {
          correct_index: 1,
          explanation:
            "Correct Answer B is correct because relational tables require unique identifiers.",
        },
      },
    };

    const html = renderToString(
      <LearningCheck
        node={mockNode}
        initialLearnData={revealLearnData}
        initialLoading={false}
      />,
    );

    expect(html).toContain("Here is the answer");
    expect(html).toContain(
      "Correct Answer B is correct because relational tables require unique identifiers.",
    );
    expect(html).toContain("Got it, continue");
  });

  it("renders correct completed confirmation when answered correctly", () => {
    const completedLearnData: NodeLearnData = {
      explanation: "Creates initial tables.",
      has_commit: true,
      commit_sha: "abc1234",
      learning: {
        diff_explanation: "This commit creates tables.",
        diff_source: "plan_only",
        commit_sha: "abc1234",
        stale: false,
        question: {
          prompt: "What does this migration do?",
          options: ["A", "B", "C", "D"],
        },
      },
      answer_state: {
        wrong_count: 0,
        resolved: true,
        result: "correct",
        reveal: null,
      },
    };

    const html = renderToString(
      <LearningCheck
        node={mockNode}
        initialLearnData={completedLearnData}
        initialLoading={false}
        initialJustCompleted={true}
      />,
    );

    expect(html).toContain(
      "Step completed. Steps that needed it are now unlocked.",
    );
  });

  it("renders skip confirmation dialog when skip is initiated", () => {
    const html = renderToString(
      <LearningCheck
        node={mockNode}
        initialLoading={false}
        initialShowSkipConfirm={true}
      />,
    );

    expect(html).toContain("Skip this check?");
    expect(html).toContain("Yes, skip check");
    expect(html).toContain("Cancel");
  });

  it("renders error state with Retry and Skip buttons when generation fails", () => {
    const html = renderToString(
      <LearningCheck
        node={mockNode}
        initialLoading={false}
        initialError="LLM generation temporarily unavailable. Please retry or skip."
      />,
    );

    expect(html).toContain(
      "LLM generation temporarily unavailable. Please retry or skip.",
    );
    expect(html).toContain("Retry");
    expect(html).toContain("Skip check");
  });
});
