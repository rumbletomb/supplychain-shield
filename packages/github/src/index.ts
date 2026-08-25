import { createHmac, timingSafeEqual } from "node:crypto";
import { App } from "@octokit/app";
import type { Finding, ScanResult } from "@scs/contracts";

let app: App | undefined;

function privateKey(): string {
  const encoded = process.env.GITHUB_PRIVATE_KEY_BASE64;
  if (!encoded) throw new Error("GITHUB_PRIVATE_KEY_BASE64 is not configured");
  return Buffer.from(encoded, "base64").toString("utf8");
}

export function githubApp(): App {
  if (!app) {
    const appId = process.env.GITHUB_APP_ID;
    if (!appId) throw new Error("GITHUB_APP_ID is not configured");
    app = new App({ appId, privateKey: privateKey() });
  }
  return app;
}

export function verifyWebhook(payload: string, signature: string | undefined): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function installationOctokit(installationId: number): Promise<any> {
  return githubApp().getInstallationOctokit(installationId);
}

export async function createCheckRun(input: {
  installationId: number;
  owner: string;
  repository: string;
  sha: string;
  detailsUrl?: string;
}): Promise<number> {
  const octokit = await installationOctokit(input.installationId);
  const response = await octokit.request("POST /repos/{owner}/{repo}/check-runs", {
    owner: input.owner,
    repo: input.repository,
    name: "SupplyChain Shield",
    head_sha: input.sha,
    status: "in_progress",
    started_at: new Date().toISOString(),
    ...(input.detailsUrl ? { details_url: input.detailsUrl } : {}),
  });
  return Number(response.data.id);
}

function annotation(finding: Finding) {
  if (!finding.location) return undefined;
  return {
    path: finding.location.path,
    start_line: finding.location.startLine ?? 1,
    end_line: finding.location.endLine ?? finding.location.startLine ?? 1,
    annotation_level:
      finding.severity === "critical" || finding.severity === "high"
        ? ("failure" as const)
        : finding.severity === "medium"
          ? ("warning" as const)
          : ("notice" as const),
    title: finding.title.slice(0, 255),
    message: `${finding.description}\n\nRemediation: ${finding.remediation}`.slice(0, 65_535),
  };
}

export async function completeCheckRun(input: {
  installationId: number;
  owner: string;
  repository: string;
  checkRunId: number;
  result: ScanResult;
  detailsUrl?: string;
}) {
  const octokit = await installationOctokit(input.installationId);
  const conclusion =
    input.result.status === "failed"
      ? "failure"
      : input.result.status === "warned"
        ? "neutral"
        : "success";
  const annotations = input.result.findings.flatMap((finding) => {
    const value = annotation(finding);
    return value ? [value] : [];
  });

  await octokit.request("PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}", {
    owner: input.owner,
    repo: input.repository,
    check_run_id: input.checkRunId,
    status: "completed",
    conclusion,
    completed_at: new Date().toISOString(),
    ...(input.detailsUrl ? { details_url: input.detailsUrl } : {}),
    output: {
      title: `${input.result.summary.total} findings · ${input.result.status}`,
      summary: [
        `Critical: ${input.result.summary.critical}`,
        `High: ${input.result.summary.high}`,
        `Medium: ${input.result.summary.medium}`,
        `Low: ${input.result.summary.low}`,
      ].join(" · "),
      annotations: annotations.slice(0, 50),
    },
  });
}

export async function failCheckRun(input: {
  installationId: number;
  owner: string;
  repository: string;
  checkRunId: number;
  message: string;
}) {
  const octokit = await installationOctokit(input.installationId);
  await octokit.request("PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}", {
    owner: input.owner,
    repo: input.repository,
    check_run_id: input.checkRunId,
    status: "completed",
    conclusion: "action_required",
    completed_at: new Date().toISOString(),
    output: {
      title: "SupplyChain Shield could not complete the scan",
      summary: input.message.slice(0, 65_535),
    },
  });
}

export async function downloadRepositoryArchive(input: {
  installationId: number;
  owner: string;
  repository: string;
  sha: string;
}): Promise<Buffer> {
  const octokit = await installationOctokit(input.installationId);
  const response = await octokit.request("GET /repos/{owner}/{repo}/tarball/{ref}", {
    owner: input.owner,
    repo: input.repository,
    ref: input.sha,
  });
  return Buffer.from(response.data as unknown as ArrayBuffer);
}
