-- 004_drift_flag.sql: Drift tracking columns (Task 06.6)

-- 1. Commits table drift columns
ALTER TABLE commits
  ADD COLUMN IF NOT EXISTS has_drift boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS drift_score real,
  ADD COLUMN IF NOT EXISTS drift_reason text;

CREATE INDEX IF NOT EXISTS idx_commits_has_drift ON commits(has_drift);

-- 2. Nodes table drift columns
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS has_drift boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS drift_score real,
  ADD COLUMN IF NOT EXISTS drift_reason text;

CREATE INDEX IF NOT EXISTS idx_nodes_has_drift ON nodes(has_drift);
