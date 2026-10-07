# Deploying Kalp.io on Vercel

This guide provides end-to-end instructions for deploying Kalp.io to production on Vercel using the Vercel Services multi-service configuration, Supabase Postgres, and Google Gemini API.

---

## 1. Architecture Overview

Kalp.io is deployed as a single Vercel project containing two decoupled services configured via [`vercel.json`](../vercel.json):

```
Kalp.io/
├── frontend/       # Next.js (App Router) — Interactive UI & React Flow graph canvas (handles /*)
├── backend/        # Next.js (App Router) — Serverless API routes & LLM pipeline (handles /api/*)
└── vercel.json     # Services routing definition & URL rewrites
```

- **Same-Domain Routing**: In production, Vercel routes all `/api/*` requests to the `backend` service and all other requests (`/*`) to the `frontend` service on the same domain. No CORS configuration or client-side backend URLs are needed.
- **Serverless Only**: Strictly stateless. No long-running background processes or local filesystem writes. All requests must finish within Vercel's serverless function timeout limits (10–60s depending on plan).

---

## 2. Prerequisites

Before deploying, ensure you have:

1. **Vercel Account**: [vercel.com](https://vercel.com)
2. **GitHub Account & Repository**: Push access to your Kalp.io repository (e.g. `https://github.com/owner/repo`).
3. **Google Gemini API Key**: Obtain from [Google AI Studio](https://aistudio.google.com).
4. **Supabase Postgres Database**: Free or paid project from [supabase.com](https://supabase.com).

---

## 3. Database Setup (Supabase Postgres)

### 3.1. Connection String (Transaction Pooler)

Because Vercel executes serverless functions with ephemeral instances, **always use the Supabase Transaction Pooler (port `6543`)**, not the direct connection (port `5432`):

```
postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@[YOUR-POOLER-REGION].pooler.supabase.com:6543/postgres
```

> [!IMPORTANT]
> **Password URL Encoding**: If your database password contains special characters (e.g., `@`, `#`, `!`, `/`, `$`), URL-encode them:
>
> - `@` → `%40`
> - `#` → `%23`
> - `!` → `%21`
> - `/` → `%2F`

### 3.2. Apply Database Migrations

Apply the database schema to your Supabase instance before deploying:

```bash
cd backend
npm install
npm run db:migrate
```

Or verify connectivity using:

```bash
npm run db:check
```

The migrations in `backend/supabase/migrations/` will create the required tables:

- `projects`: Root project records with owner cookies and webhook secrets.
- `requirements`: Extracted feature specifications.
- `nodes`: Build graph DAG tasks with readiness and committed statuses.
- `edges`: Prerequisite dependency chains (`DEPENDS_ON`, `BLOCKS`).
- `commits`: Ingested git commits from GitHub webhooks.
- `commit_suggestions`: Intelligent fallback suggestions based on modified file paths.

---

## 4. Environment Variables Configuration

Set these environment variables in your Vercel Project Settings (**Settings → Environment Variables**):

| Variable                  | Service   | Required | Description                                                          | Example                                                                  |
| :------------------------ | :-------- | :------- | :------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| `LLM_API_KEY`             | `backend` | **Yes**  | Google AI Studio Gemini API Key for graph synthesis                  | `AQ.Ab8RN6...`                                                           |
| `DATABASE_URL`            | `backend` | **Yes**  | Supabase Postgres Transaction Pooler connection string (`port 6543`) | `postgresql://postgres.ref:pass@aws-0-pooler.supabase.com:6543/postgres` |
| `LLM_MODEL`               | `backend` | No       | Pin a specific model (disables dynamic model selection)              | `models/gemini-2.5-flash`                                                |
| `GITHUB_WEBHOOK_SECRET`   | `backend` | No       | Legacy global fallback secret (Kalp generates per-project secrets)   | `optional_global_secret_hex`                                             |
| `NEXT_TELEMETRY_DISABLED` | Both      | No       | Disables Next.js anonymous telemetry                                 | `1`                                                                      |

> [!CAUTION]
> **SECURITY REQUIREMENT: NEVER COMMIT SECRETS**
>
> - Never commit `.env`, `.env.local`, or any credentials into Git.
> - Ensure `.env.local` remains in [`.gitignore`](../.gitignore).
> - All production secrets must only be entered in the Vercel dashboard.

> [!NOTE]
> The `frontend` service does **not** require any backend URL environment variables. Vercel's `vercel.json` rewrites `/api/*` to the backend service under the exact same hostname.

---

## 5. Deploying to Vercel

### Option A: GitHub Git Integration (Recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **"Add New..." → "Project"**.
2. Select your imported GitHub repository (`Kalp.io`).
3. Vercel automatically detects the root [`vercel.json`](../vercel.json) services preset.
4. Expand **Environment Variables** and add:
   - `LLM_API_KEY`
   - `DATABASE_URL`
5. Click **Deploy**.
6. Every push to the `main` branch will automatically trigger production deployments. Pull requests will generate preview environments.

### Option B: Deploying via Vercel CLI

1. Install or run the Vercel CLI:
   ```bash
   npx vercel login
   ```
2. Link your project:
   ```bash
   npx vercel link
   ```
3. Set your production environment variables:
   ```bash
   npx vercel env add LLM_API_KEY production
   npx vercel env add DATABASE_URL production
   ```
4. Deploy to production:
   ```bash
   npx vercel --prod
   ```

---

## 6. Post-Deployment Verification & Smoke Test

Once deployed, verify that production services are operational:

### 6.1. Health Check Endpoint

```bash
curl https://<your-vercel-domain>/api/health
```

Expected JSON response:

```json
{
  "status": "healthy",
  "database": "connected",
  "llm": "available",
  "timestamp": "2026-10-07T..."
}
```

### 6.2. LLM Model Status Check

```bash
curl https://<your-vercel-domain>/api/llm/status
```

Expected JSON response:

```json
{
  "success": true,
  "data": {
    "provider": "gemini",
    "state": "available",
    "selectedModel": "models/gemini-2.5-flash"
  }
}
```

### 6.3. Production Smoke Test

Run the full end-to-end smoke test verifying repo connection, DAG compilation, and commit webhook updates:

```bash
cd backend
npm run test:smoke
```

---

## 7. GitHub Webhook Setup for Live Commit Tracking

To automatically transition tasks to **`Committed`** when developers commit code:

1. Open your deployed Kalp.io application in the browser (`https://<your-vercel-domain>`).
2. Create or open a project graph.
3. In the top bar, expand **Connect Repository**.
4. Enter your public GitHub repository URL (e.g. `https://github.com/kalp-team/ai-code-reviewer`) and click **Connect**.
5. Kalp generates a dedicated **Webhook Secret** and provides the **Payload URL**:
   ```
   https://<your-vercel-domain>/api/webhook/github
   ```
6. Navigate to your GitHub repository:
   - Go to **Settings → Webhooks → Add webhook**.
   - **Payload URL**: `https://<your-vercel-domain>/api/webhook/github`
   - **Content type**: `application/json`
   - **Secret**: Paste the project's generated webhook secret.
   - **Which events would you like to trigger this webhook?**: Select **"Just the push event"**.
   - Ensure **Active** is checked, then click **Add webhook**.
7. Now, when any developer pushes a commit containing the task bracket in the message:
   ```bash
   git commit -m "[01.1] Setup project scaffolding"
   git push origin main
   ```
   Kalp.io receives the push event, verifies the HMAC-SHA256 signature, stores the commit, and automatically transitions Node `01.1` to **`Committed`** while unblocking downstream dependent tasks!
