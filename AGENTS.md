# WePuu Platform Agent Contract

## Mission

This repository defines and will eventually implement the WePuu OAuth 2.1 control plane for direct MCP access to WordPress sites. The control plane manages login, site pairing, user grants, short-lived access tokens, refresh-token rotation, revocation, and signing-key publication. MCP tool calls and WordPress content must travel directly between the client and the WordPress connector.

## Current phase

Phase 2.0.1 through Phase 2.0.7B1 are accepted and closed. The accepted
Phase 2.0.7B1 candidate is on `main` at merge commit `a57b422`; PR #4 and the
post-merge hosted CI passed. The restricted TAC/Daybreak review remains waived
under ADR-013 and is not represented as a pass. ADR-016 local signing was
merged at `7007caf`. The operator explicitly authorized the provisional
single-VPS production deployment recorded by ADR-017 on 2026-10-09. The
production Auth0 interactive login and callback gate passed on 2026-10-09;
the production WordPress end-to-end release gate passed on 2026-10-10 with
Authorization Code plus PKCE, local RS256 signing, refresh rotation and
revocation, direct WordPress MCP, and isolated Application Password regression
evidence. Connector changes and Phase 2.0.7B2 remain separately gated.
ADR-018 P1 Better Auth and ADR-019 P2 Email OTP + Resend are deployed on the
bounded operator environment; real email delivery, OTP verification, stable
account mapping and `/app` entry were recorded on 2026-10-11. P3-A core
acceptance is complete: PR #33 is merged and CI is green. Exact `bb71226`
control and authorization images were published, a fresh project backup was verified and
the bounded deployment, health smoke and positive production
OAuth/PKCE/Consent/direct-MCP browser regression passed on 2026-10-11. The
repeat G1 Refresh Replay acceptance and the isolated G2 RFC 7009 revocation
acceptance passed on 2026-10-12. Both delivered their expected signed Outbox
events and produced Connector denial before Access Token expiry. The
fixed-purpose `wepuu-e2e-lifecycle` client was provisioned in production on
2026-10-11 from a digest-pinned one-shot image without deploying that image or
running migration 014; the existing Authorization image was restarted and
returned healthy with both clients recognized.
The first production G1 Refresh Replay acceptance attempt on 2026-10-11 did
not pass. R0-to-R1 rotation completed, but the validation script stopped on a
Node 26 locked-stream error while processing the first replay response. The
new isolated Grant was revoked with `token_revoked`, its outbox delivery
failed, and R1 plus Connector denial were not verified. The original
`wepuu-e2e-codex` Grant was unchanged. That failure remains historical
evidence. After the fixed Authorization and pairing-scoped Connector repairs,
a newly paired Site passed the positive OAuth/MCP regression and a separately
authorized repeat G1 passed on 2026-10-12: R0 replay and subsequent R1 use both
returned `invalid_grant`, the isolated Grant was revoked with
`refresh_replay`, its sequence-1 Outbox event was delivered, and the Connector
rejected AT1 before expiry. The Codex Grant remained unchanged. G2 then
revoked a new independent Grant with `token_revoked`, delivered sequence 2 and
caused the corresponding AT0 to be denied before expiry. P3-B1A Codex Desktop
compatibility preflight initially passed for Windows Desktop `26.727.4816.0`.
The first real Desktop OAuth attempt on 2026-10-13 then failed closed with
`invalid_redirect_uri`: this Desktop connection used a callback-specific path
under `/callback/`, while the pre-registered client contains only the stable
`/callback` path. No OAuth artifact or Grant change occurred. Full acceptance
and controlled-use readiness remain false. A fixed-purpose exact callback
registration and rollback tooling was locally validated, then used under a
verified backup to add only the observed exact callback. The existing
Authorization image restarted healthy; the Codex Grant was unchanged. A
subsequent retry reported a missing issuer, but its actual execution was
`codex mcp login` in a task terminal, not a Desktop connection-panel test.
The browser callback contained the correct issuer. The historical invocation
did not record its executable identity and its root cause remains unconfirmed.
Current fixed-executable CLI and app-server loopback tests pass for backend
`0.162.0-alpha.17.2`, including fail-closed issuer and state cases. See
`docs/P3B1B_ISSUER_DIAGNOSTICS_VALIDATION_2026-10-13.md`.
The updated Desktop GUI did not list the project-scoped server. A fixed-backend
`config/read` found its project layer disabled; a separately approved single
temporary user-config entry then produced matching enabled definitions without
changing other config bytes, credentials, production or protocol rules. See
`docs/P3B1B_DESKTOP_CONFIG_LOADING_VALIDATION_2026-10-13.md`.
The operator then completed the single real GUI login on Desktop package
`26.1007.2314.0`. The connected runtime exposed the exact 23-tool name set and
one direct WordPress site-health call passed. Origin access metadata and unchanged
Grant, Connector and Outbox postchecks support P3-B1B acceptance. Only the owned
temporary global config entry was removed, without clearing credentials or
revoking the Grant. P3-B2/P3-B3 and full/controlled-use readiness remain pending.
See `docs/P3B1B_CODEX_DESKTOP_PRODUCTION_ACCEPTANCE_2026-10-13.md`.
The independent production registration history is retained in
`docs/P3B1B_PRODUCTION_CALLBACK_REGISTRATION_2026-10-13.md`.
The positive evidence and corrected lifecycle provisioning preflight are
recorded in
`docs/P3A_PRODUCTION_POSITIVE_ACCEPTANCE_2026-10-11.md` and
`docs/P3A_TOKEN_LIFECYCLE_PREFLIGHT_2026-10-11.md`; the production operation is
recorded in `docs/P3A6_PRODUCTION_CLIENT_PREREGISTRATION_2026-10-11.md`; the
failed G1 attempt is recorded in
`docs/P3A7_G1_REFRESH_REPLAY_PRODUCTION_ACCEPTANCE_2026-10-11.md`.
The successful repeat is recorded in
`docs/P3A7_G1_REFRESH_REPLAY_PRODUCTION_ACCEPTANCE_2026-10-12.md`.
The successful G2 and aggregate P3-A conclusion are recorded in
`docs/P3A7_G2_TOKEN_REVOCATION_PRODUCTION_ACCEPTANCE_2026-10-12.md`.
A fixed-digest Authorization hotfix and the pairing-scoped Connector repair
were deployed to the bounded test environment on 2026-10-12 after verified
PostgreSQL, MariaDB, Connector and configuration backups. The services and
protocol smoke checks passed and the database remained at migrations 001
through 013. The old site was then disconnected through the product flow. An
initial fresh pairing attempt failed closed because the configured Tenant did
not belong to the active account. After deploying the Tenant membership guard
and using the correct workspace Tenant, a new Site was paired through the
formal flow. Its positive OAuth/PKCE/MCP and normal refresh regression passed,
followed by the successful isolated G1 and G2 lifecycle tests described above.
The local repair validation and production result are recorded in
`docs/P3A7_REPLAY_FIX_VALIDATION_2026-10-11.md` and
`docs/P3A7_PRODUCTION_REPAIR_DEPLOYMENT_2026-10-12.md`.
ADR-020 P4-A console-domain separation is a locally validated candidate only.
It is not deployed and does not authorize DNS, Nginx or production database
changes.

Until another phase is explicitly approved, work may:

- operate, validate and safely roll back the bounded ADR-017 deployment without
  connector changes or expansion into Phase 2.0.7B2;

- preserve the accepted Phase 2.0.2 foundation and its validation evidence;
- preserve the accepted pairing/grant platform and connector contracts,
  migrations, fixtures, tests, and validation evidence;
- preserve the accepted Phase 2.0.4 token, refresh, key-rotation, revocation,
  abuse-control, connector fail-closed, and data-boundary contracts;
- extend the approved server-rendered platform UI with control-metadata-only
  detail, compatibility, activity and release-readiness views;
- add content-free operations probes and metrics without tenant, content or
  credential labels;
- retain placeholder release metadata only in local/test mode;
- keep general release, connector changes and Phase 2.0.7B2 separately gated;
- do not reopen or materially change the closed Phase 2.0.3 contract without
  an ADR and explicit approval;
- keep all architecture decisions consistent with the documents under `docs/`.

## Non-negotiable product boundaries

- The data plane is client to WordPress. The platform is not an MCP gateway or content proxy.
- The platform must not receive, store, log, inspect, or relay WordPress content, MCP tool inputs, or MCP tool outputs.
- The platform must not store WordPress passwords or Application Passwords.
- The existing 23-tool connector catalog is frozen. OAuth changes authentication and maximum scope only; it does not weaken local WordPress capability or object checks.
- Application Password direct access remains a supported independent fallback.
- WordPress makes no platform request until an administrator explicitly enables and starts connection.
- Authentication, tenant boundaries, audience validation, token validation, and uncertain security states fail closed.
- Do not implement cryptographic or OAuth protocol primitives from scratch. Use reviewed libraries and the protected local key custody defined by ADR-016.

## Required protocol baseline

- OAuth Authorization Code with PKCE S256.
- Protected Resource Metadata and Authorization Server Metadata discovery.
- Bearer challenges through `WWW-Authenticate`.
- The canonical full MCP endpoint is the RFC 8707 resource and the exact access-token audience.
- Bearer tokens appear only in the `Authorization` header.
- Strict redirect URI, `state`, issuer, algorithm, signature, time, audience, site, grant, and scope validation.
- Short-lived access tokens, rotating refresh-token families, replay detection, revocation, and overlapping JWKS key rotation.
- No token passthrough.

## Change discipline

Before changing an approved contract, add or update an ADR and identify migrations, compatibility impact, failure behavior, and rollback. Security must never be rolled back by disabling signature, issuer, audience, tenant, grant, or WordPress permission checks.

Every later implementation phase must include:

1. focused tests for the change;
2. adversarial tests for authentication and tenant isolation;
3. a data-flow review confirming that content never enters the control plane;
4. a validation record under `docs/`;
5. explicit approval before any connector repository change.
