import simpleGit from "simple-git";
import { getRepoFiles } from "./stages/L1.inventory"
import prisma from "../prisma/prisma";
import { FileRecord } from "./pipeline.types"
import { isCompatibleForTinyRepo, packFiles } from "./pipeline.helper"
import { LLMService } from "../LLM/llm.service";

export const generateFirstTimeDocs = async (
    repoId: string,
    repoPath: string,
) => {
    const llmService = new LLMService();

    const git = simpleGit(repoPath);
    const {
        files,
        codeFiles,
        intentFiles,
        others
    }: {
        files: string[];
        codeFiles: FileRecord[];
        intentFiles: FileRecord[];
        others: FileRecord[];
    } = await getRepoFiles(git, repoPath);

    // TODO: if is_compatible = false, don't store in DB.
    const is_compatible = await isCompatibleForTinyRepo(files, codeFiles, intentFiles, others, repoPath);

    if (!is_compatible) {
        console.log("[StorageWorker] This repo is big, not suitable for TinyRepo");
        return;
    }
    await generateDocsTinyRepo(codeFiles, intentFiles, others, repoPath, llmService);
}

const generateDocsTinyRepo = async (codeFiles: FileRecord[], intentFiles: FileRecord[], others: FileRecord[], repoPath: string, llmService: LLMService) => {
    const codeFilesPacked = packFiles(codeFiles, repoPath);
    const intentFilesPacked = packFiles(intentFiles, repoPath);
    const othersPacked = packFiles(others, repoPath);

    const prompt = `
    Codefiles \n
    ${codeFilesPacked}

    Intentfiles \n
    ${intentFilesPacked}

    Others \n
    ${othersPacked}
    `

    const docs = await llmService.getTinyRepoDocs(prompt);
    console.log(docs);
}