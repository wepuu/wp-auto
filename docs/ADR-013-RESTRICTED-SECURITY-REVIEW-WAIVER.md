# ADR-013: Restricted security-review service waiver

## Status

Accepted on 2026-09-30 for Phase 2.0.6 qualification only. This decision does
not authorize production deployment, public release, or Phase 2.0.7.

## Context

The approved Phase 2.0.6 plan required two independent reviews through Codex
Security TAC/Daybreak. The project owner cannot obtain access to that restricted
service, so keeping it as a mandatory exit gate would make the phase impossible
to close for an eligibility reason unrelated to the candidate's behavior.

An unavailable review must not be reported as passed. Removing this particular
tool gate also must not weaken any OAuth, tenant-isolation, connector, key
custody, deletion, recovery, or data-boundary requirement.

## Decision

- Codex Security TAC/Daybreak is recorded as `waived/not executed`, not `pass`.
- The project owner explicitly accepts the residual risk introduced by the
  absence of that external review for Phase 2.0.6.
- Phase closure still requires the complete T01-T22 deterministic matrix, the
  PostgreSQL backup/restore and tombstone gates, dependency audits, SBOM and
  license checks, real two-key AWS KMS acceptance, retained HTTPS WordPress and
  Codex direct-MCP regressions, content-free data-flow review, and cleanup.
- A final review of the immutable candidate diff and threat model must be
  recorded using the review capabilities available to the project. Any
  Critical, High, or Medium issue found by an executed check remains blocking;
  Low issues require a disposition.
- The waiver is tool-specific. It does not permit bypassing signature, issuer,
  audience, resource, tenant, site, grant, client, scope, PKCE, redirect,
  refresh-replay, revocation, WordPress capability, or fail-closed checks.

## Compatibility, migrations, and failure behavior

This decision changes qualification evidence only. It adds no API, schema,
token, key, client, WordPress, or deployment compatibility change and requires
no migration. Runtime security failures retain their existing fail-closed
behavior.

## Rollback

If the restricted service becomes available before public production use, the
waiver may be superseded by recording reviews against the immutable candidate.
Reinstating that review requires no runtime rollback. Any resulting finding is
handled through a new candidate and complete revalidation.
