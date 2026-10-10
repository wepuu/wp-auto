# P2 Email OTP validation - 2026-10-10

## Scope

This record covers the local P2 candidate only. It does not authorize or record
a VPS deployment, production migration, real-user cleanup, connector change or
Phase 2.0.7B2 work.

## Confirmed behavior

- Better Auth 1.7.7 owns the six-digit, five-minute Email OTP and stores both
  the verification identifier and code in hashed form.
- A real loopback HTTP request traverses Fastify and the Better Auth Fetch
  handler. One accepted send followed by six concurrent resends produces six
  `429` responses and only one mock delivery. A forged `X-Forwarded-For` does
  not change the limiter key when no proxy is trusted.
- The deployment candidate trusts `CF-Connecting-IP` only from the reviewed
  Cloudflare prefix list and overwrites the application-facing forwarding
  header with Nginx's resolved remote address.
- Raw `/api/auth/*` and removed Auth0 callback routes return fixed 404 responses.
- Multiple `Set-Cookie` values are preserved; the Session cookie has the exact
  `__Host-wepuu_session`, Secure, HttpOnly, SameSite=Lax, Path=/, no-Domain
  profile.
- Login transactions reject CSRF tampering, email substitution, expiry and
  replay. Concurrent tabs resume distinct stored paths while producing one
  account, home tenant, owner membership and account-auth link.
- A failed account bootstrap leaves the transaction unconsumed and retryable.
  The valid Better Auth Session is not cleared and no second OTP is required.
- OAuth, local JOSE signing, JWKS, tenant isolation and connector code are not
  changed by this account-login implementation.

## Delivery semantics and remaining gates

Ordinary tests use `MockOtpEmailSender`; no external email provider is contacted.
`ResendOtpEmailSender` distinguishes accepted, rejected and unknown outcomes,
uses a bounded timeout and performs no automatic retry. A real Resend delivery
test and inbox receipt remain explicit operator tests before rollout.

The current Better Auth limiter key is trusted client IP plus route. This is
accepted only for internal testing. Email-targeted cost and abuse protections
must be reviewed before public registration. The candidate is not deployed.

## Executed checks

- `WEPUU_TEST_DATABASE_URL=<isolated tmpfs PostgreSQL> pnpm check` passed:
  91 tests, 90 passed, zero failed and one existing PHP-environment test
  skipped; TypeScript and ESLint also passed.
- `pnpm test:database` passed 14/14, including login transaction tamper,
  expiry, replay, concurrent tabs and bootstrap recovery.
- `auth@1.7.7 check --config packages/account-auth/src/schema.ts schema`
  passed after migration 013.
- Backup restore and deletion-tombstone replay passed.
- `pnpm audit --audit-level high` reported no known vulnerabilities.
- SBOM verification passed with 286 components. The scanner warned about the
  Codex runner's ambient `NODE_PATH` and outbound proxy; neither is baked into
  the application images.
- The VPS candidate and retained local acceptance Compose files parsed
  successfully without starting services.
- The local OCI signing gate passed; candidate image environments contain only
  fixed non-secret runtime settings, JWKS contains no private members, and the
  AWS KMS runtime dependency remains absent.
- Repository and candidate-image inspection found no Resend API key, private
  key, passphrase, Session token or provider token. Deliberate test canaries
  and private-key rejection patterns remain in test/source code.

The PostgreSQL fixture used `compose.test.yaml` on loopback port 55433 with
tmpfs storage. No VPS, production database, production secret or real Resend
API was accessed.

## Data-flow review

The new flow carries normalized email, OTP verification state and account
metadata only. It has no WordPress content client, MCP proxy route, tool input
or tool output. Resend receives the destination email and one-time code only.
