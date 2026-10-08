-- 003_learning.sql: Learning layer tables (Task 09.1)

-- 1. Node Learning (Generated diff explanations & multiple-choice questions)
CREATE TABLE IF NOT EXISTS node_learning (
  node_id uuid PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  diff_explanation text,
  diff_source text CHECK (diff_source IN ('patch', 'files_only', 'plan_only')),
  commit_sha text,
  question jsonb NOT NULL,
  correct_index int NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  prompt_version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_node_learning_project_id ON node_learning(project_id);

-- 2. Node Answers (Attempts, results, and skips)
CREATE TABLE IF NOT EXISTS node_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  selected_index int,
  result text NOT NULL CHECK (result IN ('correct', 'wrong', 'skipped')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_node_answers_node_id ON node_answers(node_id);
CREATE INDEX IF NOT EXISTS idx_node_answers_project_id ON node_answers(project_id);

-- Enable Row Level Security (RLS) on both tables, no policies
ALTER TABLE node_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_answers ENABLE ROW LEVEL SECURITY;
