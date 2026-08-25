import { prisma } from "@scs/database";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { processScan } from "./process-scan.js";

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const worker = new Worker("shield-scans", async (job) => processScan(job.data), {
  connection,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  limiter: { max: 10, duration: 1_000 },
});

worker.on("completed", (job) =>
  console.info(JSON.stringify({ event: "scan.completed", jobId: job.id })),
);
worker.on("failed", (job, error) =>
  console.error(JSON.stringify({ event: "scan.failed", jobId: job?.id, error: error.message })),
);
worker.on("error", (error) =>
  console.error(JSON.stringify({ event: "worker.error", error: error.message })),
);

async function shutdown(signal: string) {
  console.info(JSON.stringify({ event: "worker.shutdown", signal }));
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.info(JSON.stringify({ event: "worker.started", concurrency: worker.opts.concurrency }));
