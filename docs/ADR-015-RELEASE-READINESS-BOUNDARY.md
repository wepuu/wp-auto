# ADR-015: Release Readiness Boundary

Status: accepted for Phase 2.0.7B1 on 2026-10-07.

## Context

The product shell and portable OCI runtime are accepted, but the production
domain, hosting provider, legal identity, policies, region and external OIDC
application are not selected. Product and operations work must continue
without turning preview values into public claims or binding the runtime to
AWS hosting.

## Decision

- Represent release identity, policy versions, client compatibility and the
  non-AWS AWS-credential path as typed configuration.
- Permit visibly marked placeholders only in `local` and `test` modes.
  `staging` and `production` fail startup unless immutable release metadata,
  public policy URLs, explicit trusted proxies, a metrics credential and a
  temporary AWS identity path are configured.
- Publish an authenticated readiness view that reports categories and status,
  never secret values, credential paths or key references.
- Keep health probes separate: liveness proves only that the process runs;
  readiness fails closed on dependency uncertainty.
- Expose low-cardinality, content-free process metrics only behind a dedicated
  Bearer secret. Metrics contain aggregate response counts and duration, not
  tenant, site, grant, user, token, URL query or MCP data labels.
- Keep compatibility claims evidence-bound. Codex 0.154.0 remains the verified
  path; WorkBuddy 5.5.2 / codebuddy 2.137.1 remains unsupported.
- Do not add public deletion, billing, telemetry, content processing or a
  production deployment in Phase 2.0.7B1.

## Compatibility and data flow

OAuth, pairing, grant, JWT, refresh, JWKS, revocation and connector contracts
do not change. The 23-tool catalog and Application Password fallback remain
intact. New views consume only existing control metadata. MCP requests and
WordPress content remain client-to-WordPress.

## Failure and rollback

Invalid public release configuration prevents startup. Missing or incorrect
metrics credentials return the same not-found response. UI record lookup is
tenant-scoped and returns a generic not-found page. Rollback removes the new
read-only pages, aliases and metrics endpoint; no database migration is
required.
