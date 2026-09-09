-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'CLONING', 'SCANING', 'GENERATING', 'PR_OPEN', 'COMPLETED', 'FAILED', 'WAITING_LLM_JUDGE', 'LLM_JUDGE_REJECTED', 'DROPPED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- DropIndex
DROP INDEX IF EXISTS "Prompt_prompt_key_is_current_key";
DROP INDEX IF EXISTS "Prompt_prompt_key_key";

-- AlterTable LLMTaskConfig
ALTER TABLE "LLMTaskConfig" DROP COLUMN IF EXISTS "model";
ALTER TABLE "LLMTaskConfig" DROP COLUMN IF EXISTS "provider";
ALTER TABLE "LLMTaskConfig" DROP COLUMN IF EXISTS "systemInstruction";
ALTER TABLE "LLMTaskConfig" ADD COLUMN IF NOT EXISTS "maxOutputTokens" INTEGER;
ALTER TABLE "LLMTaskConfig" ADD COLUMN IF NOT EXISTS "modelRosterId" TEXT NOT NULL;
ALTER TABLE "LLMTaskConfig" ADD COLUMN IF NOT EXISTS "promptId" TEXT NOT NULL;

-- AlterTable Prompt
ALTER TABLE "Prompt" DROP COLUMN IF EXISTS "is_current";

-- CreateTable ModelRoster
CREATE TABLE IF NOT EXISTS "ModelRoster" (
    "id" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "contextWindow" INTEGER DEFAULT 1048576,

    CONSTRAINT "ModelRoster_pkey" PRIMARY KEY ("id")
);

-- CreateTable DocsUpdateJob
CREATE TABLE IF NOT EXISTS "DocsUpdateJob" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "triggerCommit" TEXT DEFAULT '',
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "pullRequestId" INTEGER,
    "branchName" TEXT,
    "prLink" TEXT,
    "errorLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocsUpdateJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable LLMLog
CREATE TABLE IF NOT EXISTS "LLMLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "taskKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "inputTokens" INTEGER DEFAULT 0,
    "outputTokens" INTEGER DEFAULT 0,
    "error" TEXT,
    "resultSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LLMLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable LLMCache
CREATE TABLE IF NOT EXISTS "LLMCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "cacheName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LLMCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "ModelRoster_modelName_provider_key" ON "ModelRoster"("modelName", "provider");
CREATE INDEX IF NOT EXISTS "LLMLog_taskKey_idx" ON "LLMLog"("taskKey");
CREATE INDEX IF NOT EXISTS "LLMLog_createdAt_idx" ON "LLMLog"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "LLMCache_userId_repoId_taskKey_key" ON "LLMCache"("userId", "repoId", "taskKey");

-- AddForeignKeys safely
DO $$ BEGIN
    ALTER TABLE "LLMTaskConfig" ADD CONSTRAINT "LLMTaskConfig_modelRosterId_fkey" FOREIGN KEY ("modelRosterId") REFERENCES "ModelRoster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "LLMTaskConfig" ADD CONSTRAINT "LLMTaskConfig_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "DocsUpdateJob" ADD CONSTRAINT "DocsUpdateJob_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "LLMCache" ADD CONSTRAINT "LLMCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "LLMCache" ADD CONSTRAINT "LLMCache_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("github_repo_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
