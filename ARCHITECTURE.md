# System Architecture Documentation: AutoDocs Core Engine

## 1. System Overview & Purpose

**AutoDocs** is an autonomous, commit-driven AI documentation platform. It monitors connected GitHub repositories via Webhooks and GitHub App integrations, analyzes code diffs, evaluates documentation drift using LLM judges, generates production-grade architectural documentation (`ARCHITECTURE.md`), and automatically submits consolidated Pull Requests to upstream repositories.

### Core Functional Capabilities
- **Automated Repository Onboarding**: Connects to GitHub App installations, performs shallow clones (`--depth 1`), scans repository inventory, and generates initial documentation.
- **Webhook Diff Classification**: Receives GitHub `push` webhooks, verifies HMAC signatures, evaluates changed files, and invokes a lightweight LLM Judge to determine if documentation updates are required.
- **LLM Context Caching**: Utilizes provider-level prompt caching (Google GenAI Caches) keyed by user, repository, task, and commit SHA to reduce token latency and compute costs during iterative updates.
- **Automated Branch & PR Management**: Commits generated documentation to dedicated branches (`auto-Docs`), force-pushes consolidated changes, and opens or updates GitHub Pull Requests.
- **Credit-Based Monetization & Billing**: Deducts credits for LLM usage with configurable margin markups ($0.01/credit base rate) and tracks immutable transaction ledgers.

---

## 2. Architectural Patterns & Core Technology Stack

### Architectural Style
The system follows an **Asynchronous, Event-Driven Queue-Worker Architecture** coupled with a RESTful Express.js API backend.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                AUTODOCS ENGINE                                   │
│                                                                                  │
│  ┌───────────────────────────┐                ┌──────────────────────────────┐  │
│  │    Express.js API Server  │                │      BullMQ Async Workers    │  │
│  │  - Auth (OAuth / JWT)       │  Enqueues      │  - storage.worker.ts         │  │
│  │  - Webhook Endpoint       │───────────────>│  - webhook.worker.ts         │  │
│  │  - REST Resources & SSE   │  Jobs via      │  - docgen.worker.ts          │  │
│  └─────────────┬─────────────┘  Redis Queues  └──────────────┬───────────────┘  │
│                │                                             │                  │
│                ▼                                             ▼                  │
│  ┌───────────────────────────┐                ┌──────────────────────────────┐  │
│  │   PostgreSQL 17 Database  │                │   Local Disk Storage & Git   │  │
│  │   (Prisma ORM Persistence)│                │   (codebases/<repo_id>/)     │  │
│  └───────────────────────────┘                └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Technology Roster
- **Runtime Environment**: Node.js 22 (Alpine Linux base image with native `git` CLI installed).
- **Language**: TypeScript (Target: `ES2022`, Module System: `NodeNext`).
- **HTTP & Routing**: Express v5 (`express`), CORS, Cookie Parser.
- **Database & Persistence**: PostgreSQL 17, Prisma ORM v7 (`@prisma/client`, `@prisma/adapter-pg`).
- **Queue & Async Processing**: BullMQ v6, Redis 8 (`ioredis`).
- **Git & GitHub Integrations**: `simple-git` CLI execution wrapper, Octokit SDK (`@octokit/rest`, `@octokit/auth-app`).
- **AI & LLM Integration**: Google GenAI SDK (`@google/genai`), Zod schema validation (`zod`, `zod-to-json-schema`), Token counting (`tiktoken`).
- **Authentication & Security**: JSON Web Tokens (`jsonwebtoken`), Bcrypt password/session hashing (`bcrypt`), HMAC SHA-256 Webhook Verification.

---

## 3. Directory Structure & Module Boundaries

```
.autoDocs/
├── src/
│   ├── index.ts                   # Application entrypoint & worker bootstrapper
│   ├── admin/                     # Master admin dashboard, user & queue telemetry
│   ├── auth/                      # OAuth (GitHub/Google), JWT issuance, refresh sessions
│   ├── billing/                   # Credit balance, ledger transactions, grant requests
│   ├── config/                    # Zod env schema validation, Redis connection options
│   ├── dashboard/                 # Metrics aggregator for user frontend views
│   ├── github/                    # Webhook handlers, App setup, Git operations & PR creation
│   ├── jobs/                      # Pipeline execution history, job retries, SSE streaming
│   ├── LLM/                       # LLM Provider abstraction, model roster, prompt management & context cache
│   │   ├── config/                # Task binding configs (tinyRepo, judge, docsGenerator)
│   │   ├── models/                # LLM Model Roster CRUD
│   │   ├── prompts/               # System prompt template management
│   │   └── providers/             # Gemini provider implementation & JSON repair parser
│   ├── middleware/                # Error handling, JWT authentication, RBAC admin authorization
│   ├── pipeline/                  # Core documentation generation pipeline
│   │   ├── pipeline.orchestrator.ts# Pipeline orchestration routines
│   │   └── stages/                # L1 inventory scanner, L2 diff judge, L4 docs generator
│   ├── prisma/                    # Prisma client initialization, schema, and migrations
│   ├── queue/                     # BullMQ definitions & publisher helper functions
│   ├── repo/                      # Repository management, generated document fetching
│   ├── search/                    # Global search across repositories, jobs, and users
│   ├── usage/                     # Per-repository and per-user token/cost metrics
│   ├── user/                      # User profile fetching and modification
│   ├── utils/                     # Path helpers, async handler, HMAC verification, logger
│   └── worker/                    # BullMQ background workers (Storage, Webhook, DocGen)
├── Dockerfile                     # Production Node 22 + Alpine + Git image build
├── docker-compose.yml             # Local development environment configuration
└── docker-compose.prod.yml        # Production stack composition with shared Postgres/Redis
```

---

## 4. Data Models & Persistence Architecture

Data persistence is managed via PostgreSQL and defined in `src/prisma/schema.prisma`.

```mermaid
erDiagram
    User ||--o{ RefreshSession : 