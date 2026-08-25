import Link from "next/link";

export default function NotFound() {
  return (
    <div className="pageShell emptyState">
      <div className="emptyIcon">?</div>
      <h1>Scan not found</h1>
      <p>The report may have expired or the identifier is invalid.</p>
      <Link className="primaryButton" href="/">
        Return to overview
      </Link>
    </div>
  );
}
