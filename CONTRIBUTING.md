# Contributing

Thank you for helping make software supply-chain security accessible to small teams.

## Development

1. Fork and clone the repository.
2. Enable Corepack and run `pnpm install`.
3. Copy `.env.example` to `.env`.
4. Start PostgreSQL and Redis with `docker compose up -d postgres redis`.
5. Apply migrations with `pnpm db:migrate`.
6. Start services with `pnpm dev`.

## Changes

- Keep scanner rules deterministic and explainable.
- Never place real credentials or harmful payloads in fixtures.
- Add a regression test for scanner and policy changes.
- Preserve the shared finding contract and stable fingerprint behavior.
- Avoid expanding GitHub App permissions without a documented security justification.
- Update user and operator documentation when behavior changes.

## Quality gates

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Pull requests should explain the problem, security impact, implementation, tests, and operational
considerations. Keep unrelated refactoring separate.

## Commits

Use concise imperative commit messages. Conventional Commits are encouraged for release automation,
for example `feat(scanner): detect broad Actions permissions`.
