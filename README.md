# Kalp.io

Turn project ideas into dependency-aware build graphs.

## Overview

Kalp.io is an intelligent tool designed to transform software project ideas and requirements into structured, dependency-aware build graphs. It breaks down complex product goals into actionable milestones, modules, and tasks with clear execution sequences.

## Architecture & Repo Layout

The repository is structured into two decoupled Next.js projects deployed independently to Vercel:

```
Kalp.io/
├── frontend/    # Next.js (App Router) - UI only; proxies /api requests to backend
├── backend/     # Next.js (App Router) - API routes only
├── README.md    # Project documentation
└── .gitignore   # Git ignore rules
```

- **`frontend`**: Handles UI interactions, visualization with React Flow, and state management. Proxies `/api/*` to the backend deployment.
- **`backend`**: Hosts serverless API routes handling validation, LLM orchestration, and Supabase integration.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Runtime**: Node.js (Vercel Serverless Functions)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Graph Visualization**: React Flow
- **Data Validation**: Zod
- **Database**: Supabase Postgres
- **AI / LLM**: LLM API integration

## Constraints & Principles

- **Serverless Only**: Strictly stateless execution. No long-running background processes or daemon threads.
- **Ephemeral Storage**: No persistent local filesystem writes; all persistent state resides in Supabase Postgres or external storage.
- **Execution Limits**: All operations and API requests are optimized to complete within standard serverless function timeouts.
