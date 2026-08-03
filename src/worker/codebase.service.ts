import fs from "fs";
import path from "path";
import axios from "axios";
import { readdir, stat } from "fs/promises";

const CODEBASES_DIR = path.join(__dirname, "codebases");

interface LockInfo {
    pid: number;
    serviceName: string;
    lockedAt: number;
}

/**
 * Check if a PID is currently running on the operating system.
 */
function isProcessAlive(pid: number): boolean {
    try {
        // process.kill with signal 0 checks process existence without killing it
        return process.kill(pid, 0);
    } catch {
        return false;
    }
}

/**
 * Checks if a repository is currently locked by another service.
 * Automatically cleans up stale locks if the process crashed.
 */
export function isRepoLocked(repoName: string): boolean {
    const repoPath = path.join(CODEBASES_DIR, repoName);
    const lockFilePath = path.join(repoPath, ".lock");

    if (!fs.existsSync(lockFilePath)) return false;

    try {
        const lockData: LockInfo = JSON.parse(
            fs.readFileSync(lockFilePath, "utf8"),
        );

        // Check if process is still actively running
        if (isProcessAlive(lockData.pid)) {
            return true; // Repo is actively locked
        }

        // Process crashed or exited without unlocking -> Clean up stale lock
        console.warn(
            `[Lock] Found stale lock for ${repoName} from crashed process (PID: ${lockData.pid}). Clearing lock.`,
        );
        fs.unlinkSync(lockFilePath);
        return false;
    } catch {
        // Malformed lock file -> treat as unlocked and remove
        fs.unlinkSync(lockFilePath);
        return false;
    }
}

/**
 * Acquires a lock and updates the .last_used timestamp.
 */
export function acquireRepoLock(
    repoName: string,
    serviceName: string,
): boolean {
    const repoPath = path.join(CODEBASES_DIR, repoName);
    const lockFilePath = path.join(repoPath, ".lock");
    const lastUsedFilePath = path.join(repoPath, ".last_used");

    if (isRepoLocked(repoName)) {
        return false; // Cannot lock, already in use
    }

    // Write lock file
    const lockInfo: LockInfo = {
        pid: process.pid,
        serviceName,
        lockedAt: Date.now(),
    };
    fs.writeFileSync(lockFilePath, JSON.stringify(lockInfo));

    // Update last used timestamp
    fs.writeFileSync(lastUsedFilePath, Date.now().toString());
    return true;
}

/**
 * Releases the lock on a repository.
 */
export function releaseRepoLock(repoName: string): void {
    const repoPath = path.join(CODEBASES_DIR, repoName);
    const lockFilePath = path.join(repoPath, ".lock");

    if (fs.existsSync(lockFilePath)) {
        fs.unlinkSync(lockFilePath);
    }
}

/**
 * Finds the Least Recently Used (LRU) repository that is NOT currently locked.
 * Returns null if no eligible repositories exist (e.g. all are locked or folder is empty).
 */
export function getEvictableLRURepo(): string | null {
    if (!fs.existsSync(CODEBASES_DIR)) return null;

    const entries = fs.readdirSync(CODEBASES_DIR);

    const eligibleRepos = entries
        .map((repoName) => {
            const repoPath = path.join(CODEBASES_DIR, repoName);

            // Skip non-directory entries
            if (!fs.statSync(repoPath).isDirectory()) return null;

            // 1. Skip if locked by any active process (docs-gen, classify, etc.)
            if (isRepoLocked(repoName)) return null;

            // 2. Get last used timestamp
            const lastUsedFilePath = path.join(repoPath, ".last_used");
            let lastUsed = 0;
            if (fs.existsSync(lastUsedFilePath)) {
                lastUsed = parseInt(fs.readFileSync(lastUsedFilePath, "utf8"), 10) || 0;
            }

            return { repoName, repoPath, lastUsed };
        })
        .filter(
            (
                item,
            ): item is { repoName: string; repoPath: string; lastUsed: number } =>
                item !== null,
        );

    if (eligibleRepos.length === 0) {
        return null; // All repos are currently in use or no repos exist
    }

    // Sort ascending: Oldest timestamp first (LRU)
    eligibleRepos.sort((a, b) => a.lastUsed - b.lastUsed);

    return eligibleRepos[0].repoName;
}

/**
 * Checks if there is enough space to clone a new repo.
 * Evicts unlocked LRU repos until space is available.
 * Returns `true` if sufficient space is freed, or `false` if locked repos prevent eviction.
 */
export const checkForSpace = async (
    cloneUrl: string,
    TOTAL_SIZE: number,
    installationToken: number,
): Promise<boolean> => {
    const sanitizedUrl = cloneUrl
        .trim()
        .replace(/\/+$/, "")
        .replace(/\.git$/, "");

    // 1. Match owner and repo using regex
    const match = sanitizedUrl.match(
        /(?:[:/])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/,
    );

    if (!match) {
        throw new Error(`Invalid GitHub clone URL: ${cloneUrl}`);
    }

    const [, owner, repo] = match;

    // 2. Query GitHub API for repository size
    const repoData = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
            headers: {
                Authorization: `Bearer ${installationToken}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "DocsFlow-Worker",
            },
        },
    );

    const repoSize = 1024 * repoData.data.size; // Size in KB converted to bytes

    // Ensure the codebases directory exists
    if (!fs.existsSync(CODEBASES_DIR)) {
        fs.mkdirSync(CODEBASES_DIR, { recursive: true });
    }

    let currentSize = await getDirectorySize(CODEBASES_DIR);

    // 3. Evict LRU repositories until space is freed
    while (repoSize + currentSize > TOTAL_SIZE) {
        const lruRepo = getEvictableLRURepo();

        // If no evictable repos remain (all locked or directory empty), return false
        if (!lruRepo) {
            console.warn(
                `[Storage] Cannot free space for ${repo}. All local repos are locked or directory is empty.`,
            );
            return false;
        }

        const repoPath = path.join(CODEBASES_DIR, lruRepo);
        console.log(`[Storage] Evicting LRU repository: ${lruRepo}`);

        // Delete the repository folder
        fs.rmSync(repoPath, { recursive: true, force: true });

        // Recalculate directory size after deletion
        currentSize = await getDirectorySize(CODEBASES_DIR);
    }

    return true; // Space successfully guaranteed
};

async function getDirectorySize(dir: string): Promise<number> {
    if (!fs.existsSync(dir)) return 0;

    let size = 0;
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            size += await getDirectorySize(fullPath);
        } else {
            size += (await stat(fullPath)).size;
        }
    }

    return size;
}