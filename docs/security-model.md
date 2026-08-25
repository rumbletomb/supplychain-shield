# Security model

## Protected assets

- Customer source code and repository metadata.
- GitHub App private key and installation tokens.
- Detected credentials, including values that may already be compromised.
- Tenant policies, exceptions, audit history, and findings.
- Integrity of Check Run conclusions.

## Principal threats and controls

| Threat | Control |
| --- | --- |
| Forged GitHub webhook | SHA-256 HMAC verification with constant-time comparison |
| Replay or duplicate delivery | Immutable job identifiers and unique finding fingerprints |
| Malicious repository code | Static-only analysis; no build, install, test, hook, or repository executable |
| Archive path traversal | Absolute paths are not preserved and temporary roots are destroyed |
| Credential leakage in results | Matched secret values are never copied into finding metadata or logs |
| Compromised long-lived token | GitHub App installation tokens are requested just in time |
| Cross-tenant access | Every repository belongs to one organization and queries are tenant-scoped when authentication is enabled |
| Suppressed finding without accountability | Exceptions require actor, reason, expiration, and audit event |
| Worker exhaustion | File-size limits, ignored generated paths, timeouts, queue concurrency, and retries |

## Current release assumptions

The self-hosted v0.1 release assumes the dashboard and API are placed behind an authenticated
reverse proxy or private network. GitHub webhooks remain publicly reachable. Native multi-user SSO
and dashboard RBAC are roadmap items and must not be inferred from the GitHub App installation.

Production deployments should:

- Store secrets in a managed key vault.
- Terminate TLS at a trusted ingress.
- Restrict database and Redis traffic to the service network.
- Use separate runtime identities for API and worker.
- Deny worker egress except GitHub and OSV endpoints.
- Set container CPU, memory, process, and filesystem limits.
- Back up PostgreSQL and test restoration.
- Forward service logs to a protected, append-oriented destination.

## Source retention

Repository archives exist only in a randomly named OS temporary directory for the duration of one
job. Cleanup runs after success or failure. Findings, summary counts, dependency components, and
audit metadata are retained according to operator policy; source files are not.

## Disclosure

Follow [SECURITY.md](../SECURITY.md). Do not open public issues containing exploit details, real
credentials, private repository names, or customer data.
