# Phase 2.0.1 Conformance Test Plan

## Objective

Retire protocol and interoperability risk before Phase 2.0.2 production foundation. This phase validates the frozen OAuth/MCP contract through a provider-neutral black-box suite. It does not expose a production endpoint or change the WordPress connector.

## Test tiers

### Tier 0 — pure contract tests

Runs without network access, third-party packages, provider accounts, PHP, or WordPress. The current implementation is under `spikes/oauth-conformance/`.

Coverage:

- canonical HTTPS resource validation;
- exact single audience;
- authorization/token resource equality;
- exact redirect URI and RFC 8252 loopback-port exception;
- PKCE S256 shape;
- Authorization-header-only Bearer transport;
- minimum access-token claims and forbidden claims;
- independent scope-ceiling intersection;
- one-winner refresh rotation and replay result;
- control-plane content/credential field rejection.

### Tier 1 — synthetic provider black box

Runs against a local or isolated provider adapter implementing the same HTTP surfaces as a real AS/RS.

Coverage:

- PRM and `WWW-Authenticate` discovery;
- RFC 8414 metadata;
- authorization code + PKCE S256;
- resource in authorization and token requests;
- exact redirect and issuer response validation;
- pre-registered, CIMD, and DCR clients;
- JWT claims, key selection, and audience rejection;
- refresh rotation/reuse detection;
- revocation and idempotency;
- JWKS overlap, stale cache, unknown `kid`, and emergency revoke;
- tenant/site/grant isolation;
- no content or token leakage through logs and outbound calls.

### Tier 2 — candidate provider adapters

Run the identical Tier 1 suite against:

- `node-oidc-provider` candidate;
- Auth0 comparison tenant, if credentials and tenant approval are available.

Any adapter-specific workaround must be isolated, documented, and scored as a compatibility cost. A workaround that widens audience, weakens PKCE, accepts token passthrough, or logs sensitive data is disallowed.

### Tier 3 — real clients

Run with the target versions and record raw protocol outcomes after redaction:

- Codex: pre-registered client, CIMD, DCR, and automatic mode;
- WorkBuddy: browser login, PRM, resource, PKCE, refresh, reconnect, restart, revoke, and insufficient-scope behavior.

### Tier 4 — WordPress/PHP verifier

Run an isolated PHP/JOSE fixture against issued public JWKS and signed token fixtures. This tier is blocked until PHP and Composer are available in the approved environment.

## Positive test matrix

| ID | Area | Expected result |
|---|---|---|
| P01 | PRM | path-specific metadata identifies one exact resource and AS |
| P02 | Challenge | unauthenticated MCP request returns 401 Bearer challenge with metadata URL |
| P03 | AS metadata | issuer, endpoints, PKCE, JWKS, revocation, and registration metadata are coherent |
| P04 | Authorization | code flow requires S256, state, exact redirect, and resource |
| P05 | Token | code exchange requires verifier and the same resource |
| P06 | Audience | JWT contains one `aud` equal to the full resource URI |
| P07 | Claims | only approved opaque identity/control claims appear |
| P08 | Scope | token scope is intersection of all ceilings |
| P09 | Refresh | successful use rotates family generation atomically |
| P10 | Revocation | grant/family revocation is idempotent and blocks future use |
| P11 | JWKS | new key is published before use and old key remains during overlap |
| P12 | Direct path | MCP request goes directly client → WordPress; platform sees no tool body |

## Negative test matrix

| ID | Attack | Expected result |
|---|---|---|
| N01 | origin-only audience | reject |
| N02 | sibling-path or slash variant | reject |
| N03 | authorization/token resource mismatch | reject |
| N04 | plain or missing PKCE | reject |
| N05 | redirect host/path/query/scheme mutation | reject |
| N06 | missing or mismatched issuer | reject |
| N07 | multiple audience or audience array | reject |
| N08 | unknown algorithm or `none` | reject |
| N09 | unknown/stale `kid` beyond safe cache | reject |
| N10 | expired/not-yet-valid token | reject |
| N11 | code or refresh replay | reject and emit bounded security event |
| N12 | cross-site/cross-tenant grant | reject without enumeration |
| N13 | token in query/cookie | reject |
| N14 | requested scope above ceiling | reduce or reject; never widen |
| N15 | content/credential field in control payload | reject, redact, and alert |
| N16 | platform outage with unsafe trust state | fail closed; no live-fetch bypass |

## Evidence rules

- Capture request method/path/status/selected headers only after deterministic redaction.
- Replace token, code, verifier, cookie, email, and user identifiers with stable test placeholders.
- Do not store WordPress content, tool arguments, tool outputs, media URLs, or raw authorization headers.
- Every failed test records expected contract, actual behavior, provider/client version, and whether the deviation is hard-fail or acceptable profile variance.
- A test is not “passed” from a screenshot or marketing document; it needs a reproducible protocol trace.

## Exit gate

Phase 2.0.1 exits only when one provider passes all hard gates, the supported client matrix is explicit, PHP/JWKS verification passes, deviations are recorded in ADRs, and `PHASE_2_0_1_VALIDATION.md` is accepted.
