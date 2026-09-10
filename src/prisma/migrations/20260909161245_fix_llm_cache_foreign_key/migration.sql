-- DropForeignKey
ALTER TABLE "LLMCache" DROP CONSTRAINT IF EXISTS "LLMCache_repoId_fkey";

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "LLMCache" ADD CONSTRAINT "LLMCache_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
