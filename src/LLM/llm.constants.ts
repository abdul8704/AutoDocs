
export const JSON_ENFORCEMENT_PROMPT = `
CRITICAL OUTPUT REQUIREMENTS:
You are interacting with an automated system. You must output ONLY a valid, raw JSON object that strictly adheres to the provided JSON Schema with the exact keys: 'prTitle', 'prBody', 'commitMessage', and 'documentation'.

1. NO MARKDOWN: Do not wrap the output in \`\`\`json or any other markdown fences.
2. NO CONVERSATIONAL TEXT: Do not include introductory phrases (e.g., "Here is the result:") or concluding remarks.
3. DATA INTEGRITY & CONCISENESS:
   - All string values must be properly escaped (especially quotes and line breaks inside the documentation or description fields).
   - The 'prTitle' must strictly follow the Conventional Commits specification (e.g., feat:, fix:, docs:, refactor:).
   - The 'prBody' must clearly separate the 'Why' (business value/bug fixed) from the 'How' (technical implementation).
   - The 'commitMessage' must be a concise, single-line commit summary.
   - The 'documentation' must be clean, structured Markdown. Avoid repeating identical table rows or duplicating sections.
   - Do not invent keys or fields that are not explicitly defined in the schema.
4. FALLBACK BEHAVIOR: If you cannot determine a value for a required string field, output an empty string ("") rather than omitting the key.

Failure to follow these formatting rules will cause a fatal system crash in the downstream pipeline.
`;

export const DIFF_ENFORCEMENT_PROMPT = `
CRITICAL OUTPUT REQUIREMENTS:
You are interacting with an automated system. You must output ONLY a valid, raw JSON object that strictly adheres to the provided JSON Schema with the exact keys: 'verdict' and 'reasoning'

1. NO MARKDOWN: Do not wrap the output in \`\`\`json or any other markdown fences.
2. NO CONVERSATIONAL TEXT: Do not include introductory phrases (e.g., "Here is the result:") or concluding remarks.
3. DATA INTEGRITY & CONCISENESS:
   - All string values must be properly escaped (especially quotes and line breaks inside the documentation or description fields).
   - 'verdict' must be strictly true or false
   - 'reasoning' should be brief, one or two lines max. 
   -  Do not invent keys or fields that are not explicitly defined in the schema.

Failure to follow these formatting rules will cause a fatal system crash in the downstream pipeline.
`;

export const CACHE_RECONCILIATION_ENFORCEMENT_PROMPT = `
CRITICAL CACHE RECONCILIATION REQUIREMENTS:
You are updating technical documentation for an evolving codebase. The baseline state of the codebase is already pre-loaded into your active context memory under <latest_codebase>. 

You are provided with a dynamic delta representing changes made since that baseline:

1. FILE DELETIONS (<deleted_files>):
   - The files listed here have been permanently removed from the repository.
   - You MUST surgically eliminate all references to these files, their data models, exported interfaces, and API routes from the documentation and Mermaid diagrams.

2. WHOLE-FILE OVERRIDES (<updated_files>):
   - Contains the full, definitive contents of newly added or modified files.
   - Execute a complete in-memory replacement: discard the baseline version of these files from your cached context and substitute them with these exact contents.
   - Treat these contents as the absolute current implementation.

3. ARCHITECTURAL RECONCILIATION:
   - Identify all ripple effects across layers (e.g., how a schema change affects routes or business logic).
   - Update Mermaid diagrams (flowchart, erDiagram, sequenceDiagram) to reflect new entities, removed dependencies, or altered data flows.
   - Preserve human-written tribal knowledge, badges, custom links, and existing formatting from <existing_documentation> unless invalidated by the code changes.
   - Do not hallucinate external services or endpoints not evident in the codebase.

4. OUTPUT INTEGRITY:
   - You must output ONLY a valid, raw JSON object matching the schema: 'prTitle', 'prBody', 'commitMessage', and 'documentation'.
   - 'prTitle' must follow Conventional Commits (e.g., 'docs: update schema models and auth routes').
   - 'prBody' must clearly summarize what was changed in the docs and why.
   - 'commitMessage' must be a concise, single-line commit summary.
   - Do NOT wrap the JSON in markdown code blocks (\`\`\`json).
`;