# P3-C3: Final Acceptance and Public Registration Readiness Review

Date: 2026-10-15. This is a read-only readiness assessment and records GitHub documentation integration. It does not authorize a production rollout or public launch.

## Decision

The bounded P3 OAuth/MCP feature set has passed its recorded production acceptance: P3-A, P3-B1, P3-B2D and P3-B3. Site B has since been retired, with its platform history retained. These historical results remain valid for the tested versions and scope.

Do not open unrestricted public registration yet. The current Email OTP setup allows sign-up and applies IP/route limits, but ADR-019 explicitly says those internal-test limits do not establish protection against per-destination abuse, delivery cost, or reputation damage. This is the concrete public-registration blocker. This review does not recommend an invitation or allowlist system; the intended onboarding remains the normal public registration flow.

A 3–5-person first observation group may be recruited to use the normal public flow after the public abuse controls and onboarding checks below are ready. That group is an operational observation cohort, not a signup cap.

## GitHub evidence integration

- PR #66 was merged normally as merge commit d18c306589234b0fe48472c5e1c0001f5b0de279. Main CI run 38682605295 succeeded.
- PR #67 was updated with a normal merge commit from the new main, reducing its final diff to four intended documentation files. Its CI run 38682868529 succeeded.
- PR #67 was merged normally as merge commit a243f18c4d1b8fa75415786e804c532ef0218b22.
- Final main is a243f18c4d1b8fa75415786e804c532ef0218b22; main CI run 38683161007 succeeded.
- The P3-C2B record remains an intermediate snapshot. The P3-C2C record documents the later DNS, certificate and Nginx retirement. Neither record overwrites the other.

## Current production snapshot

Read-only checks at 2026-10-15 04:40 UTC found:

- Control, Authorization, PostgreSQL, Site A WordPress and MariaDB were healthy, with no container restart or OOM flag.
- Control image: ghcr.io/wepuu/wp-auto-control@sha256:3a4eed82715339076947aaa9ada0a8a065b1784041bc2f4c353d79f8a3d6038f.
- Authorization image: ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742.
- The database has exactly migrations 001 through 013.
- One Site is active: the current Site A resource. Site B is revoked and its application resources and ingress certificate have been retired; a host-only reject vhost remains to prevent accidental default-site routing.
- One wepuu-e2e-codex Grant is active for Site A, scope mcp:read, updated at 2026-10-14 15:06:19.849847+00, with no revocation reason. This is the replacement Grant created during the separately authorized Site A recovery. The earlier Codex Grant remains revoked.
- No wepuu-e2e-lifecycle Grant is live.
- The active Site has no undelivered Outbox event. Four undelivered terminal events belong to revoked historical Site records; the old Site A sequence-5 event remains http.401 at the retry limit. It was not edited or manually requeued.
- RAM available was about 1.1 GiB, with about 2.5 GiB swap used. Short vmstat samples showed intermittent swap activity, while all scoped services remained healthy and no new OOM/restart was observed. This is a bounded-host observation, not a public-capacity guarantee.

## app.wpauto.cc HTTP 526

The public endpoint returned HTTP 526 during this review. The Cloudflare error documentation describes 526 as an origin-certificate validation failure, commonly seen with Full (strict) when the origin certificate is invalid for the requested hostname: [Cloudflare error 526](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-526/).

The origin checks provide the specific local cause:

- No dedicated app.wpauto.cc Nginx virtual host or matching certificate file is present.
- A TLS request with SNI app.wpauto.cc receives a certificate for auth.wpauto.cc; normal hostname validation fails.
- The only matching active vhost found was for auth.wpauto.cc. Nginx configuration validation passed.
- auth.wpauto.cc remains reachable and redirects /app to the existing account-login flow; test.wpauto.cc remains reachable.
- The existing Control service is healthy and listens on loopback port 3000; Authorization listens on 3001. The 526 is not evidence that the current frontend process is absent.
- P4-A, which would establish a separate app-domain boundary, is not deployed. The public app hostname therefore has no dedicated service route.

The Cloudflare zone setting itself was not queried through an authenticated account/API during this review. Prior operator confirmation says Full (strict) is enabled; the current 526 plus the verified origin hostname mismatch are consistent with that setting.

Use https://auth.wpauto.cc/app as the current console and signup entry. The app-domain 526 does not block that route. If app.wpauto.cc is to be advertised later, first install a hostname-matching certificate and a dedicated vhost; a minimal alias can redirect to the existing auth-hosted console. Do not weaken TLS validation or deploy P4-A as an incidental 526 fix.

## P3 evidence and remaining coverage

| Area | Recorded evidence | Assessment |
|---|---|---|
| P3-A | Authorization Code + PKCE, Consent, direct MCP, refresh rotation, G1 replay and G2 RFC 7009 behavior | Passed for the recorded production environment |
| P3-B1 | Real Codex Desktop login and MCP connection; exact tool set and direct WordPress site-health | Passed for the tested Desktop package |
| P3-B2D | Six-step A/B access matrix with two independent Site-bound lifecycle Grants | Passed for same-account, same-Tenant Site/resource/Grant isolation |
| P3-B3 | Core Application Password, permissions, invalid credentials, invalid Bearer non-fallback | Passed; temporary test identity and credential were removed |
| P3-C2 | Site B application/storage and ingress retirement; platform history retained | Complete; intermediate and final records both retained |
| Tenant boundary | PostgreSQL RLS and tenant-resolution tests cover distinct accounts/Tenants; production B2D exercised two Sites in one Tenant | Do not claim independent production Tenant isolation. Add one isolated CI end-to-end test spanning two accounts/Tenants before opening registration |
| Cross-Site revocation propagation | Per-Site G1/G2 lifecycle behavior passed; no cross-Site propagation claim was tested | Not an additional P3-B2 acceptance requirement; keep the separate flag false |
| Historical sequence-5 event | Terminal http.401 on a revoked Site at retry limit; active Site queue is empty | Retain as a classified historical operations issue. Do not manually rewrite or requeue it |

The targeted Tenant test is a bounded CI evidence task, not a request for more production Sites or OAuth runs. It should exercise account-to-Tenant membership, consent/grant resolution and a negative cross-Tenant resource/token attempt through the real Provider/HTTP path using isolated PostgreSQL fixtures.

## Public registration readiness

The product path should remain standard public registration with no invitation code, email allowlist or invite-only gate. Before exposing it broadly:

1. Add per-destination OTP send limits in addition to the existing IP/route limits. Use a keyed hash of the normalized destination and the existing rate-limit storage; do not store raw email addresses in rate-limit labels.
2. Add bounded send-cost controls and observable counters/alerts for send volume, provider failures, bounce/complaint signals and rate-limit denials. Keep logs free of OTPs, tokens and message content.
3. Verify signup, email ownership, account/Tenant creation, first Site pairing and consent with a fresh independent test account using the same public flow intended for ordinary users. This is a separately authorized production onboarding test.
4. Publish one canonical entry URL. Use auth.wpauto.cc/app until an app-domain certificate and route are intentionally delivered.
5. Review VPS capacity against expected onboarding/email load before announcing the flow; current health on a shared 4 GiB host does not establish public service capacity.

These controls are bounded release preparation, not a reason to add invitations or reopen the accepted OAuth contract. After this gate, conduct the first 3–5-user observation using ordinary public signup, then decide whether to widen access based on delivery, abuse and service-health evidence.

## Status

~~~~text
P3_CORE_OAUTH_MCP_PASS=True
P3B2_SITE_ISOLATION_PASS=True
P3B3_APPLICATION_PASSWORD_PASS=True
P3C2B_SITE_B_CLEANUP_COMPLETE=True
P3C2C_SITE_B_INGRESS_RETIREMENT_PASS=True
TENANT_ISOLATION_INDEPENDENTLY_TESTED=False
REVOCATION_PROPAGATION_ISOLATION_TESTED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
~~~~

No production services, Grants, Connector state, Outbox rows, Cloudflare settings, Nginx configuration, certificates, DNS records or migrations were changed during this review. No OAuth flow was run. Migration 014 and P4-A remain undeployed.
