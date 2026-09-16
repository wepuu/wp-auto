# Threat Model

## Scope and assets

In scope are platform accounts, tenants, paired-site identity, OAuth clients, authorization transactions, grants, access/refresh tokens, signing keys, JWKS, revocation events, WordPress-local bindings, and the boundary around the direct MCP data plane.

High-value assets:

- signing authority and KMS permissions;
- authorization codes and refresh tokens;
- tenant/site/grant relationships;
- local WordPress grant mappings;
- redirect URIs, client metadata, canonical resources, and issuer configuration;
- security audit integrity.

WordPress content is deliberately outside the platform boundary. Its appearance in platform requests, logs, traces, queues, databases, error reporting, or support exports is a security incident and contract violation.

## Trust boundaries

1. User browser ↔ platform web UI.
2. OAuth client ↔ authorization service.
3. OAuth client ↔ WordPress MCP endpoint.
4. WordPress ↔ platform pairing/revocation endpoints.
5. Platform services ↔ PostgreSQL/Redis/KMS/logging.
6. Tenant ↔ tenant and site ↔ site data partitions.
7. WordPress OAuth transport identity ↔ existing WordPress ability/service authorization.

## Threat register

| ID | Threat | Required control | Validation evidence |
|---|---|---|---|
| T01 | Pairing-link theft or CSRF | local `manage_options`, nonce, high-entropy state/verifier, hash at rest, short TTL, single use, transaction binding | stolen/replayed/cross-session tests |
| T02 | Malicious endpoint or SSRF | HTTPS, public-address policy, DNS re-resolution defense, TLS hostname validation, blocked metadata/private ranges, no arbitrary redirects, strict budgets | IPv4/IPv6, redirect, rebinding, DNS and timeout corpus |
| T03 | Domain ownership transfer | bind exact canonical endpoint; suspend and re-pair on any material URI change | domain-change and stale-proof tests |
| T04 | Redirect URI manipulation | exact registration and comparison; narrow RFC 8252 loopback-port exception | alternate scheme/host/path/query/port tests |
| T05 | Authorization code interception | PKCE S256, single-use short code, exact client/redirect/resource binding | wrong verifier, reuse and race tests |
| T06 | Login CSRF or mix-up | unpredictable state, issuer response validation, fixed issuer metadata, no silent issuer fallback | missing/mismatched state and issuer tests |
| T07 | Audience confusion/confused deputy | exact RFC 8707 resource in both requests and exact single `aud` at RS | origin, sibling path, slash, case, alias, array and wildcard tests |
| T08 | Token passthrough | platform has no MCP proxy route; outbound allow-list; architecture/data-flow checks | route inventory and egress tests |
| T09 | Access-token replay | short expiry, TLS, unique `jti`, no logging, optional local denylist; evaluate sender constraint later | duplicate/high-risk revoke tests |
| T10 | Refresh-token theft/reuse | opaque hash, one-use rotation, transaction/CAS, family generation, reuse revokes family | concurrent refresh and old-token replay tests |
| T11 | JWKS/key substitution | pinned issuer/JWKS origin, TLS, algorithm allow-list, `kid`, overlap, KMS custody, bounded refresh | unknown kid, alg confusion, stale cache and emergency rotation tests |
| T12 | Tenant IDOR | server-derived tenant context, mandatory tenant key, scoped queries/RLS, non-enumerable IDs | cross-tenant read/write/delete matrix |
| T13 | Grant mapping tamper | WordPress-protected storage, admin/user nonce, opaque IDs, signed one-time completion, immutable site binding | local privilege and tampering tests |
| T14 | Stale WordPress privilege | resolve active user and run current capability/object checks on every call | delete, demote, remove-membership and security-plugin hooks |
| T15 | Scope escalation | scope intersection at consent/token refresh; scope is ceiling; no default write | manipulated request and refresh expansion tests |
| T16 | Platform admin impersonation | no arbitrary mint endpoint; least privilege; dual-control break-glass; immutable audit | privileged-route and access review |
| T17 | Sensitive logging | field allow-list, secret/content redaction, body exclusion, restricted correlation IDs | canary-secret and content-leak tests |
| T18 | Denial of service/registration abuse | per-IP/client/account/site limits, quotas, bounded payloads, backoff, circuit breakers | load and adversarial registration tests |
| T19 | Clock manipulation | small documented skew, trusted time source, monotonic duration use where possible | boundary and skew tests |
| T20 | Deletion leakage | tombstone workflow, outbox purge, backup expiry, verified deletion report | deletion and restore tests |
| T21 | Supply-chain compromise | pinned packages, lockfile review, provenance/SBOM, vulnerability response, no remote executable code | CI policy and release evidence |
| T22 | Platform outage | cached JWKS safety window, short token lifetime, local revoke, AP independence, fail-closed unsafe cache | outage/failover exercises |

## Abuse cases

### A platform account attempts to pair a victim site

Possessing a URL is insufficient. Completion requires a fresh action by a logged-in WordPress administrator and a proof bound to the same attempt and canonical endpoint.

### A valid token for site A is sent to site B

Site B rejects it because both `aud` and `site_id` must exactly match its locally paired values. It must not query the platform to “find” a matching site.

### A platform operator tries to use a grant

The operator has no WordPress credential or local grant mapping and cannot create a token through an administrative endpoint. Key use is restricted to the authorization service and audited.

### A stolen refresh token is raced

Exactly one transaction may advance the family generation. Any competing or subsequent use revokes the entire family and produces a security event without revealing which request was legitimate.

### A user is demoted after a token is issued

Scope and token validity do not preserve old privileges. The connector maps the grant to the current user and existing WordPress capability/object checks deny newly unauthorized operations.

## Security invariants

- No control-plane success path needs WordPress content or credentials.
- No token is accepted without exact issuer, audience, site, grant, signature, time, algorithm, and local-user validity.
- No scope can bypass WordPress permission checks.
- No external call occurs before administrator opt-in.
- No platform outage can break Application Password authentication.
- No rollback or recovery procedure weakens validation.

## Residual risks and deferred controls

- A valid bearer access token can be replayed until expiry if stolen; 2–5 minute lifetime bounds this risk. DPoP may be evaluated later after client support is proven.
- Platform-originated revocation is not globally instantaneous during site outage; local revoke is immediate and central exposure is bounded by access-token lifetime.
- Client registration ecosystems are evolving. CIMD and WorkBuddy behavior require continuous compatibility tests.
- Compromise of an active signing key remains severe; KMS policy, short tokens, rotation, key denylisting, and incident drills reduce but do not remove the risk.
