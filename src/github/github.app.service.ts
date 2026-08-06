import { env } from "../config/env";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import prisma from "../prisma/prisma";
import { GitAllRepoResponse, ImportedRepoResponse, InstallationStatusResponse } from "../types/repo.types"
import { HttpError } from "../utils/httpError.utils";
import { scanCustomPrompt } from "../utils/promptGuard.utils";
import { publishFirstTimeImport } from "../queue/publishers"
import { FirstTimeImportJobData } from "../queue/types.queue";
import { DocGenResult } from "../pipeline/pipeline.orchestrator"

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
  const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({ per_page: 100 });

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

export const importThisRepo = async (userId: string, githubRepoId: string, name: string, cloneUrl: string, installation_id: number) => {
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

  const publisherData: FirstTimeImportJobData = {
    repoId: githubRepoId,
    userId,
    repoFullName: name,
    installationId: user.githubInstallationId,
    defaultBranch: "main",
    cloneUrl: await getAuthenticatedRepoUrl(cloneUrl, user.githubInstallationId),
    //      customPrompt // TODO
  }
  await publishFirstTimeImport(publisherData)

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

// ============================================================================
// Custom doc instructions — free text the owner adds on top of our prompts.
// ============================================================================

export interface RepoPromptsInput {
  archPrompt?: string | null;
  modulePrompt?: string | null;
}

// Both lookups scope by user_id: that is what stops one user from reading or
// writing the instructions attached to somebody else's repo.
export const getRepoPrompts = async (userId: string, githubRepoId: string) => {
  const repo = await prisma.repo.findFirst({
    where: { github_repo_id: githubRepoId, user_id: userId },
    select: { arch_prompt: true, module_prompt: true, prompts_updated_at: true },
  });

  if (!repo) {
    throw new HttpError(404, "Repo not found");
  }

  return {
    archPrompt: repo.arch_prompt,
    modulePrompt: repo.module_prompt,
    updatedAt: repo.prompts_updated_at,
  };
}

export const setRepoPrompts = async (
  userId: string,
  githubRepoId: string,
  input: RepoPromptsInput,
) => {
  const repo = await prisma.repo.findFirst({
    where: { github_repo_id: githubRepoId, user_id: userId },
    select: { id: true },
  });

  if (!repo) {
    throw new HttpError(404, "Repo not found");
  }

  // Only the keys actually present in the body are touched — an omitted key
  // leaves the stored value alone, an explicit null clears it.
  const data: { arch_prompt?: string | null; module_prompt?: string | null; prompts_updated_at: Date } = {
    prompts_updated_at: new Date(),
  };

  const flags: Record<string, string[]> = {};

  if (input.archPrompt !== undefined) {
    data.arch_prompt = vetPrompt("archPrompt", input.archPrompt, flags);
  }

  if (input.modulePrompt !== undefined) {
    data.module_prompt = vetPrompt("modulePrompt", input.modulePrompt, flags);
  }

  const updated = await prisma.repo.update({
    where: { id: repo.id },
    data,
    select: { arch_prompt: true, module_prompt: true, prompts_updated_at: true },
  });

  return {
    prompts: {
      archPrompt: updated.arch_prompt,
      modulePrompt: updated.module_prompt,
      updatedAt: updated.prompts_updated_at,
    },
    flags,
  };
}

// Runs the injection scan and returns the text that is safe to persist. Anything
// the guard rejects becomes a 400 naming the field and the reasons, so the user
// can see what tripped rather than guessing.
const vetPrompt = (
  field: string,
  value: string | null,
  flags: Record<string, string[]>,
): string | null => {

  if (value === null || value.trim() === "") {
    return null;
  }

  const scan = scanCustomPrompt(value);

  if (!scan.ok) {
    throw new HttpError(400, `${field} rejected: ${scan.rejections.join("; ")}`);
  }

  if (scan.flags.length > 0) {
    flags[field] = scan.flags;
  }

  return scan.sanitized;
}

export const getAuthenticatedRepoUrl = async (rawCloneUrl: string, installationId: number) => {
  const installationToken: string = await getInstallationToken(installationId);

  return rawCloneUrl.replace('https://', `https://x-access-token:${installationToken}@`);
}

export const raisePR = async (
  repoId: string,
  baseBranch: string,
  newBranch: string,
  docResult: DocGenResult
) => {
  
  const repo = await prisma.repo.findUnique({
    where: {
      github_repo_id: repoId
    }
  });
  
  if(!repo || !repo.full_name)
    throw new Error(`${repoId} doesnt exist in DB`)

  const user = await prisma.user.findUnique({
    where: {
      id: repo?.user_id
    }
  });
  
  if(!user) 
    throw new Error("User not found")

  const owner = repo?.full_name?.split("/")[0];
  const repoName = repo?.full_name?.split("/")[1];
  const installationId = user?.githubInstallationId;

  if(!installationId)
      throw new Error(`Installation Id not found for ${user.name}`);

  const octokit = await getInstallationOctokit(installationId);

  const files: Array<{ path: string; content: string }> = [];

  // Add architecture doc at root (e.g. "architecture.md")
  if (docResult.archDoc) {
    files.push({
      path: "architecture.md",
      content: docResult.archDoc,
    });
  }

  // Add module docs under docs/ directory
  for (const [filename, content] of Object.entries(docResult.moduleDocs)) {
    files.push({
      path: `docs/${filename}`,
      content,
    });
  }

  const { data: baseRef } = await octokit.rest.git.getRef({
    owner,
    repo: repoName,
    ref: `heads/${baseBranch}`,
  });

  const parentCommitSha = baseRef.object.sha;

  const { data: parentCommit } = await octokit.rest.git.getCommit({
    owner,
    repo: repoName,
    commit_sha: parentCommitSha,
  });

  const baseTreeSha = parentCommit.tree.sha;

  // 4. Build Git tree objects
  const tree = files.map((file) => ({
    path: file.path,
    mode: "100644" as const,
    type: "blob" as const,
    content: file.content,
  }));

  const { data: newTree } = await octokit.rest.git.createTree({
    owner,
    repo: repoName,
    base_tree: baseTreeSha,
    tree,
  });

  // 5. Create new commit
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo:  repoName,
    message: docResult.commitMessage,
    tree: newTree.sha,
    parents: [parentCommitSha],
  });

  // 6. Create branch for the PR
  await octokit.rest.git.createRef({
    owner,
    repo: repoName,
    ref: `refs/heads/${newBranch}`,
    sha: newCommit.sha,
  });


  // 8. Open the Pull Request
  const { data: pullRequest } = await octokit.rest.pulls.create({
    owner,
    repo: repoName,
    title: docResult.prTitle,
    body: docResult.prBody,
    head: newBranch,
    base: baseBranch,
  });

  return pullRequest.html_url;

}