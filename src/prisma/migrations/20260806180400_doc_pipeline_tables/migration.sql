-- CreateTable
CREATE TABLE "ModuleDoc" (
    "id" TEXT NOT NULL,
    "repo_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "incomplete" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoDocState" (
    "repo_id" TEXT NOT NULL,
    "arch_doc" TEXT,
    "owner_report" TEXT,
    "intent_hash" TEXT,
    "prompt_version" TEXT,
    "resolution_rate" DOUBLE PRECISION,
    "route_kind" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepoDocState_pkey" PRIMARY KEY ("repo_id")
);

-- CreateIndex
CREATE INDEX "ModuleDoc_repo_id_idx" ON "ModuleDoc"("repo_id");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleDoc_repo_id_module_id_key" ON "ModuleDoc"("repo_id", "module_id");

-- AddForeignKey
ALTER TABLE "ModuleDoc" ADD CONSTRAINT "ModuleDoc_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoDocState" ADD CONSTRAINT "RepoDocState_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
