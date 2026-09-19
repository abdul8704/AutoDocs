# AutoDocs Core Engine — System Architecture

## 1. Executive Summary & Architectural Approach

**AutoDocs Core Engine** is an autonomous, commit-driven AI documentation platform. The system automatically inspects codebases, evaluates git diffs against prompt rules, and generates or updates technical documentation (`ARCHITECTURE.md`) via automated GitHub Pull Requests.

### Core Architectural Style
- **Event-Driven Micro-Monolith**: Built on Node.js (TypeScript), Express.js, PostgreSQL (Prisma ORM), Redis, and BullMQ.
- **Asynchronous Execution Pipeline**: Heavy disk I/O (cloning, git operations) and LLM inferencing are decoupled from standard HTTP request/response lifecycles via BullMQ workers.
- **Multi-Tier LLM Orchestration & Scoped Caching**: Flexible model roster binding (`ModelRoster`, `LLMTaskConfig`, `Prompt`) with provider abstractions and Gemini context caching (`ScopedCacheService`).
- **GitHub App & Webhook Integration**: Authenticates using GitHub App installation tokens, processes push webhooks with HMAC SHA-256 verification, and automatically opens PRs on target repositories.

---

## 2. High-Level System Topology

```mermaid
flowchart TD
    User([Developer / Admin]) -->|HTTP REST / JWT| ExpressApp[Express HTTP API Server]
    GitHub[GitHub Platform] -->|Webhook Push Events| WebhookEndpoint["/api/webhooks/github"]
    GitHubApp[GitHub App Installation] -->|OAuth Callback| ExpressApp

    subgraph Express HTTP Layer
        ExpressApp --> AuthModule[Auth & JWT Module]
        ExpressApp --> GithubAppModule[GitHub App Module]
        ExpressApp --> RepoModule[Repo Management]
        ExpressApp --> JobsModule[Jobs & Telemetry]
        ExpressApp --> AdminModule[Admin Console]
        ExpressApp --> BillingModule[Ledger & Credit Billing]
        ExpressApp --> LLMConfigModule[LLM & Prompt Config]
    end

    ExpressApp -->|ORM Queries| Postgres[(PostgreSQL Database)]
    ExpressApp -->|Enqueue Jobs| Redis[(Redis Broker)]

    subgraph Asynchronous BullMQ Workers
        StorageWorker[Storage Worker\n`repo-storage-queue`\nConcurrency: 2] 
        WebhookWorker[Webhook Classifier Worker\n`push-classify-queue`\nConcurrency: 10]
        DocGenWorker[DocGen Worker\n`doc-generation-queue`\nConcurrency: 3]
    end

    Redis --> StorageWorker
    Redis --> WebhookWorker
    Redis --> DocGenWorker

    StorageWorker -->|Disk Read/Write| LocalFS["Local Filesystem\n`./codebases/<repoId>`"]
    WebhookWorker -->|Git Diff Inspection| LocalFS
    DocGenWorker -->|File Write & Git Push| LocalFS

    WebhookWorker -->|Evaluate Diff| GeminiAPI[Google Gemini LLM Service]
    DocGenWorker -->|Generate ARCHITECTURE.md| GeminiAPI
    DocGenWorker -->|Create Pull Request| GitHub
```

---

## 3. Asynchronous Execution & Worker Queue Topology

The background processing architecture utilizes **BullMQ** over Redis connection pools to isolate compute and network workloads across three distinct queues:

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub Webhook
    participant API as Express API
    participant DB as PostgreSQL DB
    participant Q as Redis / BullMQ
    participant W1 as Storage Worker
    participant W2 as Classifier Worker
    participant W3 as DocGen Worker
    participant LLM as Google Gemini API

    GH->>API: POST /api/webhooks/github (Push Event)
    API->>API: Verify HMAC SHA-256 Signature
    API->>DB: Create DocsUpdateJob (status: PENDING)
    API->>Q: Enqueue `push-classify-queue`
    API-->>GH: 200 OK

    Q->>W2: Consume classification job
    W2->>W2: Check/Clone repo to local disk
    W2->>LLM: Evaluate Diff (`judge` prompt task)
    alt Diff requires doc update
        W2->>DB: Update DocsUpdateJob (status: PENDING)
        W2->>Q: Enqueue `doc-generation-queue`
    else Diff irrelevant for docs
        W2->>DB: Update DocsUpdateJob (status: DROPPED)
    end

    Q->>W3: Consume docgen job
    W3->>W3: Inventory files & construct prompt
    W3->>LLM: Generate structured ARCHITECTURE.md
    W3->>W3: Commit ARCHITECTURE.md to `auto-Docs` branch
    W3->>GH: Open Pull Request via Octokit
    W3->>DB: Update DocsUpdateJob (status: PR_OPEN, prLink)
    W3->>DB: Deduct credits from user wallet
```

### Queue Configuration Overview

| Queue Name | Responsibilities | Default Concurrency | Retry / Backoff Strategy |
| :--- | :--- | :--- | :--- |
| `repo-storage-queue` | Shallow repo clones, deep clones, local folder cleanups | `2` | 3 attempts, exponential backoff (5s) |
| `push-classify-queue` | Webhook push event diff evaluation & LLM filtering | `10` | 2 attempts, exponential backoff (3s) |
| `doc-generation-queue` | Full AST inventory assembly, LLM document generation, git commits, PR creation | `3` | 3 attempts, exponential backoff (10s) |

---

## 4. Data Models & Persistence Architecture

Persistence is implemented using **PostgreSQL** via **Prisma ORM** (`src/prisma/schema.prisma`). Local repository checkouts are persisted on disk under `codebases/<repoId>`.

### Primary Entity Relationship Summary

```mermaid
erDiagram
    User ||--o{ RefreshSession : 