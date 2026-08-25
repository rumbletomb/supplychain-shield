# Architecture

## Design goals

SupplyChain Shield is designed for small organizations that need centralized pull-request security
without granting a third party broad access to their repositories. The first release optimizes for
least privilege, operational simplicity, deterministic findings, and safe handling of untrusted
source archives.

## Services

### Web application

The Next.js application is read-oriented. It displays repository posture, scan history, finding
details, remediation, and downloadable reports. Browser requests use the public API URL; server
rendering uses the internal API URL in container deployments.

### API

The Fastify API owns validation and orchestration. It verifies GitHub webhook HMAC signatures,
upserts installation metadata, creates an in-progress Check Run, records a queued scan, and sends an
immutable job to BullMQ. It never performs repository analysis on the request thread.

### Worker

Workers consume jobs with controlled concurrency. GitHub installation tokens are obtained only by
the acquisition layer. The archive is written with restrictive permissions, extracted without
preserving absolute paths, scanned, and deleted in a `finally` block.

No package manager, build script, test suite, or executable from the target repository is run.

### Core scanner

The scanner loads text files smaller than one megabyte and excludes generated, vendored, and binary
content. Independent adapters produce a common finding contract:

- Secret patterns retain no matched value.
- Dependency manifests are matched with OSV in one batch request.
- Dockerfiles and Actions workflows are evaluated locally.
- Findings receive stable SHA-256 fingerprints.

The policy engine converts normalized findings into `passed`, `warned`, or `failed` status. Reports
are generated from the same normalized result to prevent disagreement between the dashboard,
GitHub Check, SARIF, and CycloneDX output.

## Data flow

1. GitHub sends `pull_request.opened`, `reopened`, or `synchronize`.
2. The API validates the signature and event action.
3. A repository, installation, policy, scan, and Check Run are recorded.
4. BullMQ delivers the scan job to one worker.
5. The worker obtains a short-lived installation token and downloads the exact commit SHA.
6. Static scanners execute against the temporary tree.
7. Findings are normalized, fingerprinted, and evaluated against repository policy.
8. One database transaction replaces findings and completes the scan.
9. GitHub receives the final conclusion and up to 50 inline annotations.
10. The temporary tree is deleted even if scanning or publishing fails.

## Scaling model

- API instances are stateless and can be replicated behind a load balancer.
- PostgreSQL is the source of truth.
- Redis provides delivery and retries, not durable business state.
- Workers scale horizontally and enforce per-process concurrency.
- A superseded scan can be cancelled without deleting its audit record.
- Object storage is reserved for future large artifacts; current JSON reports are generated from the
  database.

## Trust boundaries

The principal boundaries are GitHub-to-API, API-to-queue, worker-to-untrusted-source, and
tenant-to-tenant data access. Controls for each boundary are documented in
[security-model.md](security-model.md).
