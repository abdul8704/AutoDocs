import fs from "fs/promises";
import { createPath } from "../utils/pathHelper.utils";
import { CodebaseChangeEvent, GitFetchResponse } from "../types/repo.types";
import prisma from "../prisma/prisma";
import * as githubAppService from "./github.app.service"

import { publishCleanup, publishDeepCloneForPush, publishPushForClassification } from "../queue/publishers"
import { CleanupJobData, DeepClonePushJobData } from "../queue/types.queue";
import { beginRun } from "../pipeline/pipeline.progress";
import { scopedLogger } from "../utils/logger.utils";
import { HttpError } from "../utils/httpError.utils";

const log = scopedLogger("webhook");


// clone the repo into our base
export const cloneNewRepo = async (event: CodebaseChangeEvent, userId: string) => {
    // creates path like codebases/<repo_id>/
    // const path = constructPath(event.repo.id);
    // const cloneUrl = await githubAppService.getAuthenticatedRepoUrl(event.repo.clone_url, event.installation.id);
    // await git.clone(cloneUrl, path);

    const repoData: DeepClonePushJobData = {
        repoId: event.repo.id,
        defaultBranch: event.ref,
        repoFullName: event.repo.full_name,
        installationId: event.installation.id,
        beforeSha: event.before,
        afterSha: event.after,
        userId,
        cloneUrl: await githubAppService.getAuthenticatedRepoUrl(event.repo.clone_url, event.installation.id)
    };

    await publishDeepCloneForPush(repoData);
}

// check if the repo already exists in our local base
export const checkIfRepoExists = async (repoId: string): Promise<boolean> => {
    const path = createPath("codebases", repoId);

    try {
        const stats = await fs.stat(path);
        return stats.isDirectory();
    } catch (err: any) {
        if (err?.code === "ENOENT") return false;
        throw err;
    }
}


export const githubWebhookHandlerService = async (payload: any) => {
    // check if repo id is there in db
    const githubRepoId = payload.repository.id.toString();
    const branch = payload.ref; // e.g. "refs/heads/main"
    const defaultBranch = `refs/heads/${payload.repository.default_branch}`;

    log.info(
        { repo: githubRepoId, branch, defaultBranch, afterSha: payload.after },
        `push received on ${payload.repository?.full_name} (${branch})`,
    );

    // Only process pushes to the main/default branch
    if (branch !== defaultBranch) {
        log.info({ repo: githubRepoId, branch },
            `ignored — ${branch} is not the default branch`);
        return;
    }

    // has the user imported this repo??
    const importedRepo = await prisma.repo.findUnique({
        where: { github_repo_id: githubRepoId },
        include: { user: true },
    });

    if (!importedRepo) {
        // App is installed on this repo, but user hasn't imported it in our dashboard. Ignore!
        log.info({ repo: githubRepoId },
            `ignored — ${payload.repository?.full_name} has not been imported in the dashboard`);
        return;
    }

    // --- FUTURE PRICING CHECK (SEAMLESS INTEGRATION) ---
    // if (importedRepo.user.usedDocsQuota >= 15 && importedRepo.user.planType === 'FREE') {
    //    return res.status(200).send("Quota exceeded");
    // }

    // Publisher is debounced (10-min window, per repo+branch): rapid pushes
    // merge into one evaluation, keeping the earliest beforeSha.
    const job = await publishPushForClassification({
        repoId: importedRepo.github_repo_id,
        repoFullName: importedRepo.full_name ?? payload.repository.full_name,
        branch,
        defaultBranch: payload.repository.default_branch,
        beforeSha: payload.before,
        afterSha: payload.after,
        installationId: importedRepo.installation_id,
        userId: importedRepo.user_id,
    });

    log.info(
        { repo: githubRepoId, job: job.id, afterSha: payload.after },
        `queued push evaluation for ${importedRepo.full_name} @ ${String(payload.after).slice(0, 8)} ` +
        `(runs after the 10-minute debounce window)`,
    );

    await beginRun(githubRepoId, "WEBHOOK_PUSH", job.id ?? null, "PUSH_QUEUED");
}

// :repoId may be the Repo uuid the frontend routes on or the github_repo_id the
// pipeline keys on, so resolve the row first — deleting straight off the given
// id would silently no-op for whichever spelling the caller did not send.
export const deleteRepo = async (userId: string, repoId: string) => {
    const repo = await prisma.repo.findFirst({
        where: { ...githubAppService.repoIdentity(repoId), user_id: userId },
    });

    if (!repo) {
        throw new HttpError(404, "Repo not found");
    }

    if (await checkIfRepoExists(repo.github_repo_id)) {
        const cleanUpData: CleanupJobData = {
            repoId: repo.github_repo_id,
            userId,
            action: "DELETE_REPO"
        }
        await publishCleanup(cleanUpData)
    }

    await prisma.repo.delete({ where: { id: repo.id } });

    log.info({ repo: repo.github_repo_id, userId }, `removed repository ${repo.full_name}`);
}

