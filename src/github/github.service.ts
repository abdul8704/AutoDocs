import simpleGit, { SimpleGit } from "simple-git"
import fs, { mkdir } from "fs/promises";
import { createPath } from "../utils/pathHelper.utils";
import { constructPath } from "../utils/pathHelper.utils"
import { CodebaseChangeEvent, GitFetchResponse } from "../types/repo.types";
import prisma from "../prisma/prisma";
import * as githubAppService from "./github.app.service"

import { publishCleanup, publishDeepCloneForPush, removeJobsForRepo } from "../queue/publishers"
import { CleanupJobData, DeepClonePushJobData, FirstTimeImportJobData } from "../queue/types.queue";
import path from "path";

export interface PRPayload {
    repoOwner: string;
    repoName: string;
    repoPath: string;
    installationId: number;
    branchName: string;
    commitMessage: string;
    prTitle: string;
    prBody: string;
    filesToCommit: Array<{ path: string; content: string }>;
}

let git: SimpleGit = simpleGit();

// clone the repo into our base
export const cloneNewRepo = async (data: FirstTimeImportJobData, repoPath: string) => {
    // creates path like codebases/<repo_id>/
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
    // 1. Remove all active, waiting, delayed, paused, or failed BullMQ jobs associated with this repo
    await removeJobsForRepo(repoId);

    const path = constructPath(repoId);

    if (await checkIfRepoExists(path)) {
        const cleanUpData: CleanupJobData = {
            repoId,
            userId,
            action: "DELETE_REPO"
        }
        await publishCleanup(cleanUpData)
    }

    const repos = await prisma.repo.findMany({
        where: {
            user_id: userId,
            github_repo_id: repoId
        }
    });

    const repoDbIds = repos.map((repo) => repo.id);
    if (repoDbIds.length > 0) {
        await prisma.docsUpdateJob.deleteMany({
            where: {
                repoId: { in: repoDbIds }
            }
        });
    }

    await prisma.repo.deleteMany({
        where: {
            user_id: userId,
            github_repo_id: repoId
        }
    });

    return;
}


export const writeFilesAndCommit = async (branchName: string, repoPath: string, filesToCommit: Array<{ path: string; content: string }>, commitMessage: string) => {
    const git: SimpleGit = simpleGit(repoPath)
    await git.checkoutLocalBranch(branchName);

    for (const file of filesToCommit) {
        const filePath = path.join(repoPath, file.path);

        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content);
    }

    await git.add("./*");

    // Setup git user (required for commits)
    await git.addConfig('user.name', 'My AI Docs Bot');
    await git.addConfig('user.email', 'bot@mydomain.com');

    await git.commit(commitMessage);

    // Push the new branch to the remote
    await git.push('origin', branchName);
}

export const openPR = async (
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string,
    installationId: number
) => {
    const octokit = await githubAppService.getInstallationOctokit(installationId);
    const prResponse = await octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head,
        base,
    });

    console.log(`PR successfully created: ${prResponse.data.html_url}`);

    return { prNumber: prResponse.data.number, prLink: prResponse.data.html_url };
}