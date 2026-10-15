# P3-D: Public registration security candidate validation

Date: 2026-10-15. Candidate started from main a243f18c4d1b8fa75415786e804c532ef0218b22.
PR #68 remains a separate Draft assessment; this change does not merge it.

## Implementation

ADR-022 records exact rolling send reservations, the dedicated HMAC key,
Better Auth before-hook integration, conservative charge semantics and safe
Provider outcome classification. Migration 015 is additive to 001–013 and is
independent of 014. Control-only configuration/metrics are added. The Resend
Dashboard runbook documents manual complaint/bounce observation; realtime
delivery-event monitoring is not implemented or claimed.

The isolated Tenant regression uses two verified mock-email identities and
home Tenants, signed Site Consent through GrantService and real Control and
Authorization HTTP handlers with oidc-provider 9.12.2/PostgreSQL. Tokens, codes,
cookies and keys exist only in isolated test memory/protected temp fixtures.

## Executed checks

- Local Node: 26.11.1; pinned pnpm 11.19.0; Better Auth 1.7.7; Resend 6.32.1.
- Focused configuration and actual Resend SDK/mock-fetch tests: 3 passed.
- Full local checks and Hosted CI: pending; update with actual results.
- Local Docker unavailable; PostgreSQL/HTTP acceptance is assigned to the
  mandatory isolated Hosted CI, not represented by local skipped tests.

No production connection, email send, OAuth Consent, deployment, schema change,
Grant/Outbox operation, invitation gate, Site B recreation or P4-A rollout was
performed. Existing uncommitted primary-workspace files and design/ are not
included in this branch.

## Candidate state (pending full Hosted CI)

```text
P3_CORE_OAUTH_MCP_PASS=True
P3B2_SITE_ISOLATION_PASS=True
P3B3_APPLICATION_PASSWORD_PASS=True
P3C2B_SITE_B_CLEANUP_COMPLETE=True
P3D_EMAIL_OTP_PROTECTION_CANDIDATE_PASS=False
P3D_TENANT_OAUTH_ISOLATION_CI_PASS=False
P3D_PRODUCTION_DEPLOYED=False
P3D_REAL_EMAIL_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Future production release needs a baseline Control hotfix, verified backup,
protected key mount and selective 015 migration. main's default startup migrate
must not run against production: main contains undeployed 014. Production
deployment and ordinary public onboarding/email validation require separate
authorization. No image publication or production rollout is part of this PR.
