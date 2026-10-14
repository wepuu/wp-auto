# P3-B3 Application Password production attempt — 2026-10-14

## Result: stopped before credential creation

The operator authorized one Site B Application Password compatibility run with
one temporary least-privilege identity/credential and exact cleanup. The runner
stopped in its credential-creation preflight with
`application_identity_review_required`. No test user or Application Password was
created, and no authenticated MCP/Basic/cookie test was reached. This is a test
harness failure, **not evidence that WordPress Application Password authentication
failed**. The production attempt was not restarted after the failure.

Run identifier (not a credential): `5bedac68-dd97-4b7e-b2ed-3fd081d66eb5`.
Only read-only diagnosis and postchecks followed. No OAuth Consent, code exchange,
refresh, replay, RFC 7009 revocation, deployment or Site B cleanup occurred.

## Prechecks actually executed

- PR #60 Head `614c2f7a9f14ec0f63fbf968f06370d49c8c822b`, CI
  <https://github.com/wepuu/wp-auto/actions/runs/38522582719> successful.
- Seven services healthy, no new container OOM/restart, both Sites active and
  paired. Original Codex and two lifecycle Grants remained active.
- Authorization before/after:
  `ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.
- Migrations exactly 001–013; no 014/P4-A changes.
- Site A v2, sequence 2, two Grant deny markers; B v2, sequence 0, zero markers.
- Core Application Password support true; zero existing Subscribers on Site B.
  Observed live Core version was `7.1.3`; the installed Connector was not changed.
- Dynamic resource checks allowed continuation. Immediately preceding sample
  minimum MemAvailable 1036.832 MiB; no new OOM or sustained severe pressure.
- No existing user password, Application Password, browser credential store or
  OAuth Token was read/copied for authentication.

## Confirmed harness root cause

The original one-shot PHP helper assigned the generic global `$action` before
requiring WordPress. The installed Core's `wp-includes/default-filters.php`
uses `$action` in registration loops (observed at lines 120 and 402), then
`unset( $filter, $action, $post_type )` at line 837. Because the helper loaded
Core at global scope, its action variable did not survive bootstrap.

Consequently, `preflight` incorrectly fell through to the helper's absent-user
cleanup branch. That branch found no run identity and returned
`passwordRevoked=true,userDeleted=true`; these were **not actual revoke/delete
operations**. The Node orchestrator correctly rejected this as a preflight
response without `supported`, before calling `create`. No MCP request was sent.

A read-only sentinel reproduction confirmed the control variable was unset
after `wp-load.php`. Subscriber count remained zero and the exact run-specific
username did not exist. No product authentication defect has been established.

## Local correction and tests

Only test tooling changed; no runtime/plugin deployment:

- `scripts/p3b3-application-password-core.php`: validate uniquely prefixed inputs
  before bootstrap, then restore validated action/run only **after** bootstrap.
  The corrected read-only preflight against actual Core returned exactly
  `supported=true,subscribers=0`. `create`, `ambient` and `cleanup` production
  operations were not re-executed after correction.
- `scripts/test-production-application-password.mjs`: fixed Site B/client-to-WP
  destination, explicit execution flag, no credential arguments/files, raw child
  stdout/stderr captured in memory and never printed. Exactly one creation
  attempt, failure cleanup in `finally`, fixed diagnostic codes only.
- `scripts/test-production-application-password.test.mjs`: 10 local regression
  tests passed, including failure cleanup, secret-output suppression, exact
  catalog, capability denial, cookie nonfallback controls and the bootstrap
  restoration ordering. These simulations are not production acceptance.
- Node syntax and PHP stdin lint passed; `git diff --check` passed.
- Full local `pnpm check`: **181 passed, 1 failed, 18 skipped**. Typecheck/lint
  completed; the unchanged `packages/pairing/test/https-transport.test.ts` failed
  because Windows PowerShell could not load `Microsoft.PowerShell.Security` or
  its `Cert:` provider for the self-signed TLS fixture. Its source matches the
  already CI-passing PR #60 baseline. No TLS verification was disabled, no test
  was skipped to manufacture success, and full local check is not marked passed.

The future harness uses Core native
[creation](https://developer.wordpress.org/reference/classes/wp_application_passwords/create_new_application_password/)
and [exact deletion](https://developer.wordpress.org/reference/classes/wp_application_passwords/delete_application_password/)
APIs. It does not implement authentication primitives. Its proposed negative
read-only probe is `wp-auto-media-search`: Subscriber lacks `upload_files`, while
site-health/transport require `read`. A temporary user's own short-lived Core
cookie/REST nonce supplies a valid ambient-identity control for invalid Bearer
rejection; no browser cookie is read. All these live probes remain unexecuted.

## Production acceptance coverage

| Item | Actual result |
|---|---|
| Site B Core Application Password support | PASS, read-only |
| Create one temporary Subscriber / password | NOT_RUN |
| Correct Basic identity / MCP initialize | NOT_RUN |
| Frozen 23 tools and exact order | NOT_RUN |
| site-health | NOT_RUN |
| Subscriber permission denial/no content disclosure | NOT_RUN |
| Wrong Basic and missing authentication rejected | NOT_RUN |
| Invalid Bearer and valid-cookie nonfallback | NOT_RUN |
| Independent Basic postcheck | NOT_RUN |
| Revoke credential and deny it afterward | NOT_RUN; no credential existed |
| Test identity cleanup | NOT_REQUIRED; exact run identity absent |

## Read-only postchecks and scope preservation

The full projected business/Connector snapshots matched precheck. Complete row
digests of the original Codex Grant and both lifecycle Grants matched their
previous accepted baseline. Original Codex timestamp remained
`2026-10-12T12:03:49.698212+00:00`, reason null. All historical Outbox row metadata
digests, Site sequence/markers, Client summary and migration list were unchanged.
Seven service image/health/OOM/restart projections were unchanged and healthy.

Postcheck resource minimum MemAvailable was 706.418 MiB, final 1273.688 MiB.
One transient swap-I/O burst reached 24.601 MiB/s; subsequent samples dropped,
so the established sustained-pressure rules allowed the sample with warnings.
Host OOM total remained 174, no new container OOM/restart. No service was stopped
or resized to produce this result.

## State and required next authorization

```text
P3B3_APPLICATION_PASSWORD_PASS=False
P3B2_PRODUCTION_ISOLATION_TESTED=True
P3B2_SITE_ISOLATION_PASS=True
SAME_TENANT_CROSS_SITE_RESOURCE_GRANT_ISOLATION=True
REVOCATION_PROPAGATION_ISOLATION_TESTED=False
TENANT_ISOLATION_INDEPENDENTLY_TESTED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The candidate PR is stacked on #60 and does not merge #57/#58/#59/#60. Preserve
this attempt, review the corrected test-only helper and hosted CI, then obtain
explicit renewed authorization for a single actual credential creation and
Basic/MCP run, with exact cleanup. No existing credential needs revocation from
this attempt. No Site B deletion or OAuth Grant cleanup is implied.
`design/` remained untracked, unmodified and unstaged.
