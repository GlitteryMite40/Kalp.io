-- 001_init.sql: Kalp.io Core Database Schema

-- 1. Projects
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  idea text NOT NULL,
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  current_stage text,
  repo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Project Stages
CREATE TABLE IF NOT EXISTS project_stages (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('requirements', 'architecture', 'decomposition', 'criteria')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  output jsonb,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, stage)
);

-- 3. Requirements
CREATE TABLE IF NOT EXISTS requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

-- 4. Nodes
CREATE TABLE IF NOT EXISTS nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  phase text NOT NULL,
  title text NOT NULL,
  type text,
  status text NOT NULL DEFAULT 'not_started' CHECK (
    status IN ('not_started', 'ready', 'in_progress', 'committed', 'completed', 'blocked', 'failed', 'needs_review')
  ),
  requirement_id uuid REFERENCES requirements(id) ON DELETE SET NULL,
  files text[] NOT NULL DEFAULT '{}',
  explanation text,
  acceptance text[] NOT NULL DEFAULT '{}',
  tests text[] NOT NULL DEFAULT '{}',
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, node_key)
);

-- 5. Edges
CREATE TABLE IF NOT EXISTS edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_node uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (
    type IN ('DEPENDS_ON', 'IMPLEMENTS', 'TESTS', 'PRODUCES', 'MODIFIES', 'BLOCKS')
  ),
  CHECK (from_node <> to_node),
  UNIQUE (from_node, to_node, type)
);

-- 6. Commits
CREATE TABLE IF NOT EXISTS commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_id uuid REFERENCES nodes(id) ON DELETE SET NULL,
  sha text NOT NULL,
  message text,
  files text[] NOT NULL DEFAULT '{}',
  matched_by text CHECK (matched_by IN ('message', 'files')),
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sha)
);

-- 7. Usage
CREATE TABLE IF NOT EXISTS usage (
  owner_id uuid NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, day)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_owner_created ON projects(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_project_id ON nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_edges_project_id ON edges(project_id);
CREATE INDEX IF NOT EXISTS idx_edges_from_node ON edges(from_node);
CREATE INDEX IF NOT EXISTS idx_edges_to_node ON edges(to_node);
CREATE INDEX IF NOT EXISTS idx_commits_project_id ON commits(project_id);
CREATE INDEX IF NOT EXISTS idx_commits_node_id ON commits(node_id);

-- Enable Row Level Security (RLS) on all tables (Data API is off, backend connects as db owner)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;
