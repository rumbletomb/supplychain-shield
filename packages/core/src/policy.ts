import type { Finding, Policy, ScanStatus, Severity } from "@scs/contracts";

const severityRank: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function evaluatePolicy(findings: Finding[], policy: Policy): ScanStatus {
  const active = findings.filter((finding) => !policy.ignoredRules.includes(finding.ruleId));

  const blocks = active.some((finding) => {
    if (finding.category === "secret" && policy.blockVerifiedSecrets) return true;
    if (finding.category === "license") {
      const license = String(finding.metadata.license ?? "");
      if (policy.deniedLicenses.includes(license)) return true;
    }
    return severityRank[finding.severity] >= severityRank[policy.blockAt];
  });

  if (blocks) return "failed";

  const warns = active.some(
    (finding) => severityRank[finding.severity] >= severityRank[policy.warnAt],
  );
  return warns ? "warned" : "passed";
}

export function summarize(findings: Finding[]) {
  return findings.reduce(
    (summary, finding) => {
      summary.total += 1;
      summary[finding.severity] += 1;
      return summary;
    },
    { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  );
}
