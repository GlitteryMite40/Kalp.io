import { z } from "zod";
import {
  BASE_SYSTEM_GUARD,
  wrapUserInput,
  type PromptMessages,
} from "./shared";

export const LEARN_PROMPT_VERSION = "learn.v1";

export interface LearnInputNode {
  title: string;
  explanation?: string | null;
  acceptance?: string[];
  files?: string[];
  requirementTitle?: string | null;
}

export interface BuildLearnInput {
  node: LearnInputNode;
  diff?: string | null;
  commitMessage?: string | null;
  filesChanged?: string[] | null;
}

export const LearnQuestionSchema = z.object({
  prompt: z.string().trim().min(1, "Question prompt cannot be empty"),
  options: z
    .array(z.string().trim().min(1, "Option cannot be empty"))
    .length(4, "Options must contain exactly 4 items")
    .refine((opts) => new Set(opts).size === 4, {
      message: "Options must contain exactly 4 distinct strings",
    }),
  correct_index: z
    .number()
    .int("correct_index must be an integer")
    .min(0, "correct_index must be between 0 and 3")
    .max(3, "correct_index must be between 0 and 3"),
  explanation: z.string().trim().min(1, "Explanation cannot be empty"),
  hint: z.string().trim().min(1, "Hint cannot be empty"),
});

export const LearnOutputSchema = z.object({
  diff_explanation: z
    .string()
    .trim()
    .min(1, "Explanation cannot be empty")
    .max(900, "diff_explanation must be at most 900 characters"),
  question: LearnQuestionSchema,
});

export type LearnOutput = z.infer<typeof LearnOutputSchema>;
export type LearnQuestion = z.infer<typeof LearnQuestionSchema>;

/**
 * Builds system and user prompt messages for generating learning explanations and check questions.
 */
export function buildLearnMessages(input: BuildLearnInput): PromptMessages {
  const { node, diff, commitMessage, filesChanged } = input;

  const system = `${BASE_SYSTEM_GUARD}

You are an expert, patient programming mentor helping a beginner build an application step by step with AI coding agents.
Your goal is to explain what was just built in simple, friendly, beginner-accessible language, and generate a conceptual multiple-choice question to check their understanding before unlocking the next steps.

Language and tone rules:
- Write for a beginner who understands basic programming concepts but is new to software architecture.
- Explain what changed, why this step exists, and how it connects to the steps before and after it.
- Define any technical term in one short, clear clause.
- Refer to files by name.
- Write the explanation in simple, clear prose (maximum 900 characters).
- If no diff is available, explicitly state in the explanation that it is based on the project plan.
- Write all human-readable text in the same language as the user's project text.

Question creation rules:
- The question must test purpose, order, architecture, or data flow (for example, why this step must come first, or what would break if a file or module were missing).
- Do NOT quiz on syntax trivia, language quirks, or exact identifiers.
- Provide exactly 4 distinct options: one clearly correct answer and three plausible distractors.
- Do NOT leak the answer inside the prompt text.
- Provide a brief, supportive explanation for why the correct option is right.
- Provide a helpful hint that nudges the learner without directly giving away the answer.`;

  const parts: string[] = [
    `Node Title: ${node.title}`,
    node.explanation ? `Node Purpose (Plan): ${node.explanation}` : "",
    node.requirementTitle ? `Parent Requirement: ${node.requirementTitle}` : "",
    node.files && node.files.length > 0
      ? `Target Files: ${node.files.join(", ")}`
      : "",
    node.acceptance && node.acceptance.length > 0
      ? `Acceptance Criteria:\n${node.acceptance.map((a) => ` - ${a}`).join("\n")}`
      : "",
    filesChanged && filesChanged.length > 0
      ? `Files Changed in Commit: ${filesChanged.join(", ")}`
      : "",
  ].filter(Boolean);

  let userContent = parts.join("\n\n");

  if (commitMessage && commitMessage.trim()) {
    userContent += `\n\nCommit Message:\n${wrapUserInput(commitMessage.trim(), "user_input")}`;
  }

  if (diff && diff.trim()) {
    userContent += `\n\nCommit Diff Patch:\n${wrapUserInput(diff.trim(), "user_input")}`;
  } else {
    userContent += `\n\nNo git diff available. Base the explanation and question on the node plan, acceptance criteria, and target files.`;
  }

  return {
    system,
    prompt: userContent,
    version: LEARN_PROMPT_VERSION,
  };
}
