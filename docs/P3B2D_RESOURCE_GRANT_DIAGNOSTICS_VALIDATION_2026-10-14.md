# P3-B2D: resource-bound Grant diagnosis and local repair candidate

## Scope and production evidence boundary

This independent candidate starts at main
`dbf19ea10c3cbd91dc773d92116f0210c8a59822` and references Draft PR #57,
Head `abe59a1668fd1ed6ee0334adbd37b736cebb8419`. #57's failed production
attempt is unchanged: A exchanged successfully, B returned
`temporarily_unavailable`, both business Grants became active, and the six
matrix checks were NOT_RUN. No production operations, OAuth retries, Grant
changes, artifact inspection, cleanup or deployments were performed here.

## Unmodified-runtime mechanism proof

Commit `a7f5182` retains the reproduction-only test, without a runtime fix.
Hosted CI run `38426318674` passed, including strict checks, PostgreSQL tests,
OCI, backup/restore and retained OAuth conformance. The regression uses a new
test-owned database with only migrations 001-013, the actual Authorization
Service HTTP handler and PostgreSQL adapter, local RSA/Ed25519 keys, mock Email
OTP through Better Auth, account projection and an in-memory browser Cookie
jar. Business Grants are created and activated through GrantService begin and
signed Consent proof completion, never inserted as pre-approved rows.

The following assertions passed before runtime modification:

1. Site A completes actual Consent, PKCE exchange and RS256 Token validation.
2. The same browser Session and Client begin Site B, then B business Consent
   becomes active through the service.
3. Persisted B Interaction still selects A's Provider Grant, while B's exact
   business Grant differs.
4. `consentGrantUpdatePlan` rejects that mismatch, and actual Consent POST
   returns 503 `temporarily_unavailable` before `interactionFinished`.
5. Both business Grants remain active; only A's Provider Grant is saved.

State transition: default `loadExistingGrant` -> Session's Client Grant A ->
B Interaction `details.grantId=A` -> resolver selects B -> consent plan rejects.
This confirms a local mechanism defect. The original production diagnostic
contained no reason code, so the historical exception remains unconfirmed
rather than being relabeled as definitively proven.

Earlier candidate CI failures were fixture defects (trusted proxy Host,
native exchange Origin/resource, teardown and lint); they do not constitute
product-root-cause proof. These were fixed without weakening production checks.
Initial database cleanup was changed to close all service pools and wait for
test-owned connections to disappear before dropping the isolated database;
no production database is involved.

## Candidate implementation and verification

ADR-021 records the official resource-specific `loadExistingGrant` hook, strict
binding validation and missing-artifact Consent recovery. The mismatch guard
is retained. Fixed diagnostic stage/category records contain only time, event,
stage and category; no raw cause, message, stack, identifier or secret.

The candidate regression exercises:

- A -> B -> A with independent Provider/business Grants and exact JWT bindings.
- Repeated Consent for two already-active business Grants with unchanged
  business IDs/status/timestamps; no duplicate Grant creation.
- An independent browser Provider Session under the same Better Auth account.
- Interleaved pending A/B Consent, with each completed Code exchanged promptly.
- A deferred session-bound Code denied after B changes the Session's Client
  Grant. This is expected `invalid_grant`, not a successful parallel exchange.
- Cross-resource Code and Refresh exchange denied with no Token issuance.
  These checks require an explicit target/scope/access error, not expiry or an
  unrelated invalid_grant. A potentially consumed failed refresh is not retried.
- Adversarial test-owned Provider artifact corruption of account, Client,
  resource and scope, with normal checks preserved.
- Local offline refresh rotation, explicit B RFC 7009 revocation, A refresh
  remaining usable, then an independent consumed A Refresh Replay; reasons
  and one Outbox event per Grant are checked through actual HTTP/Provider/DB.

Unit cases cover submitted Grant ID mismatch, missing submitted Provider Grant,
missing-business/missing-artifact normal Consent behavior, extra resource/OIDC
claims/scopes, inactive account, database failures, and a sensitive exception
sentinel absent from diagnostic JSON. Session pointers are not consulted by
the resource loader. No refresh_families integration is added.

Local Node is 26.11.1. Typecheck and lint passed; 22 focused
Consent/diagnostic tests passed without skips. Full local `pnpm check` did not
pass: 166 passed, 1 failed, 19 environment-gated skips (186 total). The unchanged
pairing HTTPS fixture cannot load Windows PowerShell Security/Cert support;
it fails during certificate generation, before transport. No TLS validation
was disabled or test suppressed. Local Docker/PostgreSQL is unavailable, so
real HTTP/DB and OCI outcomes are obtained from hosted CI, not local skips.

Runtime repair Head `c4edd08` passed complete hosted run `38428977028`:
strict checks, real HTTP/DB regressions, PostgreSQL tests, OCI/local signing,
backup/restore, PHP interop, audit, SBOM, and retained OAuth conformance.
The subsequent focused hardening adds explicit Refresh target denial and
diagnostic-enum/tampering checks; its exact final Head CI is reported on PR #58.

## Existing active production Grants and next boundary

Preserve the two lifecycle business Grants established in the failed run.
Future separately authorized reacceptance should require their exact active
account/Tenant/Client/Site/resource/mcp:read bindings, not zero live Grants.
Reuse valid Provider artifacts; if absent, obtain them through formal Consent.
Binding corruption or ambiguity requires a separate recovery decision, never
silent replacement/revocation or manual SQL.

Any production fix requires a separate fixed-image hotfix preparation from the
verified running Authorization baseline, then independent deployment approval
and independent single reacceptance approval. No image is published here;
P4-A, migration 014, Connector, Site B cleanup and Application Password remain
out of scope. `design/` is untracked and untouched.

```text
LOCAL_MULTI_SITE_GRANT_MECHANISM_CONFIRMED=True
HISTORICAL_PRODUCTION_EXCEPTION_CONFIRMED=False
P3_CORE_OAUTH_MCP_PASS=True
P3B2_PRODUCTION_ISOLATION_TESTED=False
P3B2_SITE_ISOLATION_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
