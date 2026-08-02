import simpleGit from "simple-git"
import fs from "fs/promises";
import { createPath } from "../utils/pathHelper.utils";
import { constructPath } from "../utils/pathHelper.utils"
import { CodebaseChangeEvent, GitFetchResponse } from "../types/repo.types";
import prisma from "../prisma/prisma";
import * as githubAppService from "./github.app.service"

import { publishCleanup, publishDeepCloneForPush } from "../queue/publishers"
import { CleanupJobData, DeepClonePushJobData } from "../queue/types.queue";

const git = simpleGit();

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
        userId
    };

    await publishDeepCloneForPush(repoData);
}

// check if the repo already exists in our local base
export const checkIfRepoExists = async (repoId: string): Promise<boolean> => {
    const path = createPath("codebases", repoId);

    const stats = await fs.stat(path);
    return stats.isDirectory();
}

export const fetchAndClassify = async (event: CodebaseChangeEvent, repoName: string) => {
    const repoUrl: string = await githubAppService.getAuthenticatedRepoUrl(event.repo.clone_url, event.installation.id);
    const fetchResult: GitFetchResponse = await git.fetch(repoUrl, "main");


    // do git fetch
    // get our commit id from db
    // compare it with afterSHA in the event object with git DIFF
    // send diff file, docs, repo tree to LLM for classification

    // return LLM decision

    // if LLM says no updation, update db to this commit
    // if LLM saya updation needed, do "git merge", send new files, docs to LLM and update new docs
}

export const githubWebhookHandlerService = async (payload: any) => {
    // check if repo id is there in db
    const githubRepoId = payload.repository.id.toString();
    const branch = payload.ref; // e.g. "refs/heads/main"
    const defaultBranch = `refs/heads/${payload.repository.default_branch}`;

    // Only process pushes to the main/default branch
    if (branch === defaultBranch) {


        // has the user imported this repo??
        const importedRepo = await prisma.repo.findUnique({
            where: { github_repo_id: githubRepoId },
            include: { user: true },
        });

        if (!importedRepo) {
            // App is installed on this repo, but user hasn't imported it in our dashboard. Ignore!
            console.log(payload.repository, "is not associated with this user");
            return;
        }

        // --- FUTURE PRICING CHECK (SEAMLESS INTEGRATION) ---
        // if (importedRepo.user.usedDocsQuota >= 15 && importedRepo.user.planType === 'FREE') {
        //    return res.status(200).send("Quota exceeded");
        // }

        console.log(`🚀 Triggering doc update for imported repo: ${importedRepo.user.name}`);
        console.log(`Commit hash: ${payload.after}`);

        // 4. CALL YOUR DOC GENERATION / SIMPLE-GIT SERVICE HERE
        // await processRepoUpdate(importedRepo.id, importedRepo.installation_id, payload.after);
    }
}

export const deleteRepo = async (userId: string, repoId: string) => {
    const path = constructPath(repoId);

    if (await checkIfRepoExists(path)) {

        const cleanUpData: CleanupJobData = {
            repoId,
            userId,
            action: "DELETE_REPO"
        }
        await publishCleanup(cleanUpData)
    }

    await prisma.repo.deleteMany({
        where: {
            user_id: userId,
            github_repo_id: repoId
        }
    })


    return;
}

