import path from "path";
import prisma from "../prisma/prisma";
import { FileRecord, JobStatus } from "./pipeline.types"
import * as fs from "fs";
import { encoding_for_model, get_encoding, Tiktoken, TiktokenModel } from "tiktoken";

import { LLMConfigService } from "../LLM/config/llm.config.service";
import { calculateCost, getEstimatedOutputTokens } from "../LLM/llm.helper";
import { BillingService } from "../billing/billing.service";

export interface TinyRepoCompatibility {
    compatible: boolean;
    totalInputToken: number;
    modelName: string;
    contextWindow: number;
}

// NOTE: docFiles must be included here — the actual generation call (L4.tinyDocs)
// packs codeFiles + intentFiles + docFiles + others into the prompt, but this
// compatibility check previously omitted docFiles entirely. A repo with large
// doc files could pass this check and then blow past the model's context window
// (and, before the credit-estimation fix below, run up an unbounded LLM bill).
export const isCompatibleForTinyRepo = async (
    _git_ls: string[],
    codeFiles: FileRecord[],
    intentFiles: FileRecord[],
    docFiles: FileRecord[],
    others: FileRecord[],
    repoPath: string
): Promise<TinyRepoCompatibility> => {
    let config = await prisma.lLMTaskConfig.findUnique({
        where: {
            taskKey: "tinyRepo"
        },
        include: {
            model: true,
            prompt: true
        }
    });

    if (!config) {
        await LLMConfigService.ensureLLMConfigsExist();
        config = await prisma.lLMTaskConfig.findUnique({
            where: {
                taskKey: "tinyRepo"
            },
            include: {
                model: true,
                prompt: true
            }
        });
    }

    const contextWindow: number = config?.model?.contextWindow || 1048576;
    const modelName: string = config?.model?.modelName || "gemini-3.6-flash";

    const totalInputToken = estimateToken(codeFiles, modelName, repoPath) +
        estimateToken(intentFiles, modelName, repoPath) +
        estimateToken(docFiles, modelName, repoPath) +
        estimateToken(others, modelName, repoPath);

    return {
        compatible: totalInputToken + 1000 <= contextWindow, // estimate system prompt to be 1000 tokens. TO_DO: fix a better limit
        totalInputToken,
        modelName,
        contextWindow,
    };
}

const estimateToken = (files: FileRecord[], model: string, repoPath: string) => {
    const encoder = getSafeEncoder(model);

    const packedFiles = packFiles(files, repoPath);

    const tokenIntegers = encoder.encode(packedFiles);
    const tokenCount = tokenIntegers.length;

    encoder.free();

    return tokenCount;
}
const getSafeEncoder = (model: string): Tiktoken => {
    try {
        return encoding_for_model(model as TiktokenModel);
    } catch {
        // Fallback BPE encoding for token approximations across non-OpenAI providers
        return get_encoding('cl100k_base');
    }
};

export const estimateTokensForText = (text: string, model: string): number => {
    const encoder = getSafeEncoder(model);
    const count = encoder.encode(text).length;
    encoder.free();
    return count;
};

/**
 * Estimates the credit cost of an upcoming tinyRepo/docsGenerator LLM call and
 * throws (via BillingService.validateCreditForJob) if the user cannot cover it.
 *
 * `newContentTokens` is the content that will be billed at the full input rate
 * this call (and, on a cache miss, written to a fresh cache at the cache-write
 * rate). `cachedContentTokens` is content already sitting in a valid cache,
 * billed at the cheaper cache-read rate. Mirrors exactly the calculateCost()
 * call llm.service.ts makes with the *actual* usage once the real call returns,
 * so the estimate and the eventual charge use the same formula.
 */
export const estimateAndValidateCredits = async (
    userId: string,
    taskKey: "tinyRepo" | "docsGenerator",
    modelName: string,
    newContentTokens: number,
    cachedContentTokens = 0,
): Promise<{ estimatedCredits: number; estimatedTokens: number }> => {
    const estimatedOutputTokens = await getEstimatedOutputTokens(taskKey);
    const promptTokens = newContentTokens + cachedContentTokens;

    // A cache write only happens this call when there wasn't already a valid
    // cache to read from (see ScopedCacheService.createOrGetCache).
    const cacheWriteTokens = cachedContentTokens > 0 ? 0 : newContentTokens;

    const cost = await calculateCost(modelName, promptTokens, cachedContentTokens, estimatedOutputTokens, cacheWriteTokens);
    const estimatedCredits = BillingService.providerCostToCredits(cost.tokenCost + cost.cacheWriteCost);

    // Throws with a descriptive message if the user can't cover the estimate.
    await BillingService.validateCreditForJob(userId, estimatedCredits);

    return { estimatedCredits, estimatedTokens: promptTokens };
};

export const packFiles = (files: FileRecord[], repoPath: string) => {
    let packedFiles = '';

    for (const file of files) {
        packedFiles += `\n\n--- FILE: ${file.path} ---\n`;
        packedFiles += fs.readFileSync(path.join(repoPath, file.path), 'utf8');
    }

    return packedFiles
}

export const packFilesByName = (filePaths: string[], repoPath: string) => {
    let packedFiles = '';

    for (const filePath of filePaths) {
        packedFiles += `\n\n--- FILE: ${filePath} ---\n`;
        packedFiles += fs.readFileSync(path.join(repoPath, filePath), 'utf8');
    }

    return packedFiles;
}

export const updateJobStatus = async (jobId: string, status: JobStatus, errorLog?: string | null) => {
    await prisma.docsUpdateJob.update({
        where: {
            id: jobId
        },
        data: {
            status,
            ...(errorLog !== undefined ? { errorLog } : {}),
        }
    });
}
