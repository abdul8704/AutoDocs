import path from "path";
import prisma from "../prisma/prisma";
import { FileRecord, JobStatus } from "./pipeline.types"
import * as fs from "fs";
import { encoding_for_model, get_encoding, Tiktoken, TiktokenModel } from "tiktoken";

import { LLMConfigService } from "../LLM/config/llm.config.service";

export const isCompatibleForTinyRepo = async (_git_ls: string[], codeFiles: FileRecord[], intentFiles: FileRecord[], others: FileRecord[], repoPath: string) => {
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
        estimateToken(others, modelName, repoPath);

    return totalInputToken + 1000 <= contextWindow; // estimate system prompt to be 1000 tokens. TO_DO: fix a better limit
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
