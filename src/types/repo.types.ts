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