import { Module, FileRecord, GroupingOptions, DirNode } from "../pipeline.types";
import { sha256, computeModuleInputHash, normalizePath, dirOf } from "../pipeline.helper"

const DEFAULT_MIN_FILES = 3;
const DEFAULT_MAX_FILES = 15;
const DEFAULT_PROMPT_VERSION = "v1";
const ROOT = "(root)";

// ============================================================================
// Directory tree
// ============================================================================

function buildTree(codeFiles: FileRecord[]): DirNode {
    const root: DirNode = { path: "", files: [], children: new Map(), subtreeCount: 0 };
    for (const file of codeFiles) {
        const dirs = dirOf(normalizePath(file.path));
        let node = root;
        if (dirs !== "") {
            for (const part of dirs.split("/")) {
                if (!node.children.has(part)) {
                    node.children.set(part, {
                        path: node.path === "" ? part : `${node.path}/${part}`,
                        files: [], children: new Map(), subtreeCount: 0,
                    });
                }
                node = node.children.get(part)!;
            }
        }
        node.files.push(file);
    }
    computeCounts(root);
    return root;
}

function computeCounts(node: DirNode): number {
    node.subtreeCount = node.files.length;
    for (const child of node.children.values()) {
        node.subtreeCount += computeCounts(child);
    }
    return node.subtreeCount;
}

function collectAllFiles(node: DirNode, out: FileRecord[] = []): FileRecord[] {
    out.push(...node.files);
    for (const child of node.children.values()) collectAllFiles(child, out);
    return out;
}

// ============================================================================
// Core: recursive, size-based module cutting (depth-agnostic)
// ============================================================================

function cutModules(
    node: DirNode,
    minFiles: number,
    maxFiles: number,
    out: Map<string, FileRecord[]>,
): void {
    // --- CEREMONY COLLAPSE ------------------------------------------------
    // A directory with no code files of its own and exactly one child carries
    // no structural information — walk through it without "spending" a level.
    // This is what makes src/main/java/com/acme/ invisible on Spring repos,
    // while a flat Node repo simply never triggers it.
    while (node.files.length === 0 && node.children.size === 1) {
        node = node.children.values().next().value!;
    }

    // --- BASE CASE: small enough (or nowhere deeper to go) -> one module ---
    if (node.subtreeCount <= maxFiles || node.children.size === 0) {
        if (node.subtreeCount > 0) {
            out.set(node.path === "" ? ROOT : node.path, collectAllFiles(node));
        }
        return;
    }

    // --- RECURSIVE CASE: too big -> descend into children ------------------
    // Children too tiny to stand alone are absorbed into this dir's own bucket.
    const misc: FileRecord[] = [...node.files];
    const childNames = [...node.children.keys()].sort(); // deterministic order
    for (const name of childNames) {
        const child = node.children.get(name)!;
        if (child.subtreeCount < minFiles) {
            misc.push(...collectAllFiles(child));
        } else {
            cutModules(child, minFiles, maxFiles, out);
        }
    }
    // Direct files of a split directory (e.g. src/app.ts next to src/routes/)
    // plus absorbed tiny children form this directory's own "misc" module.
    if (misc.length > 0) {
        out.set(node.path === "" ? ROOT : node.path, misc);
    }
}

// ============================================================================
// Display names: strip the common ceremony prefix for human-facing labels
// ============================================================================

function computeDisplayNames(ids: string[]): Map<string, string> {
    const real = ids.filter((id) => id !== ROOT);
    const result = new Map<string, string>();
    result.set(ROOT, ROOT);
    if (real.length === 0) return result;

    // Longest common directory prefix across all module ids.
    let prefix = real[0].split("/");
    for (const id of real.slice(1)) {
        const parts = id.split("/");
        let i = 0;
        while (i < prefix.length && i < parts.length && prefix[i] === parts[i]) i++;
        prefix = prefix.slice(0, i);
        if (prefix.length === 0) break;
    }
    // Never strip a module down to nothing (happens when one module IS the prefix).
    const strip = prefix.join("/");
    for (const id of real) {
        let name = strip && id.startsWith(strip) ? id.slice(strip.length).replace(/^\//, "") : id;
        if (name === "") name = id.split("/").pop()!; // the module that equals the prefix
        result.set(id, name);
    }
    return result;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Groups files into disjoint, deterministic modules of bounded size.
 *
 * Code files drive the tree-cutting; non-code files (configs, HTML, SQL, docs)
 * ride along into the module owning their directory. Works irrespective of
 * folder depth: Spring's src/main/java/com/acme/** and Node's src/** produce
 * equally sensible modules from the same algorithm.
 */
export function groupModules(
    codeFiles: FileRecord[],
    otherFiles: FileRecord[] = [],
    options: GroupingOptions = {},
): Module[] {
    const minFiles = options.minFiles ?? DEFAULT_MIN_FILES;
    const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    const promptVersion = options.promptVersion ?? DEFAULT_PROMPT_VERSION;

    if (codeFiles.length === 0 && otherFiles.length === 0) return [];

    // 1. Cut modules from the CODE file tree (structure = where the code lives).
    const groups = new Map<string, FileRecord[]>();
    if (codeFiles.length > 0) {
        cutModules(buildTree(codeFiles), minFiles, maxFiles, groups);
    }

    // 2. Attach non-code files to the deepest module whose path prefixes theirs.
    //    Unclaimed ones (e.g. docs/, config-only dirs) bucket by top-level dir.
    const moduleIds = [...groups.keys()]
        .filter((id) => id !== ROOT)
        .sort((a, b) => b.length - a.length); // deepest first
    for (const file of otherFiles) {
        const dir = dirOf(normalizePath(file.path));
        const home =
            moduleIds.find((id) => dir === id || dir.startsWith(id + "/")) ??
            (groups.has(ROOT) || dir === "" ? ROOT : dir.split("/")[0]);
        if (!groups.has(home)) groups.set(home, []);
        groups.get(home)!.push(file);
    }

    // 3. Finalize: deterministic sort + hashes + display names.
    const displayNames = computeDisplayNames([...groups.keys()]);
    return [...groups.entries()]
        .map(([id, files]) => {
            const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
            return {
                id,
                displayName: displayNames.get(id) ?? id,
                files: sorted,
                inputHash: computeModuleInputHash(sorted, promptVersion),
            };
        })
        .sort((a, b) => a.id.localeCompare(b.id));
}

/** Reverse index for L3's edge-collapse and the webhook's changed-file mapping. */
export function buildFileToModuleIndex(modules: Module[]): Map<string, string> {
    const index = new Map<string, string>();
    for (const m of modules) for (const f of m.files) index.set(normalizePath(f.path), m.id);
    return index;
}

// ============================================================================
// Helpers
// ============================================================================

