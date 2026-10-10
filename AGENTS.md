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
evidence. Connector changes and
Phase 2.0.7B2 remain separately gated. The ADR-018 P1 Better Auth
account-boundary candidate was implemented and
locally validated on 2026-10-10 but is not deployed. Production still uses the
ADR-017/ADR-007 callback until a separate rollout is authorized. The ADR-019
P2 Email OTP + Resend candidate is implemented and locally validated on
2026-10-10, removes the Auth0 runtime from the candidate, and is also not
deployed.

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
