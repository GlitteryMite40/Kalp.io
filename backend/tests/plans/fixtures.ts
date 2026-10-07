/**
 * 5 Sample Ideas Fixtures for Task 07.2: Plan quality tests
 *
 * Covers diverse software domains:
 * 1. Habit Tracker for College Students (EdTech / Social Productivity)
 * 2. AI Recipe Planner & Smart Pantry (FoodTech / AI Assistant)
 * 3. Developer Kubernetes CLI Dashboard (DevOps / Systems CLI)
 * 4. E-Commerce Multi-Vendor Marketplace (FinTech / Marketplace)
 * 5. Telehealth Patient Video Consultation Platform (HealthTech / Real-time WebRTC)
 */

import type { ExtractOutput } from "@/server/prompts/extract";
import type { ArchitectureOutput } from "@/server/prompts/architecture";
import type { CriteriaOutput } from "@/server/prompts/criteria";

export interface DecomposeNodeMock {
  node_key: string;
  phase: string;
  title: string;
  type?: string | null;
  status?: string;
  requirement_key?: string | null;
  files: string[];
  explanation?: string | null;
  acceptance?: string[];
  tests?: string[];
}

export interface DecomposeMockData {
  nodes: DecomposeNodeMock[];
  edges: Array<{
    from_node: string;
    to_node: string;
    type: "DEPENDS_ON";
  }>;
}

export interface SampleIdeaFixture {
  id: string;
  name: string;
  idea: string;
  extractMock: ExtractOutput;
  architectureMock: ArchitectureOutput;
  decomposeMock: DecomposeMockData;
  criteriaMock: CriteriaOutput;
}

export const SAMPLE_IDEAS: SampleIdeaFixture[] = [
  // ---------------------------------------------------------------------------
  // 1. Habit Tracker for College Students
  // ---------------------------------------------------------------------------
  {
    id: "10000000-0000-4000-8000-000000000000",
    name: "Habit Tracker for College Students",
    idea: "A habit tracker for college students with streaks, reminders, and study group accountability features to study together.",
    extractMock: {
      project_name: "CampusHabits",
      assumptions: [
        "Users authenticate via student email or OAuth.",
        "Mobile-first responsive design for campus usage.",
      ],
      requirements: [
        {
          key: "REQ-1",
          title: "User Registration & Campus Profiles",
          description:
            "Students register using college credentials and manage custom habit goals.",
        },
        {
          key: "REQ-2",
          title: "Habit Streaks & Push Reminders",
          description:
            "Tracks consecutive daily streaks with timezone-aware study reminders.",
        },
        {
          key: "REQ-3",
          title: "Study Group Accountability Circles",
          description:
            "Enables students to join shared study circles and view peer streak progress.",
        },
      ],
      users: ["College students", "Study group coordinators"],
      constraints: ["Serverless execution", "Low battery background reminders"],
      integrations: ["Supabase Auth", "Web Push Notifications"],
    },
    architectureMock: {
      stack: {
        frontend: "Next.js App Router",
        backend: "Next.js Route Handlers",
        database: "Supabase Postgres",
        hosting: "Vercel",
        other: ["Web Push Service"],
      },
      modules: [
        {
          name: "Auth & Profile Service",
          responsibility: "Manage student accounts and profiles",
          requirement_keys: ["REQ-1"],
        },
        {
          name: "Streak Calculation Engine",
          responsibility:
            "Compute streak continuity and schedule notifications",
          requirement_keys: ["REQ-2"],
        },
        {
          name: "Study Circles Social Hub",
          responsibility: "Manage group memberships and activity feeds",
          requirement_keys: ["REQ-3"],
        },
      ],
      assumptions: [
        "Supabase Postgres is the primary data store.",
        "Push notifications trigger via scheduled cron endpoints.",
      ],
      interactions: [
        "Next.js frontend connects to serverless API routes.",
        "Streak calculation updates daily habit status atomically.",
      ],
      summary:
        "Modern serverless habit tracking platform with social accountability.",
    },
    decomposeMock: {
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "Project Scaffolding & Setup",
          type: "setup",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["package.json", "tsconfig.json"],
          explanation: "Initial workspace scaffolding and lint setup.",
        },
        {
          node_key: "02.1",
          phase: "02",
          title: "Habits and Users Database Schema",
          type: "database",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["supabase/migrations/001_habits.sql"],
          explanation: "Postgres schema for users, habits, and study circles.",
        },
        {
          node_key: "02.2",
          phase: "02",
          title: "Auth Route Handlers & Profile API",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["src/app/api/auth/route.ts"],
          explanation: "Student authentication and profile endpoints.",
        },
        {
          node_key: "02.3",
          phase: "02",
          title: "Streak Calculation Engine",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/server/habits.ts"],
          explanation: "Calculates habit continuity and milestone streaks.",
        },
        {
          node_key: "03.1",
          phase: "03",
          title: "Interactive Habit Dashboard UI",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/app/habits/page.tsx"],
          explanation: "Habit check-in card and streak animation counter.",
        },
        {
          node_key: "03.2",
          phase: "03",
          title: "Study Circle Group Feed UI",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-3",
          files: ["src/app/groups/page.tsx"],
          explanation: "Social study group feed and peer streak leaderboards.",
        },
        {
          node_key: "04.1",
          phase: "04",
          title: "End-to-End Habit Flow Tests",
          type: "testing",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["tests/habits.spec.ts"],
          explanation: "Automated end-to-end validation of streak tracking.",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "02.3", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.3", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "02.2", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.2", type: "DEPENDS_ON" },
      ],
    },
    criteriaMock: {
      "01.1": {
        acceptance: [
          "Package dependencies install cleanly with zero peer dependency conflicts.",
          "TypeScript typecheck passes in strict mode.",
        ],
        tests: [
          "npm install exits with code 0",
          "tsc --noEmit reports 0 type errors",
          "ESLint validates root source directory",
        ],
      },
      "02.1": {
        acceptance: [
          "Database migration executes idempotently creating all habit and circle tables.",
          "Foreign key constraints enforce referential integrity between users and streaks.",
        ],
        tests: [
          "Migration script creates users and habits tables",
          "Deleting a user cascades habit logs properly",
          "Unique constraint prevents duplicate habit entries on the same date",
        ],
      },
      "02.2": {
        acceptance: [
          "Valid session returns 200 with student profile data.",
          "Unauthenticated requests are rejected with 401 Unauthorized.",
        ],
        tests: [
          "GET /api/auth returns profile with valid cookie",
          "POST /api/auth rejects malformed payload with 400",
          "Missing auth token returns 401 status",
        ],
      },
      "02.3": {
        acceptance: [
          "Calculates consecutive active days accurately across month boundaries.",
          "Resets streak to 0 when a habit is missed beyond the grace period.",
        ],
        tests: [
          "Consecutive 7-day logs evaluate to streak 7",
          "Missed day correctly breaks active streak sequence",
          "Grace period window maintains streak if logged within threshold",
        ],
      },
      "03.1": {
        acceptance: [
          "Habit dashboard renders list of active habits with streak counters.",
          "Toggling a habit completed updates UI state optimistically.",
        ],
        tests: [
          "Dashboard component mounts with active habits",
          "Clicking habit toggle dispatches completion action",
          "Streak counter animates on milestone completion",
        ],
      },
      "03.2": {
        acceptance: [
          "Group study circle displays peer members and collective streak totals.",
          "Students can join a new group via invitation code.",
        ],
        tests: [
          "Group feed displays leaderboard ranking",
          "Invalid group code triggers helpful error banner",
          "Member list reflects real-time status updates",
        ],
      },
      "04.1": {
        acceptance: [
          "Full habit lifecycle from creation to check-in passes end-to-end.",
          "Study circle synchronization validates peer streak updates.",
        ],
        tests: [
          "E2E creates habit and asserts streak increment",
          "E2E validates group member streak synchronization",
          "E2E confirms notification reminder triggers on schedule",
        ],
      },
    },
  },

  // ---------------------------------------------------------------------------
  // 2. AI Recipe Planner & Smart Pantry
  // ---------------------------------------------------------------------------
  {
    id: "20000000-0000-4000-8000-000000000000",
    name: "AI Recipe Planner & Smart Pantry",
    idea: "An AI-powered recipe planner and smart grocery list generator that reduces food waste by recommending meals based on available pantry items and dietary restrictions.",
    extractMock: {
      project_name: "PantryChef AI",
      assumptions: [
        "Users track pantry ingredients with expiration dates.",
        "LLM generates recipes based on available inventory.",
      ],
      requirements: [
        {
          key: "REQ-1",
          title: "Pantry Inventory Management",
          description:
            "Users track available ingredients, quantities, and expiration date alerts.",
        },
        {
          key: "REQ-2",
          title: "AI Recipe Synthesis Engine",
          description:
            "Synthesizes healthy recipes prioritizing expiring pantry ingredients.",
        },
        {
          key: "REQ-3",
          title: "Smart Grocery Shopping Cart",
          description:
            "Automatically generates shopping lists for missing ingredients required by chosen recipes.",
        },
      ],
      users: ["Home cooks", "Busy professionals"],
      constraints: [
        "Strict token limits on LLM generation",
        "Fast search queries",
      ],
      integrations: ["Gemini 2.5 LLM", "PostgreSQL Full-Text Search"],
    },
    architectureMock: {
      stack: {
        frontend: "React Vite",
        backend: "FastAPI Python",
        database: "PostgreSQL",
        hosting: "Render",
        other: ["Gemini 2.5 API"],
      },
      modules: [
        {
          name: "Pantry Inventory Service",
          responsibility:
            "Manage food items, stock levels, and expiration alerts",
          requirement_keys: ["REQ-1"],
        },
        {
          name: "Recipe Generation Service",
          responsibility:
            "Orchestrate Gemini LLM calls with dietary prompt constraints",
          requirement_keys: ["REQ-2"],
        },
        {
          name: "Shopping List Cart Service",
          responsibility:
            "Calculate ingredient differences and manage shopping checklists",
          requirement_keys: ["REQ-3"],
        },
      ],
      assumptions: [
        "FastAPI backend interfaces with Gemini API.",
        "PostgreSQL stores inventory records and cached recipe outputs.",
      ],
      interactions: [
        "React frontend queries FastAPI for pantry inventory.",
        "Recipe generator pulls expiring ingredients to feed LLM context.",
      ],
      summary:
        "AI-first food sustainability platform reducing household grocery waste.",
    },
    decomposeMock: {
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "FastAPI & React Monorepo Setup",
          type: "setup",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["docker-compose.yml", "package.json", "pyproject.toml"],
          explanation:
            "Configures full-stack monorepo with containerized database.",
        },
        {
          node_key: "02.1",
          phase: "02",
          title: "Pantry & Recipe Database Schema",
          type: "database",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["alembic/versions/001_pantry.py"],
          explanation:
            "PostgreSQL tables for ingredients, expiration dates, and recipes.",
        },
        {
          node_key: "02.2",
          phase: "02",
          title: "Gemini Recipe Client Service",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["app/services/llm.py"],
          explanation:
            "Gemini client generating meal plans tailored to available inventory.",
        },
        {
          node_key: "02.3",
          phase: "02",
          title: "Pantry Inventory REST API",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["app/routers/pantry.py"],
          explanation:
            "CRUD endpoints for pantry stock and expiration queries.",
        },
        {
          node_key: "03.1",
          phase: "03",
          title: "Interactive Pantry Grid View",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["src/components/PantryGrid.tsx"],
          explanation:
            "Interactive pantry inventory grid with expiration color flags.",
        },
        {
          node_key: "03.2",
          phase: "03",
          title: "Smart Grocery Shopping Cart",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-3",
          files: ["src/components/ShoppingList.tsx"],
          explanation:
            "Checklist displaying missing recipe items ready for purchase.",
        },
        {
          node_key: "04.1",
          phase: "04",
          title: "Recipe Pipeline Integration Tests",
          type: "testing",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["tests/test_recipe_flow.py"],
          explanation:
            "Validates recipe generation using mock inventory inputs.",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.3", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.3", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "02.2", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "03.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.2", type: "DEPENDS_ON" },
      ],
    },
    criteriaMock: {
      "01.1": {
        acceptance: [
          "docker-compose boots FastAPI, React, and Postgres successfully.",
          "Health check endpoint returns status healthy on port 8000.",
        ],
        tests: [
          "docker compose up starts all services cleanly",
          "GET /health returns HTTP 200 with status ok",
          "Frontend dev server compiles without build errors",
        ],
      },
      "02.1": {
        acceptance: [
          "Alembic migration creates pantry_items and recipes tables with proper indexes.",
          "Expiration date column supports efficient sorting and range queries.",
        ],
        tests: [
          "alembic upgrade head executes without error",
          "Inserting ingredient with past date validates properly",
          "Index on expiration_date speeds up queries",
        ],
      },
      "02.2": {
        acceptance: [
          "Gemini client builds structured recipe prompts with fallback schemas.",
          "Rejects generation requests when prompt tokens exceed safe thresholds.",
        ],
        tests: [
          "LLM service generates valid recipe json",
          "Handles transient 503 errors with exponential backoff",
          "Empty pantry produces fallback pantry-restock recipes",
        ],
      },
      "02.3": {
        acceptance: [
          "GET /api/pantry returns sorted ingredients by nearest expiration date.",
          "POST /api/pantry validates item quantity and category.",
        ],
        tests: [
          "GET /api/pantry returns items ordered by expiration",
          "POST /api/pantry with negative quantity returns 422",
          "DELETE /api/pantry/:id removes item from database",
        ],
      },
      "03.1": {
        acceptance: [
          "Pantry grid highlights items expiring within 48 hours in amber/red.",
          "Inline quantity increment/decrement syncs with backend instantly.",
        ],
        tests: [
          "PantryGrid renders list of active ingredients",
          "Expiring item displays visual urgency indicator",
          "Quantity adjustment triggers optimistic state update",
        ],
      },
      "03.2": {
        acceptance: [
          "Shopping list automatically groups missing recipe items by grocery aisle.",
          "Checking off an item updates local and cloud checklist state.",
        ],
        tests: [
          "ShoppingList populates missing ingredients accurately",
          "Toggle item completes checkbox state",
          "Export button copies formatted checklist to clipboard",
        ],
      },
      "04.1": {
        acceptance: [
          "Full pipeline test: add pantry items -> generate recipe -> verify shopping list.",
          "All assertions pass cleanly under automated CI test environment.",
        ],
        tests: [
          "test_pantry_flow_integration verifies end-to-end flow",
          "test_recipe_missing_items_calculation asserts correct diff",
          "test_dietary_restriction_filtering enforces gluten-free rules",
        ],
      },
    },
  },

  // ---------------------------------------------------------------------------
  // 3. Developer Kubernetes CLI Dashboard
  // ---------------------------------------------------------------------------
  {
    id: "30000000-0000-4000-8000-000000000000",
    name: "Developer Kubernetes CLI Dashboard",
    idea: "A terminal-based Kubernetes monitoring dashboard in Go that discovers cluster contexts, polls pod resource metrics, and streams live container logs.",
    extractMock: {
      project_name: "KubeLens CLI",
      assumptions: [
        "Reads standard ~/.kube/config files.",
        "Runs directly in user terminal emulator via TUI.",
      ],
      requirements: [
        {
          key: "REQ-1",
          title: "Kubeconfig Context Discovery",
          description:
            "Discovers cluster contexts from local kubeconfig and supports instant switching.",
        },
        {
          key: "REQ-2",
          title: "Pod Health & Resource Metrics Poller",
          description:
            "Monitors real-time pod statuses, CPU/memory consumption, and crash-loop warnings.",
        },
        {
          key: "REQ-3",
          title: "Real-Time Container Log Streamer",
          description:
            "Streams live logs from selected container pods with search and regex filters.",
        },
      ],
      users: ["Kubernetes developers", "Site Reliability Engineers"],
      constraints: [
        "Zero persistent backend required",
        "Terminal ANSI rendering",
      ],
      integrations: ["k8s.io/client-go", "Bubbletea TUI"],
    },
    architectureMock: {
      stack: {
        frontend: "Bubbletea TUI",
        backend: "Go 1.22 client-go",
        database: "In-Memory LRU Cache",
        hosting: "Local Binary",
        other: ["k8s.io/client-go"],
      },
      modules: [
        {
          name: "Context Discovery Service",
          responsibility: "Parse kubeconfig and initialize cluster clients",
          requirement_keys: ["REQ-1"],
        },
        {
          name: "Pod Informer & Metrics Poller",
          responsibility: "Stream pod lifecycle events and resource usage",
          requirement_keys: ["REQ-2"],
        },
        {
          name: "Container Log Streamer",
          responsibility:
            "Multiplex container stdout/stderr streams to terminal buffer",
          requirement_keys: ["REQ-3"],
        },
      ],
      assumptions: [
        "Go binary runs natively on macOS, Linux, and Windows.",
        "Client uses read-only Kubernetes RBAC permissions.",
      ],
      interactions: [
        "Bubbletea TUI model queries client-go informers via channels.",
        "Log streamer writes directly to TUI viewport viewport buffer.",
      ],
      summary:
        "Blazing-fast terminal Kubernetes cluster monitor and diagnostic tool.",
    },
    decomposeMock: {
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "Go Module & CLI Scaffolding",
          type: "setup",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["go.mod", "main.go"],
          explanation:
            "Initializes Go CLI application and dependency management.",
        },
        {
          node_key: "02.1",
          phase: "02",
          title: "Kubeconfig Context Discovery Client",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["pkg/k8s/context.go"],
          explanation:
            "Parses local kubeconfig and manages active cluster credentials.",
        },
        {
          node_key: "02.2",
          phase: "02",
          title: "Pod Informer & Metrics Poller",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["pkg/k8s/pods.go"],
          explanation:
            "Watches pod events and resource metrics via Kubernetes informers.",
        },
        {
          node_key: "03.1",
          phase: "03",
          title: "Live Container Log Streamer",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-3",
          files: ["pkg/k8s/logs.go"],
          explanation:
            "Streams logs from active pod containers with buffering.",
        },
        {
          node_key: "03.2",
          phase: "03",
          title: "Bubbletea TUI Dashboard Layout",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["pkg/tui/dashboard.go"],
          explanation:
            "Interactive terminal UI dashboard with split-pane view.",
        },
        {
          node_key: "04.1",
          phase: "04",
          title: "CLI Binary Packaging & Smoke Tests",
          type: "deployment",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["Makefile", "pkg/k8s/k8s_test.go"],
          explanation:
            "Cross-compiles binary distributions and runs CLI smoke tests.",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "02.2", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "03.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.2", type: "DEPENDS_ON" },
      ],
    },
    criteriaMock: {
      "01.1": {
        acceptance: [
          "go build succeeds with zero compiler warnings.",
          "CLI accepts standard --help and --version flags.",
        ],
        tests: [
          "go test ./... passes on fresh checkout",
          "main executable returns version number",
          "Root flags initialize default configuration",
        ],
      },
      "02.1": {
        acceptance: [
          "Discovers all cluster contexts present in ~/.kube/config.",
          "Gracefully warns user if kubeconfig file is missing or unreadable.",
        ],
        tests: [
          "LoadKubeconfig returns parsed context list",
          "SwitchContext sets active cluster client",
          "Handles empty kubeconfig path with descriptive error",
        ],
      },
      "02.2": {
        acceptance: [
          "Informer receives real-time pod addition, update, and deletion events.",
          "Identifies CrashLoopBackOff states and raises warning status flag.",
        ],
        tests: [
          "Pod informer stores active namespace pods",
          "Pod state machine classifies Running vs Error correctly",
          "CPU metrics parse milli-cores into human-readable percent",
        ],
      },
      "03.1": {
        acceptance: [
          "Streams container logs with continuous tailing without memory leaks.",
          "Search filter filters log lines by regex matching in real time.",
        ],
        tests: [
          "StreamLogs pipes container reader into channel",
          "Context cancellation gracefully shuts down stream reader",
          "Regex matcher filters matching log entries",
        ],
      },
      "03.2": {
        acceptance: [
          "TUI renders split panes for pod list, metrics, and live log viewer.",
          "Keyboard shortcuts (tab, arrows, q) navigate panes reliably.",
        ],
        tests: [
          "Dashboard model initializes with default dimensions",
          "KeyMsg 'q' emits tea.Quit command",
          "Resizing terminal adjusts pane viewport widths",
        ],
      },
      "04.1": {
        acceptance: [
          "Makefile targets build binaries for darwin, linux, and windows.",
          "Automated integration test verifies mock cluster connection.",
        ],
        tests: [
          "make build outputs valid binary",
          "Mock k8s client test passes in CI",
          "Executable size complies with lightweight release budget",
        ],
      },
    },
  },

  // ---------------------------------------------------------------------------
  // 4. E-Commerce Multi-Vendor Marketplace
  // ---------------------------------------------------------------------------
  {
    id: "40000000-0000-4000-8000-000000000000",
    name: "E-Commerce Multi-Vendor Marketplace",
    idea: "A multi-vendor digital goods marketplace with store catalogs, customer shopping carts, checkout, and Stripe Connect split payments.",
    extractMock: {
      project_name: "MarketHub",
      assumptions: [
        "Multiple independent vendors sell products on a single storefront.",
        "Stripe Connect handles automatic payout splits to merchant accounts.",
      ],
      requirements: [
        {
          key: "REQ-1",
          title: "Vendor Storefront & Product Catalog",
          description:
            "Merchants can manage digital product listings, pricing, and vendor profiles.",
        },
        {
          key: "REQ-2",
          title: "Shopping Cart & Multi-Vendor Checkout",
          description:
            "Customers add items from multiple vendors into a unified cart and checkout.",
        },
        {
          key: "REQ-3",
          title: "Stripe Connect Split Payments",
          description:
            "Executes automated split payouts routing earnings to vendors while retaining marketplace fees.",
        },
      ],
      users: ["Merchants/Vendors", "Customers/Buyers", "Platform Admins"],
      constraints: [
        "PCI compliance via Stripe Elements",
        "Idempotent webhooks",
      ],
      integrations: ["Stripe Connect API", "Supabase Postgres"],
    },
    architectureMock: {
      stack: {
        frontend: "Next.js App Router",
        backend: "Next.js Route Handlers",
        database: "PostgreSQL Prisma",
        hosting: "Vercel",
        other: ["Stripe Connect SDK"],
      },
      modules: [
        {
          name: "Vendor Catalog Service",
          responsibility: "Manage product metadata, images, and inventory",
          requirement_keys: ["REQ-1"],
        },
        {
          name: "Cart & Checkout Service",
          responsibility: "Manage shopping sessions and coordinate orders",
          requirement_keys: ["REQ-2"],
        },
        {
          name: "Stripe Split Payment Engine",
          responsibility: "Process payments and dispatch vendor payouts",
          requirement_keys: ["REQ-3"],
        },
      ],
      assumptions: [
        "Prisma ORM connects to serverless PostgreSQL.",
        "Stripe webhooks sign and verify all payment events.",
      ],
      interactions: [
        "Buyer cart triggers CheckoutSession creation with transfer_data.",
        "Webhook receives payment_intent.succeeded and marks order paid.",
      ],
      summary:
        "Scalable multi-vendor digital commerce engine with automated split settlements.",
    },
    decomposeMock: {
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "Marketplace Scaffold & DB Setup",
          type: "setup",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["package.json", "prisma/schema.prisma"],
          explanation:
            "Configures project dependencies, linting, and Prisma client.",
        },
        {
          node_key: "02.1",
          phase: "02",
          title: "Vendor Product Catalog Tables",
          type: "database",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["prisma/migrations/001_catalog.sql"],
          explanation:
            "Database schema for vendors, product items, and categories.",
        },
        {
          node_key: "02.2",
          phase: "02",
          title: "Cart & Order Management API",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/app/api/cart/route.ts"],
          explanation:
            "Endpoints for session carts, item updates, and order generation.",
        },
        {
          node_key: "03.1",
          phase: "03",
          title: "Stripe Connect Payment Webhooks",
          type: "integration",
          status: "not_started",
          requirement_key: "REQ-3",
          files: ["src/app/api/webhooks/stripe/route.ts"],
          explanation:
            "Handles Stripe Connect split payments and webhook signatures.",
        },
        {
          node_key: "03.2",
          phase: "03",
          title: "Product Browsing & Checkout UI",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/app/checkout/page.tsx"],
          explanation:
            "Customer shopping cart, vendor attribution, and payment screen.",
        },
        {
          node_key: "04.1",
          phase: "04",
          title: "Marketplace Checkout E2E Tests",
          type: "testing",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["tests/marketplace.spec.ts"],
          explanation: "End-to-end checkout and split payment test suite.",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.2", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "03.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.2", type: "DEPENDS_ON" },
      ],
    },
    criteriaMock: {
      "01.1": {
        acceptance: [
          "Prisma CLI generates types matching schema.prisma.",
          "Next.js build script executes without missing dependency errors.",
        ],
        tests: [
          "npx prisma generate generates valid TypeScript client",
          "Environment template contains STRIPE_SECRET_KEY placeholders",
          "Next.js dev server boots successfully",
        ],
      },
      "02.1": {
        acceptance: [
          "Database migration sets up vendors and products with unique SKU constraints.",
          "Foreign keys link products strictly to registered vendor accounts.",
        ],
        tests: [
          "Prisma migration creates vendors and products tables",
          "Duplicate SKU insert is rejected with unique constraint error",
          "Vendor deletion handles cascading product relationships correctly",
        ],
      },
      "02.2": {
        acceptance: [
          "POST /api/cart adds items and computes subtotal with tax.",
          "Rejects checkout attempt when cart is empty.",
        ],
        tests: [
          "Adding item updates cart total correctly",
          "Empty cart checkout returns 400 Bad Request",
          "Handles concurrent cart updates safely",
        ],
      },
      "03.1": {
        acceptance: [
          "Stripe webhook verifies stripe-signature header cryptographically.",
          "Transfers correct proportional payout amount to each vendor account.",
        ],
        tests: [
          "Valid webhook signature processes order fulfillment",
          "Invalid signature returns HTTP 400 immediately",
          "Split calculation computes platform take-rate percentage accurately",
        ],
      },
      "03.2": {
        acceptance: [
          "Checkout UI renders Stripe Elements embedded payment input.",
          "Displays clear breakdown of items grouped by vendor.",
        ],
        tests: [
          "Checkout page renders cart items and totals",
          "Stripe Elements mount successfully in DOM",
          "Card decline displays informative error banner",
        ],
      },
      "04.1": {
        acceptance: [
          "Simulated buyer purchases products from 2 distinct vendors in one order.",
          "Asserts order created and vendor balances updated.",
        ],
        tests: [
          "Multi-vendor checkout test verifies split payout calls",
          "Webhook retry test verifies idempotent order processing",
          "Refund flow test reverses marketplace fee and vendor payout",
        ],
      },
    },
  },

  // ---------------------------------------------------------------------------
  // 5. Telehealth Patient Video Consultation Platform
  // ---------------------------------------------------------------------------
  {
    id: "50000000-0000-4000-8000-000000000000",
    name: "Telehealth Patient Video Consultation Platform",
    idea: "A HIPAA-compliant telehealth platform with patient doctor scheduling, WebRTC peer-to-peer video rooms, and encrypted e-prescriptions.",
    extractMock: {
      project_name: "TeleCare Health",
      assumptions: [
        "Patients and doctors join video consultations via browser WebRTC.",
        "Medical records and prescriptions require encryption at rest.",
      ],
      requirements: [
        {
          key: "REQ-1",
          title: "Patient & Doctor Appointment Booking",
          description:
            "Enables patients to browse doctor availability and book appointment slots.",
        },
        {
          key: "REQ-2",
          title: "WebRTC Video Consultation Room",
          description:
            "Provides secure, encrypted peer-to-peer audio/video streaming room for appointments.",
        },
        {
          key: "REQ-3",
          title: "Encrypted E-Prescriptions & Records",
          description:
            "Doctors issue digital prescriptions with cryptographic signing and encrypted storage.",
        },
      ],
      users: ["Patients", "Licensed Physicians", "Clinical Staff"],
      constraints: [
        "HIPAA compliance guidelines",
        "End-to-end encrypted media",
      ],
      integrations: ["WebRTC / LiveKit", "AWS KMS or Vault", "PostgreSQL"],
    },
    architectureMock: {
      stack: {
        frontend: "Next.js App Router",
        backend: "Node.js WebSocket Server",
        database: "Postgres",
        hosting: "Vercel & Fly.io",
        other: ["WebRTC Signaling", "KMS Encryption"],
      },
      modules: [
        {
          name: "Appointment Scheduling Service",
          responsibility: "Manage physician availability slots and bookings",
          requirement_keys: ["REQ-1"],
        },
        {
          name: "WebRTC Video Signaling Gateway",
          responsibility: "Exchange SDP offers, answers, and ICE candidates",
          requirement_keys: ["REQ-2"],
        },
        {
          name: "Encrypted Health Records Vault",
          responsibility: "Store encrypted clinical notes and e-prescriptions",
          requirement_keys: ["REQ-3"],
        },
      ],
      assumptions: [
        "Next.js handles portal UI and appointment APIs.",
        "Dedicated signaling server coordinates WebRTC handshakes.",
      ],
      interactions: [
        "Client requests time-limited room token from appointment service.",
        "Browser connects to signaling server to establish peer-to-peer video.",
      ],
      summary:
        "HIPAA-compliant telehealth consultation portal with real-time video streaming.",
    },
    decomposeMock: {
      nodes: [
        {
          node_key: "01.1",
          phase: "01",
          title: "HIPAA-Compliant Workspace Scaffolding",
          type: "setup",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["package.json", ".env.example"],
          explanation:
            "Workspace setup with security headers and encryption libs.",
        },
        {
          node_key: "02.1",
          phase: "02",
          title: "Encrypted Medical Records & Appointments Schema",
          type: "database",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["src/lib/db/schema.sql"],
          explanation:
            "PostgreSQL tables for bookings, doctor slots, and encrypted prescriptions.",
        },
        {
          node_key: "02.2",
          phase: "02",
          title: "Appointment Booking & Slot Validation API",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-1",
          files: ["src/server/appointments.ts"],
          explanation:
            "Endpoints for calendar slot discovery and double-booking prevention.",
        },
        {
          node_key: "02.3",
          phase: "02",
          title: "WebRTC Signaling WebSocket Service",
          type: "backend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/server/webrtc.ts"],
          explanation:
            "WebSocket signaling service for SDP offer/answer exchanges.",
        },
        {
          node_key: "03.1",
          phase: "03",
          title: "Secure Patient-Doctor Video Room UI",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["src/app/consultation/[id]/page.tsx"],
          explanation:
            "Secure in-browser video calling interface with mic/cam toggles.",
        },
        {
          node_key: "03.2",
          phase: "03",
          title: "E-Prescription Viewer & Doctor Notes UI",
          type: "frontend",
          status: "not_started",
          requirement_key: "REQ-3",
          files: ["src/app/prescriptions/page.tsx"],
          explanation:
            "E-prescription creation and signed document vault viewer.",
        },
        {
          node_key: "04.1",
          phase: "04",
          title: "WebRTC Signaling & Security Tests",
          type: "testing",
          status: "not_started",
          requirement_key: "REQ-2",
          files: ["tests/webrtc.test.ts"],
          explanation:
            "Verifies peer connectivity, token verification, and encryption.",
        },
      ],
      edges: [
        { from_node: "02.1", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "02.2", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "02.3", to_node: "01.1", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.3", type: "DEPENDS_ON" },
        { from_node: "03.1", to_node: "02.2", type: "DEPENDS_ON" },
        { from_node: "03.2", to_node: "02.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.1", type: "DEPENDS_ON" },
        { from_node: "04.1", to_node: "03.2", type: "DEPENDS_ON" },
      ],
    },
    criteriaMock: {
      "01.1": {
        acceptance: [
          "Security headers (HSTS, CSP, X-Frame-Options) configure correctly.",
          "Crypto libraries for field-level encryption initialize properly.",
        ],
        tests: [
          "Security header middleware injects strict CSP",
          "Crypto initialization generates valid envelope keys",
          "TypeScript typecheck passes across server and client files",
        ],
      },
      "02.1": {
        acceptance: [
          "Medical records schema enforces encrypted ciphertext columns.",
          "Doctor appointment slots prevent overlapping bookings with unique index.",
        ],
        tests: [
          "Schema migration executes cleanly",
          "Double-booking appointment slot triggers constraint error",
          "Audit trail table logs all record access attempts",
        ],
      },
      "02.2": {
        acceptance: [
          "Slot validation endpoint returns available physician hours accurately.",
          "Booking confirmation generates unique time-limited room token.",
        ],
        tests: [
          "GET /api/slots returns open appointment windows",
          "Booking slot locks slot for pending payment",
          "Expired room token is rejected on room entry",
        ],
      },
      "02.3": {
        acceptance: [
          "Signaling server authenticates room tokens before forwarding SDP packets.",
          "Cleanly terminates session when consultation time limit expires.",
        ],
        tests: [
          "Signaling relay forwards SDP offer to target peer",
          "Unauthorized token is immediately disconnected with 4401 code",
          "ICE candidate exchange connects two simulated peers",
        ],
      },
      "03.1": {
        acceptance: [
          "Video room UI renders remote and local camera video elements.",
          "Mute audio and disable camera buttons function without tearing connection.",
        ],
        tests: [
          "Consultation room mounts with local video track",
          "Toggle audio muting updates track enabled state",
          "Call end button cleans up peer connection and redirects",
        ],
      },
      "03.2": {
        acceptance: [
          "Doctor can submit digital prescription with dosage instructions.",
          "Patient sees decryptable prescription with verified physician signature.",
        ],
        tests: [
          "Prescription form validates medication dosage inputs",
          "Patient view renders decrypted prescription summary",
          "Download PDF button generates signed prescription document",
        ],
      },
      "04.1": {
        acceptance: [
          "Automated test verifies complete WebRTC signaling handshake.",
          "Field-level encryption test confirms ciphertext stored at rest in DB.",
        ],
        tests: [
          "Signaling test confirms peer-to-peer exchange succeeds",
          "Ciphertext inspection confirms plain text is never persisted",
          "Token expiry test prevents unauthorized post-call entry",
        ],
      },
    },
  },
];
