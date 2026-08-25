# Security policy

## Supported versions

Security fixes are applied to the latest release and the `main` branch.

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** private advisory flow for this repository. If private
reporting is unavailable, contact the repository owner privately before sharing technical details.

Include:

- Affected component and version or commit.
- Reproduction steps using synthetic data.
- Expected and observed behavior.
- Security impact and prerequisites.
- Suggested mitigation, if known.

Do not include real credentials, customer source code, private repository identifiers, or personal
data. Do not open a public issue until a fix and disclosure plan have been agreed.

We aim to acknowledge complete reports within five business days. Timelines for validation and
remediation depend on impact and complexity.

## Scope

The API, worker, dashboard, GitHub App integration, scanner contracts, containers, and deployment
configuration are in scope. Vulnerabilities in third-party services such as GitHub or OSV should be
reported to their respective maintainers unless SupplyChain Shield uses them unsafely.
