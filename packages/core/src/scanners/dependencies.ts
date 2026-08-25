import type { Finding } from "@scs/contracts";
import type { WorkspaceFile } from "../files.js";
import { fingerprint } from "../fingerprint.js";

export interface Dependency {
  name: string;
  version: string;
  ecosystem: "npm" | "PyPI";
  path: string;
  direct: boolean;
}

interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  database_specific?: { severity?: string };
  affected?: Array<{
    ranges?: Array<{
      events?: Array<{ introduced?: string; fixed?: string; last_affected?: string }>;
    }>;
  }>;
}

function cleanVersion(value: string): string | undefined {
  const match = value.match(/\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?/);
  return match?.[0];
}

function parsePackageLock(file: WorkspaceFile): Dependency[] {
  try {
    const lock = JSON.parse(file.content);
    const packages = lock.packages ?? {};
    return Object.entries<any>(packages)
      .filter(([key, value]) => key && value?.version)
      .map(([key, value]) => ({
        name: value.name ?? key.split("node_modules/").at(-1),
        version: String(value.version),
        ecosystem: "npm" as const,
        path: file.relativePath,
        direct: !key.slice("node_modules/".length).includes("node_modules/"),
      }))
      .filter((dependency) => Boolean(dependency.name));
  } catch {
    return [];
  }
}

function parseRequirements(file: WorkspaceFile): Dependency[] {
  return file.content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("-"))
    .flatMap((line) => {
      const match = line.match(/^([A-Za-z0-9_.-]+)\s*==\s*([^;\s]+)/);
      if (!match?.[1] || !match[2]) return [];
      return [
        {
          name: match[1],
          version: match[2],
          ecosystem: "PyPI" as const,
          path: file.relativePath,
          direct: true,
        },
      ];
    });
}

export function extractDependencies(files: WorkspaceFile[]): Dependency[] {
  const dependencies = files.flatMap((file) => {
    if (file.relativePath.endsWith("package-lock.json")) return parsePackageLock(file);
    if (/(?:^|\/)requirements(?:-[^/]+)?\.txt$/i.test(file.relativePath)) {
      return parseRequirements(file);
    }
    return [];
  });

  const unique = new Map<string, Dependency>();
  for (const dependency of dependencies) {
    unique.set(`${dependency.ecosystem}:${dependency.name}@${dependency.version}`, dependency);
  }
  return [...unique.values()];
}

function mapSeverity(vulnerability: OsvVulnerability): Finding["severity"] {
  const value = vulnerability.database_specific?.severity?.toLowerCase();
  if (value === "critical" || value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "high";
}

function fixedVersion(vulnerability: OsvVulnerability): string | undefined {
  for (const affected of vulnerability.affected ?? []) {
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed) return cleanVersion(event.fixed);
      }
    }
  }
  return undefined;
}

export async function scanDependencies(
  dependencies: Dependency[],
  fetcher: typeof fetch = fetch,
): Promise<Finding[]> {
  if (dependencies.length === 0) return [];

  let response: Response;
  try {
    response = await fetcher("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        queries: dependencies.map((dependency) => ({
          package: { name: dependency.name, ecosystem: dependency.ecosystem },
          version: dependency.version,
        })),
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(
      `OSV request failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  if (!response.ok) throw new Error(`OSV returned HTTP ${response.status}`);
  const payload = (await response.json()) as { results?: Array<{ vulns?: OsvVulnerability[] }> };

  return dependencies.flatMap((dependency, index) =>
    (payload.results?.[index]?.vulns ?? []).map((vulnerability) => {
      const fix = fixedVersion(vulnerability);
      return {
        fingerprint: fingerprint(
          "SCS-DEPENDENCY-VULNERABILITY",
          dependency.ecosystem,
          dependency.name,
          dependency.version,
          vulnerability.id,
        ),
        ruleId: "SCS-DEPENDENCY-VULNERABILITY",
        engine: "osv",
        category: "vulnerability" as const,
        severity: mapSeverity(vulnerability),
        title: `${vulnerability.id} affects ${dependency.name}`,
        description:
          vulnerability.summary ?? vulnerability.details?.slice(0, 600) ?? "Known vulnerability",
        remediation: fix
          ? `Upgrade ${dependency.name} to ${fix} or a later compatible version.`
          : `Review the advisory and replace or mitigate ${dependency.name}. No fixed version was reported.`,
        location: { path: dependency.path },
        packageName: dependency.name,
        installedVersion: dependency.version,
        ...(fix ? { fixedVersion: fix } : {}),
        advisoryUrl: `https://osv.dev/vulnerability/${encodeURIComponent(vulnerability.id)}`,
        metadata: {
          ecosystem: dependency.ecosystem,
          direct: dependency.direct,
          aliases: vulnerability.aliases ?? [],
        },
      } satisfies Finding;
    }),
  );
}
