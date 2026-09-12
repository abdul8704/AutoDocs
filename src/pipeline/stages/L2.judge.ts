import { DiffSummary, FileRecord } from "../pipeline.types";
import { packFiles, packFilesByName } from "../pipeline.helper";
import { LLMService } from "../../LLM/llm.service";
import { DiffJudgeSchema } from "../../LLM/llm.types";
import { CODE_EXTS, DOC_EXTS, KEEP_NONCODE, EXCLUDE_DIRS, EXCLUDE_FILES, isBlacklistedDoc, isIntentFile } from "./L1.inventory";
import * as path from "path";
import { SimpleGit } from "simple-git";

export const llmJudge = async (
    userId: string,
    jobId: string,
    docFiles: FileRecord[],
    diff: string,
    repoPath: string,
    llmService: LLMService
) => {
    const docsPacked = packFiles(docFiles, repoPath);
    const prompt = `
    Docs \n
    ${docsPacked}

    Diff \n
    ${diff}`

    const llmVerdict: DiffJudgeSchema = await llmService.evaluateDiffStructured(userId, prompt, jobId);
    console.log("[PIPELINE] Verdict generated successfully");
    console.log(llmVerdict);
    return llmVerdict;
}

// given a file, return true if it's either code, non_code, doc or intent file
export const isRelevantPath = (rel: string): boolean => {
    const normalized = rel.replace(/\\/g, "/");
    const ext = path.extname(normalized).toLowerCase();

    if (normalized.split("/").some(p => EXCLUDE_DIRS.has(p))) {
        return false;
    }

    if (EXCLUDE_FILES.has(path.basename(normalized)) || isBlacklistedDoc(normalized)) {
        return false;
    }

    return CODE_EXTS.has(ext) || KEEP_NONCODE.has(ext) || DOC_EXTS.has(ext) || isIntentFile(normalized);
};

export const evaluateDiff = (diff: DiffSummary) => {
    let needReview = 0;

    diff.files.forEach((file) => {
        if (file.binary) {
            return;
        }
        if (isRelevantPath(file.file)) {
            needReview++
        }
    })
    return needReview > 0;
}

export const getChangedFilesPacked = (diff: DiffSummary, repoPath: string) => {
    const relevantFiles = diff.files.filter(file => {
        if (file.binary) return false;
        return isRelevantPath(file.file);
    });

    const codeFiles: string[] = [];
    const intentFiles: string[] = [];
    const others: string[] = [];
    const docFiles: string[] = [];

    relevantFiles.forEach(file => {
        const ext = path.extname(file.file).toLowerCase();
        if (CODE_EXTS.has(ext)) {
            codeFiles.push(file.file);
        } else if (isIntentFile(file.file)) {
            intentFiles.push(file.file);
        } else if (DOC_EXTS.has(ext) || KEEP_NONCODE.has(ext)) {
            docFiles.push(file.file);
        } else {
            others.push(file.file);
        }
    });

    const updatedCodeFile = packFilesByName(codeFiles, repoPath);
    const updatedIntentFile = packFilesByName(intentFiles, repoPath);
    const updatedDocFile = packFilesByName(docFiles, repoPath);
    const updatedOthers = packFilesByName(others, repoPath);

    return {
        codeFilesNew: updatedCodeFile,
        intentFilesNew: updatedIntentFile,
        docFilesNew: updatedDocFile,
        othersNew: updatedOthers,
    };
}

export const getRemovedFiles = async (git: SimpleGit, beforeSha: string, afterSha: string) => {
    const diffRaw = await git.diff(["--diff-filter=D",]);
    const status = await git.diff([
        "--name-status",
        "--diff-filter=R",
        beforeSha,
        afterSha
    ]);

    const renamedFiles = status
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(line => {
            const [, oldPath] = line.split("\t");
            return oldPath;
        });

    let removedFiles = "";

    for (const fileName of diffRaw)
        removedFiles += fileName + ",";

    for (const fileName of renamedFiles)
        removedFiles += fileName + ",";

    return removedFiles;
}