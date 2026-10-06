-- 003_commit_suggestions.sql: Commit file matching suggestions and confidence (Task 06.5)

-- Add suggested_node_id and confidence columns to commits table
ALTER TABLE commits
  ADD COLUMN IF NOT EXISTS suggested_node_id uuid REFERENCES nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confidence real;

CREATE INDEX IF NOT EXISTS idx_commits_suggested_node_id ON commits(suggested_node_id);

-- Dedicated table for all commit suggestions (handles multiple matches per commit)
CREATE TABLE IF NOT EXISTS commit_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_id uuid NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  confidence real NOT NULL,
  matched_files text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commit_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_commit_suggestions_commit_id ON commit_suggestions(commit_id);
CREATE INDEX IF NOT EXISTS idx_commit_suggestions_node_id ON commit_suggestions(node_id);

-- Enable Row Level Security (RLS)
ALTER TABLE commit_suggestions ENABLE ROW LEVEL SECURITY;
