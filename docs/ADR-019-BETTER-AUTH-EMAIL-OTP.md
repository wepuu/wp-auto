# ADR-019: Better Auth Email OTP account login

- Status: accepted for P2 implementation; local candidate not deployed
- Date: 2026-10-10

## Context

ADR-018 established Better Auth as the account-authentication boundary but used
Auth0 temporarily. WePuu needs a self-hosted passwordless entry point without
changing the node-oidc-provider authorization server, the stable WePuu account
identifier, tenant authorization, local signing, or the direct WordPress data
plane.

## Decision

Better Auth 1.7.7's official Email OTP plugin owns OTP creation, hashed
verification persistence, expiry, attempt counting, user creation and Session
issuance. Codes are six digits, expire after five minutes, permit at most five
verification attempts and rotate on resend. Email addresses are trimmed,
Unicode NFC-normalized, lower-cased and then restricted to the ASCII mailbox
profile accepted by the pinned validator before reaching Better Auth.

control-api exposes server-rendered Email and verification forms. It does not
expose Better Auth's raw `/api/auth/*` surface. Exact-Origin, CSRF, method,
content type and bounded input checks run before control-api constructs an
internal Fetch request to the Better Auth handler. That handler remains in the
path so Better Auth's database limiter and security validation cannot be
bypassed by an `auth.api` send or verify call. Fastify derives the client IP
from its configured trusted-proxy boundary; caller-supplied forwarding headers
are ignored outside that boundary.

The current internal-test policy limits by client IP and Better Auth route.
Send and verify windows and maxima are bounded runtime configuration. This is
not sufficient protection for open public registration; per-destination abuse,
delivery cost and reputation controls must be reassessed before that gate.

Resend is a delivery adapter only. Its API key is read from a protected file.
An accepted API response means that Resend accepted the request, not that the
message reached the inbox. Explicit rejection and an indeterminate timeout or
transport outcome are presented differently, and there is no automatic retry
queue. Ordinary tests use a mock sender; a real Resend test is opt-in.

## Login transaction and failure behavior

The initial GET validates a same-origin local return path and creates a
ten-minute PostgreSQL transaction. The browser receives an opaque 256-bit token
while PostgreSQL stores only its SHA-256 digest, the CSRF digest, an HMAC email
binding and the validated return path. The two-step forms never carry
`return_to`. Completion is single-use; independent browser tabs have distinct
transactions.

OTP verification creates the Better Auth Session first. Account projection and
transaction consumption then run atomically through
`platform.ensure_account_auth_link`. If projection fails, OAuth authorization
does not continue, the Better Auth Session remains valid, the login transaction
remains unconsumed, and a protected retry can complete initialization without a
new code. Suspended or deleted WePuu accounts fail closed.

The single browser credential remains `__Host-wepuu_session`, Secure,
HttpOnly, SameSite=Lax, Path=/, with no Domain, a twelve-hour absolute lifetime,
no Session refresh and no cookie cache.

## Compatibility, data flow and rollback

OAuth issuer/discovery, PKCE, consent, access and refresh tokens, revocation,
RS256/JWKS, tenant/site/grant isolation, the connector and Application Password
access do not change. OTP email data flows only from the browser to control-api,
Better Auth/PostgreSQL and Resend. No WordPress content, MCP input or MCP output
enters this flow.

The obsolete Auth0 runtime and `openid-client` adapter are removed from the P2
candidate. Historical ADRs and validation records remain unchanged. Production
still runs the approved ADR-017 image until a separate rollout is authorized;
rollback is therefore an image/database rollback decision, not a dual active
login system in the P2 code.
