// Throwaway harness: signs a token for a real user and hits the live status
// endpoint the frontend polls, so route path, auth and payload shape are all
// exercised end to end.
//
//   npx tsx src/scripts/status.smoke.ts
//
import "../config/env";
import prisma from "../prisma/prisma";
import { env } from "../config/env";
import { generateAccessToken } from "../auth/jwt.service";
import { beginRun, markStage } from "../pipeline/pipeline.progress";

// Override when a container is also bound to this port: "localhost" can resolve
// to whichever of the two got the IPv4 address.
//   BASE_URL=http://[::1]:5000 npx tsx src/scripts/status.smoke.ts
const BASE = process.env.BASE_URL ?? `http://localhost:${env.PORT}`;

const main = async () => {

    const repo = await prisma.repo.findFirst({
        select: { id: true, github_repo_id: true, full_name: true, user_id: true },
    });

    if (!repo) {
        console.error("no Repo rows in the DB");
        process.exit(1);
    }

    const token = generateAccessToken(repo.user_id);

    const hit = async (label: string, path: string) => {
        const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
        const body = await res.text();
        console.log(`\n${label}\n  GET ${path} -> ${res.status}`);
        if (res.ok) {
            const { status } = JSON.parse(body);
            console.log(`  runStatus=${status.runStatus} state=${status.state} active=${status.active}`);
            console.log(`  stage=${status.stageKey} step=${status.stageIndex} (${status.stage})`);
            console.log(`  message=${status.message}`);
            console.log(`  progress=${JSON.stringify(status.progress)} prUrl=${status.prUrl}`);
            console.log(`  steps=${JSON.stringify(status.steps)}`);
        } else {
            console.log(`  ${body.slice(0, 200)}`);
        }
    };

    console.log(`\nrepo: ${repo.full_name}  uuid=${repo.id}  github_repo_id=${repo.github_repo_id}`);

    // Control: a route that already existed, to prove the token and the running
    // server are fine before blaming the new route.
    const control = await fetch(`${BASE}/api/github/imported-repos`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`\ncontrol\n  GET /api/github/imported-repos -> ${control.status}`);

    // Both id forms must work: the dashboard routes on the uuid, the pipeline
    // keys on the github_repo_id.
    await hit("idle, by uuid", `/api/github/repos/${repo.id}/status`);
    await hit("idle, by github_repo_id", `/api/github/repos/${repo.github_repo_id}/status`);

    // Now drive a run partway and confirm the endpoint reflects it live.
    await beginRun(repo.github_repo_id, "FIRST_IMPORT", "status-smoke", "QUEUED");
    await hit("after beginRun", `/api/github/repos/${repo.id}/status`);

    await markStage(repo.github_repo_id, "MODULE_DOCS", { done: 2, total: 5, detail: "Writing module documentation — auth" });
    await hit("mid-run, module 2 of 5", `/api/github/repos/${repo.id}/status`);

    await prisma.repoDocState.update({
        where: { repo_id: repo.github_repo_id },
        data: { run_status: "IDLE", stage: null, stage_label: null, stage_index: null, stage_detail: null, progress_done: null, progress_total: null, run_job_id: null },
    });

    console.log("\nreset to IDLE\n");
    await prisma.$disconnect();
};

main();
