import prisma from "../prisma/prisma";
import { scanCustomPrompt } from "../utils/promptGuard.utils";

import { CustomInstructions } from "./pipeline.types";
import { PROMPT_VERSION } from "./pipeline.version";
import { sha256 } from "./pipeline.helper";
import { CUSTOM_GUARD } from "./stages/L6.prompts";

// ============================================================================
// The repo owner's custom instructions, plus the cache key they belong to.
//
// Module.inputHash is sha256(contentHashes + promptVersion), so a custom prompt
// that is NOT in promptVersion would leave every cached module doc looking fresh
// after the owner edits their instructions. Folding its hash in makes an edit
// behave exactly like a prompt change: everything regenerates once, then caches.
// ============================================================================

export interface LoadedCustomInstructions {
    custom: CustomInstructions;
    effectiveVersion: string;
}

// repoId is the github_repo_id — that is what the queue payload carries all the
// way from importThisRepo. Never fails the run: anything unusable becomes a
// warning and the docs are generated without the instructions.
export const loadCustomInstructions = async (
    repoId: string,
    warnings: string[],
): Promise<LoadedCustomInstructions> => {

    const repoRow = await prisma.repo.findUnique({
        where: { github_repo_id: repoId },
        select: { arch_prompt: true, module_prompt: true },
    });

    if (!repoRow) {
        warnings.push(`no Repo row found for ${repoId} — custom instructions were not applied`);
    }

    const custom: CustomInstructions = {
        arch: vetStored("arch instructions", repoRow?.arch_prompt, warnings),
        module: vetStored("module instructions", repoRow?.module_prompt, warnings),
    };

    // CUSTOM_GUARD rides along so editing the guard text also invalidates the
    // docs it influenced. PROMPT_VERSION itself does not cover it, because the
    // guard only reaches the model when a custom prompt exists.
    const effectiveVersion = custom.module
        ? `${PROMPT_VERSION}-m${sha256(CUSTOM_GUARD + "\n" + custom.module).slice(0, 12)}`
        : PROMPT_VERSION;

    return { custom, effectiveVersion };
};

// The endpoint already scanned this text before storing it, so re-scanning here
// is the second line: it catches values that were stored under an older, looser
// ruleset, and it puts the soft flags into the run's notification either way.
// A hard rejection drops the instructions rather than failing the run — the docs
// are still worth generating without them.
const vetStored = (
    label: string,
    stored: string | null | undefined,
    warnings: string[],
): string | null => {

    if (!stored) {
        return null;
    }

    const scan = scanCustomPrompt(stored);

    if (!scan.ok) {
        warnings.push(`${label} were dropped — they no longer pass the prompt-injection scan (${scan.rejections.join("; ")})`);
        return null;
    }

    if (scan.flags.length > 0) {
        warnings.push(`${label} were applied with flags: ${scan.flags.join(", ")}`);
    }

    return scan.sanitized;
};
