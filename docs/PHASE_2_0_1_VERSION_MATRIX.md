# Phase 2.0.1 Version and Environment Matrix

Status: local provider, HTTPS, PHP, and Codex pre-registered browser gates
pass; Auth0 is rejected; WorkBuddy 5.5.2 is unsupported.

| Component | Baseline | Status | Required follow-up |
|---|---|---|---|
| Node.js | local v24.19.0; target Node 24 LTS | pass | pin CI image in Phase 2.0.2 |
| npm/pnpm | npm 11.17.0, pnpm 11.19.0 | pass | reproduce install in CI |
| OAuth engine | `node-oidc-provider` 9.12.2 | pass for isolated spike | review KMS, distributed state, and production adapter |
| Persistence | `pg` 8.16.3 + PostgreSQL 16-alpine | pass: restart/consume/revoke | distributed failure qualification |
| Managed comparison | Auth0 tenant `dev-o173hfg1cbmd0crj` | rejected: plain PKCE accepted; DCR probe deleted with status 204; one-time M2M helper deleted | none for Phase 2.0.1 |
| Codex | codex-cli 0.154.0 | pass: pre-registered code + S256 + dynamic loopback callback + token exchange | add client refresh/revoke/tool-invocation coverage before broader version support |
| WorkBuddy | GUI 5.5.2; codebuddy 2.137.1 | unsupported: valid project HTTP config read but not loaded as a Connector | exclude this version; retest future versions |
| PHP | Docker PHP 8.1.34 | pass: real provider tokens and rotation | repeat in CI after provider selection |
| Composer | Docker Composer 2.10.3 | pass | repeat audit in CI |
| JOSE | `lcobucci/jwt` 4.3.0 | pass: RS256/header/claims/audience/rotation negatives | repeat in CI |
| TLS | Caddy 2.10.2 local CA; Node 24.21.0 fixture | pass: exact external issuer/resource and pinned fingerprint | verify restoration after every run |

## Environment rules

- Provider credentials are process environment or authenticated CLI session
  only; no `.env`, fixture, log, or Git storage.
- No production issuer, key, WordPress site, or customer account is used.
- Version changes require a complete re-run of the provider-neutral suite.
- Browser evidence must be protocol traces, not screenshots alone.
