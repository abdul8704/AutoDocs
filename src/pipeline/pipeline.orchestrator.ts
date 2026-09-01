import simpleGit from "simple-git";
import { getRepoFiles } from "./stages/L1.inventory"
import prisma from "../prisma/prisma";
import { FileRecord } from "./pipeline.types"
import { isCompatibleForTinyRepo, packFiles } from "./pipeline.helper"
import { LLMService } from "../LLM/llm.service";
import { DocsAndPRSchema } from "../LLM/llm.types";
import { writeFilesAndCommit, openPR } from "../github/github.service";

export const generateFirstTimeDocs = async (
    repoId: string,
    repoPath: string,
    jobId: string,
    cloneUrl: string,
    installationId: number
): Promise<string> => {
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
        throw new Error("Repo is not compatible for TinyRepo");
    }

    await prisma.docsUpdateJob.update({
        where: {
            id: jobId
        },
        data: {
            status: "GENERATING"
        }
    });
    console.log("[PIPELINE] Preprocessing done, about to generate docs")
    const generatedDocs: DocsAndPRSchema = await generateDocsTinyRepo(codeFiles, intentFiles, others, repoPath, llmService);

    console.log("[PIPELINE] Writing to repo");

    await writeFilesAndCommit("autoDocs", repoPath, [{
        path: "ARCHITECTURE.md",
        content: generatedDocs.documentation
    }], generatedDocs.commitMessage);

    const parsedUrl = new URL(cloneUrl);
    const parts = parsedUrl.pathname.split('/');
    const repoOwner = parts[1];
    const repoName = parts[2].replace('.git', '');

    const { prNumber, prLink } = await openPR(
        repoOwner,
        repoName,
        generatedDocs.prTitle,
        generatedDocs.prBody,
        "autoDocs",
        "main",
        installationId
    )

    console.log("[PIPELINE] PR opened successfully")

    await prisma.docsUpdateJob.update({
        where: {
            id: jobId
        },
        data: {
            status: "PR_OPEN",
            branchName: "autoDocs",
            pullRequestId: prNumber,

        }
    });

    return prLink;
}

const generateDocsTinyRepo = async (codeFiles: FileRecord[], intentFiles: FileRecord[], others: FileRecord[], repoPath: string, llmService: LLMService): Promise<DocsAndPRSchema> => {
    console.log("[PIPELINE] Packing files")
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

    const docs: DocsAndPRSchema = await llmService.getStructuredTinyRepoDocs(prompt);
    console.log("[PIPELINE] Docs generated successfully");

    return docs;
}

