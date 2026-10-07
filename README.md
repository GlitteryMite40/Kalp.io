# Kalp.io

> Turn any software project idea into an autonomous, dependency-aware build graph.

Kalp.io decomposes high-level project specs and software ideas into structured, executable execution DAGs. It extracts requirements, devises architecture, maps modules into prerequisite task chains with Zod-validated contracts, visualizes the build graph interactively using React Flow, and automatically tracks development progress via GitHub commits and webhooks.

---

## Architecture & Technology Stack

Kalp.io is architected for **Vercel Services** (multi-service deployment under a single Vercel project via [`vercel.json`](./vercel.json)):

```
Kalp.io/
├── frontend/          # Next.js (App Router) — UI & React Flow canvas (handles /*)
├── backend/           # Next.js (App Router) — Serverless API routes & LLM pipeline (handles /api/*)
├── docs/              # Deployment and operations documentation
│   └── DEPLOY.md      # Production Vercel deployment guide
├── vercel.json        # Platform routing: /api/* -> backend, /* -> frontend
├── LICENSE            # MIT License
└── README.md          # Documentation & setup guide
```

- **Frontend**: Next.js App Router (React 19, TypeScript, Tailwind CSS, `@xyflow/react` / React Flow).
- **Backend**: Next.js App Router API routes, Serverless Node.js runtime, Zod schema validation.
- **Database**: Supabase Postgres (PostgreSQL 15+ with transaction connection pooling).
- **AI Engine**: Google Gemini API via dynamic model selection (`gemini-2.5-flash`, `gemini-3.5-flash`).
- **Serverless Constraints**: Strictly stateless execution. No long-running daemons, no local persistent disk storage, all requests complete within standard serverless function limits.

---

## Prerequisites

Before setting up Kalp.io locally, ensure you have:

- **Node.js**: `v20.x` or later (LTS recommended). Check with `node -v`.
- **npm**: `v10.x` or later. Check with `npm -v`.
- **Git**: Installed and configured.
- **Supabase Postgres Database**: Free or paid project at [supabase.com](https://supabase.com).
- **Google AI Studio Gemini API Key**: Free API key from [aistudio.google.com](https://aistudio.google.com).

---

## Getting Started (Clean Machine Setup)

Follow these steps to run Kalp.io locally:

### 1. Clone the Repository

```bash
git clone https://github.com/GlitteryMite40/Kalp.io.git
cd Kalp.io
```

### 2. Install Dependencies

Install dependencies for both the backend and frontend services:

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

### 3. Configure Environment Variables

Create the backend environment file by copying the template:

```bash
cp backend/.env.example backend/.env.local
```

Open `backend/.env.local` in your editor and configure your credentials:

```env
# Google AI Studio Gemini API key
LLM_API_KEY=your_gemini_api_key_here

# Supabase Postgres Transaction Pooler string (port 6543)
DATABASE_URL=postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres

# Optional: Server Port (defaults to 3001)
PORT=3001
```

> [!CAUTION]
>
> ### ⚠️ SECURITY REQUIREMENT: NEVER COMMIT SECRETS
>
> - **Never** commit `.env`, `.env.local`, API keys, or database credentials into Git.
> - Ensure all `.env*` files remain ignored in [`.gitignore`](./.gitignore).
> - Never hardcode secrets in source code, documentation, or commit messages.
> - If an API key or password is accidentally committed, rotate and revoke it immediately.

> [!NOTE]
> The `frontend` service requires **zero** environment variables. Vercel's routing infrastructure (and Next.js rewrites) proxies all `/api/*` requests to the backend on the same origin.

### 4. Run Database Migrations

Apply the database schema to your Supabase instance:

```bash
cd backend
npm run db:migrate
```

Verify your database connection:

```bash
npm run db:check
```

Verify Gemini LLM API connectivity:

```bash
npm run llm:check
```

### 5. Start Local Development Servers

Open two terminal windows:

**Terminal 1 — Backend API Service (Port 3001)**:

```bash
cd backend
npm run dev
```

The backend API server starts at `http://localhost:3001`.

**Terminal 2 — Frontend UI Service (Port 3000)**:

```bash
cd frontend
npm run dev
```

The frontend UI starts at `http://localhost:3000`.

Open [http://localhost:3000](http://localhost:3000) in your browser. Enter a software idea (e.g. _"A developer portfolio generator that parses GitHub repositories and deploys via Next.js"_) and click **Generate Graph** to see Kalp.io in action!

---

## Environment Variables Reference

| Variable                  | Service   | Required | Default | Description                                                                                                           |
| :------------------------ | :-------- | :------- | :------ | :-------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_KEY`             | `backend` | **Yes**  | —       | Google AI Studio Gemini API Key for graph synthesis and verification.                                                 |
| `DATABASE_URL`            | `backend` | **Yes**  | —       | Supabase Postgres connection string. Must use the **Transaction Pooler** (`port 6543`), not the direct port (`5432`). |
| `LLM_MODEL`               | `backend` | No       | Auto    | Optional: Pin a specific Gemini model (e.g. `models/gemini-2.5-flash`), disabling automatic candidate fallback.       |
| `PORT`                    | `backend` | No       | `3001`  | Local development port for the backend server.                                                                        |
| `GITHUB_WEBHOOK_SECRET`   | `backend` | No       | —       | Legacy global webhook secret. (Kalp generates per-project webhook secrets automatically).                             |
| `NEXT_TELEMETRY_DISABLED` | Both      | No       | `1`     | Disables Next.js anonymous telemetry in CI and production.                                                            |

---

## Available Scripts

### Backend (`cd backend`)

| Command                | Description                                                                     |
| :--------------------- | :------------------------------------------------------------------------------ |
| `npm run dev`          | Starts backend Next.js API server locally on port 3001.                         |
| `npm run build`        | Builds production Next.js backend bundle.                                       |
| `npm run typecheck`    | Validates TypeScript types strictly (`tsc --noEmit`).                           |
| `npm run lint`         | Runs ESLint on all backend routes and utilities.                                |
| `npm run format:check` | Checks Prettier formatting across backend files.                                |
| `npm run test:unit`    | Runs all offline unit tests with Vitest (no live LLM calls).                    |
| `npm run test:plans`   | Runs plan quality and DAG topology validation tests.                            |
| `npm run test:smoke`   | Runs full production end-to-end smoke test against Supabase & real GitHub repo. |
| `npm run db:check`     | Tests live Supabase Postgres database connectivity.                             |
| `npm run db:migrate`   | Applies database migrations from `supabase/migrations/`.                        |
| `npm run db:smoke`     | Runs transactional constraint tests against Postgres.                           |
| `npm run llm:check`    | Probes live Gemini API connectivity and dynamic model selection.                |

### Frontend (`cd frontend`)

| Command                | Description                                                     |
| :--------------------- | :-------------------------------------------------------------- |
| `npm run dev`          | Starts frontend Next.js UI development server on port 3000.     |
| `npm run build`        | Builds production Next.js frontend bundle.                      |
| `npm run typecheck`    | Validates TypeScript types strictly (`tsc --noEmit`).           |
| `npm run lint`         | Runs ESLint across frontend components and pages.               |
| `npm run format:check` | Checks Prettier formatting across frontend files.               |
| `npm run test:unit`    | Runs frontend unit tests with Vitest.                           |
| `npm run test:e2e`     | Runs Playwright end-to-end test suite in headless browser.      |
| `npm test`             | Runs the full frontend test suite (unit, UI, export, controls). |

---

## Testing & Quality Assurance

Kalp.io includes comprehensive automated testing:

```bash
# 1. Run backend unit tests (100+ tests, offline mocks)
cd backend && npm run test:unit

# 2. Run backend plan quality tests
cd backend && npm run test:plans

# 3. Run frontend unit tests
cd frontend && npm run test:unit

# 4. Run Playwright end-to-end test (submits idea -> graph -> webhook -> committed)
cd frontend && npm run test:e2e

# 5. Run live production smoke test (verifies live Supabase & GitHub webhook update)
cd backend && npm run test:smoke
```

---

## Production Deployment on Vercel

Kalp.io is designed for zero-config Vercel deployment:

1. **Push to GitHub**: Push your code to your GitHub repository.
2. **Import into Vercel**: Import the repository in your [Vercel Dashboard](https://vercel.com/dashboard). Vercel automatically detects the [`vercel.json`](./vercel.json) services configuration.
3. **Set Environment Variables**: In Vercel Project Settings, add:
   - `LLM_API_KEY`: Your Gemini API key.
   - `DATABASE_URL`: Your Supabase Transaction Pooler connection string (`port 6543`).
4. **Deploy**: Click Deploy. Vercel routes `/api/*` to the backend and `/*` to the frontend automatically.

For step-by-step instructions, troubleshooting, and webhook configuration, see the detailed [**Deployment Guide (`docs/DEPLOY.md`)**](./docs/DEPLOY.md).

---

## GitHub Commit Tracking & Webhooks

When a GitHub repository is connected to a Kalp.io project:

1. Kalp provisions a unique, cryptographically secure `webhook_secret` and payload URL (`https://<your-domain>/api/webhook/github`).
2. Add this webhook in your GitHub repository settings under **Settings → Webhooks**.
3. When developers push commits with task brackets in their commit messages:
   ```bash
   git commit -m "[02.1] Implemented authentication endpoints"
   git push origin main
   ```
4. Kalp's webhook endpoint verifies the HMAC-SHA256 signature, stores the commit, and automatically transitions Task `02.1` to **`Committed`**, unblocking any downstream dependent tasks.

---

## License

This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.
