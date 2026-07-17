export interface CodebaseChangeEvent {
    ref: string;
    before: string;
    after: string;
    repo: {
        id: number;
        name: string;
        full_name: string;
        owner:{
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
