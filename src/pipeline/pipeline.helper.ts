import path from "path";
import prisma from "../prisma/prisma";
import { FileRecord, JobStatus } from "./pipeline.types"
import * as fs from "fs";
import { encoding_for_model, get_encoding, Tiktoken, TiktokenModel } from "tiktoken";

export const isCompatibleForTinyRepo = async (git_ls: string[], codeFiles: FileRecord[], intentFiles: FileRecord[], others: FileRecord[], repoPath: string) => {
    const config = await prisma.lLMTaskConfig.findUnique({
        where: {
            taskKey: "tinyRepo"
        },
        include: {
            model: true,
            prompt: true
        }
    });

    if (!config) {
        throw new Error("Tiny repo config not found");
    }

    const contextWindow: number = config.model.contextWindow || 0;

    let totalLength = 0;

    for (const codeFile of codeFiles)
        totalLength += codeFile.sizeBytes;

    for (const intentFile of intentFiles)
        totalLength += intentFile.sizeBytes;

    for (const other of others)
        totalLength += other.sizeBytes;

    let totalInputToken = estimateToken(codeFiles, config.model.modelName, repoPath) +
        estimateToken(intentFiles, config.model.modelName, repoPath) +
        estimateToken(others, config.model.modelName, repoPath);

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

export const updateJobStatus = async (jobId: string, status: JobStatus) => {
    await prisma.docsUpdateJob.update({
        where: {
            id: jobId
        },
        data: {
            status,
        }
    });

}
