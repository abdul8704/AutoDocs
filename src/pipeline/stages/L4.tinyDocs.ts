import { FileRecord } from "../pipeline.types";
import { packFiles } from "../pipeline.helper";
import { LLMService } from "../../LLM/llm.service";
import { DocsAndPRSchema, TinyRepoPayload } from "../../LLM/llm.types";

export const generateDocsTinyRepo = async (
    jobId: string,
    codeFiles: FileRecord[], 
    intentFiles: FileRecord[], 
    docFiles: FileRecord[], 
    others: FileRecord[], 
    repoPath: string, 
    llmService: LLMService,
    userId: string,
    repoId: string,
    commitSha: string,
    promptSuffix?: string,
): Promise<DocsAndPRSchema> =>
    {
    
    console.log("[PIPELINE] Packing files")
    const codeFilesPacked = packFiles(codeFiles, repoPath);
    const intentFilesPacked = packFiles(intentFiles, repoPath);
    const othersPacked = packFiles(others, repoPath);
    const docsFiles = packFiles(docFiles, repoPath)

    const prompt = `
    <docs>
    ${docsFiles}
    </docs>
    
    <codefiles>
    ${codeFilesPacked}
    </codefiles>

    <intentfiles>
    ${intentFilesPacked}
    </intentfiles>

    <others>
    ${othersPacked}
    </others>
    `
    const payload: TinyRepoPayload = {
        userId,
        repoId,
        taskKey: "tinyRepo",
        currentCommitSha: commitSha,
        promptPrefix: prompt,
        promptSuffix: promptSuffix ?? ""
    };

    const docs: DocsAndPRSchema = await llmService.getStructuredTinyRepoDocs(payload, jobId);
    console.log("[PIPELINE] Docs generated successfully");

    return docs;
}