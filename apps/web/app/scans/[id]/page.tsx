import Link from "next/link";
import { notFound } from "next/navigation";
import { getJson, publicApiUrl } from "../../api";

export const dynamic = "force-dynamic";

interface ScanDetail {
  id: string;
  status: string;
  commitSha: string;
  pullRequest?: number;
  durationMs?: number;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  summary?: Record<string, number>;
  repository: { fullName: string };
  findings: Array<{
    id: string;
    severity: string;
    category: string;
    title: string;
    description: string;
    remediation: string;
    path?: string;
    startLine?: number;
    packageName?: string;
    installedVersion?: string;
    fixedVersion?: string;
    advisoryUrl?: string;
    exceptions: Array<{ id: string; reason: string; expiresAt: string }>;
  }>;
}

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await getJson<ScanDetail>(`/api/scans/${id}`);
  if (!scan) notFound();

  return (
    <div className="pageShell">
      <Link href="/" className="backLink">
        ← Back to overview
      </Link>
      <section className="scanHero">
        <div>
          <div className="eyebrow">Scan report</div>
          <h1>{scan.repository.fullName}</h1>
          <p className="mono">
            Commit {scan.commitSha}
            {scan.pullRequest ? ` · Pull request #${scan.pullRequest}` : ""}
          </p>
        </div>
        <span className={`largeBadge badge-${scan.status.toLowerCase()}`}>{scan.status}</span>
      </section>

      <section className="reportToolbar">
        <div>
          <span>Findings</span>
          <strong>{scan.findings.length}</strong>
        </div>
        <div>
          <span>Duration</span>
          <strong>{scan.durationMs ? `${(scan.durationMs / 1000).toFixed(1)}s` : "—"}</strong>
        </div>
        <div>
          <span>Completed</span>
          <strong>
            {scan.completedAt ? new Date(scan.completedAt).toLocaleString() : "In progress"}
          </strong>
        </div>
        <nav>
          <a href={publicApiUrl(`/api/scans/${id}/export?format=sarif`)}>SARIF</a>
          <a href={publicApiUrl(`/api/scans/${id}/export?format=cyclonedx`)}>CycloneDX</a>
          <a href={publicApiUrl(`/api/scans/${id}/export?format=json`)}>JSON</a>
        </nav>
      </section>

      {scan.errorMessage && (
        <div className="notice danger">
          <strong>Scan error:</strong> {scan.errorMessage}
        </div>
      )}

      <section className="findingsGrid">
        {scan.findings.map((finding) => (
          <article className="findingCard" key={finding.id}>
            <div className="findingHeader">
              <span className={`severity severity-${finding.severity.toLowerCase()}`}>
                {finding.severity}
              </span>
              <span className="category">{finding.category}</span>
              {finding.exceptions.length > 0 && <span className="exception">Exception active</span>}
            </div>
            <h2>{finding.title}</h2>
            <p>{finding.description}</p>
            {(finding.path || finding.packageName) && (
              <div className="findingLocation">
                {finding.path && (
                  <code>
                    {finding.path}
                    {finding.startLine ? `:${finding.startLine}` : ""}
                  </code>
                )}
                {finding.packageName && (
                  <code>
                    {finding.packageName}@{finding.installedVersion}
                    {finding.fixedVersion ? ` → ${finding.fixedVersion}` : ""}
                  </code>
                )}
              </div>
            )}
            <div className="remediation">
              <strong>Recommended remediation</strong>
              <p>{finding.remediation}</p>
            </div>
            {finding.advisoryUrl && (
              <a className="textLink" href={finding.advisoryUrl}>
                Open security advisory →
              </a>
            )}
          </article>
        ))}
        {scan.findings.length === 0 && (
          <div className="emptyState panel">
            <div className="emptyIcon">✓</div>
            <h2>No findings</h2>
            <p>This revision satisfies the active security policy.</p>
          </div>
        )}
      </section>
    </div>
  );
}
