import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";
import { FirstTimeImportJobData, DeepClonePushJobData, CleanupJobData, PushClassifyJobData, DocUpdateJobData } from "./types.queue"
import type { StorageJobData } from "./types.queue.ts"

/**
 * Queue 1: Disk & Storage Operations (Cloning + Deleting)
 * Low Concurrency (Worker: 2) to protect local disk I/O and bandwidth.
 */
export const repoStorageQueue = new Queue<StorageJobData>(
  "repo-storage-queue",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  }
);

/**
 * Queue 2: Webhook Push Classification
 * High Concurrency (Worker: 10) for fast, debounced evaluations.
 */
export const classifyQueue = new Queue<PushClassifyJobData>(
  "push-classify-queue",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  }
);

/**
 * Queue 3: Documentation Generation
 * Medium Concurrency (Worker: 3) to manage heavy LLM token quotas.
 */
export const docGenQueue = new Queue<DocUpdateJobData>(
  "doc-generation-queue",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  }
);

// ======================================================
// 3. PUBLISHER FUNCTIONS
// ======================================================

/**
 * Publisher 1A: First-Time Repo Import (Shallow Clone `--depth 1`)
 * Target: repoStorageQueue ('clone-first-time')
 */
export const publishFirstTimeImport = async (data: FirstTimeImportJobData) => {
  return await repoStorageQueue.add("clone-first-time", data, {
    jobId: `clone-first-${data.repoId}`, // Idempotent per repository
  });
};

/**
 * Publisher 1B: Deep Clone for Push (when local cache is missing)
 * Target: repoStorageQueue ('clone-deep-push')
 */
export const publishDeepCloneForPush = async (data: DeepClonePushJobData) => {
  return await repoStorageQueue.add("clone-deep-push", data, {
    jobId: `clone-deep-${data.repoId}-${data.afterSha}`,
  });
};

/**
 * Publisher 1C: Resource Cleanup (Deletes directory & DB entries)
 * Target: repoStorageQueue ('cleanup-repo')
 */
export const publishCleanup = async (data: CleanupJobData) => {
  const targetId = data.repoId || data.userId;
  return await repoStorageQueue.add("cleanup-repo", data, {
    jobId: `cleanup-${data.action.toLowerCase()}-${targetId}`,
  });
};

/**
 * Publisher 2: GitHub Push Event Classification (10-Minute Debounced)
 * Target: classifyQueue ('classify-push')
 */
export const publishPushForClassification = async (
  data: PushClassifyJobData
) => {
  const jobId = `classify-${data.repoId}-${data.branch}`;

  // Debouncing: Check if a delayed job is already waiting in queue
  const existingJob = await classifyQueue.getJob(jobId);
  if (existingJob) {
    // Retain the original starting SHA from the earliest push in this window
    if (existingJob.data?.beforeSha) {
      data.beforeSha = existingJob.data.beforeSha;
    }
    // Remove old job to reset the 10-minute timer
    await existingJob.remove();
  }

  return await classifyQueue.add("classify-push", data, {
    jobId,
    delay: 10 * 60 * 1000, // 10-Minute Debounce Delay
  });
};

/**
 * Publisher 3: Heavy Documentation Generation
 * Target: docGenQueue ('generate-doc-update')
 */
export const publishDocUpdate = async (data: DocUpdateJobData) => {
  return await docGenQueue.add("generate-doc-update", data, {
    jobId: `docgen-${data.repoId}-${data.afterSha}`, // Idempotent per commit SHA
  });
};