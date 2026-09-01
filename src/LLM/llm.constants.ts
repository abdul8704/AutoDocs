
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