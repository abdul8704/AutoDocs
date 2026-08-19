export interface AccessibleRepo {
  githubRepoId: string;
  name: string;
  cloneUrl: string;
  isPrivate: boolean;
  defaultBranch: string;
}

export interface ImportedRepo {
  id: string;
  githubRepoId: string;
  name: string;
  cloneUrl: string;
  installationId: number;
  lastProcessedCommit: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstallationStatus {
  isInstalled: boolean;
  installationId: number | null;
  appSlug?: string;
}

export interface AuthUser {
  id: string;
}
