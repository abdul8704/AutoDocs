export interface FileRecord {
  path: string;          // repo-relative, forward slashes: "src/orders/service.ts"
  ext: string;           // ".ts"
  sizeBytes: number;
  contentHash: string;   // sha256 hex of file bytes
  isCode: boolean;       // matched a code extension (drives import scanning)
}

export interface Module {
  id: string;            // the folder key: "src/orders"  (or "(root)")
  displayName: string;   // ceremony-stripped label for docs: "orders"
  files: FileRecord[];   // disjoint across modules — every file in exactly one
  inputHash: string;     // sha256( sorted member contentHashes + PROMPT_VERSION )
}

export interface ModuleEdge {
  from: string;      // module ids
  to: string;
  count: number
}

export interface RepoAnalysis {
  files: FileRecord[];
  modules: Module[];
  moduleEdges: ModuleEdge[];
  intentBundle: string;      // README + build files, concatenated
  totalCodeTokensEst: number;
}

export interface GroupingOptions {
  minFiles?: number; // Minimum files per module before merging (default: 3)
  maxFiles?: number; // Maximum files per module before splitting (default: 15)
  promptVersion?: string; // Cache key version suffix (default: "v1")
}

export interface DirNode {
  path: string;                    // "" = repo root
  files: FileRecord[];             // code files DIRECTLY in this directory
  children: Map<string, DirNode>;  // child directory name -> node
  subtreeCount: number;            // code files in this whole subtree
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

// Provider-NEUTRAL prompt shape — structurally identical to LlmPrompt in the
// LLM module. `cache: true` marks a stable prefix; the Anthropic adapter
// translates it to cache_control. Never put provider syntax in this type.
export interface BuiltPrompt {
  system: Array<{ text: string; cache?: boolean }>;
  user: string;
}

export interface IncompleteFeature {
  feature: string;
  status: "stub" | "partial" | "scaffolding";
  evidence: string;
  detail: string;
}

/** What one module call returns (shape enforced by MODULE_DOC_SCHEMA). */
export interface ModuleDocResult {
  markdown: string;
  incomplete: IncompleteFeature[];
}

export const DOC_SECTIONS = [
  "Purpose",
  "Public surface",
  "How it works",
  "Interactions",
  "Gotchas",
] as const;

export interface ValidationPatch {
  moduleId: string;
  section: (typeof DOC_SECTIONS)[number];
  operation: "replace" | "append";
  newMarkdown: string;
}

export interface ValidationFinding {
  type: string;
  modules: string[];
  evidence: string;
  explanation: string;
  patches: ValidationPatch[];
}

export interface EditResult {
  updatedDocs: Map<string, string>;      // moduleId -> corrected markdown
  appliedPatches: ValidationPatch[];
  skippedPatches: ValidationPatch[];     // unknown module / missing section
  flaggedFindings: ValidationFinding[];  // findings with no patches -> owner report
}