/** Payload for shallow cloning a repository for the first time */
export interface FirstTimeImportJobData {
  repoId: string;
  defaultBranch: string;
  installationId: number;
  userId: string;
  customPrompt?: string;
  repoFullName: string;
  cloneUrl: string;
}

/** Payload for deep cloning/fetching a repo when local cache is missing on push */
export interface DeepClonePushJobData {
  repoId: string;
  repoFullName: string;
  cloneUrl: string;
  defaultBranch: string;
  installationId: number;
  beforeSha: string;
  afterSha: string;
  userId: string;
}

/** Payload for deleting repo/user local folders and database entries */
export interface CleanupJobData {
  repoId: string;
  path?: string;
  userId: string;
  action: "DELETE_REPO" | "DELETE_USER";
}

/** Payload for evaluating push events via Layer 3 Classifier LLM */
export interface PushClassifyJobData {
  repoId: string;
  repoFullName: string;
  branch: string;
  defaultBranch: string;
  beforeSha: string;
  afterSha: string;
  installationId: number;
  userId: string;
}

/** Payload for generating updated documentation via Heavy LLM */
export interface DocUpdateJobData {
  repoId: string;
  repoFullName: string;
  affectedDocs: string[];
  beforeSha: string;
  afterSha: string;
  userId: string;
  customPrompt?: string;
}

// Union type for the Storage Queue
export type StorageJobData =
  | FirstTimeImportJobData
  | DeepClonePushJobData
  | CleanupJobData;
