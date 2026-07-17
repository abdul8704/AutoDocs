import simpleGit from "simple-git"
import fs from "fs/promises";
import { createPath } from "../utils/pathHelper.utils";
import { CodebaseChangeEvent } from "../types/repo.types";
import { constructPath } from "../utils/pathHelper.utils"

const git = simpleGit();

export const cloneNewRepo = async (event: CodebaseChangeEvent, repoName: string) => {
    const path = constructPath(repoName);
    await git.clone(event.repo.clone_url, path);
}

export const checkIfRepoExists = async (repoName: string): Promise<boolean> => {
    const path = createPath("codebases", repoName);

    const stats = await fs.stat(path);
    return stats.isDirectory(); 
}