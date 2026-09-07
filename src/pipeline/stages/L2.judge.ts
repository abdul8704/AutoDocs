import { DiffSummary, FileRecord } from "../pipeline.types";
import { packFiles } from "../pipeline.helper";
import { LLMService } from "../../LLM/llm.service";
import { DiffJudgeSchema } from "../../LLM/llm.types";
import { CODE_EXTS, DOC_EXTS, KEEP_NONCODE, EXCLUDE_DIRS, EXCLUDE_FILES, isPublishedDoc, isBlacklistedDoc, isIntentFile } from "./L1.inventory";
import * as path from "path";

export const llmJudge = async (
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

    const llmVerdict: DiffJudgeSchema = await llmService.evaluateDiffStructured(prompt);
    console.log("[PIPELINE] Verdict generated successfully");
    console.log(llmVerdict);
    return llmVerdict;
}

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
        if(isRelevantPath(file.file)) {
            needReview++
        }
    })
    return needReview > 0;
}