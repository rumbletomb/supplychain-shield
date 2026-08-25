# Operations

## Health and dependencies

`GET /health` verifies API availability and database connectivity. Queue health should additionally
be monitored through Redis metrics and worker heartbeat logs.

## Logs

Services emit structured records. Authorization and webhook-signature headers are redacted. Do not
increase request-body logging on the webhook route because payloads can contain private repository
metadata.

## Backups

Back up PostgreSQL at least daily and before schema migrations. Redis is not the source of truth;
loss of Redis can require requeueing incomplete scans but does not erase completed reports.

Test restoration quarterly or according to the organization's recovery objective.

## Updates

1. Review the changelog and migration SQL.
2. Back up PostgreSQL.
3. Build immutable images from the tagged commit.
4. Apply migrations with one API deployment.
5. Roll out workers, API, then web.
6. Run the demo scan and a private test-repository scan.
7. Roll back application images if checks fail; database rollback requires an explicit reviewed plan.

## Retention

The default environment exposes `RETENTION_DAYS=30`. Automated deletion is planned for the next
release; until then, operators should implement database retention according to local policy and
legal requirements.

## Incident response

If the GitHub App key is suspected to be compromised:

1. Revoke the private key in GitHub immediately.
2. Generate and deploy a replacement.
3. Review installation and audit activity.
4. Rotate the webhook secret if webhook authenticity may also be affected.
5. Preserve relevant logs without retaining exposed source archives.
