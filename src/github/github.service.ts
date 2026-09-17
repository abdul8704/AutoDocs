import simpleGit, { SimpleGit } from "simple-git"
import fs, { mkdir } from "fs/promises";
import { createPath } from "../utils/pathHelper.utils";
import { constructPath } from "../utils/pathHelper.utils"
import prisma from "../prisma/prisma";
import * as githubAppService from "./github.app.service";

import { publishCleanup, publishPushForClassification, removeJobsForRepo } from "../queue/publishers";
import { CleanupJobData, PushClassifyJobData } from "../queue/types.queue";
import path from "path";
import { ScopedCacheService } from "../LLM/llm.cache.service";
import { BillingService } from "../billing/billing.service";

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
    const branch = ref ? ref.replace("refs/heads/", "") : "";

    try {
        if (branch) {
            await git.fetch(["origin", branch]);
        } else {
            await git.fetch(["origin"]);
        }
    } catch (fetchErr) {
        console.warn(`[fetchLocalChanges] Specific fetch for '${branch}' failed, falling back to git fetch origin:`, fetchErr);
        try {
            await git.fetch(["origin"]);
        } catch (fallbackErr) {
            console.error("[fetchLocalChanges] Fallback git fetch origin failed:", fallbackErr);
            throw fallbackErr;
        }
    }
    console.log("local changes downloaded successfully");
}

export const pullChanges = async (repoPath: string) => {
    git = simpleGit(repoPath);
    await git.pull("origin");
    
    console.log("remote changes pulled successfully");

    const sha = await git.revparse(["HEAD"]);
    return sha.trim();
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

    git = simpleGit(repoPath);
    const sha = await git.revparse(["HEAD"]);

    return sha.trim();
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
    } catch (err: unknown) {
        if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "ENOENT") {
            return false;
        }
        throw err;
    }
}
export const evictAllCaches = async (payload: { pull_request?: { number?: number }; repository?: { id?: number | string } }) => {
    const prNumber = payload.pull_request?.number;
    const githubRepoId = payload.repository?.id?.toString();

    if (prNumber) {
        const latestPR = await prisma.docsUpdateJob.findFirst({
            where: {
                pullRequestId: prNumber,
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        if (latestPR && latestPR.status === "PR_OPEN") {
            await prisma.docsUpdateJob.update({
                where: {
                    id: latestPR.id,
                },
                data: {
                    status: "MERGED",
                }
            });
        }
    }

    if (githubRepoId) {
        const cache = new ScopedCacheService();
        const repo = await prisma.repo.findUnique({
            where: {
                github_repo_id: githubRepoId
            },
            include: {
                user: true
            }
        });

        if (repo) {
            await cache.evictCache(repo.user.id, repo.id, "tinyRepo");
        }
    }
};

export const githubWebhookHandlerService = async (payload: { repository: { id: number | string; default_branch: string; name?: string }; ref: string; after: string; before: string }) => {
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

        const hasSufficientCredits = await BillingService.hasSufficientBalance(importedRepo.user.id, 10);

        const status = hasSufficientCredits ? "PENDING" : "INSUFFICIENT_CREDITS";
        const errorLog = hasSufficientCredits ? null : "Insufficient credits (< 10 credits). Request paused until user manually retries.";

        const job = await prisma.docsUpdateJob.create({
            data: {
                repoId: importedRepo.id,
                status,
                triggerCommit: payload.after,
                errorLog,
            }
        });
        console.log("Starting webhook job", job.id);

        if (hasSufficientCredits) {
            console.log(`🚀 Triggering doc update for imported repo: ${importedRepo.user.name}`);
            console.log(`Commit hash: ${payload.after}`);

            const workerObject: PushClassifyJobData = {
                docJobId: job.id,
                ref: payload.ref,
                repoId: importedRepo.id,
                installationId: importedRepo.installation_id,
                afterSha: payload.after,
                beforeSha: payload.before,
                defaultBranch: payload.repository.default_branch || "main",
                userId: importedRepo.user.id,
            };

            await publishPushForClassification(workerObject);
        } else {
            console.log(`[Webhook] User ${importedRepo.user.id} has insufficient credits (< 10). Job ${job.id} created with INSUFFICIENT_CREDITS status.`);
        }
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

    // Force push the branch to remote to ensure clean consolidated updates
    try {
        await git.push(['origin', branchName, '--force']);
    } catch (pushErr) {
        console.warn(`[writeFilesAndCommit] Force push failed, falling back to standard push:`, pushErr);
        await git.push('origin', branchName);
    }
}

export const getDefaultBranch = async (repoPath: string): Promise<string> => {
    try {
        const git = simpleGit(repoPath);
        const symbolicRef = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
        const branch = symbolicRef.trim().replace(/^refs\/remotes\/origin\//, "");
        if (branch) return branch;
    } catch {
        try {
            const git = simpleGit(repoPath);
            const summary = await git.branchLocal();
            if (summary.current) return summary.current;
        } catch {
            // ignore
        }
    }
    return "main";
};

export const openPR = async (
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string,
    installationId: number,
    repoId?: string
) => {
    const octokit = await githubAppService.getInstallationOctokit(installationId);

    // 1. Check for existing open PRs raised by our app for this head branch
    try {
        const existingPrs = await octokit.rest.pulls.list({
            owner,
            repo,
            head: `${owner}:${head}`,
            state: "open"
        });

        for (const existingPr of existingPrs.data) {
            console.log(`[openPR] Closing existing open PR #${existingPr.number} in repo ${owner}/${repo} to replace with a new consolidated PR...`);
            try {
                await octokit.rest.pulls.update({
                    owner,
                    repo,
                    pull_number: existingPr.number,
                    state: "closed"
                });
                console.log(`[openPR] Successfully closed PR #${existingPr.number} on GitHub.`);
            } catch (closeErr) {
                console.error(`[openPR] Error closing existing PR #${existingPr.number}:`, closeErr);
            }

            // Update database records associated with the old PR number
            await prisma.docsUpdateJob.updateMany({
                where: {
                    pullRequestId: existingPr.number,
                    status: "PR_OPEN",
                },
                data: {
                    status: "DROPPED",
                    errorLog: "Superseded and replaced by a newer pull request.",
                },
            }).catch((dbErr) => console.error("[openPR] Failed to update old job status in DB:", dbErr));
        }
    } catch (listErr) {
        console.warn("[openPR] Could not list existing open PRs:", listErr);
    }

    // 2. Also ensure any existing job for repoId marked PR_OPEN is superseded in DB
    if (repoId) {
        await prisma.docsUpdateJob.updateMany({
            where: {
                repoId,
                status: "PR_OPEN",
            },
            data: {
                status: "DROPPED",
                errorLog: "Superseded and replaced by a newer pull request.",
            },
        }).catch((dbErr) => console.error("[openPR] Failed to update existing repo PR_OPEN jobs in DB:", dbErr));
    }

    // 3. Create the new PR
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
    } catch (err: unknown) {
        if (typeof err === "object" && err !== null && "status" in err && (err as { status?: number }).status === 422) {
            // Retry with target repository default branch if base branch mismatched
            try {
                const repoInfo = await octokit.rest.repos.get({ owner, repo });
                const actualDefaultBranch = repoInfo.data.default_branch;

                if (actualDefaultBranch && actualDefaultBranch !== base) {
                    console.log(`Retrying PR creation with target repository default branch: '${actualDefaultBranch}'`);
                    const prResponse = await octokit.rest.pulls.create({
                        owner,
                        repo,
                        title,
                        body,
                        head,
                        base: actualDefaultBranch,
                    });
                    console.log(`PR successfully created: ${prResponse.data.html_url}`);
                    return { prNumber: prResponse.data.number, prLink: prResponse.data.html_url };
                }
            } catch (retryErr) {
                console.error("[openPR] Failed to retry PR creation with repo default branch:", retryErr);
            }
        }
        throw err;
    }
}