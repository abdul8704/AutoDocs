import { FileRecord } from "../pipeline.types";
import { packFiles } from "../pipeline.helper";
import { LLMService } from "../../LLM/llm.service";
import { DocsAndPRSchema } from "../../LLM/llm.types";

export const generateDocsTinyRepo = async (codeFiles: FileRecord[], intentFiles: FileRecord[], docFiles: FileRecord[], others: FileRecord[], repoPath: string, llmService: LLMService): Promise<DocsAndPRSchema> => {
    console.log("[PIPELINE] Packing files")
    const codeFilesPacked = packFiles(codeFiles, repoPath);
    const intentFilesPacked = packFiles(intentFiles, repoPath);
    const othersPacked = packFiles(others, repoPath);
    const docsFiles = packFiles(docFiles, repoPath)

    const prompt = `
    Docs \n
    ${docsFiles}
    
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