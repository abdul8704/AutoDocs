import simpleGit from "simple-git";
import { getRepoFiles } from "./stages/L1.inventory"
import prisma from "../prisma/prisma";
import { DiffSummary, FileRecord } from "./pipeline.types"
import { isCompatibleForTinyRepo, packFiles, updateJobStatus } from "./pipeline.helper"
import { LLMService } from "../LLM/llm.service";
import { DocsAndPRSchema } from "../LLM/llm.types";
import { writeFilesAndCommit, openPR, mergeChanges } from "../github/github.service";
import { generateDocsTinyRepo } from "./stages/L4.tinyDocs"
import { evaluateDiff, getChangedFilesPacked, getRemovedFiles, llmJudge } from "./stages/L2.judge";
import { clone } from "zod";
import { CACHE_RECONCILIATION_ENFORCEMENT_PROMPT } from "../LLM/llm.constants";
import { ScopedCacheService } from "../LLM/llm.cache.service";

export const generateFirstTimeDocs = async (
    userId: string,
    repoId: string,
    currentCommitSha: string,
    repoPath: string,
    jobId: string,
    cloneUrl: string,
    installationId: number,
    defaultBranch: string = "main"
): Promise<string> => {
    const llmService = new LLMService();

    const git = simpleGit(repoPath);
    const {
        files,
        codeFiles,
        intentFiles,
        docFiles,
        others
    }: {
        files: string[];
        codeFiles: FileRecord[];
        intentFiles: FileRecord[];
        docFiles: FileRecord[];
        others: FileRecord[];
    } = await getRepoFiles(git, repoPath);

    // TODO: if is_compatible = false, don't store in DB.
    const is_compatible = await isCompatibleForTinyRepo(files, codeFiles, intentFiles, others, repoPath);

    if (!is_compatible) {
        console.log("[StorageWorker] This repo is big, not suitable for TinyRepo");
        throw new Error("Repo is not compatible for TinyRepo");
    }
    else {
        await updateJobStatus(jobId, "GENERATING");

        console.log("[PIPELINE] Preprocessing done, about to generate docs")
        const generatedDocs: DocsAndPRSchema = await generateDocsTinyRepo(jobId, codeFiles, intentFiles, docFiles, others, repoPath, llmService, userId, repoId, currentCommitSha);

        console.log("[PIPELINE] Writing to repo");

        await writeFilesAndCommit("auto-Docs", repoPath, [{
            path: "ARCHITECTURE.md",
            content: generatedDocs.documentation
        }], generatedDocs.commitMessage, cloneUrl);

        const parsedUrl = new URL(cloneUrl);
        const parts = parsedUrl.pathname.split('/');
        const repoOwner = parts[1];
        const repoName = parts[2].replace('.git', '');

        const { prNumber, prLink } = await openPR(
            repoOwner,
            repoName,
            generatedDocs.prTitle,
            generatedDocs.prBody,
            "auto-Docs",
            defaultBranch,
            installationId
        )

        console.log("[PIPELINE] PR opened successfully")

        await prisma.docsUpdateJob.update({
            where: {
                id: jobId
            },
            data: {
                status: "PR_OPEN",
                branchName: "auto-Docs",
                pullRequestId: prNumber,
                prLink
            }
        });



        return prLink;
    }
}

export const handleWebhooks = async (
    userId: string,
    repoId: string,
    jobId: string,
    repoPath: string,
    beforeSha: string,
    afterSha: string,
    ref: string,
    installationId: number,
    cloneUrl: string
): Promise<{ regenerated: boolean, prLink: string | null }> => {
    const llmService = new LLMService();

    const git = simpleGit(repoPath);
    const {
        files,
        codeFiles,
        intentFiles,
        docFiles,
        others
    }: {
        files: string[];
        codeFiles: FileRecord[];
        intentFiles: FileRecord[];
        docFiles: FileRecord[];
        others: FileRecord[];
    } = await getRepoFiles(git, repoPath);

    const diffSummary = await git.diffSummary([beforeSha, afterSha]);

    if (!evaluateDiff(diffSummary as DiffSummary)) {
        await updateJobStatus(jobId, "DROPPED");
        return { regenerated: false, prLink: null };
    }

    const diff = await git.diff([beforeSha, afterSha]);
    console.log("repo diff ", diff);

    await updateJobStatus(jobId, "WAITING_LLM_JUDGE")

    const llmDecision = await llmJudge(userId, jobId, docFiles, diff, repoPath, llmService);
    console.log("LLM Decision: ", llmDecision);

    if (!llmDecision.verdict) {
        console.log("dropping")
        await updateJobStatus(jobId, "DROPPED");
        return { regenerated: false, prLink: null };
    }

    await mergeChanges(repoPath, ref.replace("refs/heads/", ""));
    console.log("merge, pack files, re run pipeline");

    const is_compatible = await isCompatibleForTinyRepo(files, codeFiles, intentFiles, others, repoPath);

    if (!is_compatible) {
        console.log("[WebhookWorker] This repo is big, not suitable for TinyRepo");
        throw new Error("Repo is not compatible for TinyRepo");
    }
    await updateJobStatus(jobId, "GENERATING");

    let generatedDocs: DocsAndPRSchema;
    
    // cache not expired, and we can just add and send the new updations
    if(await llmService.checkCache(userId, repoId, "tinyRepo", beforeSha)){
        const removedFiles: string = await getRemovedFiles(git, beforeSha, afterSha);
        const {
            codeFilesNew,
            intentFilesNew,
            docFilesNew,
            othersNew
        } = getChangedFilesPacked(diffSummary as DiffSummary, repoPath);
        
        const promptSuffix = `
        <deleted_files>
            ${removedFiles}
        </deleted_files>
        
        <updated_files>
            <code_files>
                ${codeFilesNew}
            </code_files>
            <intent_files>
                ${intentFilesNew}
            </intent_files>
            <doc_files>
                ${docFilesNew}
            </doc_files>
            <other_files>
                ${othersNew}
            </other_files>
        </updated_files>
        `
        generatedDocs = await generateDocsTinyRepo(
            jobId, 
            codeFiles, 
            intentFiles, 
            docFiles, 
            others, 
            repoPath, 
            llmService, 
            userId, 
            repoId, 
            afterSha, 
            promptSuffix + "\n" + CACHE_RECONCILIATION_ENFORCEMENT_PROMPT
        );
    }
    else{
        generatedDocs = await generateDocsTinyRepo(
            jobId, 
            codeFiles, 
            intentFiles, 
            docFiles, 
            others, 
            repoPath, 
            llmService, 
            userId, 
            repoId, 
            afterSha
        );
    }

    console.log("[PIPELINE] Writing to repo");
    
    await writeFilesAndCommit("auto-Docs", repoPath, [{
        path: "ARCHITECTURE.md",
        content: generatedDocs.documentation
    }], generatedDocs.commitMessage, cloneUrl);

    const parsedUrl = new URL(cloneUrl);
    const parts = parsedUrl.pathname.split('/');
    const repoOwner = parts[1];
    const repoName = parts[2].replace('.git', '');

    const baseBranch = ref ? ref.replace("refs/heads/", "") : "main";

    const { prNumber, prLink } = await openPR(
        repoOwner,
        repoName,
        generatedDocs.prTitle,
        generatedDocs.prBody,
        "auto-Docs",
        baseBranch,
        installationId
    )

    console.log("[PIPELINE] PR opened successfully")

    await prisma.docsUpdateJob.update({
        where: {
            id: jobId
        },
        data: {
            status: "PR_OPEN",
            branchName: "auto-Docs",
            pullRequestId: prNumber,
            prLink
        }
    });
    return { regenerated: true, prLink: null };
}

