import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Policy, ScanJob, ScanResult } from "@scs/contracts";
import { scanJobSchema } from "@scs/contracts";
import { scanWorkspace } from "@scs/core";
import { type Prisma, prisma } from "@scs/database";
import { completeCheckRun, downloadRepositoryArchive, failCheckRun } from "@scs/github";
import * as tar from "tar";

function prismaStatus(status: ScanResult["status"]) {
  return status.toUpperCase() as "PASSED" | "WARNED" | "FAILED";
}

async function policyFor(scanId: string): Promise<Policy> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: { repository: { include: { policy: true } } },
  });
  const policy = scan?.repository.policy;
  if (!policy)
    return {
      version: 1,
      blockAt: "high",
      warnAt: "medium",
      blockVerifiedSecrets: true,
      deniedLicenses: [],
      ignoredRules: [],
    };
  return {
    version: 1,
    blockAt: policy.blockAt.toLowerCase() as Policy["blockAt"],
    warnAt: policy.warnAt.toLowerCase() as Policy["warnAt"],
    blockVerifiedSecrets: policy.blockVerifiedSecrets,
    deniedLicenses: policy.deniedLicenses,
    ignoredRules: policy.ignoredRules,
  };
}

async function sourcePath(job: ScanJob): Promise<{ root: string; cleanup: () => Promise<void> }> {
  if (job.source === "local") return { root: path.resolve(job.path), cleanup: async () => {} };

  const temporary = await mkdtemp(path.join(tmpdir(), "shield-scan-"));
  const archivePath = path.join(temporary, "repository.tar.gz");
  const archive = await downloadRepositoryArchive({
    installationId: job.installationId,
    owner: job.owner,
    repository: job.repository,
    sha: job.sha,
  });
  await writeFile(archivePath, archive, { mode: 0o600 });
  await tar.x({ file: archivePath, cwd: temporary, strip: 1, preservePaths: false });
  return { root: temporary, cleanup: () => rm(temporary, { recursive: true, force: true }) };
}

async function persistResult(scanId: string, result: ScanResult) {
  await prisma.$transaction(async (transaction) => {
    await transaction.finding.deleteMany({ where: { scanId } });
    if (result.findings.length > 0) {
      await transaction.finding.createMany({
        data: result.findings.map((finding) => ({
          scanId,
          fingerprint: finding.fingerprint,
          ruleId: finding.ruleId,
          engine: finding.engine,
          category: finding.category,
          severity: finding.severity.toUpperCase() as any,
          title: finding.title,
          description: finding.description,
          remediation: finding.remediation,
          path: finding.location?.path ?? null,
          startLine: finding.location?.startLine ?? null,
          packageName: finding.packageName ?? null,
          installedVersion: finding.installedVersion ?? null,
          fixedVersion: finding.fixedVersion ?? null,
          advisoryUrl: finding.advisoryUrl ?? null,
          metadata: finding.metadata as Prisma.InputJsonValue,
        })),
      });
    }
    await transaction.scan.update({
      where: { id: scanId },
      data: {
        status: prismaStatus(result.status),
        durationMs: result.durationMs,
        summary: result.summary,
        sbom: result.sbom as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  });
}

export async function processScan(rawJob: unknown) {
  const job = scanJobSchema.parse(rawJob);
  await prisma.scan.update({
    where: { id: job.scanId },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  const source = await sourcePath(job);

  try {
    const policy = await policyFor(job.scanId);
    const result = await scanWorkspace(source.root, { policy });
    await persistResult(job.scanId, result);
    if (job.source === "github" && job.checkRunId) {
      await completeCheckRun({
        installationId: job.installationId,
        owner: job.owner,
        repository: job.repository,
        checkRunId: job.checkRunId,
        result,
        detailsUrl: `${process.env.WEB_URL ?? "http://localhost:3000"}/scans/${job.scanId}`,
      });
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scan error";
    await prisma.scan.update({
      where: { id: job.scanId },
      data: { status: "ERRORED", errorMessage: message.slice(0, 2_000), completedAt: new Date() },
    });
    if (job.source === "github" && job.checkRunId) {
      await failCheckRun({
        installationId: job.installationId,
        owner: job.owner,
        repository: job.repository,
        checkRunId: job.checkRunId,
        message,
      });
    }
    throw error;
  } finally {
    await source.cleanup();
  }
}
