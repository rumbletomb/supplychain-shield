import Link from "next/link";
import { getJson } from "./api";
import { DemoButton } from "./demo-button";

export const dynamic = "force-dynamic";

interface Dashboard {
  repositories: number;
  scanCounts: Record<string, number>;
  findingCounts: Record<string, number>;
  recentScans: Array<{
    id: string;
    status: string;
    commitSha: string;
    createdAt: string;
    durationMs?: number;
    repository: { fullName: string };
    findings: Array<{ severity: string }>;
  }>;
}

const statusLabel: Record<string, string> = {
  PASSED: "Passed",
  WARNED: "Review",
  FAILED: "Blocked",
  RUNNING: "Scanning",
  QUEUED: "Queued",
  ERRORED: "Error",
};

export default async function DashboardPage() {
  const dashboard = await getJson<Dashboard>("/api/dashboard");
  const critical = dashboard?.findingCounts.critical ?? 0;
  const high = dashboard?.findingCounts.high ?? 0;
  const scans = dashboard?.recentScans ?? [];

  return (
    <div className="pageShell">
      <section className="hero">
        <div>
          <div className="eyebrow">Security command center</div>
          <h1>Ship code you can trust.</h1>
          <p>
            One focused view of vulnerable dependencies, leaked credentials and unsafe delivery
            configuration—directly connected to every pull request.
          </p>
        </div>
        <DemoButton />
      </section>

      {!dashboard && (
        <div className="notice">
          <strong>Waiting for the API.</strong> Start the Docker stack, then run the demo scan.
        </div>
      )}

      <section className="metrics" aria-label="Security summary">
        <article>
          <span>Protected repositories</span>
          <strong>{dashboard?.repositories ?? 0}</strong>
          <small>Active GitHub App installations</small>
        </article>
        <article>
          <span>Critical findings</span>
          <strong className={critical ? "dangerText" : ""}>{critical}</strong>
          <small>Requires immediate remediation</small>
        </article>
        <article>
          <span>High-risk findings</span>
          <strong className={high ? "warningText" : ""}>{high}</strong>
          <small>Blocked by the default policy</small>
        </article>
        <article>
          <span>Scans completed</span>
          <strong>
            {(dashboard?.scanCounts.passed ?? 0) +
              (dashboard?.scanCounts.warned ?? 0) +
              (dashboard?.scanCounts.failed ?? 0)}
          </strong>
          <small>Full audit trail retained</small>
        </article>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <span className="eyebrow">Latest activity</span>
            <h2>Repository scans</h2>
          </div>
          <span className="muted">Live from the analysis queue</span>
        </div>
        {scans.length === 0 ? (
          <div className="emptyState">
            <div className="emptyIcon">✓</div>
            <h3>No scans yet</h3>
            <p>Run the safe demonstration repository or install the GitHub App.</p>
          </div>
        ) : (
          <div className="scanList">
            {scans.map((scan) => {
              const risk = scan.findings.filter(
                (item) => item.severity === "CRITICAL" || item.severity === "HIGH",
              ).length;
              return (
                <Link href={`/scans/${scan.id}`} className="scanRow" key={scan.id}>
                  <span className={`statusIcon status-${scan.status.toLowerCase()}`} />
                  <span className="scanIdentity">
                    <strong>{scan.repository.fullName}</strong>
                    <small>
                      {scan.commitSha.slice(0, 8)} · {new Date(scan.createdAt).toLocaleString()}
                    </small>
                  </span>
                  <span className="riskCount">{risk} high risk</span>
                  <span className={`badge badge-${scan.status.toLowerCase()}`}>
                    {statusLabel[scan.status] ?? scan.status}
                  </span>
                  <span className="chevron">→</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
