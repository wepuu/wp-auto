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
Cloudflare. Infrastructure checks passed, but interactive Auth0 callback and
real WordPress pairing/direct-MCP acceptance remain open. This provisional
deployment does not close Phase 2.0.7B, authorize connector changes or start
Phase 2.0.7B2.

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
