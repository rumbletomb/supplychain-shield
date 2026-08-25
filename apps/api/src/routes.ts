import path from "node:path";
import { createSarif } from "@scs/core";
import { prisma } from "@scs/database";
import { createCheckRun, verifyWebhook } from "@scs/github";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import { scanQueue } from "./queue.js";
import { jsonSafe } from "./serialization.js";

const exceptionSchema = z.object({
  reason: z.string().min(10).max(1_000),
  approvedBy: z.string().min(1).max(100),
  expiresAt: z.coerce.date().refine((value) => value > new Date(), "Expiry must be in the future"),
});

const policyUpdateSchema = z.object({
  blockAt: z.enum(["critical", "high", "medium", "low", "info"]),
  warnAt: z.enum(["critical", "high", "medium", "low", "info"]),
  blockVerifiedSecrets: z.boolean(),
  deniedLicenses: z.array(z.string().min(1).max(100)).max(100),
  ignoredRules: z.array(z.string().min(1).max(150)).max(500),
});

function statusCounts(scans: Array<{ status: string }>) {
  return scans.reduce<Record<string, number>>((result, scan) => {
    result[scan.status.toLowerCase()] = (result[scan.status.toLowerCase()] ?? 0) + 1;
    return result;
  }, {});
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", service: "supplychain-shield-api", timestamp: new Date() };
  });

  app.get("/api/dashboard", async () => {
    const [repositories, scans, findings] = await Promise.all([
      prisma.repository.count({ where: { active: true } }),
      prisma.scan.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { repository: true, findings: true },
      }),
      prisma.finding.groupBy({ by: ["severity"], _count: true }),
    ]);

    return jsonSafe({
      repositories,
      scanCounts: statusCounts(scans),
      findingCounts: Object.fromEntries(
        findings.map((item) => [item.severity.toLowerCase(), item._count]),
      ),
      recentScans: scans,
    });
  });

  app.get("/api/scans", async (request) => {
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(30) })
      .parse(request.query);
    const scans = await prisma.scan.findMany({
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: { repository: true, _count: { select: { findings: true } } },
    });
    return jsonSafe(scans);
  });

  app.get("/api/repositories", async () => {
    const repositories = await prisma.repository.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      include: { policy: true, _count: { select: { scans: true } } },
    });
    return jsonSafe(repositories);
  });

  app.put("/api/repositories/:id/policy", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = policyUpdateSchema.parse(request.body);
    const repository = await prisma.repository.findUnique({ where: { id } });
    if (!repository) return reply.code(404).send({ error: "Repository not found" });
    const policy = await prisma.policy.upsert({
      where: { repositoryId: id },
      update: {
        blockAt: body.blockAt.toUpperCase() as any,
        warnAt: body.warnAt.toUpperCase() as any,
        blockVerifiedSecrets: body.blockVerifiedSecrets,
        deniedLicenses: body.deniedLicenses,
        ignoredRules: body.ignoredRules,
      },
      create: {
        repositoryId: id,
        blockAt: body.blockAt.toUpperCase() as any,
        warnAt: body.warnAt.toUpperCase() as any,
        blockVerifiedSecrets: body.blockVerifiedSecrets,
        deniedLicenses: body.deniedLicenses,
        ignoredRules: body.ignoredRules,
      },
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: repository.organizationId,
        actor: "api-user",
        action: "repository.policy.updated",
        target: repository.fullName,
        metadata: body,
      },
    });
    return jsonSafe(policy);
  });

  app.get("/api/scans/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const scan = await prisma.scan.findUnique({
      where: { id },
      include: {
        repository: { include: { policy: true } },
        findings: {
          orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
          include: { exceptions: true },
        },
      },
    });
    if (!scan) return reply.code(404).send({ error: "Scan not found" });
    return jsonSafe(scan);
  });

  app.get("/api/scans/:id/export", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { format } = z
      .object({ format: z.enum(["json", "sarif", "cyclonedx"]) })
      .parse(request.query);
    const scan = await prisma.scan.findUnique({
      where: { id },
      include: { findings: true, repository: true },
    });
    if (!scan) return reply.code(404).send({ error: "Scan not found" });
    const findings = scan.findings.map((item) => ({
      fingerprint: item.fingerprint,
      ruleId: item.ruleId,
      engine: item.engine,
      category: item.category as any,
      severity: item.severity.toLowerCase() as any,
      title: item.title,
      description: item.description,
      remediation: item.remediation,
      ...(item.path
        ? {
            location: { path: item.path, ...(item.startLine ? { startLine: item.startLine } : {}) },
          }
        : {}),
      ...(item.packageName ? { packageName: item.packageName } : {}),
      ...(item.installedVersion ? { installedVersion: item.installedVersion } : {}),
      ...(item.fixedVersion ? { fixedVersion: item.fixedVersion } : {}),
      ...(item.advisoryUrl ? { advisoryUrl: item.advisoryUrl } : {}),
      metadata: (item.metadata as Record<string, unknown>) ?? {},
    }));
    const body =
      format === "sarif"
        ? createSarif(findings)
        : format === "cyclonedx"
          ? scan.sbom
          : { scan, findings };
    reply.header(
      "content-disposition",
      `attachment; filename=shield-${id}.${format === "sarif" ? "sarif" : "json"}`,
    );
    return body;
  });

  app.post("/api/scans/:id/retry", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const original = await prisma.scan.findUnique({
      where: { id },
      include: { repository: { include: { installation: true } } },
    });
    if (!original) return reply.code(404).send({ error: "Scan not found" });

    const scan = await prisma.scan.create({
      data: {
        repositoryId: original.repositoryId,
        pullRequest: original.pullRequest,
        commitSha: original.commitSha,
        ref: original.ref,
        source: original.source,
      },
    });

    if (original.source === "local") {
      const fixturePath =
        config.DEMO_FIXTURE_PATH ?? path.resolve(process.cwd(), "../../fixtures/vulnerable-node");
      await scanQueue.add(
        "scan",
        { source: "local", scanId: scan.id, path: fixturePath },
        { jobId: scan.id },
      );
      return reply.code(202).send({ scanId: scan.id, status: "queued" });
    }

    const installation = original.repository.installation;
    if (!installation) return reply.code(409).send({ error: "GitHub installation is unavailable" });
    const installationId = Number(installation.githubId);
    const checkRunId = await createCheckRun({
      installationId,
      owner: original.repository.owner,
      repository: original.repository.name,
      sha: original.commitSha,
      detailsUrl: `${config.WEB_URL}/scans/${scan.id}`,
    });
    await prisma.scan.update({ where: { id: scan.id }, data: { checkRunId: BigInt(checkRunId) } });
    await scanQueue.add(
      "scan",
      {
        source: "github",
        scanId: scan.id,
        installationId,
        owner: original.repository.owner,
        repository: original.repository.name,
        sha: original.commitSha,
        checkRunId,
      },
      { jobId: scan.id },
    );
    return reply.code(202).send({ scanId: scan.id, status: "queued" });
  });

  app.post("/api/findings/:id/exceptions", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = exceptionSchema.parse(request.body);
    const finding = await prisma.finding.findUnique({
      where: { id },
      include: { scan: { include: { repository: true } } },
    });
    if (!finding) return reply.code(404).send({ error: "Finding not found" });
    const exception = await prisma.$transaction(async (transaction) => {
      const created = await transaction.exception.create({ data: { findingId: id, ...body } });
      await transaction.auditEvent.create({
        data: {
          organizationId: finding.scan.repository.organizationId,
          actor: body.approvedBy,
          action: "finding.exception.created",
          target: finding.fingerprint,
          metadata: { reason: body.reason, expiresAt: body.expiresAt },
        },
      });
      return created;
    });
    return reply.code(201).send(jsonSafe(exception));
  });

  app.post("/api/demo/scans", async (_request, reply) => {
    const organization = await prisma.organization.upsert({
      where: { githubLogin: "shield-demo" },
      update: {},
      create: { githubLogin: "shield-demo", displayName: "SupplyChain Shield Demo" },
    });
    const repository = await prisma.repository.upsert({
      where: { fullName: "shield-demo/vulnerable-node" },
      update: { active: true },
      create: {
        githubId: -1,
        owner: "shield-demo",
        name: "vulnerable-node",
        fullName: "shield-demo/vulnerable-node",
        organizationId: organization.id,
      },
    });
    await prisma.policy.upsert({
      where: { repositoryId: repository.id },
      update: {},
      create: { repositoryId: repository.id, deniedLicenses: [], ignoredRules: [] },
    });
    const scan = await prisma.scan.create({
      data: { repositoryId: repository.id, commitSha: "demo-local", source: "local" },
    });
    const fixturePath =
      config.DEMO_FIXTURE_PATH ?? path.resolve(process.cwd(), "../../fixtures/vulnerable-node");
    await scanQueue.add(
      "scan",
      { source: "local", scanId: scan.id, path: fixturePath },
      { jobId: scan.id },
    );
    return reply.code(202).send({ scanId: scan.id, status: "queued" });
  });

  app.post("/webhooks/github", async (request, reply) => {
    const rawBody = (request as any).rawBody?.toString("utf8") ?? JSON.stringify(request.body);
    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    if (!verifyWebhook(rawBody, signature))
      return reply.code(401).send({ error: "Invalid webhook signature" });

    const event = request.headers["x-github-event"];
    const delivery = request.headers["x-github-delivery"];
    if (event !== "pull_request") return reply.code(202).send({ accepted: true, ignored: true });
    const payload = request.body as any;
    if (!["opened", "reopened", "synchronize"].includes(payload.action)) {
      return reply.code(202).send({ accepted: true, ignored: true });
    }

    const installationId = Number(payload.installation?.id);
    const repo = payload.repository;
    const owner = repo.owner.login;
    const organization = await prisma.organization.upsert({
      where: { githubLogin: owner },
      update: { displayName: repo.owner.login },
      create: { githubLogin: owner, displayName: repo.owner.login },
    });
    const installation = await prisma.installation.upsert({
      where: { githubId: BigInt(installationId) },
      update: { organizationId: organization.id },
      create: { githubId: BigInt(installationId), organizationId: organization.id },
    });
    const repository = await prisma.repository.upsert({
      where: { githubId: BigInt(repo.id) },
      update: { installationId: installation.id, active: true },
      create: {
        githubId: BigInt(repo.id),
        owner,
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        private: repo.private,
        organizationId: organization.id,
        installationId: installation.id,
      },
    });
    await prisma.policy.upsert({
      where: { repositoryId: repository.id },
      update: {},
      create: { repositoryId: repository.id, deniedLicenses: [], ignoredRules: [] },
    });

    const sha = payload.pull_request.head.sha;
    const scan = await prisma.scan.create({
      data: {
        repositoryId: repository.id,
        pullRequest: payload.pull_request.number,
        commitSha: sha,
        ref: payload.pull_request.head.ref,
      },
    });
    const checkRunId = await createCheckRun({
      installationId,
      owner,
      repository: repo.name,
      sha,
      detailsUrl: `${config.WEB_URL}/scans/${scan.id}`,
    });
    await prisma.scan.update({ where: { id: scan.id }, data: { checkRunId: BigInt(checkRunId) } });
    await scanQueue.add(
      "scan",
      {
        source: "github",
        scanId: scan.id,
        installationId,
        owner,
        repository: repo.name,
        sha,
        checkRunId,
      },
      { jobId: `${delivery ?? scan.id}:${sha}` },
    );
    return reply.code(202).send({ accepted: true, scanId: scan.id });
  });
}
