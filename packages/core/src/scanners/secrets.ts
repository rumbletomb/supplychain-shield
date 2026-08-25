import type { Finding } from "@scs/contracts";
import type { WorkspaceFile } from "../files.js";
import { fingerprint } from "../fingerprint.js";

interface SecretRule {
  id: string;
  title: string;
  regex: RegExp;
  severity: Finding["severity"];
}

const rules: SecretRule[] = [
  {
    id: "SCS-SECRET-PRIVATE-KEY",
    title: "Private key committed to the repository",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    severity: "critical",
  },
  {
    id: "SCS-SECRET-GITHUB-TOKEN",
    title: "GitHub token committed to the repository",
    regex: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,255}\b/g,
    severity: "critical",
  },
  {
    id: "SCS-SECRET-AWS-ACCESS-KEY",
    title: "AWS access key committed to the repository",
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    severity: "critical",
  },
  {
    id: "SCS-SECRET-GENERIC-CREDENTIAL",
    title: "Hard-coded credential",
    regex: /(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["'][A-Za-z0-9+/_.-]{12,}["']/gi,
    severity: "high",
  },
];

const ignoredPaths = /(?:^|\/)(?:test|tests|fixtures|examples?|docs?)(?:\/|$)/i;

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

export function scanSecrets(files: WorkspaceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      for (const match of file.content.matchAll(rule.regex)) {
        const line = lineAt(file.content, match.index ?? 0);
        const severity = ignoredPaths.test(file.relativePath) ? "medium" : rule.severity;
        findings.push({
          fingerprint: fingerprint(rule.id, file.relativePath, line),
          ruleId: rule.id,
          engine: "shield-secrets",
          category: "secret",
          severity,
          title: rule.title,
          description:
            "A value matching a credential pattern is present in source control. The value has been redacted and was not retained.",
          remediation:
            "Revoke the credential, remove it from Git history, and load the replacement from a secret manager.",
          location: { path: file.relativePath, startLine: line, endLine: line },
          metadata: { redacted: true, confidence: "high" },
        });
      }
    }
  }

  return findings;
}
