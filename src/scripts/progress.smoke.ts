// Throwaway harness: drives a fake run through every stage against a real
// RepoDocState row and prints the row after each step, so the log output and
// the persisted progress can be eyeballed side by side.
//
//   npx tsx src/scripts/progress.smoke.ts
//
import "../config/env";                      // loads .env before prisma reads DATABASE_URL
import prisma from "../prisma/prisma";
import { beginRun, markStage, finishRun } from "../pipeline/pipeline.progress";

const main = async () => {

    const repo = await prisma.repo.findFirst({ select: { github_repo_id: true, full_name: true } });

    if (!repo) {
        console.error("no Repo rows in the DB — import a repo first");
        process.exit(1);
    }

    const id = repo.github_repo_id;
    console.log(`\ndriving a fake run against ${repo.full_name} (${id})\n`);

    const show = async (label: string) => {
        const s = await prisma.repoDocState.findUnique({ where: { repo_id: id } });
        console.log(
            `  DB after ${label.padEnd(20)} -> status=${s?.run_status} ` +
            `step=${s?.stage_index} (${s?.stage_label}) stage=${s?.stage} ` +
            `progress=${s?.progress_done ?? "-"}/${s?.progress_total ?? "-"}`,
        );
    };

    await beginRun(id, "FIRST_IMPORT", "smoke-1", "QUEUED");
    await show("beginRun");

    for (const stage of ["CLONING", "CUSTOM_INSTRUCTIONS", "INVENTORY", "INTENT_BUNDLE",
        "ROUTING", "GROUPING", "IMPORT_GRAPH", "STALENESS"] as const) {
        await markStage(id, stage);
        await show(stage);
    }

    for (let done = 1; done <= 3; done++) {
        await markStage(id, "MODULE_DOCS", { done, total: 3, detail: `Writing module ${done}` });
        await show(`MODULE_DOCS ${done}/3`);
    }

    for (const stage of ["VALIDATION", "ARCH_DOC", "PERSISTING", "RAISING_PR"] as const) {
        await markStage(id, stage);
        await show(stage);
    }

    await finishRun(id, {
        status: "COMPLETED",
        detail: "Documentation raised as a pull request.",
        prUrl: "https://github.com/example/example/pull/1",
        durationMs: 1234,
    });
    await show("finishRun");

    // Leave the row IDLE so the smoke test does not masquerade as a real run.
    await prisma.repoDocState.update({
        where: { repo_id: id },
        data: { run_status: "IDLE", stage: null, stage_label: null, stage_index: null, stage_detail: null, pr_url: null, run_job_id: null },
    });

    console.log("\nreset to IDLE\n");
    await prisma.$disconnect();
};

main();
