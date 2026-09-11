export interface FileRecord {
  path: string;          // repo-relative, forward slashes: "src/orders/service.ts"
  ext: string;           // ".ts"
  sizeBytes: number;
  contentHash: string;   // sha256 hex of file bytes
  isCode: boolean;       // matched a code extension (drives import scanning)
}

export interface DiffSummary {
  changed: number;
  insertions: number;
  deletions: number;
  files: [{
    file: string;
    changes: number;
    insertions: number;
    deletions: number;
    binary: boolean;
  }];
}

export type JobStatus = "PENDING" | "INSUFFICIENT_CREDITS" | "CLONING" | "SCANING" | "GENERATING" | "PR_OPEN" | "COMPLETED" | "FAILED" | "WAITING_LLM_JUDGE" | "LLM_JUDGE_REJECTED" | "DROPPED" | "MERGED";
