/*
  Warnings:

  - Added the required column `full_name` to the `Repo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `installation_id` to the `Repo` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ModuleDoc" DROP CONSTRAINT "ModuleDoc_repo_id_fkey";

-- DropForeignKey
ALTER TABLE "RepoDocState" DROP CONSTRAINT "RepoDocState_repo_id_fkey";

-- AlterTable
ALTER TABLE "Repo" ADD COLUMN     "full_name" TEXT NOT NULL,
ADD COLUMN     "installation_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "RepoDocState" ADD COLUMN     "judge_skip_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "githubInstallationId" INTEGER,
ADD COLUMN     "planType" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN     "usedDocsQuota" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repo" ADD CONSTRAINT "Repo_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleDoc" ADD CONSTRAINT "ModuleDoc_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "Repo"("github_repo_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoDocState" ADD CONSTRAINT "RepoDocState_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "Repo"("github_repo_id") ON DELETE CASCADE ON UPDATE CASCADE;
