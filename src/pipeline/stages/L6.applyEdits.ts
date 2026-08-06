import { applyPatch } from "./L6.promptBuilder";
import { ValidationFinding, ValidationPatch, EditResult } from "../pipeline.types"

/**
 * Applies every patch from the validation call to the doc set.
 * Never throws, never partially corrupts a doc: a patch that cannot be
 * applied cleanly is skipped and reported, and the original doc survives.
 */
export function applyValidationFindings(
    docs: Map<string, string>,
    findings: ValidationFinding[],
): EditResult {

    const updatedDocs = new Map(docs);
    const appliedPatches: ValidationPatch[] = [];
    const skippedPatches: ValidationPatch[] = [];
    const flaggedFindings: ValidationFinding[] = [];

    for (const finding of findings) {

        if (finding.patches.length === 0) {
            flaggedFindings.push(finding);
            continue;
        }

        for (const patch of finding.patches) {

            const current = updatedDocs.get(patch.moduleId);

            if (current === undefined) {
                skippedPatches.push(patch);      // validator named a module we don't have
                continue;
            }

            const next = applyPatch(current, patch);

            if (next === current) {
                skippedPatches.push(patch);      // section heading not found
                continue;
            }

            updatedDocs.set(patch.moduleId, next);
            appliedPatches.push(patch);
        }
    }

    return { updatedDocs, appliedPatches, skippedPatches, flaggedFindings };
}