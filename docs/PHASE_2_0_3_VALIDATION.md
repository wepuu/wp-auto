# Phase 2.0.3 Pairing and Grants Validation

- Status: Phase 2.0.3A implemented; Phase 2.0.3 remains open
- Date: 2026-09-22
- Branch: `codex/phase-2-0-3`

## Implemented platform boundary

- Migration `002_pairing_and_grants.sql` adds tenant-scoped sites, pairing
  attempts, grants, idempotency records, and hashed account sessions.
- Forced RLS limits pairing/site changes to owner or administrator and limits
  grants to the local opaque subject or tenant administration.
- `@wepuu/pairing` implements canonical resource validation, public-address
  resolution, DNS pinning, fixed-path HTTPS verification, EdDSA proof
  validation, one-time verifier hashing, grant consent bindings, and bounded
  failure behavior.
- Control API identity now consumes hashed server-side sessions. It exposes
  tenant-scoped site/grant views and naturally idempotent revoke/disconnect
  operations requiring an idempotency key.
- Authorization service resolves only active paired resources and grants. An
  ambiguous subject with more than one active grant denies issuance until the
  later interaction binding is implemented.

## Current evidence

| Gate | Result |
|---|---|
| TypeScript build and ESLint | pass |
| Unit and adversarial suite | pass: 16 passed; opt-in live KMS skipped |
| PostgreSQL 16 migration replay and RLS | pass |
| Owner/member/cross-tenant enforcement | pass |
| Pairing/grant idempotency and persistence | pass |
| PHP 8.1 WordPress container to TypeScript Ed25519 interop | pass |
| Retained OAuth conformance | pass: 37 passed, one opt-in Auth0 smoke skipped |
| Dependency audit | pass: no known vulnerabilities |
| SBOM | pass: CycloneDX 1.6, 293 components |
| Live AWS KMS | unchanged Phase 2.0.2 pass; not rerun with a stored credential |
| Real WordPress connector | blocked by separate approval; repository unchanged |
| Test cleanup | pass: PostgreSQL tmpfs container and network removed |

## Remaining exit gates

- Wire a configured external OIDC account login callback that creates the
  hashed sessions; the runtime currently consumes sessions but does not mint
  them.
- Implement and validate the protocol in `wp-auto-connector` after explicit
  approval.
- Exercise real wp-admin initiation, local login/consent, user disable/delete,
  plugin disable/reinstall, domain change, and re-pair.
- Run hosted CI on the final Phase 2.0.3 commit after push authorization.

Phase 2.0.3 is not closed, and Phase 2.0.4 is not authorized.
