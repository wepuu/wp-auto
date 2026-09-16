# API Contracts

This document freezes endpoint responsibilities and security semantics, not final URL spelling or payload schemas. All production endpoints use HTTPS, bounded JSON, strict content types, request IDs, rate limits, and safe error responses.

## Public OAuth and MCP discovery surface

| Endpoint responsibility | Principal | Contract |
|---|---|---|
| Authorization Server Metadata | public | RFC 8414 issuer metadata; cacheable |
| JWKS | public | active and overlap public keys only; cacheable |
| Authorization | browser + authenticated platform account | code flow only, PKCE S256, exact resource and redirect |
| Token | OAuth client | code and refresh grants under the frozen contract |
| Revocation | OAuth client/account policy | idempotent RFC 7009-style behavior without token enumeration |
| Client registration/CIMD consumption | public client under policy | strict metadata validation, quotas and abuse controls |
| WordPress PRM | public on each site | RFC 9728 path-specific metadata for the exact MCP resource |

MCP requests themselves are not platform endpoints.

## Platform account and control API

Conceptual operations:

- list tenants available to the current platform account;
- list paired sites for an authorized tenant;
- begin/continue/cancel a pairing attempt;
- list/revoke the account's grants;
- tenant administrator suspends/disconnects a site;
- retrieve content-free security activity visible to the authorized role;
- begin verified account/data deletion.

Every operation derives account identity from the platform session and verifies tenant membership. Object IDs alone never authorize access.

## WordPress control endpoints

Future connector operations, separately approved:

- begin pairing from authenticated wp-admin;
- expose bounded pairing proof/status;
- complete local-user consent;
- locally list/revoke grants;
- receive or poll signed revocation events;
- expose PRM and the existing MCP endpoint.

Pairing and consent mutations require the appropriate WordPress capability plus CSRF nonce. MCP Bearer requests do not use wp-admin nonces; they use the OAuth token and local grant mapping.

## Required bindings

### Pairing attempt

Bound to:

- platform issuer and tenant/account transaction;
- exact proposed resource;
- WordPress administrator session/nonce;
- high-entropy secret hash;
- creation/expiry and single-use state;
- protocol version.

### Authorization transaction/code

Bound to:

- issuer, client, redirect URI;
- PKCE S256 challenge;
- tenant, site, exact resource;
- platform subject and local opaque grant;
- approved scopes and consent version;
- expiry and single-use state.

### Refresh token

Bound to:

- client, tenant, site, exact resource;
- subject, grant, scope ceiling;
- family and generation.

## Idempotency and concurrency

- Pairing completion, grant creation, revocation, and deletion requests require idempotency keys or naturally unique transaction IDs.
- A repeated request with identical immutable input returns the original safe outcome.
- Reusing a key with different input is a conflict and security event.
- Authorization-code exchange and refresh rotation are atomic single-winner transitions.
- Revocation events carry stable IDs; WordPress records processed IDs or a monotonic cursor.
- No endpoint turns an uncertain write outcome into an unconditional retry that could create an extra grant or live token family.

## Error taxonomy

| Code family | Meaning | Disclosure rule |
|---|---|---|
| `invalid_request` | malformed/bounded validation failure | identify invalid field only when safe |
| `invalid_client` | client authentication/registration failure | do not reveal another client's existence |
| `invalid_grant` | expired, consumed, revoked, mismatched code/refresh | same response across sensitive causes |
| `invalid_scope` | unknown or impermissible requested scope | return allowed public vocabulary only |
| `invalid_target` | invalid/mismatched resource where applicable | do not enumerate paired sites |
| `access_denied` | user/local consent denied | no local user details |
| `temporarily_unavailable` | safe transient service failure | include retry guidance, no secrets |
| platform `not_found` | absent or inaccessible object | same response across tenants |
| platform `conflict` | state/idempotency/concurrency conflict | stable code and correlation ID |

Errors never echo tokens, authorization codes, pairing secrets, raw redirect queries, WordPress content, database details, stack traces, or key material.

## Outbound network policy

The platform may contact a WordPress site only after explicit pairing consent and only for defined pairing/status/revocation operations. The implementation requires:

- exact destination derived from the pending canonical resource, not an arbitrary callback URL;
- DNS/IP policy validation on every new connection;
- TLS verification and bounded redirects policy;
- method, path, body-size, response-size, timeout, and content-type limits;
- no generic fetch/proxy endpoint;
- no MCP tool endpoint invocation and no WordPress content API invocation.

## Logging and observability contract

Allowed fields include timestamp, stable event name, result/reason code, correlation ID, opaque tenant/site/client/grant references, service/version, duration bucket, and bounded risk signals.

Forbidden fields include Authorization/Cookie headers, codes, token plaintext or reusable token hashes, pairing secrets, request/response bodies, tool names paired with arguments/results, posts/pages/media/SEO/email content, WordPress user identifiers, and unreviewed URLs/query strings.

Metrics are operational/security measurements, not product content telemetry. Any future analytics requires a separate consent and data contract.
