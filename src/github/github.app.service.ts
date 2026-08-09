import { env } from "../config/env";
import prisma from "../prisma/prisma";
import { GitAllRepoResponse, ImportedRepoResponse, InstallationStatusResponse } from "../types/repo.types"
import { HttpError } from "../utils/httpError.utils";
import { scanCustomPrompt } from "../utils/promptGuard.utils";
import { publishFirstTimeImport } from "../queue/publishers"
import { FirstTimeImportJobData } from "../queue/types.queue";
import { DocGenResult } from "../pipeline/pipeline.orchestrator"
import { beginRun, RUN_STEPS } from "../pipeline/pipeline.progress"
import { scopedLogger } from "../utils/logger.utils"

const log = scopedLogger("import");

const APP_ID = env.GITHUB_APP_ID
const PRIVATE_KEY = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");

// Creates an authenticated Octokit instance for a specific user's installation_id
/* 
    1. creates a jwt with payload of appid,sign with privkey, and send a POST rew to /app/installations/{installationId}/access_tokens.
    2. github will verify this token with its public key to verify the identity of our server
    3. and then after confirming its our server that is making the req, it will send installation token
*/
export const getInstallationOctokit = async (installationId: number) => {
  const [{ Octokit }, { createAppAuth }] = await Promise.all([
    import("@octokit/rest"),
    import("@octokit/auth-app"),
  ]);

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: APP_ID,
      privateKey: PRIVATE_KEY,
      installationId
    }
  })
};

// App-level (rather than installation-level) client, for the handful of endpoints
// that act on an installation itself instead of the repos inside it.
const getAppOctokit = async () => {
  const [{ Octokit }, { createAppAuth }] = await Promise.all([
    import("@octokit/rest"),
    import("@octokit/auth-app"),
  ]);

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: APP_ID,
      privateKey: PRIVATE_KEY,
    }
  })
};

// Removes the AutoDocs GitHub App from the user's account, which also stops GitHub
// from sending us push webhooks for repos we no longer have any record of. Only the
// installation is removed - the repositories and their code are untouched.
export const uninstallApp = async (installationId: number) => {
  const octokit = await getAppOctokit();
  await octokit.rest.apps.deleteInstallation({ installation_id: installationId });
}

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

  log.info({ repo: githubRepoId, userId, repoFullName: name }, `first-time import requested: ${name}`);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubInstallationId: true },
  });

  if (!user?.githubInstallationId) {
    log.warn({ repo: githubRepoId, userId }, "import rejected — GitHub App is not installed for this user");
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

  log.info({ repo: githubRepoId, id: importedRepo.id }, "Repo row upserted");

  const publisherData: FirstTimeImportJobData = {
    repoId: githubRepoId,
    userId,
    repoFullName: name,
    installationId: user.githubInstallationId,
    defaultBranch: "main",
    cloneUrl: await getAuthenticatedRepoUrl(cloneUrl, user.githubInstallationId),
    //      customPrompt // TODO
  }
  const job = await publishFirstTimeImport(publisherData)

  log.info({ repo: githubRepoId, job: job.id }, `queued on repo-storage-queue as job ${job.id}`);

  // Creates the RepoDocState row up front, so the frontend has something to
  // poll from the instant the import is accepted rather than only once the
  // whole pipeline finishes.
  await beginRun(githubRepoId, "FIRST_IMPORT", job.id ?? null, "QUEUED");

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
// Run status — what the frontend polls while a documentation run is in flight.
//
// Reads the live progress columns pipeline.progress writes at every step, so
// this reflects the stage the pipeline is on RIGHT NOW, not just the finished
// artifacts. Returns a row even for a repo that has never been documented.
// ============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The frontend routes on Repo.id (a uuid) while the pipeline keys everything on
// github_repo_id (a numeric string). Accept either rather than making the
// caller know which one it is holding.
export const repoIdentity = (repoIdOrGithubId: string) =>
  UUID_RE.test(repoIdOrGithubId)
    ? { id: repoIdOrGithubId }
    : { github_repo_id: repoIdOrGithubId };

const findUserRepo = async (userId: string, repoIdOrGithubId: string) => {
  return prisma.repo.findFirst({
    where: { ...repoIdentity(repoIdOrGithubId), user_id: userId },
    include: { doc_state: true },
  });
};

// Maps the run state onto the small vocabulary the StatusPill component knows.
const toPillState = (
  runStatus: string,
  trigger: string | null,
  hasDocs: boolean,
): string => {

  switch (runStatus) {
    case "QUEUED": return "queued";
    case "RUNNING": return trigger === "WEBHOOK_PUSH" && hasDocs ? "updating" : "processing";
    case "COMPLETED": return "complete";
    case "FAILED": return "failed";
    case "SKIPPED": return hasDocs ? "complete" : "pending";
    default: return hasDocs ? "complete" : "pending";
  }
};

export const getRepoStatus = async (userId: string, repoIdOrGithubId: string) => {

  const repo = await findUserRepo(userId, repoIdOrGithubId);

  if (!repo) {
    throw new HttpError(404, "Repo not found");
  }

  const state = repo.doc_state;
  const runStatus = state?.run_status ?? "IDLE";
  const hasDocs = Boolean(repo.last_processed_commit);

  return {
    repoId: repo.id,
    githubRepoId: repo.github_repo_id,
    name: repo.full_name,

    // Run lifecycle
    runStatus,
    state: toPillState(runStatus, state?.run_trigger ?? null, hasDocs),
    active: runStatus === "QUEUED" || runStatus === "RUNNING",
    completed: runStatus === "COMPLETED" || (runStatus === "IDLE" && hasDocs),
    trigger: state?.run_trigger ?? null,

    // Where in the pipeline it is
    steps: RUN_STEPS,
    stage: state?.stage_label ?? null,      // coarse step name, matches `steps`
    stageKey: state?.stage ?? null,         // granular machine stage
    stageIndex: state?.stage_index ?? null,
    message: state?.stage_detail ?? null,
    progress: state?.progress_total
      ? { done: state.progress_done ?? 0, total: state.progress_total }
      : null,

    // Outcome
    prUrl: state?.pr_url ?? null,
    error: state?.last_error ?? null,
    routeKind: state?.route_kind ?? null,
    ownerReport: state?.owner_report ?? null,
    lastProcessedCommit: repo.last_processed_commit,

    startedAt: state?.run_started_at ?? null,
    finishedAt: state?.run_finished_at ?? null,
    updatedAt: state?.updated_at ?? null,
  };
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
export const getRepoPrompts = async (userId: string, repoIdOrGithubId: string) => {
  const repo = await prisma.repo.findFirst({
    where: { ...repoIdentity(repoIdOrGithubId), user_id: userId },
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
  repoIdOrGithubId: string,
  input: RepoPromptsInput,
) => {
  const repo = await prisma.repo.findFirst({
    where: { ...repoIdentity(repoIdOrGithubId), user_id: userId },
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

  // 6. Create the PR branch — or force-move it if it already exists from a
  // previous docs run (retries / repeated webhook updates reuse one branch).
  try {
    await octokit.rest.git.createRef({
      owner,
      repo: repoName,
      ref: `refs/heads/${newBranch}`,
      sha: newCommit.sha,
    });
  } catch (err: any) {
    if (err?.status !== 422) throw err;      // 422 = ref already exists
    await octokit.rest.git.updateRef({
      owner,
      repo: repoName,
      ref: `heads/${newBranch}`,
      sha: newCommit.sha,
      force: true,
    });
  }

  // 7. Open the Pull Request — or refresh the one already open for this branch.
  try {
    const { data: pullRequest } = await octokit.rest.pulls.create({
      owner,
      repo: repoName,
      title: docResult.prTitle,
      body: docResult.prBody,
      head: newBranch,
      base: baseBranch,
    });
    return pullRequest.html_url;
  } catch (err: any) {
    if (err?.status !== 422) throw err;      // 422 = PR already exists for head
    const { data: open } = await octokit.rest.pulls.list({
      owner,
      repo: repoName,
      state: "open",
      head: `${owner}:${newBranch}`,
    });
    if (open.length === 0) throw err;
    const { data: updated } = await octokit.rest.pulls.update({
      owner,
      repo: repoName,
      pull_number: open[0].number,
      title: docResult.prTitle,
      body: docResult.prBody,
    });
    return updated.html_url;
  }

}