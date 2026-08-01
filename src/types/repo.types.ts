export interface CodebaseChangeEvent {
    ref: string;
    before: string;
    after: string;
    repo: {
        id: string;
        name: string;
        full_name: string;
        owner: {
            name: string;
            email: string;
        }
        clone_url: string;
    }
    head_commit: {
        id: string;
        tree_id: string;
        message: string;
        added: string[];
        modified: string[];
        removed: string[];
    }
    installation: {
        id: number;
        node_id: string;
    }
}


export interface GitFetchResponse {
    raw: string;
    remote: string | null;
    branches: {
        name: string;
        tracking: string;
    }[];
    tags: {
        name: string;
        tracking: string;
    }[];
    updated: {
        name: string;
        tracking: string;
        to: string;
        from: string;
    }[];
    deleted: {
        tracking: string;
    }[];
}

export interface GitAllRepoResponse {
    githubRepoId: string;
    name: string;
    cloneUrl: string;
    isPrivate: boolean;
    defaultBranch: string;
}

export interface InstallationStatusResponse {
    isInstalled: boolean;
    installationId: number | null;
}

export interface ImportedRepoResponse {
    id: string;
    githubRepoId: string;
    name: string | null;
    cloneUrl: string;
    installationId: number;
    lastProcessedCommit: string | null;
    createdAt: Date;
    updatedAt: Date;
}