# ADR-010: Scoped Connector Integration

- Status: accepted, implemented, and validated
- Date: 2026-09-28
- Scope: Phase 2.0.5 only

## Decision

The WordPress connector accepts WePuu Bearer access tokens alongside, not in
place of, WordPress Core Application Password authentication. Bearer processing
is limited to the exact `/wp-auto/mcp` REST route. A malformed or rejected
Bearer credential never falls back to a cookie, ambient user, or Application
Password identity.

The connector validates `typ=at+jwt`, RS256, a bounded published `kid`, the
signature, exact issuer, single-string exact resource audience, integer time
claims, opaque subject/JTI, tenant, site, grant, client, and canonical scope.
It uses the accepted bounded JWKS cache and local key/token/grant/site/subject
deny state. A current local grant resolves one existing WordPress user for the
request only; the prior user and OAuth context are restored after dispatch.

OAuth scope is a ceiling before the unchanged ability permission callback.
The ordered mapping is frozen for all 23 existing tools. Scope never supplies
a WordPress role or capability and never bypasses object, draft, concurrency,
idempotency, audit, or SSRF checks. Application Password behavior remains
independent.

The resource server publishes path-specific RFC 9728 metadata and Bearer
challenges. Missing credentials receive discovery metadata, invalid tokens
receive `invalid_token`, and a valid token lacking the tool scope receives
`insufficient_scope` where the MCP/REST transport exposes an HTTP denial.
Ordinary WordPress capability denial is not mislabeled as OAuth failure.

## Data and failure boundaries

- Access tokens exist only in the incoming Authorization header and transient
  request memory; they are not stored or logged.
- The control plane never receives MCP request bodies, tool arguments, results,
  or WordPress content.
- Unknown algorithms, keys, claims, grants, users, scopes, cache states, or
  connection states fail closed.
- An unexpired token may be verified with a safe cached JWKS during a platform
  outage; pairing, refresh, and central revocation delivery remain unavailable.
- Local disconnect, grant deletion, user removal, token/key deny state, or site
  suspension deny immediately.

## Compatibility and migration

No platform database migration is required. Phase 2.0.4 already emits the
frozen access-token claims and lifecycle events. The connector adds only
reviewed JOSE verification, request-local state, path-specific metadata, and a
central scope decorator. Existing paired records remain authoritative; no
token, cookie, WordPress password, role snapshot, or content is migrated.

Rollback disables/removes only the OAuth request integration. It must not
weaken token validation and does not remove the independent Application
Password path. Rewrite state is flushed on activation/deactivation.

## Rejected alternatives

- Platform introspection or proxying on each MCP request.
- Persisting access tokens, creating WordPress sessions, or synthesizing users.
- Per-tool ad hoc scope checks that can drift from the frozen catalog.
- Accepting audience arrays, alternate resources, `plain` PKCE, symmetric
  signatures, embedded JWK/JKU/X5U headers, or unrecognized critical headers.
- Treating an OAuth scope as proof of a WordPress capability.
