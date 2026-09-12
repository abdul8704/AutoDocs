import simpleGit from "simple-git";
import { getRepoFiles } from "./stages/L1.inventory";
import { DiffSummary, FileRecord } from "./pipeline.types";
import { isCompatibleForTinyRepo, updateJobStatus } from "./pipeline.helper";
import { LLMService } from "../LLM/llm.service";
import { mergeChanges } from "../github/github.service";
import { evaluateDiff, getChangedFilesPacked, getRemovedFiles, llmJudge } from "./stages/L2.judge";
import { CACHE_RECONCILIATION_ENFORCEMENT_PROMPT } from "../LLM/llm.constants";
import { publishDocUpdate } from "../queue/publishers";

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
        await updateJobStatus(jobId, "PENDING");

        console.log("[PIPELINE] Preprocessing done, delegating doc generation to docGenQueue...");
        await publishDocUpdate({
            docJobId: jobId,
            userId,
            repoId,
            repoPath,
            cloneUrl,
            installationId,
            currentCommitSha,
            defaultBranch,
            isFirstTime: true,
        });

        return "Job delegated to docGenQueue";
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
    await updateJobStatus(jobId, "PENDING");

    let promptSuffix: string | undefined = undefined;

    // cache not expired, and we can just add and send the new updations
    if(await llmService.checkCache(userId, repoId, "tinyRepo", beforeSha)){
        const removedFiles: string = await getRemovedFiles(git, beforeSha, afterSha);
        const {
            codeFilesNew,
            intentFilesNew,
            docFilesNew,
            othersNew
        } = getChangedFilesPacked(diffSummary as DiffSummary, repoPath);
        
        promptSuffix = `
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
        \n` + CACHE_RECONCILIATION_ENFORCEMENT_PROMPT;
    }

    console.log("[PIPELINE] Webhook evaluation passed, delegating doc generation to docGenQueue...");

    const baseBranch = ref ? ref.replace("refs/heads/", "") : "main";

    await publishDocUpdate({
        docJobId: jobId,
        userId,
        repoId,
        repoPath,
        cloneUrl,
        installationId,
        currentCommitSha: afterSha,
        beforeSha,
        afterSha,
        ref,
        defaultBranch: baseBranch,
        isFirstTime: false,
        promptSuffix,
    });

    return { regenerated: true, prLink: null };
}

