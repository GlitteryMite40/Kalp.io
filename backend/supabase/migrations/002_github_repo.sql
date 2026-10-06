-- 002_github_repo.sql: Connect GitHub Repository and Per-Project Webhooks

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS webhook_secret text,
  ADD COLUMN IF NOT EXISTS repo_full_name text,
  ADD COLUMN IF NOT EXISTS repo_connected_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_projects_repo_full_name ON projects(repo_full_name);
