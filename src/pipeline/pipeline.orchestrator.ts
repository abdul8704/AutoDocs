import simpleGit from "simple-git";
import { Module, ModuleDocResult, ValidationFinding, IncompleteFeature } from "./pipeline.types"
import { getRepoFiles } from "./stages/L1.inventory";
import { groupModules, buildFileToModuleIndex } from "./stages/L2.prefixCompressor"
import { buildModuleEdges } from "./stages/L3.dynamicGrouper"
import { buildIntentBundle } from "./stages/L4.intentBundle"
import { isTinyRepo, computeStaleness } from "./stages/L5.router"
import { MODULE_DOC_SCHEMA,  VALIDATION_SCHEMA, COMBINED_DOC_SCHEMA } from "./stages/L6.prompts"
import { applyValidationFindings } from "./stages/L6.applyEdits";
import {
    buildModulePrompt, buildArchPrompt, buildValidationPrompt, buildTinyPrompt,
    buildOwnerReport
} from "./stages/L6.promptBuilder";

import { generate, llmConcurrency } from "../LLM/index";
import fs from "node:fs";
import nodePath from "node:path";

export const generateFirstTimeDocs = async (repoId: string, repoPath: string) => {
    // const git = simpleGit(repoPath);
    const git = simpleGit();

    const { git_ls, codeFiles, intentFiles, others } = await getRepoFiles(git, repoPath);

    const cache = new Map<string, string>();
    const readFile = (relPath: string): string => {
        if (!cache.has(relPath)) {
            cache.set(relPath, fs.readFileSync(nodePath.join(repoPath, relPath), "utf8"));
        }
        return cache.get(relPath)!;
    };

    const intent = buildIntentBundle(intentFiles, readFile);

    if (isTinyRepo([...codeFiles, ...others])) {
        const prompt = buildTinyPrompt(codeFiles, others, intent, readFile);
        const { data } = await generate<ModuleDocResult>("tinyDoc", prompt, COMBINED_DOC_SCHEMA);

        const ownerReport = buildOwnerReport(
            new Map([["(repo)", data.incomplete]]), [],
        );

        return { docs: new Map([["(repo)", data.markdown]]), ownerReport };
    }

    const modules: Module[] = groupModules(codeFiles, others)
    const fileToModule: Map<string, string> = buildFileToModuleIndex(modules);
    const { edges, resolutionRate,  } = buildModuleEdges(codeFiles, readFile, fileToModule);
    
    const generateOne = async (module: Module): Promise<void> => {

        const prompt = buildModulePrompt(module, readFile, edges, intent, fileImportCounts);
    
        const { data } = await generate<ModuleDocResult>("moduleDoc", prompt, MODULE_DOC_SCHEMA);
    
        moduleDocs.set(module.id, data.markdown);
        incompleteByModule.set(module.id, data.incomplete);
    
        // TODO: upsert module_docs row here (per-call persist = crash resume)
    };
    
}
export const webhookDocGen = async (repoId: string, path: string) => {

}



const main = () => {
    const p = async () => {
        const git = simpleGit()
        await generateFirstTimeDocs("123", "C:/Coding/projects/autoDocs/server"
        );
    }
    p();
}
main()
