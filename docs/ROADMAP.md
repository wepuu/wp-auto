# Roadmap

## Scope rule

Phase 2 is a control-plane product. MCP content and tool traffic are never
routed through WePuu Platform. Moving between phases requires explicit approval
and a validation record.

## Phase 2.0.0 - architecture freeze

Status: accepted on 2026-09-15; documentation freeze complete.

The product boundary, OAuth/MCP contract, site and user binding, threat model,
data model, API/error rules, connector change contract, and disclosure draft are
frozen. Application code, deployment, and connector changes were prohibited.

## Phase 2.0.1 - conformance spike

Status: accepted and closed on 2026-09-16. The local provider/HTTPS/PHP gates
and Codex 0.154.0 pre-registered OAuth path passed; Auth0 was rejected for the
frozen S256 profile; WorkBuddy 5.5.2 was recorded unsupported; Auth0 test
clients and fingerprinted fixture state were removed.

This phase compares `node-oidc-provider` 9.12.2 with a disposable Auth0 tenant
through one provider-neutral suite. It validates PRM/AS metadata, PKCE S256,
RFC 8707 resource and exact audience, issuer response, redirects, refresh
rotation, revocation, JWKS overlap, scope boundaries, PHP JOSE, and direct
client-to-WordPress data flow. All code remains under
`spikes/oauth-conformance/`; no deployment or connector change is allowed.

Exit gate: a signed decision record identifies the selected provider, supported
clients, known deviations, pinned versions, and rejected alternatives.

## Phase 2.0.2 - platform foundation

Status: accepted and closed on 2026-09-22. No production deployment or
WordPress connector change occurred or is authorized.

- TypeScript strict-mode workspace.
- Isolated authorization service and control API.
- PostgreSQL persistence with mandatory tenant scoping.
- Provider-neutral key-custody boundary with an AWS KMS asymmetric signing
  adapter; private key bytes never enter the application, database, or logs.
- Structured, content-free security audit pipeline.
- Local development and CI validation without production deployment.

## Phase 2.0.3 - pairing and user grants

Status: accepted and closed on 2026-09-24. Platform tranche 2.0.3A
includes external OIDC account login and hashed session minting on
`codex/phase-2-0-3`; its real Auth0 browser callback, restart persistence,
logout revocation, replay boundary, and database/log privacy acceptance gates
passed on 2026-09-22. Real connector tranche 2.0.3B is retained
on `codex/phase-2-0-3b-pairing`; the cross-origin fragment handoff, SSRF-safe
site verification, site-ID-bound Ed25519 proof, platform KMS-backed consent
request, strict local approve/deny ceremony, and local opaque grant repository
pass. Real wp-admin pairing, approval, denial, replay, restart, logout,
plugin-disable, user invalidation, uninstall/reinstall, resource/domain-change
re-pair, and cleanup passed. Hosted Node 26.7 GitHub OIDC/KMS acceptance passed
in run `35967643811`. Phase 2.0.4 is now approved and in progress on its two
isolated local branches.

- Explicit administrator-initiated site pairing.
- SSRF-resistant site verification.
- Per-user local WordPress consent and opaque grant binding.
- Disconnect, re-pair, domain-change, user-disable, and deletion behavior.

Connector work is a separate task and requires separate approval.

## Phase 2.0.4 - token lifecycle

Status: accepted and closed on 2026-09-28. Platform work was completed on
`codex/phase-2-0-4-token-lifecycle`; connector JWKS and revocation work was
completed on `codex/phase-2-0-4b-revocation`. Deterministic, live HTTPS,
real two-key AWS KMS, hosted-CI, cleanup, and privacy gates passed. Phase 2.0.5
remains separately gated.

- Short-lived JWT access tokens.
- Opaque rotating refresh families with reuse detection.
- JWKS cache and overlapping rotation.
- Signed revocation outbox and local denylist behavior.
- Rate limits, abuse controls, and recovery procedures.

Exit gate: all cases in `PHASE_2_0_4_TEST_PLAN.md` pass, including real
two-key AWS KMS overlap/rotation, refresh-family concurrency/replay, signed
revocation delivery and connector fail-closed behavior. Acceptance requires a
completed validation record; fixture-only key rotation cannot close the phase.

## Phase 2.0.5 - scoped connector integration

Status: accepted and closed on 2026-09-29 after every implementation, live,
privacy, package, security-review and cleanup gate passed. Platform work is isolated on
`codex/phase-2-0-5-scoped-connector`; connector work is isolated on
`codex/phase-2-0-5-bearer-auth`. Production deployment and Phase 2.0.6 are not
authorized.

- Add Bearer authentication alongside Application Passwords.
- Map `grant_id` to a current local WordPress user for each request.
- Enforce scope as a ceiling before existing local permission checks.
- Preserve the exact 23-tool catalog and input/output semantics.

Exit gate: deterministic platform and connector suites, real HTTPS WordPress
PRM/challenge/Bearer probes, real two-key KMS token verification, direct Codex
MCP acceptance, content-free control-plane review, release-package checks and
complete temporary-state cleanup must pass.

## Phase 2.0.6 - security and resilience qualification

Status: accepted and closed on 2026-10-06. Deterministic and database suites,
local real two-key KMS, HTTPS WordPress, Codex direct-MCP, hosted GitHub
OIDC/KMS, immutable available-capability review and cleanup gates passed. The
restricted TAC/Daybreak review was waived as unavailable under ADR-013 and is
not represented as a pass. The accepted candidates are present on `main`.

- Authentication, replay, confused-deputy, SSRF, tenant-isolation, key-compromise,
  and refresh-reuse tests.
- Platform, database, JWKS, webhook, DNS, and clock-skew failure exercises.
- Backup restoration and verified deletion exercises.
- Final immutable-candidate security and data-flow review using capabilities
  available to the project before public production use.

## Phase 2.0.7 - disclosure and release gate

Phase 2.0.7A implements the product shell and portable pre-release runtime on
`codex/phase-2-0-7a-product-shell`. It adds account home workspaces,
server-rendered tenant/site/grant/activity/account pages, hardened browser
mutations, fail-closed release configuration and cloud-neutral OCI images.
Production values and deployment are not required or authorized in 2.0.7A.

Status: accepted and closed on 2026-10-07. PR #3, post-merge CI and hosted
GitHub OIDC single/two-key AWS KMS gates passed. The accepted candidate is on
`main` at merge commit `8e6257a`.

Phase 2.0.7B1 is the provider-neutral release-readiness tranche. It may add
typed release metadata, configuration readiness reporting, content-free
operations metrics, product detail/compatibility pages and release evidence
without selecting a production host or publishing the service.

Status: accepted and closed on 2026-10-07. PR #4 passed its complete hosted
validation, merged to `main` at `a57b422`, and the post-merge run
`37589413276` passed. The earlier manual GitHub OIDC single/two-key AWS KMS
closeout run `37584349687` also passed. No production deployment, connector
change or Phase 2.0.7B2 work is authorized by this acceptance.

Phase 2.0.7B remains gated on the final hosting provider, production domain,
legal identity, policy URLs, residency/retention decisions and staged release:

- Final Terms of Service and Privacy Policy URLs.
- WordPress.org disclosure and admin consent copy.
- Data retention, residency, incident response, support, and recovery policy.
- Compatibility matrix for supported Codex and WorkBuddy versions.
- Staged opt-in release with Application Password rollback intact.

On 2026-10-09 the operator separately and explicitly authorized the initial
single-VPS deployment recorded by ADR-017. `https://auth.wpauto.cc` is online
for operator validation with Auth0, local ADR-016 signing, BaoTa Nginx and
Cloudflare. The production Auth0 interactive login and callback gate passed on
2026-10-09. On 2026-10-10 the real WordPress pairing, consent, Authorization
Code with PKCE S256, access/refresh rotation, revocation, JWKS verification and
direct MCP acceptance flow also passed, while Application Password fallback
and the connector repository remained unchanged. This provisional deployment
does not close Phase 2.0.7B, authorize connector changes, invite general users
or start Phase 2.0.7B2.

### P1 - SaaS account authentication boundary

Status: implemented and locally validated on 2026-10-10; not deployed.

P1 pins Better Auth 1.7.7, adds its isolated `auth` schema and maps each
authentication user to a stable WePuu account. P1 temporarily routed Auth0
through Better Auth; that candidate runtime is superseded by P2 Email OTP.
OAuth issuer,
PKCE, consent, token lifecycle, local signing, JWKS, tenant/grant isolation and
the WordPress Connector remain unchanged. See ADR-018 and the P1 validation
record. Production rollout and any old-session cleanup remain separately
authorized actions.

### P2 - Email OTP account login

Status: deployed to the bounded operator environment and real Email OTP browser
entry passed on 2026-10-11. This does not close the later OAuth/MCP P3-A gate.

P2 uses the Better Auth 1.7.7 Email OTP plugin with hashed verification
records, a six-digit five-minute code, five verification attempts, database
rate limiting, and a Resend delivery adapter. Protected ten-minute login
transactions preserve OAuth interaction return paths across the two-step form,
and account bootstrap remains atomic and retryable without obtaining another
code. The temporary Auth0 runtime and its `openid-client` package were removed.
Real Resend delivery is an explicit opt-in validation and is not exercised by
ordinary CI. See ADR-019 and the P2 validation records.

### P3 - Email OTP OAuth and MCP production acceptance

Status: P3-A core acceptance completed on 2026-10-12. P3-B1A Codex Desktop
compatibility preflight initially passed for Windows Desktop `26.727.4816.0`.
The first real Desktop OAuth attempt on 2026-10-13 failed closed with
`invalid_redirect_uri` because the installed Desktop used a callback-specific
path that was not one of the client's registered paths. No OAuth artifact or
Grant change occurred; full acceptance and controlled-use readiness remain
false.
PR #33 and hosted CI passed. Exact `bb71226` control and authorization images
were published, a fresh project backup was verified and the bounded production
deployment, health smoke and positive Email OTP OAuth/PKCE/Consent/direct-MCP
browser regression passed on 2026-10-11. Separately authorized repeat G1
Refresh Replay and isolated G2 RFC 7009 revocation acceptance passed on
2026-10-12.
Migration 004 permits a revoked Grant to be followed by a
fresh Grant for the same account/site/client tuple. A locally tested,
fixed-purpose `wepuu-e2e-lifecycle` provisioning command therefore supports
the two destructive scenarios with sequential Grants while preserving the
existing positive client and Grant. The fixed client was provisioned on
2026-10-11 through the digest-pinned one-shot CLI; the production service
remains on the accepted pre-P4-A image and the database remains at migrations
001 through 013. At the time of client provisioning, no lifecycle destructive
test had been run.
See `P3A_PRODUCTION_POSITIVE_ACCEPTANCE_2026-10-11.md` and
`P3A_TOKEN_LIFECYCLE_PREFLIGHT_2026-10-11.md`, plus
`P3A6_PRODUCTION_CLIENT_PREREGISTRATION_2026-10-11.md`.

The separately authorized first G1 production attempt on 2026-10-11 did not
pass. R0-to-R1 rotation completed, but a Node 26 locked-stream error stopped
the script while processing the first replay response. The isolated Grant was
revoked with `token_revoked` rather than `refresh_replay`; its outbox event was
not delivered, and R1 invalidation plus Connector denial were not verified.
The existing positive `wepuu-e2e-codex` Grant remained unchanged. See
`P3A7_G1_REFRESH_REPLAY_PRODUCTION_ACCEPTANCE_2026-10-11.md`. That failure is
retained as historical evidence.
The P3-A7 Authorization repair and Connector pairing-scoped revocation-state
correction were deployed to the bounded test environment on 2026-10-12 after
fresh verified backups. Runtime, discovery, JWKS, client and migration smoke
checks passed. The old site was disconnected normally. The first fresh pairing
failed before proof delivery because the configured Tenant did not belong to
the active account, and the WordPress fixture was returned through its normal
local action to a safe disconnected state. See
`P3A7_REPLAY_FIX_VALIDATION_2026-10-11.md` and
`P3A7_PRODUCTION_REPAIR_DEPLOYMENT_2026-10-12.md`.

The diagnostic Control hotfix was subsequently deployed and one separately
authorized pairing was attempted on 2026-10-12. It failed before proof
delivery because the Tenant ID configured in WordPress belonged to a different
platform account than the active Better Auth Session. PostgreSQL RLS correctly
rejected the pairing-attempt insert. No new platform attempt, Site, Grant or
Outbox event was created; WordPress retained only its fail-closed local pending
state. A platform guard candidate now rejects missing or non-administrative
tenant membership before calling the pairing service and records the bounded
`pairing.tenant_access_denied` diagnostic. After that guard was merged and
deployed, the pending state was cleared through the normal WordPress action and
a separately authorized retry with the correct workspace Tenant created one
new active Site. The Site and Connector identifiers matched, Connector
revocation state v2 began at sequence 0, and the positive OAuth/PKCE/MCP and
normal refresh regression passed.

A separately authorized repeat G1 then passed on 2026-10-12. R0 rotated to R1;
replay of R0 and subsequent use of R1 both returned `invalid_grant`. The
isolated lifecycle Grant was revoked with reason `refresh_replay`, its
sequence-1 Outbox event was delivered, and the Connector rejected AT1 before
expiry. The existing `wepuu-e2e-codex` Grant remained active and unchanged.
See `P3A7_G1_REFRESH_REPLAY_PRODUCTION_ACCEPTANCE_2026-10-12.md`.

The separately authorized G2 used a new lifecycle Grant and submitted R0 once
to the RFC 7009 revocation endpoint. R0 then returned `invalid_grant`; the
Grant was `revoked / token_revoked`, its sequence-2 Outbox event was delivered,
and the Connector denied AT0 before expiry. Connector state retained the G1
and G2 hashed Grant markers at sequence 2, while the existing
`wepuu-e2e-codex` Grant and five historical Outbox rows remained unchanged.
See `P3A7_G2_TOKEN_REVOCATION_PRODUCTION_ACCEPTANCE_2026-10-12.md`.

Positive OAuth/PKCE/MCP, normal Refresh rotation, G1 Replay and G2 explicit
revocation have now all passed on the repaired active Site. Therefore
`P3_CORE_OAUTH_MCP_PASS=True`. P3-B1B is blocked on the exact callback-path
registration mismatch, so
`P3_FULL_ACCEPTANCE_PASS=False`, `READY_FOR_CONTROLLED_USE=False`, and
`NOT_READY_FOR_PUBLIC_REGISTRATION=True` remain in force.

### P4-A - SaaS console domain separation

Status: locally implemented and validated as a candidate on 2026-10-11; not
deployed. ADR-020 keeps Better Auth and the OAuth issuer at `auth.wpauto.cc`,
places the server-rendered console at `app.wpauto.cc`, and uses a short-lived
one-time handoff to create a hash-only derived app Session. Migration 014 adds
only handoff and console Session state. OAuth, Connector and direct MCP data
flow are unchanged. Production cutover is gated on P3-A and separate approval.

## Deferred and out of scope

ADR-016 replaces AWS KMS runtime signing with encrypted local PKCS#8 RSA-3072
custody. ADR-017 separately authorizes the provisional operator deployment;
neither decision authorizes connector work or Phase 2.0.7B2.

- Hosted MCP gateway or proxy.
- WordPress content ingestion, indexing, transformation, analytics, or telemetry.
- Billing, paid-plan enforcement, remote workflows, or WordPress administration
  conclusions.
- DPoP, sender-constrained tokens, enterprise federation, or SCIM until separately
  justified.
