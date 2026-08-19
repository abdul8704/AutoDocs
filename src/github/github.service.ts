import simpleGit, { SimpleGit } from "simple-git"
import fs, { mkdir } from "fs/promises";
import { createPath } from "../utils/pathHelper.utils";
import { constructPath } from "../utils/pathHelper.utils"
import { CodebaseChangeEvent, GitFetchResponse } from "../types/repo.types";
import prisma from "../prisma/prisma";
import * as githubAppService from "./github.app.service"

import { publishCleanup, publishDeepCloneForPush } from "../queue/publishers"
import { CleanupJobData, DeepClonePushJobData, FirstTimeImportJobData } from "../queue/types.queue";
import path from "path";

let git: SimpleGit = simpleGit();

// clone the repo into our base
export const cloneNewRepo = async (data: FirstTimeImportJobData, repoPath: string) => {
    // creates path like codebases/<repo_id>/
    console.log("doinggggg", repoPath, data.githubUrl)
    const cloneUrl = data.githubUrl
    const rootPath = path.dirname(repoPath);
    console.log(`[StorageWorker] Cloning ${data.repoId} into ${repoPath}`);
    console.log(`Cloning start: ${Date.now()}`);

    await mkdir(rootPath, { recursive: true });
    git = simpleGit(rootPath);

    await git.clone(cloneUrl, repoPath, [
        "--depth=1",
        "--single-branch",
    ]);

    console.log(`✅ Successfully cloned: ${repoPath}`);
    console.log(`Cloning end: ${Date.now()}`);
}

// check if the repo already exists in our local base
export const checkIfRepoExists = async (pathOrRepoId: string): Promise<boolean> => {
    try {
        const targetPath = path.isAbsolute(pathOrRepoId)
            ? pathOrRepoId
            : createPath("codebases", pathOrRepoId);

        const stats = await fs.stat(targetPath);
        return stats.isDirectory();
    } catch (err: any) {
        if (err.code === "ENOENT") {
            return false;
        }
        throw err;
    }
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

