# ADR-014: Product Shell and Portable Runtime

Status: accepted on 2026-10-06 for Phase 2.0.7A.

## Context

The accepted OAuth control plane has protocol and resilience coverage but no
operator-facing product shell. Production domain, hosting provider, legal
identity, data region and policy URLs are not yet selected. The eventual
application host will not be AWS, while asymmetric signing keys remain in AWS
KMS.

## Decision

- Build a Fastify server-rendered product shell rather than a browser SPA.
- Create one personal home tenant atomically on first successful account login.
- List tenant memberships through an account-context database role and fixed
  security-definer functions; tenant-scoped operations continue to use RLS.
- Keep existing JSON APIs and add only `GET /v1/account/tenants` in 2.0.7A.
- Host all CSS and JavaScript on the platform origins with a deny-by-default
  CSP. UI mutations require session authentication, membership, exact Origin,
  CSRF and idempotency controls.
- Permit placeholder release metadata only in `local` and `test`. Public modes
  fail startup until final HTTPS policy URLs, provider identity, data region
  label and trusted proxy ranges are configured.
- Publish cloud-neutral OCI images. A non-AWS host reaches AWS KMS through the
  standard AWS SDK temporary-credential chain: workload OIDC plus STS is the
  preferred path; IAM Roles Anywhere `credential_process` is the fallback.
  Static AWS Access Keys are forbidden in production mode.
- Do not expose public account deletion in 2.0.7A. The account page explains
  the existing internal verified-deletion capability and the pending policy
  gate.

## Compatibility and data flow

The OAuth, MCP, pairing, grant, token, refresh, revocation, JWKS and connector
contracts do not change. Application Password access and the 23-tool catalog
remain intact. The UI reads content-free control records only; MCP inputs,
outputs and WordPress content remain client-to-WordPress.

## Failure and rollback

Workspace bootstrap failure revokes the newly minted browser session and
returns a generic temporary failure. Invalid public deployment configuration
prevents process startup. KMS or temporary-credential uncertainty continues to
prevent signing. Rollback removes the product routes and migration consumer;
the additive home-tenant mapping may remain without changing existing tenant
authorization.
