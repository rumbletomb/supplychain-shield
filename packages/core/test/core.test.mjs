import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { defaultPolicy } from "@scs/contracts";
import { evaluatePolicy, extractDependencies, scanSecrets } from "../dist/index.js";
import { scanConfiguration } from "../dist/scanners/configuration.js";
import { scanDependencies } from "../dist/scanners/dependencies.js";

function file(relativePath, content) {
  return { relativePath, absolutePath: `/tmp/${relativePath}`, size: content.length, content };
}

describe("secret scanner", () => {
  it("detects and redacts a hard-coded credential", () => {
    const findings = scanSecrets([file("src/config.ts", 'const apiKey = "abcdefghijklmnop1234";')]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].category, "secret");
    assert.equal(JSON.stringify(findings).includes("abcdefghijklmnop1234"), false);
  });
});

describe("configuration scanner", () => {
  it("flags root containers and mutable image tags", () => {
    const ruleIds = scanConfiguration([file("Dockerfile", "FROM node:latest\nCOPY . .\n")]).map(
      (finding) => finding.ruleId,
    );
    assert.ok(ruleIds.includes("SCS-DOCKER-LATEST"));
    assert.ok(ruleIds.includes("SCS-DOCKER-ROOT"));
  });

  it("flags broad workflow permissions and mutable actions", () => {
    const ruleIds = scanConfiguration([
      file(
        ".github/workflows/ci.yml",
        "permissions: write-all\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@main\n",
      ),
    ]).map((finding) => finding.ruleId);
    assert.ok(ruleIds.includes("SCS-ACTIONS-WRITE-ALL"));
    assert.ok(ruleIds.includes("SCS-ACTIONS-UNPINNED"));
  });
});

describe("dependency scanner", () => {
  it("extracts npm lockfile dependencies", () => {
    const dependencies = extractDependencies([
      file(
        "package-lock.json",
        JSON.stringify({ packages: { "node_modules/lodash": { version: "4.17.20" } } }),
      ),
    ]);
    assert.deepEqual(dependencies[0], {
      name: "lodash",
      version: "4.17.20",
      ecosystem: "npm",
      path: "package-lock.json",
      direct: true,
    });
  });

  it("maps OSV results to actionable findings", async () => {
    const fetcher = mock.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                vulns: [
                  {
                    id: "GHSA-demo",
                    summary: "Prototype pollution",
                    database_specific: { severity: "HIGH" },
                    affected: [{ ranges: [{ events: [{ fixed: "4.17.21" }] }] }],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const findings = await scanDependencies(
      [
        {
          name: "lodash",
          version: "4.17.20",
          ecosystem: "npm",
          path: "package-lock.json",
          direct: true,
        },
      ],
      fetcher,
    );
    assert.equal(findings[0].severity, "high");
    assert.equal(findings[0].fixedVersion, "4.17.21");
  });
});

describe("policy engine", () => {
  it("blocks high-severity findings", () => {
    const finding = {
      fingerprint: "12345678",
      ruleId: "TEST",
      engine: "test",
      category: "configuration",
      severity: "high",
      title: "High risk",
      description: "A high-risk issue",
      remediation: "Fix it",
      metadata: {},
    };
    assert.equal(evaluatePolicy([finding], defaultPolicy), "failed");
  });
});
