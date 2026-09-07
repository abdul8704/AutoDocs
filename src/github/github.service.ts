import simpleGit, { SimpleGit } from "simple-git"
import fs, { mkdir } from "fs/promises";
import { createPath } from "../utils/pathHelper.utils";
import { constructPath } from "../utils/pathHelper.utils"
import { CodebaseChangeEvent, GitFetchResponse } from "../types/repo.types";
import prisma from "../prisma/prisma";
import * as githubAppService from "./github.app.service"

import { publishCleanup, publishDeepCloneForPush, publishPushForClassification, removeJobsForRepo } from "../queue/publishers"
import { CleanupJobData, DeepClonePushJobData, FirstTimeImportJobData, PushClassifyJobData } from "../queue/types.queue";
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

export const fetchLocalChanges = async (repoId: string, ref: string) => {
    git = simpleGit(constructPath(repoId));
    const branch = ref.replace("refs/heads/", "");

    await git.fetch(["origin", branch]);
    console.log("local changes downloaded successfully")
}

export const pullChanges = async (repoPath: string) => {
    git = simpleGit(repoPath);
    await git.pull("origin");
    console.log("remote changes pulled successfully");
}
export const mergeChanges = async (repoPath: string, branch: string) => {
    git = simpleGit(repoPath);
    await git.checkout(branch);
    await git.merge([`origin/${branch}`]);
    console.log("remote changes merged successfully");
}
// clone the repo into our base
export const cloneNewRepo = async (cloneUrl: string, repoPath: string, cloneMode: "shallow" | "deep" = "shallow") => {
    // creates path like codebases/<repo_id>/
    const rootPath = path.dirname(repoPath);
    console.log(`Cloning start: ${Date.now()} in ${cloneMode} mode`);

    await mkdir(rootPath, { recursive: true });
    git = simpleGit(rootPath);

    if (cloneMode == "shallow") {
        await git.clone(cloneUrl, repoPath, [
            "--depth=1",
            "--single-branch",
        ]);
    }
    else {
        await git.clone(cloneUrl, repoPath);
    }

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
        console.log("[CheckIfExists]", targetPath, stats.isDirectory());
        return stats.isDirectory();
    } catch (err: any) {
        if (err.code === "ENOENT") {
            return false;
        }
        throw err;
    }
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

        // TODO: FUTURE PRICING CHECK (SEAMLESS INTEGRATION) ---
        // if (importedRepo.user.usedDocsQuota >= 15 && importedRepo.user.planType === 'FREE') {
        //    return res.status(200).send("Quota exceeded");
        // }

        const job = await prisma.docsUpdateJob.create({
            data: {
                repoId: importedRepo.id,
                status: "PENDING",
            }
        });
        console.log("Starting webhok job")

        console.log(`🚀 Triggering doc update for imported repo: ${importedRepo.user.name}`);
        console.log(`Commit hash: ${payload.after}`);

        const workerObject: PushClassifyJobData = {
            docJobId: job.id,
            ref: payload.ref,
            repoId: importedRepo.id,
            installationId: importedRepo.installation_id,
            afterSha: payload.after,
            beforeSha: payload.before,
            defaultBranch: "main",
            userId: importedRepo.user.id,
        }

        await publishPushForClassification(workerObject);
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


export const writeFilesAndCommit = async (
    branchName: string,
    repoPath: string,
    filesToCommit: Array<{ path: string; content: string }>,
    commitMessage: string,
    authenticatedUrl: string
) => {
    const git: SimpleGit = simpleGit(repoPath);

    const branches = await git.branchLocal();
    if (branches.all.includes(branchName)) {
        await git.checkout(branchName);
    } else {
        await git.checkoutLocalBranch(branchName);
    }

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

    await git.remote(['set-url', 'origin', authenticatedUrl]);

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
    
    try {
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
    } catch (err: any) {
        // Fallback: If PR already exists for this head branch, update the existing PR
        if (err.status === 422) {
            const existingPrs = await octokit.rest.pulls.list({
                owner,
                repo,
                head: `${owner}:${head}`,
                state: "open"
            });

            if (existingPrs.data.length > 0) {
                const existingPr = existingPrs.data[0];
                await octokit.rest.pulls.update({
                    owner,
                    repo,
                    pull_number: existingPr.number,
                    title,
                    body,
                });
                console.log(`PR already exists, updated PR #${existingPr.number}: ${existingPr.html_url}`);
                return { prNumber: existingPr.number, prLink: existingPr.html_url };
            }
        }
        throw err;
    }
}