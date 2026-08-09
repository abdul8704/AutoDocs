-- Realigns the doc-pipeline tables with the schema.
--
-- ModuleDoc.repo_id and RepoDocState.repo_id hold the github_repo_id (the id
-- the queue payloads and the whole pipeline carry), but their foreign keys
-- still pointed at Repo.id — so every module-doc upsert and every doc-state
-- write failed with an FK violation. Notification was already correct, which
-- is why notification rows were the only pipeline output that persisted.
--
-- Also adds judge_skip_count, which the schema and the push judge both expect
-- but which never reached this database.
--
-- Written idempotently because the migration history and the live schema had
-- drifted apart; re-running this is a no-op.

ALTER TABLE "RepoDocState"
    ADD COLUMN IF NOT EXISTS "judge_skip_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ModuleDoc" DROP CONSTRAINT IF EXISTS "ModuleDoc_repo_id_fkey";
ALTER TABLE "ModuleDoc" ADD CONSTRAINT "ModuleDoc_repo_id_fkey"
    FOREIGN KEY ("repo_id") REFERENCES "Repo"("github_repo_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepoDocState" DROP CONSTRAINT IF EXISTS "RepoDocState_repo_id_fkey";
ALTER TABLE "RepoDocState" ADD CONSTRAINT "RepoDocState_repo_id_fkey"
    FOREIGN KEY ("repo_id") REFERENCES "Repo"("github_repo_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
