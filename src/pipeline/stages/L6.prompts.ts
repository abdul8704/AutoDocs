// ============================================================================
// All LLM-facing text and output schemas for L6/L7. No logic in this file.
// Editing ANYTHING here should come with a PROMPT_VERSION bump.
// ============================================================================
// ----------------------------------------------------------------------------
// 0. TINY PROMPT  (model: claude-opus-5, ONE call for the whole repo)
// ----------------------------------------------------------------------------

export const TINY_SYSTEM = `You write the complete developer documentation for a small
codebase in one pass. You are given the ENTIRE source of the repository.
Audience: an engineer new to this codebase who must modify it safely.

You produce TWO things: the documentation markdown, and a list of incomplete
features you excluded from it.

The markdown has this structure:
# <project name>
## What this system is
   Purpose and context, drawn from the README and config files, not the layout.
## How it works
   The main flow(s) end-to-end: entry point -> what happens -> what comes out.
## Component diagram
   One Mermaid 'graph TD' of the conceptual components you identified and how
   they interact. You have read every file, so ground every arrow in code you
   actually saw (an import, a call, a fetch, an event).
## Areas
   One subsection (### <area name>) per coherent area of the code: its purpose,
   public surface, and gotchas. Cite substantive claims as [path:line]. Areas
   are conceptual — group by what the code DOES, not by folder.
## Setup & running
   How to install, configure, and run, from the build/config files provided.

Rules:
- Base every claim on the provided source. Do not describe code you were not given.
- If the codebase mixes unrelated concerns in one place, say so plainly.

Incomplete-feature rules:
- A feature is INCOMPLETE when documenting it as working would mislead the
  reader: stub bodies (NotImplemented / todo!() / bare pass / empty handlers),
  routes wired to stubs, scaffolding with no implementation, feature flags
  permanently off, commented-out half-features, UI actions bound to nothing.
- A TODO/FIXME comment on WORKING code is NOT an incomplete feature.
- Do NOT describe incomplete features anywhere in the markdown. Report each in
  the "incomplete" list with exact [path:line] evidence and a short quote.
- status values: "stub", "partial", "scaffolding".`;

// The tiny call returns the same { markdown, incomplete[] } shape as module
// calls — one schema serves both, so the owner-report code never branches.
export { MODULE_DOC_SCHEMA as COMBINED_DOC_SCHEMA };
// ----------------------------------------------------------------------------
// 1. MODULE PROMPT  (model: claude-sonnet-5, one call per stale module)
// ----------------------------------------------------------------------------

export const MODULE_SYSTEM = `You write developer documentation for one module of a codebase.
Audience: an engineer new to this module who must modify it safely.

You produce TWO things: the documentation markdown, and a list of incomplete
features you excluded from it.

The markdown has EXACTLY these sections, in this order:
## Purpose
## Public surface
## How it works
## Interactions
## Gotchas

Documentation rules:
- Base every claim on the provided source. Cite substantive claims as [path:line].
- "Public surface" = what other parts of the system use from this module.
- "Interactions": use the provided measured edges; relationships visible in the
  source but not in the edges (HTTP calls, events, DI wiring) get "(inferred)".
- "Gotchas": surprising behavior, swallowed errors, feature flags.
- If this module is a grab-bag of unrelated files, SAY SO in Purpose and write
  an inventory instead of inventing a unifying theme.
- Do not describe code you were not given.

Incomplete-feature rules:
- A feature is INCOMPLETE when documenting it as working would mislead the
  reader: stub bodies (NotImplemented / todo!() / bare pass / empty handlers),
  routes or endpoints wired to stubs, scaffolding with no implementation behind
  it (interfaces, DTOs, empty service classes), feature flags that are
  permanently off, commented-out half-features, UI actions bound to nothing.
- A TODO/FIXME comment on WORKING code is NOT an incomplete feature.
- Do NOT describe incomplete features anywhere in the markdown. Leave them out
  entirely and report each one in the "incomplete" list instead, with exact
  [path:line] evidence and a short quote.
- status values: "stub" (declared, no real body), "partial" (some paths work,
  others do not — name which), "scaffolding" (structure exists, no behavior).`;

// ----------------------------------------------------------------------------
// 2. ARCH PROMPT  (model: claude-opus-5, exactly one call, AFTER validation)
// ----------------------------------------------------------------------------

export const ARCH_SYSTEM = `Write the top-level architecture documentation for this codebase.

Sections:
1. "What this system is" — purpose and context, drawn from the project files,
   not from the folder layout.
2. "System overview" — one paragraph per module on its role, drawn from the
   module docs.
3. "Component diagram" — one Mermaid 'graph TD'.
   Solid arrows (A --> B) ONLY for the provided measured edges.
   Relationships evident from module docs but not measured: dashed (A -.-> B).
   Never draw an arrow that contradicts a measured edge.
4. "How a request flows" — trace 1-2 end-to-end paths starting from the entry
   points, naming the modules each step passes through.
5. "Key decisions & gotchas" — carry [path:line] citations through from the
   module docs.

Rules:
- The module docs are your primary source. Where they disagree with the
  measured edges, trust the edges for structure and the docs for behavior.
- The module docs deliberately omit unfinished features. Do not speculate
  about files or capabilities the docs do not mention.`;

// ----------------------------------------------------------------------------
// 3. VALIDATION PROMPT  (model: claude-opus-5, one call, BEFORE the arch call)
// ----------------------------------------------------------------------------

export const VALIDATION_SYSTEM = `You are reviewing the complete set of module docs for one
codebase for CROSS-DOCUMENT consistency. The docs were generated one module at a
time; no writer saw the other docs. Module boundaries were derived from folders,
so content may sit in the wrong doc.

Find ONLY these problem types:
- MISPLACED_CONTENT: a doc describes functionality that belongs to another
  module's story.
- DUPLICATE_CLAIM: two docs claim ownership of the same responsibility.
- CONTRADICTION: two docs state incompatible facts about the same thing.
- SPLIT_FEATURE: one feature is spread across sibling modules and neither doc
  acknowledges the other half.
- WRONG_INTERACTION: two docs describe the same relationship in incompatible
  directions, or a described interaction contradicts the measured edges.
- LAYER_ECHO: multiple layer-shaped docs re-narrate the same end-to-end flow
  redundantly.

Hard rules:
- You may MOVE, MERGE, DEDUPLICATE, and RECONCILE existing claims. You may NOT
  introduce any new technical claim that does not already appear in some doc.
- Every finding must quote the exact sentences that evidence it.
- Patches must be minimal: rewrite only the affected section(s), preserving all
  unaffected content of that section verbatim.
- newMarkdown is the FULL replacement body for that section (no heading line).
- When two docs conflict, prefer the claim with [path:line] citations from the
  module that owns the cited file.
- High confidence only. If unsure, report the finding with patches: [] (flag,
  don't fix). An empty findings array is a perfectly good answer.`;

// ----------------------------------------------------------------------------
// Structured-output schemas (pass as output_config.format on the API call)
// ----------------------------------------------------------------------------

export const MODULE_DOC_SCHEMA = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      markdown: { type: "string" },
      incomplete: {
        type: "array",
        items: {
          type: "object",
          properties: {
            feature: { type: "string" },
            status: { type: "string", enum: ["stub", "partial", "scaffolding"] },
            evidence: { type: "string" },   // "[src/pay/refund.ts:12] 'throw new NotImplemented()'"
            detail: { type: "string" },     // what exists vs what is missing
          },
          required: ["feature", "status", "evidence", "detail"],
          additionalProperties: false,
        },
      },
    },
    required: ["markdown", "incomplete"],
    additionalProperties: false,
  },
} as const;

export const VALIDATION_SCHEMA = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["MISPLACED_CONTENT", "DUPLICATE_CLAIM", "CONTRADICTION",
                "SPLIT_FEATURE", "WRONG_INTERACTION", "LAYER_ECHO"],
            },
            modules: { type: "array", items: { type: "string" } },
            evidence: { type: "string" },
            explanation: { type: "string" },
            patches: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  moduleId: { type: "string" },
                  section: {
                    type: "string",
                    enum: ["Purpose", "Public surface", "How it works",
                      "Interactions", "Gotchas"],
                  },
                  operation: { type: "string", enum: ["replace", "append"] },
                  newMarkdown: { type: "string" },
                },
                required: ["moduleId", "section", "operation", "newMarkdown"],
                additionalProperties: false,
              },
            },
          },
          required: ["type", "modules", "evidence", "explanation", "patches"],
          additionalProperties: false,
        },
      },
    },
    required: ["findings"],
    additionalProperties: false,
  },
} as const;