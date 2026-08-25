import cors from "@fastify/cors";
import { prisma } from "@scs/database";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import { ZodError } from "zod";
import { config } from "./config.js";
import { redis, scanQueue } from "./queue.js";
import { registerRoutes } from "./routes.js";

const app = Fastify({
  logger: {
    level: config.NODE_ENV === "development" ? "debug" : "info",
    redact: ["req.headers.authorization", "req.headers.x-hub-signature-256"],
  },
  bodyLimit: 2 * 1024 * 1024,
});

await app.register(cors, { origin: config.WEB_URL, methods: ["GET", "POST"] });
await app.register(rawBody, {
  field: "rawBody",
  global: false,
  encoding: false,
  runFirst: true,
  routes: ["/webhooks/github"],
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError)
    return reply.code(400).send({ error: "Validation failed", details: error.issues });
  app.log.error(error);
  return reply.code(500).send({ error: "Internal server error" });
});

await registerRoutes(app);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await scanQueue.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: "0.0.0.0", port: config.API_PORT });
