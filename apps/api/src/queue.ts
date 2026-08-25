import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
export const scanQueue = new Queue("shield-scans", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: 500,
    removeOnFail: 1_000,
  },
});
