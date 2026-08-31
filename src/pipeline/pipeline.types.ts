export interface FileRecord {
  path: string;          // repo-relative, forward slashes: "src/orders/service.ts"
  ext: string;           // ".ts"
  sizeBytes: number;
  contentHash: string;   // sha256 hex of file bytes
  isCode: boolean;       // matched a code extension (drives import scanning)
}