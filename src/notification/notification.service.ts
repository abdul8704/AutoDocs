import prisma from "../prisma/prisma";
import type { DocGenResult } from "../pipeline/pipeline.orchestrator";

// ============================================================================
// Run notifications — one row per doc-generation attempt, ALWAYS written.
//
// The point of the table is that the user can see what happened without reading
// worker logs, so it records the failure and warning cases just as faithfully as
// the happy path. repo_id is the github_repo_id (what the job payload carries).
// ============================================================================

export type NotificationStatus = "SUCCESS" | "PARTIAL" | "FAILED";

export interface DocRunNotification {
    repoId: string;
    status: NotificationStatus;
    message: string;
    prUrl?: string | null;
    logs: Record<string, unknown>;
}

// Deliberately swallows its own errors: a notification write must never be the
// reason a doc run is marked failed and retried.
export const recordDocRun = async (input: DocRunNotification): Promise<void> => {

    try {
        await prisma.notification.create({
            data: {
                repo_id: input.repoId,
                kind: "DOC_RUN",
                status: input.status,
                message: input.message,
                pr_url: input.prUrl ?? null,
                logs: JSON.parse(JSON.stringify(input.logs)),
            },
        });
    } catch (err) {
        console.error(`[Notification] failed to record doc run for ${input.repoId}:`, err);
    }
}

// The user-facing sentence. Reads as prose in all three outcomes rather than a
// status code the frontend has to translate.
export const buildRunMessage = (
    result: DocGenResult | null,
    prUrl: string | null,
    warnings: string[],
    error: unknown,
): string => {

    if (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return `Documentation run failed: ${reason}`;
    }

    if (!result) {
        return "Documentation run finished with no result.";
    }

    const docCount = result.moduleDocCount === 0
        ? "a combined project doc"
        : `${result.moduleDocCount} module doc${result.moduleDocCount === 1 ? "" : "s"} and the architecture doc`;

    const parts: string[] = [];

    parts.push(prUrl
        ? `Documentation raised as a pull request with ${docCount}.`
        : `Documentation generated (${docCount}) but no pull request was opened.`);

    if (result.ownerReport) {
        parts.push("Some unfinished work was found and left out of the docs — see the owner report.");
    }

    if (warnings.length > 0) {
        parts.push(`${warnings.length} warning${warnings.length === 1 ? "" : "s"}: ${warnings.join("; ")}`);
    }

    return parts.join(" ");
}

// SUCCESS only when the PR is up and nothing needed flagging.
export const resolveRunStatus = (
    prUrl: string | null,
    warnings: string[],
    error: unknown,
): NotificationStatus => {

    if (error) {
        return "FAILED";
    }

    if (!prUrl || warnings.length > 0) {
        return "PARTIAL";
    }

    return "SUCCESS";
}
