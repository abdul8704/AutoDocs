import { lstat, readdir, rm } from "fs/promises";
import path from "path";
import { Redis } from "ioredis";
import { env } from "../config/env";
import prisma from "../prisma/prisma";
import { getInstallationOctokit } from "../github/github.app.service";
import { getCodebasesRoot, constructPath } from "../utils/pathHelper.utils";

/**
 * Disk budget for the local `codebases/` cache.
 *
 * - Budget: env.CODEBASES_MAX_GB (default 10).
 * - Before every clone we peek at the repo size via the GitHub API and evict
 *   least-recently-used clones until the new one fits.
 * - LRU order lives in a Redis sorted set (member = Repo.id, score = last-used ms).
 *   Directories with no score (orphans, pre-existing clones) are evicted first.
 * - Repos that are in use are never evicted: the repo being cloned, repos pinned by
 *   a running worker job, and repos with a non-terminal DocsUpdateJob.
 *
 * Concurrency: check -> evict -> clone runs under an in-process mutex. All workers
 * live in one Node process today (see index.ts). If workers are ever split across
 * processes/hosts, swap `withCloneLock` for a Redis lock.
 */

const LRU_KEY = "codebases:lru";
const BYTES_PER_GB = 1024 ** 3;
const ACTIVE_JOB_STATUSES = ["PENDING", "CLONING", "SCANING", "GENERATING", "WAITING_LLM_JUDGE"] as const;
// A job stuck in a non-terminal status longer than this no longer protects its repo.
const ACTIVE_JOB_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const getBudgetBytes = () => Math.floor(env.CODEBASES_MAX_GB * BYTES_PER_GB);

export class DiskBudgetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DiskBudgetError";
    }
}

// ---------------------------------------------------------------- Redis (LRU)

const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
});
redis.on("error", (err) => console.error("[DiskQuota] Redis error:", err.message));

/** Mark a repo's local clone as used now. Never throws. */
export const touchRepo = async (repoId: string): Promise<void> => {
    try {
        await redis.zadd(LRU_KEY, Date.now(), repoId);
    } catch (err) {
        console.warn(`[DiskQuota] touch failed for ${repoId}:`, err);
    }
};

/** Drop a repo from LRU tracking (after it is deleted from disk). Never throws. */
export const forgetRepo = async (...repoIds: string[]): Promise<void> => {
    if (repoIds.length === 0) return;
    try {
        await redis.zrem(LRU_KEY, ...repoIds);
    } catch (err) {
        console.warn(`[DiskQuota] forget failed for ${repoIds.join(",")}:`, err);
    }
};

const getLastUsed = async (repoIds: string[]): Promise<Map<string, number>> => {
    const out = new Map<string, number>();
    if (repoIds.length === 0) return out;
    try {
        const scores = await redis.zmscore(LRU_KEY, ...repoIds);
        repoIds.forEach((id, i) => out.set(id, scores[i] != null ? Number(scores[i]) : 0));
    } catch (err) {
        // Redis down: every candidate scores 0, so eviction falls back to largest-first below.
        console.warn("[DiskQuota] Could not read LRU scores:", err);
        repoIds.forEach((id) => out.set(id, 0));
    }
    return out;
};

// ---------------------------------------------------------------- Pins (in use)

const pins = new Map<string, number>();

/** Protect a repo from eviction while `fn` runs (e.g. for the duration of a worker job). */
export const withRepoPinned = async <T>(repoId: string, fn: () => Promise<T>): Promise<T> => {
    pins.set(repoId, (pins.get(repoId) ?? 0) + 1);
    try {
        return await fn();
    } finally {
        const n = (pins.get(repoId) ?? 1) - 1;
        if (n <= 0) pins.delete(repoId);
        else pins.set(repoId, n);
    }
};

const getReposWithActiveJobs = async (): Promise<Set<string>> => {
    const rows = await prisma.docsUpdateJob.findMany({
        where: {
            status: { in: [...ACTIVE_JOB_STATUSES] },
            updatedAt: { gte: new Date(Date.now() - ACTIVE_JOB_MAX_AGE_MS) },
            repoId: { not: null },
        },
        select: { repoId: true },
        distinct: ["repoId"],
    });
    return new Set(rows.map((r) => r.repoId as string));
};

// ---------------------------------------------------------------- Mutex

let lockTail: Promise<unknown> = Promise.resolve();

const withCloneLock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = lockTail.then(fn, fn);
    lockTail = run.catch(() => undefined);
    return run;
};

// ---------------------------------------------------------------- Disk measurement

/** Bytes actually allocated on disk for a file tree (falls back to apparent size). */
const allocatedBytes = (st: { blocks?: number; size: number }) =>
    st.blocks != null ? st.blocks * 512 : st.size;

export const dirSizeBytes = async (root: string): Promise<number> => {
    let total = 0;
    try {
        total += allocatedBytes(await lstat(root)); // the directory entry itself
    } catch {
        return 0;
    }
    const stack = [root];
    while (stack.length) {
        const dir = stack.pop()!;
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            continue; // vanished mid-walk / unreadable
        }
        const BATCH = 64;
        for (let i = 0; i < entries.length; i += BATCH) {
            await Promise.all(entries.slice(i, i + BATCH).map(async (e) => {
                const full = path.join(dir, e.name);
                try {
                    const st = await lstat(full);
                    total += allocatedBytes(st);
                    if (st.isDirectory()) stack.push(full);
                } catch {
                    // ignore
                }
            }));
        }
    }
    return total;
};

interface CacheEntry { id: string; bytes: number; }

const listCacheEntries = async (): Promise<CacheEntry[]> => {
    const root = getCodebasesRoot();
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (err: unknown) {
        if ((err as { code?: string }).code === "ENOENT") return [];
        throw err;
    }
    const dirs = entries.filter((e) => e.isDirectory());
    return Promise.all(dirs.map(async (d) => ({
        id: d.name,
        bytes: await dirSizeBytes(path.join(root, d.name)),
    })));
};

// ---------------------------------------------------------------- GitHub size peek

/**
 * Estimated clone size in bytes, from GitHub's `size` field (KB). This is GitHub's
 * packed size, so it is an estimate; we re-measure after cloning.
 * Returns 0 if the lookup fails, so a GitHub hiccup doesn't block clones.
 */
export const peekRepoSizeBytes = async (repoId: string): Promise<number> => {
    try {
        const repo = await prisma.repo.findUnique({
            where: { id: repoId },
            select: { full_name: true, clone_url: true, installation_id: true },
        });
        if (!repo) return 0;

        let owner: string | undefined;
        let name: string | undefined;
        if (repo.full_name?.includes("/")) {
            [owner, name] = repo.full_name.split("/");
        } else {
            const parts = new URL(repo.clone_url).pathname.split("/");
            owner = parts[1];
            name = parts[2]?.replace(/\.git$/, "");
        }
        if (!owner || !name) return 0;

        const octokit = await getInstallationOctokit(repo.installation_id);
        const { data } = await octokit.rest.repos.get({ owner, repo: name });
        return (data.size ?? 0) * 1024;
    } catch (err) {
        console.warn(`[DiskQuota] Could not peek size for repo ${repoId}; assuming 0 and reconciling after clone:`, err);
        return 0;
    }
};

// ---------------------------------------------------------------- Eviction

/**
 * Evict LRU clones until `used + incomingBytes <= budget`.
 * Returns the ids evicted. Throws DiskBudgetError if it cannot free enough and `strict`.
 */
const evictUntilFits = async (
    targetRepoId: string,
    incomingBytes: number,
    strict: boolean
): Promise<string[]> => {
    const budget = getBudgetBytes();
    const entries = await listCacheEntries();
    let used = entries.reduce((s, e) => s + e.bytes, 0);

    if (used + incomingBytes <= budget) return [];

    const protectedIds = new Set<string>([targetRepoId, ...pins.keys()]);
    try {
        for (const id of await getReposWithActiveJobs()) protectedIds.add(id);
    } catch (err) {
        console.warn("[DiskQuota] Could not load active jobs; only in-process pins are protected:", err);
    }

    const candidates = entries.filter((e) => !protectedIds.has(e.id));
    const lastUsed = await getLastUsed(candidates.map((c) => c.id));
    // Oldest first; ties (e.g. untracked dirs) -> largest first so we free space fastest.
    candidates.sort((a, b) => (lastUsed.get(a.id)! - lastUsed.get(b.id)!) || (b.bytes - a.bytes));

    const evicted: string[] = [];
    for (const c of candidates) {
        if (used + incomingBytes <= budget) break;
        try {
            await rm(constructPath(c.id), { recursive: true, force: true });
            used -= c.bytes;
            evicted.push(c.id);
            console.log(`[DiskQuota] Evicted ${c.id} (${fmt(c.bytes)}), last used ${lastUsed.get(c.id) ? new Date(lastUsed.get(c.id)!).toISOString() : "never"}`);
        } catch (err) {
            console.error(`[DiskQuota] Failed to evict ${c.id}:`, err);
        }
    }
    await forgetRepo(...evicted);

    if (used + incomingBytes > budget) {
        const msg = `Disk budget exceeded: need ${fmt(incomingBytes)}, ${fmt(budget - used)} free of ${fmt(budget)} after evicting ${evicted.length} repo(s); remaining repos are in use.`;
        if (strict) throw new DiskBudgetError(msg);
        console.warn(`[DiskQuota] ${msg}`);
    }
    return evicted;
};

/**
 * Clone a repo into codebases/ within the disk budget.
 * `cloneFn` must perform the clone into constructPath(repoId) and return its result.
 */
export const cloneWithinBudget = async <T>(repoId: string, cloneFn: () => Promise<T>): Promise<T> => {
    const estimate = await peekRepoSizeBytes(repoId); // network call stays outside the lock
    const budget = getBudgetBytes();
    if (estimate > budget) {
        throw new DiskBudgetError(`Repo ${repoId} is ~${fmt(estimate)}, larger than the whole codebases budget (${fmt(budget)}).`);
    }

    return withCloneLock(async () => {
        const evicted = await evictUntilFits(repoId, estimate, true);
        if (evicted.length) console.log(`[DiskQuota] Freed space for ${repoId} (~${fmt(estimate)}) by evicting: ${evicted.join(", ")}`);

        const result = await cloneFn();
        await touchRepo(repoId);

        // GitHub's size is only an estimate: re-check with the real footprint.
        await evictUntilFits(repoId, 0, false);
        return result;
    });
};

const fmt = (bytes: number) =>
    bytes >= BYTES_PER_GB ? `${(bytes / BYTES_PER_GB).toFixed(2)}GB` : `${(bytes / 1024 ** 2).toFixed(1)}MB`;
