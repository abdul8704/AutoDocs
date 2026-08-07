-- AlterTable
ALTER TABLE "Repo" ADD COLUMN     "arch_prompt" TEXT,
ADD COLUMN     "module_prompt" TEXT,
ADD COLUMN     "prompts_updated_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Repo_github_repo_id_key" ON "Repo"("github_repo_id");

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "repo_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DOC_RUN',
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "pr_url" TEXT,
    "logs" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_repo_id_created_at_idx" ON "Notification"("repo_id", "created_at");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "Repo"("github_repo_id") ON DELETE CASCADE ON UPDATE CASCADE;
