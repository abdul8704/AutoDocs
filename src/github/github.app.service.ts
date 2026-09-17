import { env } from "../config/env";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import prisma from "../prisma/prisma";
import { GitAllRepoResponse, ImportedRepoResponse, InstallationStatusResponse } from "../types/repo.types"
import { HttpError } from "../utils/httpError.utils";
import { publishFirstTimeImport } from "../queue/publishers"
import { FirstTimeImportJobData } from "../queue/types.queue";
import { BillingService } from "../billing/billing.service";

const APP_ID = env.GITHUB_APP_ID
const PRIVATE_KEY = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");

// Creates an authenticated Octokit instance for a specific user's installation_id
/* 
    1. creates a jwt with payload of appid,sign with privkey, and send a POST rew to /app/installations/{installationId}/access_tokens.
    2. github will verify this token with its public key to verify the identity of our server
    3. and then after confirming its our server that is making the req, it will send installation token
*/
export const getInstallationOctokit = async (installationId: number): Promise<Octokit> => {
  if (!installationId || typeof installationId !== "number" || Number.isNaN(installationId) || installationId <= 0) {
    throw new HttpError(400, "Invalid or missing GitHub installation ID");
  }
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: APP_ID,
      privateKey: PRIVATE_KEY,
      installationId
    }
  })
};

// create a installation access token, which we will use to clone repo, send PRs
export const getInstallationToken = async (installationId: number): Promise<string> => {
  const octokit = await getInstallationOctokit(installationId);
  const auth = await octokit.auth({ type: "installation" }) as { token: string };
  return auth.token;
}
export const getHeadSha = async (repoId: number, installationId: number) => {
    const octokit = await getInstallationOctokit(installationId);

  const { data: repoData } = await octokit.request('GET /repositories/{repository_id}', {
    repository_id: repoId,
    headers: { 'X-GitHub-Api-Version': '2022-11-28' }
  });

  const owner = repoData.owner.login;
  const repo = repoData.name;
  const defaultBranch = repoData.default_branch;

  const { data: commitData } = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: defaultBranch,
  });

  return commitData.sha;
}

export const getAllRepos = async (installationId: number) => {
  const octokit = await getInstallationOctokit(installationId);

  // use this function to get all importable repos
  const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({ per_page: 100 });

  const repos: GitAllRepoResponse[] = data.repositories.map((repo) => ({
    githubRepoId: repo.id.toString(),
    name: repo.full_name,
    cloneUrl: repo.clone_url,
    isPrivate: repo.private,
    defaultBranch: repo.default_branch,
    language: repo.language ?? null,
  }));

  return repos;
}

// Persists the installation_id GitHub handed us in the setup callback against the
// user that kicked off the "Connect GitHub" flow, so we know from then on that this
// user has the app installed (and which installation to use for API calls).
export const saveInstallationId = async (userId: string, installationId: number) => {
  await prisma.user.update({
    where: { id: userId },
    data: { githubInstallationId: installationId },
  });
}

// Tells the frontend whether this user has ever completed the GitHub App install
// flow, so it can show "Connect GitHub" exactly once (and never again afterwards).
export const getInstallationStatus = async (userId: string): Promise<InstallationStatusResponse> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubInstallationId: true },
  });

  return {
    isInstalled: Boolean(user?.githubInstallationId),
    installationId: user?.githubInstallationId ?? null,
  };
}

// Looks up the installation_id we stored for this user and uses it to fetch every
// repo accessible to that installation. Throws if the user hasn't installed the app.
export const getAllReposForUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubInstallationId: true },
  });

  if (!user?.githubInstallationId) {
    throw new HttpError(400, "GitHub App is not installed for this user yet");
  }

  const allRepos = await getAllRepos(user.githubInstallationId);
  const importedRepos = await prisma.repo.findMany({
    where: { user_id: userId },
    select: { github_repo_id: true, full_name: true },
  });

  const importedSet = new Set(importedRepos.map((r) => r.github_repo_id));
  const importedNameSet = new Set(importedRepos.map((r) => (r.full_name?.toLowerCase() || '')));

  return allRepos.filter(
    (r) => !importedSet.has(r.githubRepoId) && !importedNameSet.has((r.name || '').toLowerCase())
  );
};

export const importThisRepo = async (userId: string, githubRepoId: string, name: string, cloneUrl: string, installation_id?: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubInstallationId: true },
  });

  const parsedPassedId = installation_id ? Number(installation_id) : NaN;
  const effectiveInstallationId = user?.githubInstallationId || (!Number.isNaN(parsedPassedId) && parsedPassedId > 0 ? parsedPassedId : null);

  if (!effectiveInstallationId) {
    throw new HttpError(400, "GitHub App is not installed for this user yet");
  }

  const numericRepoId = Number(githubRepoId);
  let headSha = "";

  if (!Number.isNaN(numericRepoId) && numericRepoId > 0) {
    try {
      headSha = await getHeadSha(numericRepoId, effectiveInstallationId);
    } catch (err) {
      console.warn(`[Import] getHeadSha by numeric ID ${numericRepoId} failed, falling back to name/url lookup:`, err);
    }
  }

  const url = new URL(cloneUrl);
  const installationToken: string = await getInstallationToken(effectiveInstallationId);
  
  // url.pathname will be "/torvalds/linux.git"
  const parts = url.pathname.split('/');
  const owner = parts[1];
  const repo = parts[2].replace('.git', '');

  let repoLanguage: string | null = null;
  try {
    const octokit = await getInstallationOctokit(effectiveInstallationId);
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    repoLanguage = repoData.language || null;
    if (!headSha) {
      const { data: commitData } = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: repoData.default_branch,
      });
      headSha = commitData.sha;
    }
  } catch (err) {
    console.warn("[Import] Failed to fetch repo metadata from Octokit:", err);
  }

  const repoSize = await getRepoSizeOctokit(owner, repo, installationToken);
  console.log(headSha);
  if (repoSize > 1000 * 1024 * 1024) {
      throw new HttpError(400, "Repo size is greater than 1GB, which is not allowed.");
  }

  const importedRepo = await prisma.repo.upsert({
    where: { github_repo_id: githubRepoId },
    update: {
      user_id: userId,
      installation_id: effectiveInstallationId,
      clone_url: cloneUrl,
      full_name: name,
      language: repoLanguage,
      last_processed_commit: headSha
    },
    create: {
      user_id: userId,
      github_repo_id: githubRepoId,
      full_name: name,
      clone_url: cloneUrl,
      language: repoLanguage,
      installation_id: effectiveInstallationId,
      last_processed_commit: headSha
    },
  });

  const hasSufficientCredits = await BillingService.hasSufficientBalance(userId, 10);
  const status = hasSufficientCredits ? "PENDING" : "INSUFFICIENT_CREDITS";
  const errorLog = hasSufficientCredits ? null : "Insufficient credits for initial import. Request paused until user manually retries.";

  const job = await prisma.docsUpdateJob.create({
    data: {
      repoId: importedRepo.id,
      status,
      errorLog,
    }
  });

  if (hasSufficientCredits) {
    const publisherData: FirstTimeImportJobData = {
      docJobId: job.id,
      repoId: importedRepo.id,
      userId,
      installationId: effectiveInstallationId,
      defaultBranch: "main",
      githubUrl: await getAuthenticatedRepoUrl(cloneUrl, effectiveInstallationId),
    };
    console.log("about to publish first time import");
    await publishFirstTimeImport(publisherData);
  } else {
    console.log(`[Import] User ${userId} has insufficient credits (< 10). Job ${job.id} created with INSUFFICIENT_CREDITS status.`);
  }

  return importedRepo;
}

// fetch every repo this user has already imported into the app, straight from the Repo table
export const getImportedRepos = async (userId: string) => {
  const repos = await prisma.repo.findMany({
    where: { user_id: userId },
    include: {
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: { jobs: true },
      },
    },
    orderBy: { created_at: "desc" },
  });

  const reposWithLanguage = await Promise.all(
    repos.map(async (repo) => {
      let lang = repo.language;
      if (!lang && repo.full_name) {
        try {
          const parts = repo.full_name.split('/');
          if (parts.length === 2) {
            const octokit = await getInstallationOctokit(repo.installation_id);
            const { data: repoData } = await octokit.rest.repos.get({
              owner: parts[0],
              repo: parts[1],
            });
            if (repoData.language) {
              lang = repoData.language;
              prisma.repo
                .update({
                  where: { id: repo.id },
                  data: { language: lang },
                })
                .catch(() => {});
            }
          }
        } catch (e) {
          // fallback silently
        }
      }

      return {
        id: repo.id,
        github_repo_id: repo.github_repo_id,
        full_name: repo.full_name,
        clone_url: repo.clone_url,
        installation_id: repo.installation_id,
        last_processed_commit: repo.last_processed_commit,
        language: lang || null,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        jobs: repo.jobs,
        _count: repo._count,
      };
    })
  );

  return reposWithLanguage;
}

export const getAuthenticatedRepoUrl = async (rawCloneUrl: string, installationId: number) => {
  const installationToken: string = await getInstallationToken(installationId);

  return rawCloneUrl.replace('https://', `https://x-access-token:${installationToken}@`);
}

async function getRepoSizeOctokit(owner: string, repo: string, installationToken: string) {
  const octokit = new Octokit({
    auth: installationToken
  });

  const { data } = await octokit.rest.repos.get({
    owner: owner,
    repo: repo,
  });

  return data.size; // Returns size in KB
}
