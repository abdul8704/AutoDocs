import { env } from "../config/env";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import prisma from "../prisma/prisma";
import { GitAllRepoResponse } from "../types/repo.types" 

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

export const importThisRepo = async (userId: string, githubRepoId: string, name: string, cloneUrl: string, installationId: number) => {
    const importedRepo = await prisma.repo.upsert({
      where: { github_repo_id: githubRepoId },
      update: {
        user_id: userId,
        installation_id: Number(installationId),
        clone_url: cloneUrl,
        full_name: name,
      },
      create: {
        user_id: userId,
        github_repo_id: githubRepoId,
        full_name: name,
        clone_url: cloneUrl,
        installation_id: Number(installationId),
      },
    });

    return importedRepo;
}