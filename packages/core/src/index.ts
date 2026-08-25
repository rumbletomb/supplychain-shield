import { defaultPolicy, type Finding, type Policy, type ScanResult } from "@scs/contracts";
import { readWorkspaceFiles } from "./files.js";
import { evaluatePolicy, summarize } from "./policy.js";
import { createCycloneDx, createSarif } from "./reports.js";
import { scanConfiguration } from "./scanners/configuration.js";
import { extractDependencies, scanDependencies } from "./scanners/dependencies.js";
import { scanSecrets } from "./scanners/secrets.js";

export async function scanWorkspace(
  root: string,
  options: { policy?: Policy; fetcher?: typeof fetch } = {},
): Promise<ScanResult> {
  const startedAt = performance.now();
  const files = await readWorkspaceFiles(root);
  const dependencies = extractDependencies(files);
  const findings: Finding[] = [
    ...scanSecrets(files),
    ...scanConfiguration(files),
    ...(await scanDependencies(dependencies, options.fetcher)),
  ];

  return {
    findings,
    status: evaluatePolicy(findings, options.policy ?? defaultPolicy),
    summary: summarize(findings),
    sbom: createCycloneDx(dependencies),
    durationMs: Math.round(performance.now() - startedAt),
  };
}

export { createCycloneDx, createSarif, evaluatePolicy, extractDependencies, scanSecrets };
