-- Live pipeline progress on RepoDocState.
--
-- The row used to be written once, at the end of a run. These columns are
-- written at every step (see pipeline.progress.ts) so the frontend can poll
-- the row and watch a documentation run advance.
--
-- Purely additive: every column is nullable or defaulted, so existing rows
-- become IDLE with no stage, which is exactly right for a repo whose docs were
-- generated before this change.
ALTER TABLE "RepoDocState"
    ADD COLUMN IF NOT EXISTS "run_status"      TEXT NOT NULL DEFAULT 'IDLE',
    ADD COLUMN IF NOT EXISTS "run_trigger"     TEXT,
    ADD COLUMN IF NOT EXISTS "run_job_id"      TEXT,
    ADD COLUMN IF NOT EXISTS "stage"           TEXT,
    ADD COLUMN IF NOT EXISTS "stage_label"     TEXT,
    ADD COLUMN IF NOT EXISTS "stage_index"     INTEGER,
    ADD COLUMN IF NOT EXISTS "stage_detail"    TEXT,
    ADD COLUMN IF NOT EXISTS "progress_done"   INTEGER,
    ADD COLUMN IF NOT EXISTS "progress_total"  INTEGER,
    ADD COLUMN IF NOT EXISTS "run_started_at"  TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "run_finished_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "last_error"      TEXT,
    ADD COLUMN IF NOT EXISTS "pr_url"          TEXT;
