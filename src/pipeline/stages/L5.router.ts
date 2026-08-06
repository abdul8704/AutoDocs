import { FileRecord, Module, RouterOptions } from "../pipeline.types";

const DEFAULT_TINY_THRESHOLD_TOKENS = 100_000;

export function estimateTokens(sizeBytes: number): number {
    return Math.ceil(sizeBytes / 4);
}

/**
 * Size decision — runs RIGHT AFTER L1, before any grouping or graph work.
 * Needs nothing but the file records.
 */
export function isTinyRepo(
    files: FileRecord[],
    options: RouterOptions = {},
): boolean {

    const threshold = options.tinyThresholdTokens ?? DEFAULT_TINY_THRESHOLD_TOKENS;

    let totalBytes = 0;

    for (const file of files) {
        totalBytes += file.sizeBytes;
    }

    return estimateTokens(totalBytes) < threshold;
}

/**
 * Staleness computation — runs AFTER grouping, only on the NORMAL path.
 * One hash comparison per module; this is the entire incremental system.
 */
export function computeStaleness(
    modules: Module[],
    storedHashes: Map<string, string>,
) {

    const staleModules: Module[] = [];
    const cachedModuleIds: string[] = [];
    const currentIds = new Set<string>();

    for (const module of modules) {

        currentIds.add(module.id);

        if (storedHashes.get(module.id) === module.inputHash) {
            cachedModuleIds.push(module.id);
        } else {
            staleModules.push(module);
        }
    }

    const deletedModuleIds: string[] = [];

    for (const storedId of storedHashes.keys()) {

        if (!currentIds.has(storedId)) {
            deletedModuleIds.push(storedId);
        }
    }

    return { staleModules, cachedModuleIds, deletedModuleIds };
}