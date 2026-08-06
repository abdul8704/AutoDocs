import crypto from "crypto";
import { Module, FileRecord, GroupingOptions, DirNode } from "./pipeline.types";


export function sha256(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
}

export function computeModuleInputHash(files: FileRecord[], promptVersion: string): string {
    const sortedHashes = files.map((f) => f.contentHash).sort().join("|");
    return sha256(`${sortedHashes}|${promptVersion}`);
}

/** Normalize to forward slashes and strip leading "./" — Windows- and input-safe. */
export function normalizePath(p: string): string {
    return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function dirOf(filePath: string): string {
    const i = filePath.lastIndexOf("/");
    return i === -1 ? "" : filePath.slice(0, i);
}
export interface IntentBundle {
    bundle: string;        // the concatenated text that goes into prompts
    intentHash: string;    // sha256 of bundle — detects README/config changes on webhooks
    includedFiles: string[];
    truncated: boolean;    // true if the total cap forced us to drop content
}

export interface IntentOptions {
    maxCharsPerFile?: number;   // default 12_000
    maxTotalChars?: number;     // default 32_000
}

export type Route =
    | { kind: "TINY" }
    | {
        kind: "NORMAL";
        staleModules: Module[];      // regenerate these (LLM calls)
        cachedModuleIds: string[];   // reuse stored docs, $0
        deletedModuleIds: string[];  // stored docs whose module no longer exists
      };

export interface RouterOptions {
    tinyThresholdTokens?: number;   // default 100_000
}