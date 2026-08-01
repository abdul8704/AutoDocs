import { env } from "../config/env";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import prisma from "../prisma/prisma";
import { GitAllRepoResponse, ImportedRepoResponse, InstallationStatusResponse } from "../types/repo.types" 
import { HttpError } from "../utils/httpError.utils";

const APP_ID = env.GITHUB_APP_ID
const PRIVATE_KEY = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");

// Creates an authenticated Octokit instance for a specific user's installation_id
/* 
    1. creates a jwt with payload of appid,sign with privkey, and send a POST rew to /app/installations/{installationId}/access_tokens.
    2. github will verify this token with its public key to verify the identity of our server
    3. and then after confirming its our server that is making the req, it will send installation token
*/
export const getInstallationOctokit = async (installationId: number): Promise<Octokit> => {
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

export const getAllRepos = async (installationId: number) => {
    const octokit = await getInstallationOctokit(installationId);

    // use this function to get all importable repos
    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({ per_page: 100});

    const repos: GitAllRepoResponse[] = data.repositories.map((repo) => ({
      githubRepoId: repo.id.toString(),
      name: repo.full_name,
      cloneUrl: repo.clone_url,
      isPrivate: repo.private,
      defaultBranch: repo.default_branch,
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

    return getAllRepos(user.githubInstallationId);
}

export const importThisRepo = async (userId: string, githubRepoId: string, name: string, cloneUrl: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubInstallationId: true },
    });

    if (!user?.githubInstallationId) {
      throw new HttpError(400, "GitHub App is not installed for this user yet");
    }

    const importedRepo = await prisma.repo.upsert({
      where: { github_repo_id: githubRepoId },
      update: {
        user_id: userId,
        installation_id: user.githubInstallationId,
        clone_url: cloneUrl,
        full_name: name,
      },
      create: {
        user_id: userId,
        github_repo_id: githubRepoId,
        full_name: name,
        clone_url: cloneUrl,
        installation_id: user.githubInstallationId,
      },
    });

    return importedRepo;
}

// fetch every repo this user has already imported into the app, straight from the Repo table
export const getImportedRepos = async (userId: string) => {
    const repos = await prisma.repo.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    });

    const importedRepos: ImportedRepoResponse[] = repos.map((repo) => ({
      id: repo.id,
      githubRepoId: repo.github_repo_id,
      name: repo.full_name,
      cloneUrl: repo.clone_url,
      installationId: repo.installation_id,
      lastProcessedCommit: repo.last_processed_commit,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
    }));

    return importedRepos;
}

export const getAuthenticatedRepoUrl = async (rawCloneUrl: string, installationId: number) => {
  const installationToken: string = await getInstallationToken(installationId);

  return rawCloneUrl.replace('https://', `https://x-access-token:${installationToken}@`);
}
