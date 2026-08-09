# Project documentation

## What this system is

A small repository of 71 file(s) across 25 area(s), carrying
199 top-level declaration(s).

## How it works

- `(root)` — 6 file(s)
- `src` — 1 file(s)
- `src/auth` — 5 file(s)
- `src/auth/providers` — 3 file(s)
- `src/config` — 2 file(s)
- `src/github` — 5 file(s)
- `src/LLM` — 4 file(s)
- `src/LLM/providers` — 3 file(s)
- `src/middleware` — 1 file(s)
- `src/notification` — 1 file(s)
- `src/pipeline` — 6 file(s)
- `src/pipeline/stages` — 8 file(s)
- `src/prisma` — 2 file(s)
- `src/prisma/migrations` — 1 file(s)
- `src/prisma/migrations/20260726152447_init` — 1 file(s)
- `src/prisma/migrations/20260806180400_doc_pipeline_tables` — 1 file(s)
- `src/prisma/migrations/20260806180500_notifications_and_custom_prompts` — 1 file(s)
- `src/prisma/migrations/20260808062739_prod` — 1 file(s)
- `src/prisma/migrations/20260808070500_repo_doc_state_run_progress` — 1 file(s)
- `src/prisma/migrations/20260808071500_align_pipeline_foreign_keys` — 1 file(s)
- `src/queue` — 2 file(s)
- `src/scripts` — 3 file(s)
- `src/types` — 2 file(s)
- `src/utils` — 6 file(s)
- `src/worker` — 4 file(s)

## Component diagram

```mermaid
graph TD
  a44c4ce["(root)"]
  a25a663["src"]
  a2df12c["src/auth"]
  af17c63["src/auth/providers"]
  a324fb0["src/config"]
  a3697aa["src/github"]
  a87fe33["src/LLM"]
  a30bae6["src/LLM/providers"]
  aa714f1["src/middleware"]
  a06278f["src/notification"]
  a629f4b["src/pipeline"]
  a93671c["src/pipeline/stages"]
  aa9fd52["src/prisma"]
  ae520c0["src/prisma/migrations"]
  a89d1fb["src/prisma/migrations/20260726152447_init"]
  ab33b85["src/prisma/migrations/20260806180400_doc_pipeline_tables"]
  a4e0b15["src/prisma/migrations/20260806180500_notifications_and_custom_prompts"]
  a70c82d["src/prisma/migrations/20260808062739_prod"]
  a822827["src/prisma/migrations/20260808070500_repo_doc_state_run_progress"]
  acf9838["src/prisma/migrations/20260808071500_align_pipeline_foreign_keys"]
  acd1949["src/queue"]
  a47023a["src/scripts"]
  a15bf06["src/types"]
  a0f13bc["src/utils"]
  a17caef["src/worker"]
```

## Areas

### (root)

- `githubLogin` (const) — [src/auth/auth.controller.ts:33]
- `githubCallback` (const) — [src/auth/auth.controller.ts:43]
- `googleLogin` (const) — [src/auth/auth.controller.ts:83]
- `googleCallback` (const) — [src/auth/auth.controller.ts:90]
- `refresh` (const) — [src/auth/auth.controller.ts:96]
- `logout` (const) — [src/auth/auth.controller.ts:112]
- `deleteUser` (const) — [src/auth/auth.controller.ts:123]
- `authenticate` (const) — [src/auth/auth.middleware.ts:4]
- `findOrCreateGithubUser` (const) — [src/auth/auth.service.ts:22]
- `setUpJwt` (const) — [src/auth/auth.service.ts:43]

### src

- `githubLogin` (const) — [src/auth/auth.controller.ts:33]
- `githubCallback` (const) — [src/auth/auth.controller.ts:43]
- `googleLogin` (const) — [src/auth/auth.controller.ts:83]
- `googleCallback` (const) — [src/auth/auth.controller.ts:90]
- `refresh` (const) — [src/auth/auth.controller.ts:96]
- `logout` (const) — [src/auth/auth.controller.ts:112]
- `deleteUser` (const) — [src/auth/auth.controller.ts:123]
- `authenticate` (const) — [src/auth/auth.middleware.ts:4]
- `findOrCreateGithubUser` (const) — [src/auth/auth.service.ts:22]
- `setUpJwt` (const) — [src/auth/auth.service.ts:43]

### src/auth

- `githubLogin` (const) — [src/auth/auth.controller.ts:33]
- `githubCallback` (const) — [src/auth/auth.controller.ts:43]
- `googleLogin` (const) — [src/auth/auth.controller.ts:83]
- `googleCallback` (const) — [src/auth/auth.controller.ts:90]
- `refresh` (const) — [src/auth/auth.controller.ts:96]
- `logout` (const) — [src/auth/auth.controller.ts:112]
- `deleteUser` (const) — [src/auth/auth.controller.ts:123]
- `authenticate` (const) — [src/auth/auth.middleware.ts:4]
- `findOrCreateGithubUser` (const) — [src/auth/auth.service.ts:22]
- `setUpJwt` (const) — [src/auth/auth.service.ts:43]

### src/auth/providers

- `getGithubAuthUrl` (const) — [src/auth/providers/github.provider.ts:10]
- `exchangeGithubCode` (const) — [src/auth/providers/github.provider.ts:25]
- `fetchGithubProfile` (const) — [src/auth/providers/github.provider.ts:82]
- `getGoogleAuthUrl` (const) — [src/auth/providers/google.provider.ts:9]
- `exchangeGoogleCode` (const) — [src/auth/providers/google.provider.ts:14]
- `fetchGoogleProfile` (const) — [src/auth/providers/google.provider.ts:19]
- `OAuthProfile` (type) — [src/auth/providers/provider.types.ts:3]

### src/config

- `env` (const) — [src/config/env.ts:37]
- `redisConnection` (const) — [src/config/redis.ts:3]

### src/github

- `getInstallationOctokit` (const) — [src/github/github.app.service.ts:23]
- `uninstallApp` (const) — [src/github/github.app.service.ts:59]
- `getInstallationToken` (const) — [src/github/github.app.service.ts:65]
- `getAllRepos` (const) — [src/github/github.app.service.ts:71]
- `saveInstallationId` (const) — [src/github/github.app.service.ts:91]
- `getInstallationStatus` (const) — [src/github/github.app.service.ts:100]
- `getAllReposForUser` (const) — [src/github/github.app.service.ts:114]
- `importThisRepo` (const) — [src/github/github.app.service.ts:127]
- `getImportedRepos` (const) — [src/github/github.app.service.ts:182]
- `repoIdentity` (const) — [src/github/github.app.service.ts:215]

### src/LLM

- `generate` (function) — [src/LLM/index.ts:20]
- `llmConcurrency` (function) — [src/LLM/index.ts:75]
- `ProviderName` (type) — [src/LLM/llm.config.ts:4]
- `RoleConfig` (type) — [src/LLM/llm.config.ts:12]
- `LLM_CONFIG` (const) — [src/LLM/llm.config.ts:17]
- `llmEnv` (const) — [src/LLM/llm.env.ts:26]
- `LlmRole` (type) — [src/LLM/llm.types.ts:3]
- `SystemBlock` (type) — [src/LLM/llm.types.ts:5]
- `LlmPrompt` (type) — [src/LLM/llm.types.ts:10]
- `LlmUsage` (type) — [src/LLM/llm.types.ts:15]

### src/LLM/providers

- `anthropicProvider` (const) — [src/LLM/providers/anthropic.provider.ts:23]
- `dummyProvider` (const) — [src/LLM/providers/dummy.provider.ts:95]
- `openaiProvider` (const) — [src/LLM/providers/openai.provider.ts:39]

### src/middleware

- `errorMiddleware` (const) — [src/middleware/error.middleware.ts:4]

### src/notification

- `NotificationStatus` (type) — [src/notification/notification.service.ts:15]
- `DocRunNotification` (type) — [src/notification/notification.service.ts:17]
- `recordDocRun` (const) — [src/notification/notification.service.ts:27]
- `buildRunMessage` (const) — [src/notification/notification.service.ts:50]
- `resolveRunStatus` (const) — [src/notification/notification.service.ts:88]
- `PushEvalNotification` (type) — [src/notification/notification.service.ts:111]
- `recordPushEvaluation` (const) — [src/notification/notification.service.ts:126]

### src/pipeline

- `LoadedCustomInstructions` (type) — [src/pipeline/pipeline.customInstructions.ts:18]
- `loadCustomInstructions` (const) — [src/pipeline/pipeline.customInstructions.ts:26]
- `sha256` (function) — [src/pipeline/pipeline.helper.ts:5]
- `computeModuleInputHash` (function) — [src/pipeline/pipeline.helper.ts:9]
- `normalizePath` (function) — [src/pipeline/pipeline.helper.ts:15]
- `dirOf` (function) — [src/pipeline/pipeline.helper.ts:19]
- `mapWithConcurrency` (function) — [src/pipeline/pipeline.helper.ts:29]
- `buildFileTree` (function) — [src/pipeline/pipeline.helper.ts:49]
- `guessEntryPoints` (function) — [src/pipeline/pipeline.helper.ts:76]
- `toDocFileName` (function) — [src/pipeline/pipeline.helper.ts:91]

### src/pipeline/stages

- `isRelevantPath` (const) — [src/pipeline/stages/L1.inventory.ts:50]
- `getRepoFiles` (const) — [src/pipeline/stages/L1.inventory.ts:66]
- `groupModules` (function) — [src/pipeline/stages/L2.prefixCompressor.ts:136]
- `buildFileToModuleIndex` (function) — [src/pipeline/stages/L2.prefixCompressor.ts:183]
- `extractImportSpecs` (function) — [src/pipeline/stages/L3.dynamicGrouper.ts:17]
- `resolveSpec` (function) — [src/pipeline/stages/L3.dynamicGrouper.ts:38]
- `buildModuleEdges` (function) — [src/pipeline/stages/L3.dynamicGrouper.ts:68]
- `buildIntentBundle` (function) — [src/pipeline/stages/L4.intentBundle.ts:39]
- `estimateTokens` (function) — [src/pipeline/stages/L5.router.ts:5]
- `isTinyRepo` (function) — [src/pipeline/stages/L5.router.ts:13]

### src/prisma

_No exported declarations were found in the provided source._

### src/prisma/migrations

_No exported declarations were found in the provided source._

### src/prisma/migrations/20260726152447_init

_No exported declarations were found in the provided source._

### src/prisma/migrations/20260806180400_doc_pipeline_tables

_No exported declarations were found in the provided source._

### src/prisma/migrations/20260806180500_notifications_and_custom_prompts

_No exported declarations were found in the provided source._

### src/prisma/migrations/20260808062739_prod

_No exported declarations were found in the provided source._

### src/prisma/migrations/20260808070500_repo_doc_state_run_progress

_No exported declarations were found in the provided source._

### src/prisma/migrations/20260808071500_align_pipeline_foreign_keys

_No exported declarations were found in the provided source._

### src/queue

- `repoStorageQueue` (const) — [src/queue/publishers.ts:12]
- `classifyQueue` (const) — [src/queue/publishers.ts:29]
- `docGenQueue` (const) — [src/queue/publishers.ts:46]
- `publishFirstTimeImport` (const) — [src/queue/publishers.ts:84]
- `publishDeepCloneForPush` (const) — [src/queue/publishers.ts:95]
- `publishCleanup` (const) — [src/queue/publishers.ts:106]
- `publishPushForClassification` (const) — [src/queue/publishers.ts:121]
- `publishDocUpdate` (const) — [src/queue/publishers.ts:147]
- `FirstTimeImportJobData` (type) — [src/queue/types.queue.ts:2]
- `DeepClonePushJobData` (type) — [src/queue/types.queue.ts:13]

### src/scripts

_No exported declarations were found in the provided source._

### src/types

- `CodebaseChangeEvent` (type) — [src/types/repo.types.ts:1]
- `GitFetchResponse` (type) — [src/types/repo.types.ts:30]
- `GitAllRepoResponse` (type) — [src/types/repo.types.ts:52]
- `InstallationStatusResponse` (type) — [src/types/repo.types.ts:60]
- `ImportedRepoResponse` (type) — [src/types/repo.types.ts:65]

### src/utils

- `asyncHandler` (const) — [src/utils/asyncHandler.utils.ts:3]
- `verifyGitHubSignature` (const) — [src/utils/github.security.utils.ts:3]
- `HttpError` (class) — [src/utils/httpError.utils.ts:4]
- `logger` (const) — [src/utils/logger.utils.ts:15]
- `scopedLogger` (const) — [src/utils/logger.utils.ts:44]
- `startTimer` (const) — [src/utils/logger.utils.ts:53]
- `truncate` (const) — [src/utils/logger.utils.ts:59]
- `createPath` (const) — [src/utils/pathHelper.utils.ts:3]
- `constructPath` (const) — [src/utils/pathHelper.utils.ts:6]
- `PromptScanResult` (type) — [src/utils/promptGuard.utils.ts:18]

### src/worker

- `isRepoLocked` (function) — [src/worker/codebase.service.ts:33]
- `acquireRepoLock` (function) — [src/worker/codebase.service.ts:65]
- `releaseRepoLock` (function) — [src/worker/codebase.service.ts:93]
- `getEvictableLRURepo` (function) — [src/worker/codebase.service.ts:106]
- `checkForSpace` (const) — [src/worker/codebase.service.ts:152]
- `classifyWorker` (const) — [src/worker/docs.worker.ts:40]
- `docGenWorker` (const) — [src/worker/docs.worker.ts:154]
- `storageWorker` (const) — [src/worker/storage.worker.ts:19]

## Setup & running

Derived from the provided project files. Source fingerprint
`4de8fb79a03b`.
