import type { Finding } from "@scs/contracts";
import type { Dependency } from "./scanners/dependencies.js";

export function createCycloneDx(dependencies: Dependency[]) {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: "SupplyChain Shield", name: "shield-core", version: "0.1.0" }],
    },
    components: dependencies.map((dependency) => ({
      type: "library",
      name: dependency.name,
      version: dependency.version,
      purl: `pkg:${dependency.ecosystem.toLowerCase()}/${encodeURIComponent(dependency.name)}@${encodeURIComponent(dependency.version)}`,
      properties: [
        { name: "shield:source", value: dependency.path },
        { name: "shield:direct", value: String(dependency.direct) },
      ],
    })),
  };
}

export function createSarif(findings: Finding[]) {
  const rules = [...new Map(findings.map((item) => [item.ruleId, item])).values()];
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "SupplyChain Shield",
            version: "0.1.0",
            informationUri: "https://github.com/rumbletomb/supplychain-shield",
            rules: rules.map((rule) => ({
              id: rule.ruleId,
              shortDescription: { text: rule.title },
              help: { text: rule.remediation },
            })),
          },
        },
        results: findings.map((finding) => ({
          ruleId: finding.ruleId,
          level:
            finding.severity === "critical" || finding.severity === "high"
              ? "error"
              : finding.severity === "medium"
                ? "warning"
                : "note",
          message: { text: finding.description },
          locations: finding.location
            ? [
                {
                  physicalLocation: {
                    artifactLocation: { uri: finding.location.path },
                    region: finding.location.startLine
                      ? { startLine: finding.location.startLine }
                      : undefined,
                  },
                },
              ]
            : [],
          fingerprints: { shieldFingerprint: finding.fingerprint },
        })),
      },
    ],
  };
}
