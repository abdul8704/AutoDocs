import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import { FirstTimeImportJobData } from "../queue/types.queue";

// const firstPushWorker = new Worker<FirstTimeImportJobData>(

// )