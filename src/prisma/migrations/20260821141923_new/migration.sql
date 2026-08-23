/*
  Warnings:

  - A unique constraint covering the columns `[github_repo_id]` on the table `Repo` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `installation_id` to the `Repo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Repo" ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "installation_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "githubInstallationId" INTEGER,
ADD COLUMN     "planType" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN     "usedDocsQuota" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LLMTaskConfig" (
    "id" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "systemInstruction" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LLMTaskConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prompt" (
    "id" TEXT NOT NULL,
    "prompt_key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LLMTaskConfig_taskKey_key" ON "LLMTaskConfig"("taskKey");

-- CreateIndex
CREATE UNIQUE INDEX "Prompt_prompt_key_key" ON "Prompt"("prompt_key");

-- CreateIndex
CREATE UNIQUE INDEX "Prompt_prompt_key_is_current_key" ON "Prompt"("prompt_key", "is_current");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Repo_github_repo_id_key" ON "Repo"("github_repo_id");

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repo" ADD CONSTRAINT "Repo_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
