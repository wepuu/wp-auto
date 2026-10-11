# P3-A7 Replay Fix Validation — 2026-10-11

Status: local candidate; not deployed; production G1 and G2 remain incomplete.

## Scope

This candidate addresses the three defects observed during the failed first
G1 attempt without changing OAuth, JWT, JWKS, Connector HTTP, or database
schema contracts:

- the production probe no longer consumes a Fetch `Response` body twice;
- `oidc-provider` replay revocation is distinguished from RFC 7009 revocation
  by isolated request context;
- the revocation worker stores bounded non-sensitive failure categories.

The failed G1 Grant and outbox event remain immutable historical evidence.
No production data, service, image, migration, or Connector was changed while
preparing this candidate.

## Confirmed call path

In `oidc-provider` 9.12.2, the refresh-token handler loads R0, observes its
`consumed` marker, destroys R0 and calls the Provider grant revocation helper.
That helper invokes every applicable adapter's `revokeByGrantId()`; it does
not call adapter `consume()` a second time. RFC 7009 reaches the same adapter
method, so an unconditional reason at that boundary cannot distinguish the
two operations.

The fix supplies `PostgresOidcAdapter` with an optional request-level reason
resolver. Its default remains `token_revoked`. The Authorization Service uses
an `AsyncLocalStorage` context and returns `refresh_replay` only for an exact
consumed refresh token on the token endpoint with
`grant_type=refresh_token`.

## Local validation performed

- `pnpm check` under Node 26.11.1: passed; 110 tests executed, 94 passed,
  16 environment-dependent tests skipped and 0 failed.
- ESLint: passed after rejecting unsafe error-detail extraction.
- Focused tests: 36 passed, including real Fetch `Response` consumption,
  invalid response classes, 60-second Connector polling, request-context
  concurrency isolation, worker success and bounded failure categorization.
- PostgreSQL 17 integration suite: 16/16 passed against an isolated tmpfs
  database, including replay reason, explicit revocation reason, one-event
  outbox behavior and same-tuple re-consent.
- Dependency audit found no known vulnerability; the CycloneDX SBOM contained
  286 components and passed repository policy validation.
- Fresh Control and Authorization candidates passed the local-signing OCI gate;
  the published JWKS contained no private RSA members and the runtime contained
  no AWS KMS dependency.
- `git diff --check`: passed during candidate preparation.

The PostgreSQL test mirrors the Provider's destroy plus `revokeByGrantId()`
replay path, asserts one `refresh_replay` event, then uses a consumed token
with explicit revocation and asserts one `token_revoked` event.

## Remaining independent Connector defect

The production Connector retained a site-global legacy sequence after a new
pairing. Platform sequence 1 was therefore rejected against local sequence 2.
That defect requires a separate Connector repository change: new pairings must
initialize revocation state bound to their new `site_id`, while active legacy,
missing, malformed, or mismatched state continues to fail closed. It is not
fixed by this platform candidate.

Until the platform and Connector fixes pass their separate CI and controlled
deployment gates:

```text
P3_CORE_OAUTH_MCP_PASS=False
READY_FOR_CONTROLLED_USE=False
```
