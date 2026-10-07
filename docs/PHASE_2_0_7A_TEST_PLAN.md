# Phase 2.0.7A Product Shell and Portable Runtime Test Plan

Evidence contains only case IDs, status, counts and stable placeholders. It
must not contain tokens, cookies, external subjects, WordPress content or MCP
bodies.

| ID | Gate | Expected result |
|---|---|---|
| A01 | First account login | One active home tenant and owner membership are created |
| A02 | Concurrent bootstrap | All callers resolve the same home tenant |
| A03 | Bootstrap failure | New session is revoked and no partial workspace remains |
| A04 | Account tenant listing | Only active memberships for the authenticated account are returned |
| A05 | Cross-account access | Account and tenant database roles cannot enumerate another account |
| A06 | Unauthenticated product route | Redirects to OIDC with a bounded local return path |
| A07 | SSR output | Subject, token, cookie, WordPress content and MCP body canaries are absent |
| A08 | UI mutation | Exact Origin, CSRF, membership and idempotency are all required |
| A09 | Browser policy | CSP, no-store, no-referrer, frame denial and self-hosted assets apply |
| A10 | Accessibility | Keyboard, focus, landmarks, contrast, mobile and reduced motion pass |
| A11 | Deployment configuration | Local placeholders work; staging/production placeholders fail startup |
| A12 | AWS credentials | Production rejects static keys and accepts the temporary-provider contract |
| A13 | OCI runtime | Images run non-root, read-only, health-checkable and stop gracefully |
| A14 | OAuth regression | Login, consent, pairing, grant and direct data boundary remain unchanged |
| A15 | Supply chain | TypeScript, ESLint, audit, SBOM and license gates pass |
| A16 | Documentation | ADR, API, data model, threat model, runbook and validation agree |

Hosted dual-KMS acceptance is manual and uses GitHub OIDC. It is required for
the immutable 2.0.7A candidate but is not scheduled and never uses repository
AWS secrets.
