# DESIGN.md — AutoDocs Frontend Blueprint & API Verification

## 1. Executive Summary & Design Philosophy

**AutoDocs** is an autonomous, commit-driven AI documentation platform. The design system follows the **"Precision in Darkness"** obsidian theme: developer-grade, dark-mode-first UI built with near-black surfaces, high-contrast typography, emerald status indicators, and subtle glassmorphic blurs.

This document extracts the complete UI blueprint from the **AutoDocs Frontend Blueprint** Google Stitch project (`projects/16237843663965017966`), documents design tokens, layout structures, cards & data components, verifies backend database endpoints, and lists endpoints still required for complete UI feature parity.

---

## 2. Design Tokens System

### 2.1 Color System (Obsidian Dark Theme)
The application utilizes a dark zinc/slate palette paired with soft violet interactive accents and emerald green status indicators.

| Token Name | Hex Code | Purpose / Application |
| :--- | :--- | :--- |
| `background` | `#09090b` | True near-black root viewport background |
| `primary` | `#a78bfa` | Soft Violet — CTAs, active states, links, focus rings |
| `primary-container` | `#7c3aed` | Filled primary badges, solid highlight fills |
| `on-primary-container` | `#ede9fe` | Text on primary container fills |
| `tertiary` | `#34d399` | Emerald Green — Success badges, online indicators, positive metrics |
| `tertiary-container` | `#065f46` | Emerald background pills & success containers |
| `on-tertiary-container` | `#bbf7d0` | Text on emerald container fills |
| `surface-dim` / `surface` | `#0c0c0f` | Main card background surfaces |
| `surface-container-lowest` | `#09090b` | Inputs, code blocks, terminal backgrounds |
| `surface-container-low` | `#0f0f12` | Sidebar background, secondary container fills |
| `surface-container` | `#121215` | Default card and table container fill |
| `surface-container-high` | `#18181b` | Elevated cards, header bars, table headers |
| `surface-container-highest` | `#1e1e22` | Hover states, tab triggers, active item pills |
| `surface-bright` | `#18181b` | Highlighting active interactive surfaces |
| `outline` | `#52525b` | Input borders, visible card strokes |
| `outline-variant` | `#27272a` | Subtle dividers, card borders (1px solid) |
| `on-surface` | `#fafafa` | Primary text — crisp high-contrast white |
| `on-surface-variant` | `#a1a1aa` | Secondary body text, descriptions |
| `secondary` | `#71717a` | Muted labels, timestamps, metadata text |
| `error` | `#ef4444` | Danger actions, failed pipeline execution badges |
| `error-container` | `#3b1111` | Background fill for error banners and badges |

### 2.2 Typography
- **Headlines & Body**: `Geist` sans-serif (Modern, clean, tight heading tracking `-0.02em`).
- **Code & Tabular Data**: `JetBrains Mono` / monospace for SHAs, code diffs, logs, credit counts, and timestamps.

### 2.3 Elevation, Glassmorphism & Borders
- **Borders over Shadows**: Clean 1px borders (`1px solid #27272a`) define layout regions instead of heavy drop shadows.
- **Glassmorphism**: Translucent floating containers feature `backdrop-blur-xl` and `backdrop-blur-2xl` overlays over background ambient glows.

---

## 3. Screen Inventory & Layout Structures

The Google Stitch project **AutoDocs Frontend Blueprint** contains 10 distinct screens:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 AUTODOCS FRONTEND SHELL                                 │
├──────────────────────────────────────┬─────────────────────────────────────────────────┤
│ SIDEBAR NAVIGATION (256px Fixed)     │ HEADER BAR (Sticky 64px)                        │
│ - Brand Logo & Version (v1.0)        │ - Search Input (⌘K)                             │
│ - Navigation Links:                  │ - Credit Balance Pill (45 ⚡)                    │
│   • Dashboard                        │ - Manage GitHub App Link                        │
│   • Repositories                     │ - Notifications Bell & Profile Avatar           │
│   • Jobs & Logs                      ├─────────────────────────────────────────────────┤
│   • Billing & Credits                │ MAIN CONTENT CANVAS                             │
│   • Admin Console (Admin Only)       │ - Screen-Specific View Components               │
│ - Active Balance Widget (45 ⚡)       │                                                 │
│ - User Profile Widget                │                                                 │
└──────────────────────────────────────┴─────────────────────────────────────────────────┘
```

### Screen List:
1. **AutoDocs Authentication** (`7b5eb6fe49574d6690d603f63e6be83e`)
2. **GitHub App Onboarding** (`cb67dea9111c4dd9ad80b0d2ae627718`)
3. **Repositories Hub** (`98e9816435d640ea87a31d022b12259c`)
4. **Repository Details & Docs Viewer** (`257fc2218efe4a9393550380e6a49801`)
5. **Jobs & Execution Logs** (`e67f13bc4eed4991a174d59eebeeb7ed`)
6. **Admin Master Dashboard** (`f1b8833bf52a4eb08c5b13251b5dc59a`)
7. **Billing & Credit Requests** (`705085e293a34e548e3aea65f1f8292f`)
8. **LLM & Pipeline Configuration** (`4e33522761ab4a66874e248f6efd91b1`)
9. **AutoDocs Main Dashboard** (`63646d18ae4346038bc56c21786b7771`)
10. **Autonomous Documentation Platform Hero** (`3cf8807b5dc048249fa794d997e30fca`)

---

## 4. Screen Cards & Data Breakdown vs Backend API Audit

### Screen 1: AutoDocs Authentication
- **Layout**: Centered Glassmorphic Auth Portal on Dark Ambient Grid.
- **Card 1 — Glass Auth Card**:
  - *Data Displayed*: Logo mark, Title, Tagline ("Zero Manual Synced Docs"), Promo pill ("20 Free Credits"), GitHub OAuth CTA, Google OAuth CTA, SOC2 compliance badges.
  - *Backend Endpoint Verification*:
    - `GET /auth/github` — Initiate GitHub OAuth **[EXISTS]**
    - `GET /auth/github/callback` — Complete GitHub OAuth **[EXISTS]**
    - `GET /auth/google` — Initiate Google OAuth **[EXISTS]**
    - `GET /auth/google/callback` — Complete Google OAuth **[EXISTS]**
    - `POST /auth/refresh` — Refresh JWT tokens **[EXISTS]**
    - `POST /auth/logout` — Revoke session **[EXISTS]**

---

### Screen 2: GitHub App Onboarding
- **Layout**: Centered Onboarding Stepper Wizard Card inside App Shell.
- **Card 1 — Onboarding Stepper**:
  - *Data Displayed*: 3-Step Progress (1. Authenticate -> 2. Install GitHub App -> 3. Sync Repos), installation status pill (`app.install_pending :: githubInstallationId == null`).
- **Card 2 — App Connect Card**:
  - *Data Displayed*: App avatar, permissions overview, "Install & Authorize GitHub App" CTA button.
  - *Backend Endpoint Verification*:
    - `GET /api/github/installation-status` — Check GitHub App installation state **[EXISTS]**
    - `GET /api/github/setup` — Browser callback after GitHub App installation **[EXISTS]**
    - `GET /api/github/accessible-repos` — Retrieve list of accessible GitHub repos **[EXISTS]**

---

### Screen 3: Repositories Hub
- **Layout**: 2-Section Stack (Imported Repositories Bento Table + Available GitHub Repositories Table).
- **Card 1 — Header Summary Banner**:
  - *Data Displayed*: Total active repositories count e.g. `4 Active Repositories`, sync hooks operational status.
- **Card 2 — Imported Repositories Table**:
  - *Data Displayed*: Repo name (`facebook/react`), privacy tag (`Private`/`Public`), main language stack, last job status (`COMPLETED`, `PR_OPEN #42`, `IDLE`), relative timestamp, total runs count (`1,248 runs`), action buttons (`Trigger Gen`, `Details`, `Review PR`).
- **Card 3 — Available GitHub Repositories Table**:
  - *Data Displayed*: Organization selector (`Acme Corp`), repo search input, repo full name (`org/awesome-backend`), default branch (`main`), size (`14.2 MB`), access mode, language dot (`Go`), `Import Repo` action button.
  - *Backend Endpoint Verification*:
    - `GET /api/github/imported-repos` — Fetch user's imported repos **[EXISTS]**
    - `GET /api/github/accessible-repos` — Fetch unimported repos from GitHub App **[EXISTS]**
    - `POST /api/github/import-repo` — Import selected repository **[EXISTS]**
    - `DELETE /api/github/repo/:repoId` — Unlink imported repository **[EXISTS]**
    - `POST /api/repos/:repoId/trigger` — Manually trigger doc generation **[EXISTS]**

---

### Screen 4: Repository Details & Docs Viewer
- **Layout**: Header + 5-Step Pipeline Stepper + 70/30 Split Layout (Markdown Viewer / Historical Jobs).
- **Card 1 — Repo Breadcrumb & Action Header**:
  - *Data Displayed*: Repository name (`facebook/react`), branch (`main`), current commit SHA (`sha:e8f9a2b`), sync status badge (`Synchronized`), `Trigger Manual Doc Gen` button, `Delete Repo` button.
- **Card 2 — Pipeline Stepper Card**:
  - *Data Displayed*: Latest trigger commit message, PR link, 5 visual pipeline step nodes:
    1. Webhook Recv (240ms, 200 OK)
    2. Checkout (1.2s, shallow 1)
    3. AST Diff & Scan (14 files impacted)
    4. Gemini 1.5 Pro (4.8s, 28k tokens)
    5. PR Open on GitHub (Ready for review)
- **Card 3 — Markdown Document Viewer (70% Canvas)**:
  - *Data Displayed*: Document filename (`ARCHITECTURE.md`), updated time, search filter, copy button, rendered Markdown content, SVG architecture flowchart diagram, syntax-highlighted code blocks, package breakdown table.
- **Card 4 — Job History & Cost Sidebar (30% Canvas)**:
  - *Data Displayed*: Total LLM Cost (`$0.256`), Credits Consumed (`32 ⚡`), scrollable run history entries (`#JOB-8831`), status badges (`PR_OPEN`, `MERGED`, `FAILED`), commit SHA, cost per run, relative time.
  - *Backend Endpoint Verification*:
    - `GET /api/repos/:repoId` — Fetch repository details **[EXISTS]**
    - `GET /api/repos/:repoId/docs` — Fetch generated documentation content **[EXISTS]**
    - `POST /api/repos/:repoId/trigger` — Trigger doc generation **[EXISTS]**
    - `GET /api/jobs?repoId=:repoId` — Fetch job history filtered by repo **[EXISTS]**
    - `GET /api/usage/repo/:repoId` — Fetch usage cost for repo **[UNMOUNTED ROUTE - NEEDS MOUNTING]**

---

### Screen 5: Jobs & Execution Logs
- **Layout**: Telemetry Ribbon + Filter Bar + Split Table/Telemetry Drawer Layout.
- **Card 1 — Quick Metrics Ribbon**:
  - *Data Displayed*: Avg Latency (`3.12s`), Success Rate (`98.4%`), Burn Today (`18 ⚡`).
- **Card 2 — Filter & Search Bar**:
  - *Data Displayed*: Repo filter, Status filter (`COMPLETED`, `GENERATING`, `FAILED`, `INSUFFICIENT_CREDITS`), Search input (SHA/Job ID), Live Stream toggle.
- **Card 3 — Execution Stream Table**:
  - *Data Displayed*: Job ID (`#j-108`), Repository, Trigger Commit SHA, Status badge, Credits Used (`4 ⚡`), Created At, Action buttons (`Logs`, `Retry`).
- **Card 4 — Telemetry & LLM Logs Drawer (Right Panel)**:
  - *Data Displayed*: Selected job UUID, Task Key (`docGen`), Model (`gemini-1.5-pro`), Latency (`3,420 ms`), TTFT (`480ms`), Token Breakdown (Prompt: 4,200, Cached: 2,100, Input: 2,100, Output: 850), Result summary text, GitHub PR link, Live stdout terminal log stream.
  - *Backend Endpoint Verification*:
    - `GET /api/jobs` — Fetch paginated jobs list with filters **[EXISTS]**
    - `GET /api/jobs/:jobId` — Fetch single job details & LLM stdout logs **[EXISTS]**
    - `POST /api/jobs/:jobId/retry` — Re-queue failed job **[EXISTS]**
    - `GET /api/dashboard/stats` — Overall telemetry ribbon metrics **[EXISTS]**

---

### Screen 6: Admin Master Dashboard
- **Layout**: Superadmin Header + 4 KPI Cards + 3 BullMQ Queue Cards + Users Table + User Audit Modal.
- **Card 1-4 — Global KPI Metrics Cards**:
  - *Data Displayed*: Total Platform Users (`142`), Total Repos Connected (`389`), Total Doc Gen Jobs (`1,840`), Global LLM Spend (`$142.50`).
- **Card 5-7 — BullMQ Worker Infrastructure Cards**:
  - *Data Displayed*:
    - `repo-storage-queue`: Active: 0, Waiting: 0, Completed: 389, Failed: 1, p95 Latency: 240ms
    - `push-classify-queue`: Active: 1, Waiting: 2, Completed: 1,420, Failed: 3, p95 Latency: 110ms
    - `doc-generation-queue`: Active: 0, Waiting: 0, Completed: 0, Failed: 0, p95 Latency: 0ms
- **Card 8 — System Users Management Table**:
  - *Data Displayed*: Search input, Plan filter (`ALL`, `PRO`, `FREE`), User name, avatar, email, GitHub handle, connected repos count, jobs run count, plan badge, credit balance (`15 ⚡`), `Inspect Deep-Dive` action button.
- **Card 9 — User Deep-Dive Audit Modal**:
  - *Data Displayed*: Token quotas, BullMQ pipeline state, credit override status, webhook signature, impersonate session button.
  - *Backend Endpoint Verification*:
    - `GET /api/admin/stats` — Global KPIs & BullMQ queue telemetry **[EXISTS]**
    - `GET /api/admin/users` — List system users **[EXISTS]**
    - `GET /api/admin/users/:userId` — Detailed user audit payload **[EXISTS]**
    - `PATCH /api/admin/users/:userId/plan` — Upgrade/downgrade user plan **[EXISTS]**
    - `GET /api/admin/repos` — Global repo listing **[EXISTS]**
    - `GET /api/admin/jobs` — Global jobs listing **[EXISTS]**
    - `GET /api/admin/llm-logs` — Global LLM execution logs **[EXISTS]**

---

### Screen 7: Billing & Credit Requests
- **Layout**: Top 2-Card Layout (Balance + Grant Request Form) + Tabbed History (Requests vs Ledger).
- **Card 1 — Active Ledger Balance Card**:
  - *Data Displayed*: Current balance (`45 ⚡`), tier name (`Free Tier Active`), monthly allocation progress bar (`45 / 100 max monthly cap`), reset date, unit cost stats (`0.42 ⚡ / pull`), 7-day burn rate (`-12 ⚡`).
- **Card 2 — Request Credit Grant Form**:
  - *Data Displayed*: Credits Needed input, Reason textarea, Submit CTA button.
- **Card 3 — Dispatched Grant Requests Table**:
  - *Data Displayed*: Requested credits (`20 ⚡`), Status badge (`PENDING`, `APPROVED`), user reason, granted credits (`30 ⚡`), admin response text, submitted timestamp.
- **Card 4 — Immutable Credit Ledger Transactions Table**:
  - *Data Displayed*: Transaction date, Amount (`-4 ⚡`, `+20 ⚡`), Type (`USAGE_DEDUCTION`, `SIGNUP_GRANT`, `ADMIN_GRANT`), Description, linked Job ID link (`#j-108`).
  - *Backend Endpoint Verification*:
    - `GET /api/billing/summary` — Billing overview stats **[EXISTS]**
    - `GET /api/billing/balance` — Current credit balance **[EXISTS]**
    - `GET /api/billing/ledger` — Transaction ledger history **[EXISTS]**
    - `GET /api/billing/requests` — User grant request history **[EXISTS]**
    - `POST /api/billing/request` — Submit manual credit request **[EXISTS]**
    - `GET /api/billing/admin/requests` — Admin list all requests **[EXISTS]**
    - `POST /api/billing/admin/requests/:requestId/approve` — Admin approve request **[EXISTS]**
    - `POST /api/billing/admin/requests/:requestId/reject` — Admin reject request **[EXISTS]**
    - `POST /api/billing/admin/grant-direct` — Admin direct credit grant **[EXISTS]**

---

### Screen 8: LLM & Pipeline Configuration
- **Layout**: Header + Tabbed Interface (Task Pipeline Bindings vs Prompt Templates).
- **Card 1 — Task Pipeline Bindings Table**:
  - *Data Displayed*: Task Stage Key (`tinyRepo`, `judge`, `docGen`), Assigned Model (`Gemini 1.5 Flash`, `GPT-4o-mini`, `Gemini 1.5 Pro`), Provider (`Google`, `OpenAI`), Prompt Version (`v1.2`, `v2.0`, `v1.0`), Temperature (`0.2`, `0.0`, `0.3`), Max Tokens (`4096`, `1024`, `8192`), Status (`Active`), Edit CTA button.
- **Card 2 — Prompt Templates Library & Editor View**:
  - *Data Displayed*: Left list of registered prompt templates (`sys.docgen.ast-v1.0`), right editor panel with system prompt text area, dynamic variables (`{{repo_name}}`, `{{ast_diff_tree}}`), max output tokens, safety stop tokens, estimated cost, Save & Deploy CTA button.
- **Card 3 — Add Task Binding Modal**:
  - *Data Displayed*: Task stage key, model dropdown, provider, prompt version, temperature slider, max tokens.
  - *Backend Endpoint Verification*:
    - `GET /api/llm-config` / `GET /api/task-config` — List task configs **[EXISTS]**
    - `GET /api/llm-config/:taskKey` — Get single task config **[EXISTS]**
    - `POST /api/llm-config` — Create task config binding **[EXISTS]**
    - `PUT /api/llm-config` — Update task config binding **[EXISTS]**
    - `DELETE /api/llm-config/:taskKey` — Delete task config binding **[EXISTS]**
    - `GET /api/models` — List all registered LLM models **[EXISTS]**
    - `POST /api/models`, `PUT /api/models`, `DELETE /api/models` — Model CRUD **[EXISTS]**
    - `GET /api/prompts` — List prompt templates **[EXISTS]**
    - `GET /api/prompts/:promptKey` — Get single prompt template **[EXISTS]**
    - `POST /api/prompts`, `PUT /api/prompts/:promptId`, `DELETE /api/prompts/:promptId` — Prompt CRUD **[EXISTS]**

---

### Screen 9: AutoDocs Main Dashboard
- **Layout**: Header Banner + Status Banner + 4 Metric Cards + Quota/Feed Grid + Recent Jobs Table.
- **Card 1-4 — Overview Metric Cards**:
  - *Data Displayed*: Total Imported Repos (`3`), Doc Jobs Executed (`18`, sparkline), Active Pipelines (`2`), Open Pull Requests (`4`).
- **Card 5 — Monthly Quota Velocity Card**:
  - *Data Displayed*: Usage progress bar (`4/20 Docs Generated`), remaining quota (`16 Generations`), days until reset (`12 Days`), Upgrade button.
- **Card 6 — Live Webhook & Pipeline Feed Card**:
  - *Data Displayed*: Live polling indicator, event stream items (`push to main`, `PR #42 opened`, `PR #19 merged`) with timestamps.
- **Card 7 — Recent Documentation Jobs Table**:
  - *Data Displayed*: Repo name (`autodocs/core-engine`), Commit & Branch (`c7a19f2 main`), Status badge (`PR_OPEN`), Generated PR link (`#42`), Trigger time (`3 mins ago`), Actions (`Details`, `Refresh`).
  - *Backend Endpoint Verification*:
    - `GET /api/dashboard/stats` — Dashboard overview stats & metrics **[EXISTS]**
    - `GET /api/user/me` — User identity & quota info **[EXISTS]**
    - `GET /api/billing/balance` — Current credit balance **[EXISTS]**
    - `GET /api/jobs?limit=5` — Recent jobs listing **[EXISTS]**

---

## 5. API Endpoint Audit & Gap Analysis

### 5.1 Existing & Verified Endpoints
The backend implementation in `autoDocs-new` already contains a comprehensive API suite:

| Route Prefix | HTTP Method & Path | Controller Function | Status |
| :--- | :--- | :--- | :--- |
| `/auth` | `GET /auth/github` | `githubLogin` | Ready |
| `/auth` | `GET /auth/github/callback` | `githubCallback` | Ready |
| `/auth` | `GET /auth/google` | `googleLogin` | Ready |
| `/auth` | `GET /auth/google/callback` | `googleCallback` | Ready |
| `/auth` | `POST /auth/refresh` | `refresh` | Ready |
| `/auth` | `POST /auth/logout` | `logout` | Ready |
| `/api/user` | `GET /api/user/me` | `getMeController` | Ready |
| `/api/user` | `PATCH /api/user/me` | `updateMeController` | Ready |
| `/api/github` | `GET /api/github/installation-status` | `getInstallationStatus` | Ready |
| `/api/github` | `GET /api/github/accessible-repos` | `getAllAccessibleRepos` | Ready |
| `/api/github` | `GET /api/github/imported-repos` | `getImportedRepos` | Ready |
| `/api/github` | `POST /api/github/import-repo` | `importRepo` | Ready |
| `/api/github` | `DELETE /api/github/repo/:repoId` | `deleteRepo` | Ready |
| `/api/repos` | `GET /api/repos/:repoId` | `getRepoDetailsController` | Ready |
| `/api/repos` | `POST /api/repos/:repoId/trigger` | `triggerDocGenController` | Ready |
| `/api/repos` | `GET /api/repos/:repoId/docs` | `getRepoGeneratedDocsController` | Ready |
| `/api/jobs` | `GET /api/jobs` | `getJobsController` | Ready |
| `/api/jobs` | `GET /api/jobs/:jobId` | `getJobByIdController` | Ready |
| `/api/jobs` | `POST /api/jobs/:jobId/retry` | `retryJobController` | Ready |
| `/api/dashboard` | `GET /api/dashboard/stats` | `getDashboardStatsController` | Ready |
| `/api/billing` | `GET /api/billing/summary` | `getBillingSummaryController` | Ready |
| `/api/billing` | `GET /api/billing/balance` | `getCurrentBalanceController` | Ready |
| `/api/billing` | `GET /api/billing/ledger` | `getLedgerSummaryController` | Ready |
| `/api/billing` | `GET /api/billing/requests` | `getUserRequestsController` | Ready |
| `/api/billing` | `POST /api/billing/request` | `requestManualGrantController` | Ready |
| `/api/admin` | `GET /api/admin/stats` | `getAdminMasterStatsController` | Ready |
| `/api/admin` | `GET /api/admin/users` | `getAllUsersAdminController` | Ready |
| `/api/admin` | `GET /api/admin/users/:userId` | `getUserDetailsAdminController` | Ready |
| `/api/admin` | `PATCH /api/admin/users/:userId/plan` | `updateUserPlanAdminController` | Ready |
| `/api/admin` | `GET /api/admin/repos` | `getAllReposAdminController` | Ready |
| `/api/admin` | `GET /api/admin/jobs` | `getAllJobsAdminController` | Ready |
| `/api/admin` | `GET /api/admin/llm-logs` | `getLLMLogsAdminController` | Ready |
| `/api/llm-config` | `GET /api/llm-config` | `getAllConfigsController` | Ready |
| `/api/llm-config` | `POST /api/llm-config`, `PUT`, `DELETE` | `createTaskConfigController`, etc. | Ready |
| `/api/prompts` | `GET /api/prompts`, `POST`, `PUT`, `DELETE` | `promptController` CRUD | Ready |
| `/api/models` | `GET /api/models`, `POST`, `PUT`, `DELETE` | `modelsController` CRUD | Ready |

---

### 5.2 Unmounted / Missing Endpoints Required to Complete UI

To achieve 100% full frontend integration with zero mock fallbacks, the following endpoints need to be mounted or added:

#### 1. Mount Usage Router in `src/index.ts`
- **File**: `src/usage/usage.router.ts` (Already exists in codebase, but not imported in `index.ts`)
- **Required Action**: Mount `app.use("/api/usage", usageRouter);` in `src/index.ts`.
- **Endpoints Provided**:
  - `GET /api/usage/repo/:repoId` — Returns token consumption and cost breakdown for a specific repository.
  - `GET /api/usage/user/:userId` — Returns token consumption and cost breakdown for a user.

#### 2. Global Unified Search Endpoint (`GET /api/search`)
- **UI Requirement**: The top navigation header features a global search bar with `⌘K` shortcut ("Search repositories, logs, documentation...").
- **Required Endpoint**: `GET /api/search?q=:query`
- **Response Structure**:
```json
{
  "repositories": [ { "id": "...", "name": "facebook/react" } ],
  "jobs": [ { "id": "...", "sha": "e8f9a2b", "status": "COMPLETED" } ],
  "docs": [ { "repoId": "...", "path": "ARCHITECTURE.md" } ]
}
```

#### 3. Real-Time Telemetry Stream Endpoint (`GET /api/jobs/stream`)
- **UI Requirement**: The Jobs & Logs page and Main Dashboard feature a "Live Stream On" / "Live Webhook & Pipeline Feed" toggle.
- **Required Endpoint**: `GET /api/jobs/stream` (Server-Sent Events / SSE)
- **Functionality**: Streams real-time BullMQ job status changes (`push-classify-queue`, `doc-generation-queue`) and stdout log chunks directly to the UI client.
