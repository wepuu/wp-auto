# WePuu Platform Agent Contract

## Mission

This repository defines and will eventually implement the WePuu OAuth 2.1 control plane for direct MCP access to WordPress sites. The control plane manages login, site pairing, user grants, short-lived access tokens, refresh-token rotation, revocation, and signing-key publication. MCP tool calls and WordPress content must travel directly between the client and the WordPress connector.

## Current phase

Phase 2.0.1, Phase 2.0.2, and Phase 2.0.3 are accepted and closed. The accepted
Phase 2.0.3 implementation is retained on `codex/phase-2-0-3`, with connector
pairing and local consent on `codex/phase-2-0-3b-pairing`:

- preserve the accepted Phase 2.0.2 foundation and its validation evidence;
- preserve the accepted pairing/grant platform and connector contracts,
  migrations, fixtures, tests, and validation evidence;
- do not add production deployment or Phase 2.0.4/2.0.5 implementation without
  explicit approval;
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
- Do not implement cryptographic or OAuth protocol primitives from scratch. Use reviewed libraries and managed key custody.

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
