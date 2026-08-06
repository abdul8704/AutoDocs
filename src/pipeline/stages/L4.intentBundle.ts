import { FileRecord, IntentBundle, IntentOptions } from "../pipeline.types";
import { sha256, normalizePath } from "../pipeline.helper";

const DEFAULT_MAX_CHARS_PER_FILE = 12_000;
const DEFAULT_MAX_TOTAL_CHARS = 32_000;

// Lower number = appears earlier in the bundle. README carries the most
// intent, so it leads; build files next (they double as stack detection);
// long-form docs last because they are the most truncatable.
const PRIORITY_RULES: Array<[RegExp, number]> = [
    [/^readme/i,                                   0],
    [/(^|\/)(package\.json|pyproject\.toml|pom\.xml|build\.gradle|go\.mod|requirements\.txt|composer\.json|gemfile)$/i, 1],
    [/(^|\/)(dockerfile|docker-compose[^/]*\.ya?ml)$/i, 2],
    [/^\.github\/workflows\//i,                    3],
    [/(^|\/)\.env\.example$/i,                     4],
    [/^docs\//i,                                   5],
];

function priorityOf(path: string): number {

    for (const [pattern, priority] of PRIORITY_RULES) {

        if (pattern.test(path)) {
            return priority;
        }
    }

    return 9;
}

/**
 * Concatenates intent files (README, build files, CI, docs) into one
 * deterministic text block for use in LLM prompts.
 *
 * Determinism matters more here than anywhere: this string sits inside the
 * CACHED prompt prefix in L6 — if its bytes differ between two runs of the
 * same repo state, every prompt-cache read silently misses.
 */
export function buildIntentBundle(
    intentFiles: FileRecord[],
    readFile: (path: string) => string,
    options: IntentOptions = {},
): IntentBundle {

    const maxPerFile = options.maxCharsPerFile ?? DEFAULT_MAX_CHARS_PER_FILE;
    const maxTotal = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;

    // Sort by priority first, then path — both comparisons are deterministic,
    // so the same repo state always produces byte-identical output.
    const ordered = [...intentFiles].sort((a, b) => {

        const pa = priorityOf(normalizePath(a.path));
        const pb = priorityOf(normalizePath(b.path));

        if (pa !== pb) {
            return pa - pb;
        }

        return a.path.localeCompare(b.path);
    });

    const blocks: string[] = [];
    const includedFiles: string[] = [];
    let remaining = maxTotal;
    let truncated = false;

    for (const file of ordered) {

        if (remaining <= 0) {
            truncated = true;
            break;
        }

        let content: string;

        try {
            content = readFile(file.path);
        } catch {
            continue;                       // unreadable intent file: skip, never fail the run
        }

        if (content.length > maxPerFile) {
            content = content.slice(0, maxPerFile) + "\n... [truncated]";
            truncated = true;
        }

        const block = `===== ${normalizePath(file.path)} =====\n${content}`;

        if (block.length > remaining) {
            blocks.push(block.slice(0, remaining) + "\n... [truncated]");
            remaining = 0;
            truncated = true;
        } else {
            blocks.push(block);
            remaining -= block.length;
        }

        includedFiles.push(normalizePath(file.path));
    }

    const bundle = blocks.join("\n\n");

    return {
        bundle,
        intentHash: sha256(bundle),
        includedFiles,
        truncated,
    };
}