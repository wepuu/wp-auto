# Phase 2.0 Authentication Contract

Normative words MUST, MUST NOT, SHOULD, and MAY describe the intended production contract. Phase 2.0.0 documents this contract but does not implement it.

## Roles

- Authorization Server (AS): WePuu OAuth service.
- Resource Server (RS): one paired WordPress MCP endpoint.
- Client: Codex, WorkBuddy, or another explicitly qualified MCP OAuth client.
- Resource owner: a local WordPress user granting client access.
- Site administrator: a local WordPress administrator who opts the site into WePuu pairing.

## Discovery

For the canonical MCP endpoint, the RS MUST publish path-specific OAuth Protected Resource Metadata compliant with RFC 9728. An unauthenticated or invalid-token MCP request MUST return `401` with a Bearer challenge containing `resource_metadata`.

The metadata MUST identify:

- the canonical resource URI;
- the accepted authorization server issuer;
- supported scopes;
- Bearer-token transport.

The AS MUST publish RFC 8414 metadata, including issuer, authorization endpoint, token endpoint, JWKS URI, revocation endpoint, supported PKCE methods, token endpoint authentication methods, and the selected client-registration capabilities.

The issuer in metadata, authorization response where advertised, token, and local pairing configuration MUST compare exactly.

## Client registration

The system SHOULD support the following order after Phase 2.0.1 verification:

1. pre-registered client ID for deterministic production compatibility;
2. CIMD when AS and client behavior passes the conformance suite;
3. DCR where CIMD is unavailable and DCR policy permits registration.

Registration MUST use an allow-listed redirect model. Native clients using loopback redirects MUST follow RFC 8252, including variable loopback ports where applicable. Redirect URI comparison MUST be exact except for the narrowly defined loopback-port behavior.

DCR MUST enforce software/client metadata limits, rate limits, redirect scheme rules, client quotas, and tenant-independent abuse controls. It MUST NOT grant scopes merely because the client requested them.

## Authorization request

The AS MUST require:

- `response_type=code`;
- a known client identity;
- an exact registered redirect URI;
- `code_challenge` with `code_challenge_method=S256`;
- unpredictable client `state` processing;
- exactly one canonical `resource` equal to the selected site's MCP endpoint;
- scopes no broader than the site, client, platform-account, and local WordPress consent ceilings.

The AS MUST NOT accept wildcard, origin-only, sibling-path, HTTP production, userinfo-bearing, fragment-bearing, or ambiguous resource URIs.

The user MUST see the site identity and requested scope categories before consent. Platform consent alone is insufficient: a local WordPress user MUST complete the binding flow at the paired site.

## Authorization code

- Single use, target lifetime 60–120 seconds.
- Stored only as a keyed or cryptographic hash.
- Bound to client, redirect URI, PKCE challenge, tenant, site, resource, grant, user transaction, and approved scopes.
- Exchanged transactionally; concurrent or later reuse fails and emits a security event.
- Never placed in logs, analytics, support payloads, or browser persistence controlled by application JavaScript.

## Token request

The token endpoint MUST:

- require the correct authorization code grant type;
- verify the code and PKCE verifier in constant-time-compatible library code;
- require the same exact `resource` used at authorization;
- revalidate client, redirect URI, grant, site, transaction expiry, and single-use state;
- issue no token if any bound value differs or is unavailable.

Public clients MUST use `token_endpoint_auth_method=none` with PKCE. Confidential clients, if later introduced, require a separate policy and must not weaken public-client protections.

## Access token profile

The target is a signed JWT access token with:

| Field | Contract |
|---|---|
| JOSE `typ` | `at+jwt` unless the conformance spike proves a stricter interoperable value |
| JOSE `alg` | explicit allow-list; never `none`; initial candidate RS256 |
| JOSE `kid` | mandatory, non-ambiguous signing-key identifier |
| `iss` | exact AS issuer |
| `aud` | one exact canonical MCP resource string |
| `sub` | opaque pairwise subject; no email, username, or WordPress ID |
| `site_id` | opaque paired-site identifier |
| `grant_id` | opaque local-grant identifier |
| `scope` | space-delimited approved scope ceiling |
| `iat`, `nbf`, `exp` | bounded numeric dates |
| `jti` | high-entropy unique token identifier |
| `client_id` or `azp` | client binding where selected profile requires it |

The token MUST NOT contain WordPress credentials, WordPress user IDs, roles, capability snapshots, content, titles, SEO values, media URLs, email data, tool arguments, tool outputs, or wp-admin conclusions.

The RS MUST reject multiple audiences, audience arrays, aliases, normalized-after-verification audiences, or any audience not exactly equal to its paired canonical endpoint unless a later ADR and conformance profile explicitly permits otherwise.

## Scope model

Initial scope categories:

| Scope | Maximum tool category |
|---|---|
| `mcp:read` | site, content, taxonomy, media, and SEO reads |
| `mcp:content.write` | post/page draft create and eligible draft update |
| `mcp:media.write` | upload, import, update, and featured-media actions |
| `mcp:taxonomy.write` | category/tag create and exact taxonomy assignment |
| `mcp:seo.write` | eligible SEO updates |

`mcp:read` is the default. Write scopes require explicit local consent. Scope never grants a WordPress capability: it only prevents a request from reaching an otherwise-authorized tool.

## Refresh tokens

- Opaque, at least 256 bits of cryptographic entropy, and hashed at rest.
- Bound to client, tenant, site, grant, resource, subject, scope ceiling, and token family.
- Rotated on every successful use in one database transaction.
- A used token is retained as a non-secret replay marker for the family retention window.
- Reuse or impossible generation order revokes the family, denies the request, and emits an auditable security event.
- Absolute and inactivity lifetimes remain a Phase 2.0.1 decision; there is no indefinite refresh token.

## Revocation and logout

- The AS MUST expose a revocation endpoint and make revocation idempotent.
- Revoking a grant revokes all refresh families belonging to it.
- Local WordPress revoke/disconnect MUST immediately disable the local mapping.
- Platform revoke MUST enqueue a signed, idempotent site event; delivery failure is retried without extending access-token lifetime.
- Account, tenant membership, site, client, grant, refresh family, and signing key states each have explicit suspension/revocation semantics.
- Browser logout does not silently revoke unrelated grants; the UI must state what is being revoked.

## Errors

- Missing or invalid access token: `401` plus a standards-compliant Bearer challenge.
- Valid token with insufficient OAuth scope: `403` and `insufficient_scope` where the transport permits.
- Valid OAuth scope but failed WordPress capability/object check: WordPress's existing non-disclosing authorization error; do not falsely label it an OAuth scope failure.
- Token endpoints use OAuth error codes and MUST NOT expose whether another tenant, site, grant, subject, or client exists.
- Pairing and control APIs use stable machine codes, correlation IDs, and non-sensitive user messages.

## Client evidence and qualification

Current [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp) confirms Streamable HTTP MCP OAuth, pre-registered clients, CIMD, DCR, loopback callbacks, issuer validation, and advertised-scope behavior. The installed `codex-cli 0.154.0` also exposes `--oauth-client-registration` and `--oauth-resource`. Production support still requires the Phase 2.0.1 test matrix.

[WorkBuddy publicly documents](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide) general MCP OAuth and browser authorization. Its exact PRM, RFC 8707, issuer, callback, rotation, and reconnection behavior has not been proven for the target version. Its status is **prototype verification required**.

## Standards

- [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [OAuth 2.1 draft](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/15/)
- [RFC 9700](https://www.rfc-editor.org/info/rfc9700/)
- [RFC 8252](https://www.rfc-editor.org/info/rfc8252/)
- [RFC 8414](https://www.rfc-editor.org/info/rfc8414/)
- [RFC 8707](https://www.rfc-editor.org/info/rfc8707/)
- [RFC 9207](https://www.rfc-editor.org/info/rfc9207/)
- [RFC 9728](https://www.rfc-editor.org/info/rfc9728/)
