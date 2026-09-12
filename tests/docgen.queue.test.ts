import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { DocUpdateJobData } from "../src/queue/types.queue";

describe("DocGen Queue Payload Tests", () => {
    test("DocUpdateJobData satisfies required job properties", () => {
        const payload: DocUpdateJobData = {
            docJobId: "job-uuid-123",
            userId: "user-uuid-456",
            repoId: "repo-uuid-789",
            repoFullName: "owner/repo-name",
            affectedDocs: ["ARCHITECTURE.md"],
            beforeSha: "a1b2c3d4e5f6",
            afterSha: "f6e5d4c3b2a1",
            repoPath: "/codebases/repo-uuid-789",
            cloneUrl: "https://x-access-token:token@github.com/owner/repo-name.git",
            installationId: 12345,
            defaultBranch: "main",
            isFirstTime: true,
        };

        assert.equal(payload.docJobId, "job-uuid-123");
        assert.equal(payload.userId, "user-uuid-456");
        assert.equal(payload.repoId, "repo-uuid-789");
        assert.equal(payload.isFirstTime, true);
        assert.equal(payload.defaultBranch, "main");
    });
});
