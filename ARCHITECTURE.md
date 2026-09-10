# System Architecture & Technical Documentation

## 1. System Overview
* **High-Level Purpose:** AutoDocs is an automated AI-powered documentation engine designed for GitHub repositories. It monitors codebases, evaluates diffs from push events via webhooks, generates up-to-date repository technical documentation (e.g., `ARCHITECTURE.md`), and automatically submits Pull Requests containing updated documentation to user repositories.
* **Core Design Pattern:** Distributed Asynchronous Queue Architecture & Layered Micro-services Pattern.
  - **Frontend:** React SPA built with Vite and context-driven state management.
  - **Backend Server:** Node.js Express REST API handling authentication, webhooks, admin management, and job orchestration.
  - **Queue & Worker Pipeline:** Redis-backed BullMQ processing asynchronous storage, classification, and heavy LLM documentation tasks.
  - **Database:** PostgreSQL managed via Prisma ORM for persistent refresh sessions, user settings, repository metadata, LLM prompt/model rosters, and telemetry logs.

---

## 2. Technology Stack & Dependencies

| Category | Technology / Library | Purpose in this Project |
| :--- | :--- | :--- |
| **Frontend Core** | React 18, TypeScript, Vite | User dashboard interface, auth management, repository selection, and job status tracking |
| **UI & Icons** | Lucide React, Custom CSS Glassmorphism | Responsive modern dark-mode user interface |
| **Backend Core** | Express.js, Node.js (v22), TypeScript | Core REST API backend, webhooks receiver, middleware enforcement |
| **Database & ORM** | PostgreSQL, Prisma ORM, `@prisma/adapter-pg` | Relational data persistence for users, sessions, jobs, and LLM configurations |
| **Message Broker** | Redis, BullMQ, `ioredis` | Asynchronous task queues (`repo-storage-queue`, `push-classify-queue`, `doc-generation-queue`) |
| **Authentication** | GitHub OAuth 2.0, JWT, bcrypt, cookie-parser | Access token issuance, httpOnly refresh session persistence, password hashing |
| **GitHub Integration**| Octokit (`@octokit/rest`, `@octokit/auth-app`), `simple-git` | GitHub App API interactions, repository cloning, branch management, and Pull Request creation |
| **LLM & AI Engine** | `@google/genai` (Google Gemini API), Tiktoken, Zod | Token context calculation, structured JSON prompt generation, git diff evaluation |

---

## 3. High-Level Architecture Diagram

```mermaid
flowchart TD
    subgraph Client["Client Layer"]
        ReactClient["React + Vite Single Page App"]
    end

    subgraph API["Express API Gateway Layer"]
        AuthMiddleware["Auth & JWT Middleware"]
        WebhookEndpoint["Webhook Endpoint (/api/webhooks/github)"]
        RestAPI["REST API Controllers"]
    end

    subgraph Storage["Database & Storage"]
        Postgres[("PostgreSQL Database")]
        Prisma["Prisma ORM"]
        LocalFS["Local Codebase Storage (/codebases)"]
    end

    subgraph QueueLayer["Async Queue System (BullMQ)"]
        Redis[("Redis Store")]
        StorageQueue["repo-storage-queue"]
        ClassifyQueue["push-classify-queue"]
        DocGenQueue["doc-generation-queue"]
    end

    subgraph Workers["Background Job Workers"]
        StorageWorker["Storage Worker"]
        WebhookWorker["Webhook / Classify Worker"]
    end

    subgraph External["External Integrations"]
        GitHubApp["GitHub App REST API"]
        GeminiAI["Google Gemini API (LLM Engine)"]
    end

    ReactClient -->|"REST API Calls"| AuthMiddleware
    AuthMiddleware --> RestAPI
    GitHubApp -->|"Push Webhooks"| WebhookEndpoint
    RestAPI --> Prisma
    Prisma --> Postgres
    RestAPI -->|"Publish Jobs"| QueueLayer
    WebhookEndpoint -->|"Publish Push Events"| ClassifyQueue
    QueueLayer --> Redis
    StorageWorker -->|"Fetch Jobs"| StorageQueue
    WebhookWorker -->|"Fetch Jobs"| ClassifyQueue
    StorageWorker -->|"Clone / Pull Code"| LocalFS
    WebhookWorker -->|"Inspect Diffs"| LocalFS
    StorageWorker -->|"Generate Structured Docs"| GeminiAI
    WebhookWorker -->|"Judge Diff Relevance"| GeminiAI
    StorageWorker -->|"Open PRs"| GitHubApp
    WebhookWorker -->|"Open PRs / Update PRs"| GitHubApp
```

---

## 4. Directory & Module Structure

```
/ (Repository Root)
├── client/                     # Frontend React application
│   ├── src/
│   │   ├── components/         # Dashboard UI components (RepoList, ImportedRepoList, etc.)
│   │   ├── context/            # Authentication Context & Provider
│   │   ├── services/           # Client API integration layer
│   │   ├── App.tsx             # Root React application wrapper
│   │   └── main.tsx            # DOM Mounting script
│   └── vite.config.ts          # Vite bundler & dev server proxy config
├── src/                        # Backend Node.js Express Application
│   ├── admin/                  # Admin controllers, routes, and master telemetry statistics
│   ├── auth/                   # Authentication controllers, JWT service, OAuth providers
│   ├── config/                 # Environment validation (env.ts) & Redis settings
│   ├── dashboard/              # User dashboard statistics services
│   ├── github/                 # GitHub App management, webhooks handler, simple-git drivers
│   ├── jobs/                   # Job status, retrieval, and retry controllers
│   ├── LLM/                    # Dynamic LLM provider factory, prompt registry, Gemini integrations
│   ├── pipeline/               # Multi-stage documentation generation orchestrator & stages
│   │   └── stages/             # Stage L1 (Inventory), Stage L2 (Judge), Stage L4 (TinyDocs)
│   ├── prisma/                 # Database Prisma Client instantiation & migration configuration
│   ├── queue/                  # BullMQ queues definitions and publisher methods
│   ├── repo/                   # Imported repository management and document file fetchers
│   ├── user/                   # User profile fetching and mutation services
│   ├── worker/                 # Storage worker & Webhook classifier background workers
│   └── index.ts                # Application entry point and Express server router initialization
├── Dockerfile                  # Container build instructions
├── docker-compose.yml          # Postgres, Redis, and App container setup
└── package.json                # Server runtime dependencies and scripts
```

---

## 5. Data Models & Database Schema

```mermaid
erDiagram
    USER ||--o{ REFRESH_SESSION : "has"
    USER ||--o{ REPO : "owns"
    REPO ||--o{ DOCS_UPDATE_JOB : "executes"
    LLM_TASK_CONFIG }|--|| MODEL_ROSTER : "configures"
    LLM_TASK_CONFIG }|--|| PROMPT : "uses"

    USER {
        string id PK
        string name
        string githubId UK
        string email UK
        string profileUrl
        string password_hash
        int githubInstallationId
        string planType
        int usedDocsQuota
        datetime created_at
        datetime updated_at
    }

    REFRESH_SESSION {
        string id PK
        string userId FK
        string hashedRefreshToken
        datetime expiresAt
        datetime revokedAt
        datetime createdAt
        datetime updatedAt
    }

    REPO {
        string id PK
        string user_id FK
        string github_repo_id UK
        string full_name
        int installation_id
        string clone_url
        string last_processed_commit
        datetime created_at
        datetime updated_at
    }

    DOCS_UPDATE_JOB {
        string id PK
        string repoId FK
        string triggerCommit
        enum status
        int pullRequestId
        string branchName
        string prLink
        string errorLog
        datetime createdAt
        datetime updatedAt
    }

    LLM_TASK_CONFIG {
        string id PK
        string taskKey UK
        string modelRosterId FK
        string promptId FK
        float temperature
        int maxOutputTokens
        datetime updatedAt
    }

    PROMPT {
        string id PK
        string prompt_key
        string version
        string content
        datetime createdAt
        datetime updatedAt
    }

    MODEL_ROSTER {
        string id PK
        string modelName
        string provider
        int contextWindow
    }

    LLM_LOG {
        string id PK
        string jobId
        string taskKey
        string provider
        string modelName
        string status
        int durationMs
        int inputTokens
        int outputTokens
        string error
        string resultSummary
        datetime createdAt
    }
```

---

## 6. API Surface, Routes & Interfaces

### Authentication Routes (`/auth`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/auth/github` | None | Initiates GitHub OAuth authentication flow |
| `GET` | `/auth/github/callback` | None | Handles GitHub OAuth callback and sets HttpOnly refresh cookie |
| `GET` | `/auth/google` | None | Google OAuth flow stub |
| `GET` | `/auth/google/callback` | None | Google OAuth callback stub |
| `POST` | `/auth/refresh` | Cookie | Refreshes access JWT using valid httpOnly refresh session cookie |
| `POST` | `/auth/logout` | Cookie | Revokes current refresh session |
| `DELETE` | `/auth/user` | Bearer JWT | Permanently deletes user account |

### Webhooks (`/api/webhooks`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/webhooks/github` | HMAC SHA256 Signature | Processes GitHub `push` event payloads |

### GitHub App & Repositories (`/api/github`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/github/setup` | Query State | Post-installation callback handling from GitHub App setup |
| `GET` | `/api/github/installation-status` | Bearer JWT | Verifies if current user has installed the GitHub App |
| `GET` | `/api/github/accessible-repos` | Bearer JWT | Lists repositories accessible to the GitHub App installation |
| `GET` | `/api/github/imported-repos` | Bearer JWT | Lists repositories imported into AutoDocs by the user |
| `POST` | `/api/github/import-repo` | Bearer JWT | Imports repository, performs initial clone, and triggers doc generation |
| `DELETE` | `/api/github/repo/:repoId` | Bearer JWT | Deletes an imported repository and schedules workspace cleanup |

### Jobs & Documentation Management (`/api/jobs`, `/api/repos`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/jobs` | Bearer JWT | Retrieves paginated documentation update jobs |
| `GET` | `/api/jobs/:jobId` | Bearer JWT | Gets details for a specific documentation job |
| `POST` | `/api/jobs/:jobId/retry` | Bearer JWT | Re-queues a failed or pending job |
| `GET` | `/api/repos/:repoId` | Bearer JWT | Gets repository details and job execution history |
| `POST` | `/api/repos/:repoId/trigger` | Bearer JWT | Manually triggers documentation generation for a repository |
| `GET` | `/api/repos/:repoId/docs` | Bearer JWT | Fetches generated `ARCHITECTURE.md` content |

### LLM Configuration & Admin Services (`/api/admin`, `/api/llm-config`, `/api/prompts`, `/api/models`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/users` | Bearer JWT | Lists system users with usage metrics |
| `GET` | `/api/admin/stats` | Bearer JWT | Master platform analytics and BullMQ queue health check |
| `GET` | `/api/llm-config` | Bearer JWT | Fetches configured task-to-model LLM mappings |
| `POST` | `/api/prompts` | Bearer JWT | Registers or updates dynamic prompt templates |
| `GET` | `/api/models` | Bearer JWT | Lists available LLM model roster |

---

## 7. Key Data Flows & Sequences

### First-Time Repository Import Flow
```mermaid
sequenceDiagram
    autonumber
    actor User as Developer
    participant Frontend as React Dashboard
    participant API as Express API Server
    participant DB as PostgreSQL (Prisma)
    participant Queue as Storage Queue (BullMQ)
    participant Worker as Storage Worker
    participant Gemini as Gemini LLM Service
    participant GitHub as GitHub API

    User->>Frontend: Click "Import Repo"
    Frontend->>API: POST /api/github/import-repo
    API->>GitHub: Request Installation Access Token & Head Commit SHA
    API->>DB: Upsert Repo & Create DocsUpdateJob (PENDING)
    API->>Queue: Publish 'clone-first-time' Job
    API-->>Frontend: Return 201 Created
    Queue->>Worker: Consume 'clone-first-time' job
    Worker->>Worker: Shallow Clone repository locally
    Worker->>Worker: Stage L1 Inventory (Scan code, docs, and intent files)
    Worker->>Gemini: Request Structured Docs & PR Content
    Gemini-->>Worker: Return JSON (prTitle, prBody, commitMessage, documentation)
    Worker->>Worker: Write ARCHITECTURE.md & Commit to local branch 'autoDocs'
    Worker->>GitHub: Push branch & Open Pull Request
    Worker->>DB: Update DocsUpdateJob (PR_OPEN, prLink)
```

---

## 8. Configuration & Environment Variables

| Variable | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Number | No (Default `5000`) | Express API HTTP server listening port |
| `GITHUB_WEBHOOK_SECRET` | String | Yes | HMAC Secret used to verify GitHub webhook signatures |
| `GITHUB_CLIENT_ID` | String | Yes | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | String | Yes | GitHub OAuth App Client Secret |
| `GITHUB_APP_ID` | String | Yes | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | String | Yes | GitHub App Private Key for installation token signing |
| `GITHUB_APP_SLUG` | String | Yes | GitHub App URL slug name (e.g. `aiautodocs`) |
| `DATABASE_URL` | String | Yes | PostgreSQL connection string URL |
| `JWT_ACCESS_SECRET` | String | Yes | Secret key used to sign access JWTs |
| `JWT_REFRESH_SECRET` | String | Yes | Secret key used to sign session refresh JWTs |
| `ACCESS_TOKEN_EXPIRY` | String | Yes | Access token expiration duration (e.g. `15m`) |
| `REFRESH_TOKEN_EXPIRY` | String | Yes | Refresh session token expiration duration (e.g. `7d`) |
| `SERVER_URL` | URL | Yes | Publicly accessible URL for Express API server |
| `CLIENT_URL` | URL | Yes | Frontend application base URL |
| `GEMINI_API_KEY` | String | Yes | API key for Google Gemini Generative AI Service |
| `REDIS_HOST` | String | No (Default `localhost`) | Hostname for Redis instance |
| `REDIS_PORT` | Number | No (Default `6379`) | Connection port for Redis instance |