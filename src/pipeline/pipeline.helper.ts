import crypto from "crypto";
import { FileRecord } from "./pipeline.types";


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

/**
 * Runs fn over items with at most `limit` in flight. Replaces p-limit
 * (ESM-only in current versions; this project is CommonJS). The shared `i`
 * is race-free because JS is single-threaded between awaits.
 */
export async function mapWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>,
): Promise<void> {

    let i = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {

        while (i < items.length) {
            const idx = i++;
            await fn(items[idx]);
        }
    });

    await Promise.all(workers);
}

/** Compact 3-level directory tree for the arch prompt. Deterministic output. */
export function buildFileTree(files: FileRecord[], maxDepth = 3): string {

    const dirs = new Map<string, number>();   // dir path -> file count at/below

    for (const f of files) {

        const parts = normalizePath(f.path).split("/").slice(0, -1);

        for (let d = 1; d <= Math.min(parts.length, maxDepth); d++) {
            const key = parts.slice(0, d).join("/");
            dirs.set(key, (dirs.get(key) ?? 0) + 1);
        }
    }

    const lines: string[] = [];

    for (const key of [...dirs.keys()].sort()) {
        const depth = key.split("/").length - 1;
        lines.push(`${"  ".repeat(depth)}${key.split("/").pop()}/  (${dirs.get(key)} files)`);
    }

    return lines.join("\n") || "(flat repo — no directories)";
}

const ENTRY_POINT_RE = /(^|\/)(main|index|app|application|server|cli)\.\w+$/i;

/** Heuristic entry points for the arch prompt's request-flow section. */
export function guessEntryPoints(codeFiles: FileRecord[]): string[] {

    return codeFiles
        .map(f => normalizePath(f.path))
        .filter(p => ENTRY_POINT_RE.test(p))
        .sort((a, b) => a.split("/").length - b.split("/").length)   // shallowest first
        .slice(0, 5);
}