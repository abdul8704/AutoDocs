import simpleGit from "simple-git"
import fs from "fs/promises";
import { createPath } from "../utils/pathHelper.utils";
import { CodebaseChangeEvent, GitFetchResponse } from "../types/repo.types";
import { constructPath } from "../utils/pathHelper.utils"
import prisma from "../prisma/prisma";

const git = simpleGit();

// clone the repo into our base
export const cloneNewRepo = async (event: CodebaseChangeEvent) => {
    // creates path like codebases/<repo_id>/
    const path = constructPath(event.repo.id);
    await git.clone(event.repo.clone_url, path);
}

// check if the repo already exists in our local base
export const checkIfRepoExists = async (repoName: string): Promise<boolean> => {
    const path = createPath("codebases", repoName);

    const stats = await fs.stat(path);
    return stats.isDirectory(); 
}

export const fetchAndClassify = async (event: CodebaseChangeEvent, repoName: string) => {
    const repoUrl: string = event.repo.clone_url;
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

    // if(repo === null){
    //     // write the repoId to db
    //     await prisma.repo.create({
    //         data: {
    //             user_id: "1",
    //             github_repo_id: repoId,
    //             clone_url: event.repo.clone_url,
    //         }
    //     })

    //     // clone the repo
    //     await cloneNewRepo(event);
    //     // TODO: cook with LLM

    // }
    // else{
    //     // check if local copy exists
    //     const exists = await checkIfRepoExists(event.repo.full_name);

    //     if(exists){
    //         // fetch the latest commits and compare with db commit
    //         const path = constructPath(event.repo.id);
    //         const gitRepo = simpleGit(path);

    //         await gitRepo.fetch();
    //         const oldCommit = repo.last_processed_commit;
    //         const newCommit = event.head_commit.id;
    //         const commitMessage = event.head_commit.message;

    //         if(oldCommit === newCommit)
    //             return;

    //         if(oldCommit === null){
    //             // no previously processed commit to diff against, treat as a fresh clone
    //             await cloneNewRepo(event);
    //             return;
    //         }

    //         // get the patch of the diff (one large string containing all the changes)
    //         const patch = await gitRepo.diff([
    //             oldCommit,
    //             newCommit
    //         ]);

    //         // diff of only new file names of added or modified or deleted files
    //         const filesChanged = await gitRepo.diff([
    //             "--name-status",
    //             oldCommit,
    //             newCommit
    //         ]);

    //         // TODO: Invoke LLM to compare patch and docs of repo to see if repo needs docs updation
    //         // TODO: If docs need updation, cook with LLM
    
    //     }
    //     else{
    //         // clone anew
    //         await cloneNewRepo(event); 
    //     }
    // }
}

function main(){
    const a = async () => {
        const k = await git.fetch("https://github.com/abdul8704/dsa-mentor-worker.git", "main");

        console.log(k.branches, k.tags, k.updated, k.deleted)
    }
    a();
}

main()