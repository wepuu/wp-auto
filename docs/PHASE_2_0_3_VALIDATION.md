# Phase 2.0.3 Pairing and Grants Validation

- Status: accepted and closed
- Date: 2026-09-24
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
- `@wepuu/account-identity` uses `openid-client` for fixed-issuer discovery,
  Authorization Code with PKCE S256, state/nonce and RS256 ID-token validation.
- OIDC transaction state is a five-minute A256GCM JWE with current/previous-key
  overlap. External subjects are HMAC-pseudonymized and raw `sub` values are not
  persisted or logged.
- Migration `003_account_login.sql` adds identity uniqueness, session expiry
  indexing, and a least-privilege `wepuu_identity_writer` role. Successful
  callbacks mint 256-bit opaque sessions and persist only SHA-256 digests.
- Control API account cookies are `__Host-`, Secure, HttpOnly, SameSite=Lax;
  logout is exact-origin protected and revokes the server-side digest.
- The Phase 2.0.3B Connect path transfers the one-time verifier only in a URL
  fragment, removes it from browser history, and submits same-origin JSON with
  the existing Lax session. The authenticated control route performs the
  fixed-path SSRF-safe proof call and binds a platform-generated site ID into
  the connector's Ed25519 proof.
- The connector stores non-autoloaded site identity/pairing state and exact
  opaque grant-to-local-user mappings. The 23-tool catalog and Application
  Password path remain unchanged.
- Platform grant creation now issues the exact KMS-backed consent request and
  returns only a fragment-based WordPress URL. Completion accepts an explicit
  approve/deny decision, verifies a decision-bound Ed25519 site proof, and is
  retry-safe through a content-free idempotency digest.
- Grant creation is also retry-safe across process restarts: a dedicated
  runtime-only 256-bit HMAC key re-derives the same challenge, while PostgreSQL
  retains only the request/challenge digests and opaque original grant ID.
- The connector pins the platform RSA public key and `kid`, verifies exact
  RS256 headers/claims, single-string audience, canonical scope order and the
  120-second lifetime, then uses local-user-bound one-shot state and distinct
  nonce-protected approve/deny POSTs. Denial creates no local grant.

## Current evidence

| Gate | Result |
|---|---|
| TypeScript build and ESLint | pass in the pinned Linux Node 26.7.0 image |
| Unit and adversarial suite | pass: platform 31 passed; four environment/live gates skipped by default; connector 513 tests / 3399 assertions passed |
| PostgreSQL 16 migration replay, RLS and identity-role isolation | pass |
| Owner/member/cross-tenant enforcement | pass |
| Pairing/grant idempotency and persistence | pass |
| PHP 8.1 WordPress container to TypeScript Ed25519 interop | pass |
| Retained OAuth conformance | pass: 37 passed, one opt-in Auth0 smoke skipped |
| Auth0 discovery/profile probe | pass: fixed tenant metadata accepted; generated request was `code`, `openid`, PKCE `S256`, with state and nonce; no secret or authorization URL retained |
| OIDC browser callback | pass: real Auth0 Universal Login callback created one pseudonymous account and one 256-bit opaque session; the browser resolved the session before and after a control-API process restart |
| Callback replay boundary | pass: a callback without the one-time encrypted transaction cookie returned `401` with `Cache-Control: no-store`; exact state/code replay remains covered by the adversarial unit suite |
| Logout revocation | pass: exact-origin, bodyless `POST /v1/account/logout` returned `204`; the database changed from one active session to one revoked session and the browser subsequently returned `401 unauthenticated` |
| Real WordPress pairing | pass: an administrator explicitly enabled and started pairing from wp-admin; the fragment handoff, authenticated platform continuation, pinned proof call and active platform/connector site state completed over the disposable HTTPS fixture |
| Real consent approval | pass: the authenticated wp-admin ceremony created one exact-scope local grant and one active platform grant; a second completion attempt failed closed |
| Real consent denial | pass: two independent denial ceremonies completed without creating another local grant; the corresponding platform grants were revoked with the content-free `consent_denied` reason |
| Consent-page privacy | pass after correction: WordPress core overwrote the initial header priority, so the connector now applies `Referrer-Policy: no-referrer` at late `admin_init` priority; the real authenticated response also has private/no-store cache control. Pre-correction disposable access logs are removed with fixture cleanup |
| Plugin disable/re-enable | pass: deactivation removed the fixed proof route (`404`); reactivation restored its fail-closed unauthenticated response (`401`) and preserved the existing pairing-state digest |
| Local-user invalidation | pass: deleting the bound disposable WordPress user made the existing local grant immediately unresolvable; recreating the login did not restore that binding |
| Uninstall/reinstall | pass: explicit uninstall removed connection, site identity, grant and pending-consent state; reactivation restored only the fail-closed route and did not revive pairing |
| Resource-drift automation | pass: hostname or unsafe current-resource drift persists `suspended`, retains the old rejected audience, blocks pairing completion and grant lookup, and invalidates consent across preview/re-pair boundaries |
| Real resource/domain migration | pass: changing WordPress from `site.example.test` to `site-moved.example.test` immediately persisted connector `suspended`, retained the old rejected audience, returned `401` from the pairing-proof route, and made the existing local grant inactive. Explicit platform disconnect revoked the old site and grant; explicit local trust removal and re-pair generated a different opaque site ID and Ed25519 key, registered the exact moved MCP resource, and required fresh consent. Final state was one active moved site/grant, one revoked old site/grant, two local historical grant rows with exactly one active, and zero old-resource active grants. |
| Database/log privacy | pass: identity hash length 43, session digest length 32 bytes, exact issuer match, no token/cookie/password/email/profile columns, and no sensitive log matches |
| Migration data boundary | pass: the control-plane `platform` and `audit` schemas contained zero columns matching content, tool input/output, or request-body storage; all migration probes recorded only status, counts, exact public resource URLs, and boolean/digest evidence |
| Local callback fixture | pass: pinned Caddy 2.10.2, fingerprinted CurrentUser CA/hosts handling, and a v2rayN exact-domain proxy bypass for `platform.example.test` |
| Dependency audit | pass in Node 26.7.0: no known vulnerabilities |
| SBOM | pass: CycloneDX 1.6, 293 resolved components; includes `@keyobject/aws-kms` 0.0.2, `openid-client` 6.8.8 and both pinned `jose` versions |
| KMS JOSE runtime | pass: the full build/lint/test suite passes in Linux Node 26.7.0; `jose` signs through the OpenSSL KMS `KeyObject`, fixed RS256/typ/kid tests pass, and unsafe STORE parameters fail closed |
| Live AWS KMS | pass: GitHub Actions run [`35967643811`](https://github.com/wepuu/wp-auto/actions/runs/35967643811) obtained short-lived AWS credentials through the environment-bound OIDC role and completed the real Node 26.7 provider-backed JOSE/KMS contract without exporting private key material |
| Real WordPress connector | pass for pairing and consent acceptance on `codex/phase-2-0-3b-pairing`: canonical resource, real browser pairing, pinned platform `kid`, strict approve/deny, replay denial, local grant binding, disconnect/re-pair and plugin disable/re-enable all fail closed as required |
| PHP-to-TypeScript proof | pass: the real connector `SiteProofSigner` output, with integer NumericDate claims, verified in TypeScript JOSE under Node 26.7.0 |
| Test cleanup | pass: the dual-domain fixture containers, networks and volumes were destroyed; the marked hosts entries and fingerprinted CurrentUser CA were removed with `HOSTS_RESTORED=True` and `TRUST_RESTORED=True` |

## Exit decision

All Phase 2.0.3 security, interoperability, real-browser, resource-migration,
cleanup, dependency, and hosted KMS gates pass. Phase 2.0.3 is accepted and
closed. Phase 2.0.4 remains separately gated and is not authorized.
