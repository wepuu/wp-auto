# ADR-001: OAuth control plane with direct WordPress data plane

- Status: accepted for Phase 2.0.0
- Date: 2026-09-15

## Context

Users need browser-based authorization for Codex and WorkBuddy without copying WordPress Application Passwords. The platform must coordinate accounts, site pairing, grants, short tokens, refresh rotation, revocation, and key rotation. WordPress remains the resource server and the source of truth for local authorization.

The reference connector's older roadmap used “hosted gateway” language. That architecture would route tool traffic and potentially WordPress content through WePuu, creating unnecessary privacy, bandwidth, availability, WordPress.org disclosure, and compromise-blast-radius costs.

## Decision

Use a central OAuth control plane and a direct client-to-WordPress MCP data plane.

The platform:

- authenticates platform accounts;
- registers/recognizes clients;
- pairs exact WordPress MCP resources;
- orchestrates local-user consent;
- issues and rotates short credentials;
- publishes JWKS and revocation state;
- stores only minimized control-plane metadata.

The platform does not proxy, inspect, transform, route, or persist MCP requests or responses.

WordPress:

- validates access tokens locally;
- maps opaque grants to current local users;
- applies scope as a maximum;
- retains all existing capability, object, draft, concurrency, idempotency, SSRF, and tool-level controls.

## OAuth implementation decision

Do not build an Authorization Server from protocol primitives. The leading candidate is an isolated TypeScript service built around `node-oidc-provider`, with a custom transactional persistence adapter and KMS-backed signing.

This is an architectural preference, not a production dependency selection. Phase 2.0.1 must compare it against one managed provider with black-box conformance tests.

Reasons for the leading choice:

- strong coverage of metadata, PKCE, DCR, revocation, resource indicators, JWT access tokens, and related OAuth/OIDC standards;
- direct control over dynamic exact per-site resource/audience semantics;
- deployable behind a narrow internal interface so the library can later be replaced.

Risks:

- concentrated maintainer/supply-chain dependency;
- custom adapter correctness;
- draft CIMD behavior;
- responsibility for availability, patching, rate limiting, and incident response.

Required mitigations include version pinning, SBOM/license review, dependency monitoring, adapter transaction tests, interoperability tests, independent security review, and no business logic coupled to provider-private database shapes.

## Alternatives

### Hand-built Authorization Server

Rejected. It produces the highest security and maintenance risk and violates the decision to use mature authentication components.

### Managed identity provider

Retained as a fallback. It can reduce operations work, but exact arbitrary RFC 8707 resource/audience behavior, public-client registration, custom claims, revocation, and data-residency constraints must be demonstrated rather than assumed. Auth0 is the initial comparison candidate.

### ZITADEL or Keycloak as immediate default

Not selected for the first spike because currently documented resource-indicator/CIMD behavior does not cleanly prove this contract without extension or version-dependent experimental support.

### Hosted MCP gateway

Rejected for the current product. It would make platform availability part of every tool call and place customer data in the platform's trust boundary.

## Consequences

Positive:

- WordPress content remains site-to-client.
- Platform compromise does not expose stored WordPress credentials or historical content because neither exists there.
- Application Password fallback remains operational.
- Resource-server authorization stays aligned with current WordPress permissions.

Negative:

- Every connector installation must validate JWTs, cache JWKS, store local grants, and process revocation.
- Central revocation of already issued offline-verifiable tokens is bounded by their short lifetime unless events arrive.
- Domain migration and canonicalization require careful re-pairing.

## Rollback

The platform integration is opt-in. Disabling it stops platform calls and Bearer acceptance while leaving Application Password direct access intact. Rollback must not disable signature, issuer, audience, time, grant, tenant, scope, or WordPress permission checks.

## References

- [node-oidc-provider](https://github.com/panva/node-oidc-provider)
- [Auth0 Dynamic Client Registration](https://auth0.com/docs/get-started/applications/dynamic-client-registration)
- [ZITADEL Dynamic Client Registration](https://zitadel.com/docs/guides/integrate/dynamic-client-registration)
- [WordPress Application Passwords](https://developer.wordpress.org/advanced-administration/security/application-passwords/)
