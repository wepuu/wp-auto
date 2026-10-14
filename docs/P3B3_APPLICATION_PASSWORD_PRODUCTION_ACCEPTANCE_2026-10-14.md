# P3-B3 Application Password production acceptance — 2026-10-14

## Result and preserved history

One separately authorized production run passed all Basic/Application Password,
MCP, capability, invalid-credential, invalid-Bearer and cleanup assertions on
Site B. No credential creation or full-flow retry occurred.

The previous preflight stop and its helper bootstrap defect remain recorded in
`P3B3_APPLICATION_PASSWORD_ACCEPTANCE_2026-10-14.md`; they are historical facts,
not retroactively changed to passing tests. That attempt created no identity or
credential. This record covers the new explicitly authorized execution only.

## Reviewed implementation and immediate prechecks

- PR #61 <https://github.com/wepuu/wp-auto/pull/61>, unchanged Head
  `7eb147b2516205cfbc575f45fa94e581013d263b`.
- Hosted CI <https://github.com/wepuu/wp-auto/actions/runs/38527854362> passed.
- The checked-out Head and both production test files matched that exact Head;
  the corrected post-bootstrap control variables were used.
- Ten focused local harness tests passed again (10/10, zero failures/skips).
  No full local check is newly represented as passed: the earlier Windows
  certificate-fixture failure remains in the previous record; hosted CI passed.
- Seven services healthy, no new container OOM or restart. Both Sites active,
  Connector paired, Site A sequence 2/two G1/G2 markers, Site B sequence 0/no markers.
- WordPress Core Application Password support true; zero existing Subscribers.
  The helper's unique per-run username was absent before creation.
- Authorization fixed before and after:
  `ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.
- Database migrations exactly 001–013; original Codex and two lifecycle Grants,
  Connector summaries and historical Outbox matched the prior accepted baseline.
- Dynamic six-sample resource evaluation allowed execution. Minimum available
  memory 939.383 MiB, final 1185.992 MiB. No sustained severe pressure, new OOM
  or restart. Occupied Swap/historical host OOM remained non-blocking warnings.

## Single actual execution

Executed exactly once from the reviewed source:

```sh
node scripts/test-production-application-password.mjs --execute true
```

Recorded UTC window: `2026-10-14T08:37:00Z`–`08:37:35Z` (including observation).
Non-secret run ID: `1b5f3de4-e624-4d25-8c7c-9ceb6353172e`.
Temporary Site B WordPress user ID: `2`; role exactly Subscriber, `read=true`,
`upload_files=false`, `edit_posts=false`, checked before credential creation.

Only this new identity received one native Core Application Password. Its raw
password was captured inside the client test process, never placed in command
arguments, files, Git, tool output or acceptance logs. No existing administrator
password, browser credential, Codex credential or OAuth Token was read/copied.

| Step | Actual production result |
|---|---|
| Create one temporary Subscriber with run ownership marker | PASS |
| Create one dedicated Core Application Password | PASS |
| HTTPS Basic `/wp-json/wp/v2/users/me` matches new user ID | PASS |
| Direct Site B MCP initialize | PASS |
| Exact frozen 23 tools and order | PASS |
| `wp-auto-site-health` | PASS |
| Subscriber `wp-auto-media-search` rejected for native permission | PASS |
| Wrong Basic credential rejected with HTTP 401 | PASS |
| Missing authentication rejected with HTTP 401 | PASS |
| Invalid Bearer rejected with HTTP 401 + Bearer `invalid_token` | PASS |
| New user's Core Cookie/REST nonce identity control | PASS |
| Invalid Bearer plus that valid Cookie cannot downgrade | PASS |
| Independent valid Basic MCP initialize after negative tests | PASS |
| Exact Core Application Password deletion | PASS |
| Delete only owned, dependency-free temporary Subscriber | PASS |
| Former Basic credential rejected after cleanup with HTTP 401 | PASS |

No items are FAIL or NOT_RUN in this execution. The media check is deliberately
a permission-denied tool result, not a successful media fetch: the Adapter
returned `isError=true`, no structured content, and its fixed permission-denial
text. It did not return media data. No content-write tool was invoked.

The ambient Cookie/nonce was newly generated solely for this run's Subscriber;
it was not extracted from any browser or existing account. Its valid identity
was confirmed before sending the invalid-Bearer request. Each request had only
one Authorization scheme: Basic and Bearer were never mixed in one header.
The independent valid-Basic postcheck passed after the Bearer negatives.

## Data flow and authentication independence

All HTTP test destinations were exclusively `https://test2.wpauto.cc`:
the MCP endpoint and the native Core current-user endpoint. The Basic path sent
no OAuth Client ID, scope, code, Access/Refresh Token or platform request.
The new Subscriber was not associated with a platform Grant. Application
Password authentication therefore succeeded without a platform OAuth Grant for
that identity or an OAuth scope requirement; the paired OAuth mode remained
enabled. No platform outage/disconnection was manufactured or claimed tested.

WordPress native capabilities continued to gate the tools. The single catalog
and site-health probe used direct client-to-WordPress requests; no MCP input,
output, WordPress content or password was sent through Control/Authorization.
Only fixed result flags and necessary non-secret cleanup identifiers were logged.

Read-only origin access metadata within the execution window confirmed:

| Site B origin route | HTTP status | Count |
|---|---:|---:|
| GET `/wp-json/wp/v2/users/me` | 200 | 2 |
| POST `/wp-json/wp-auto/mcp` | 200 | 5 |
| POST `/wp-json/wp-auto/mcp` | 202 | 1 |
| POST `/wp-json/wp-auto/mcp` | 401 | 5 |

Only path/status counters were emitted; request headers, cookies, bodies and
responses were not logged. Challenge/status assertions came from the client,
not from treating a proxy/network failure as a valid denial.

## Exact cleanup and independent postchecks

The reviewed helper checked the new user's run ownership marker and exact
Subscriber role. It deleted only that run's matching Application Password via
Core, verified the password list empty, checked zero posts/comments/links, then
destroyed that user's Sessions and deleted that user. No existing credential or
user was removed. The revoked former Basic credential subsequently returned 401.

Independent read-only verification confirmed:

- Temporary user ID and exact per-run login absent.
- Subscriber count returned to zero; all usermeta rows for user ID 2 were zero,
  including Application Password, Session and run ownership state.
- Original Codex Grant still active, original timestamp
  `2026-10-12T12:03:49.698212+00:00`, null revocation reason.
- Three complete business Grant row SHA-256s unchanged:

| Grant ID SHA prefix | Unchanged complete row SHA-256 |
|---|---|
| Codex `721b22f53cda` | `75c06908b7e01ea633f602a8e14923bba8bbfb0cfba802af5320af7950677ad3` |
| lifecycle A `623c362c435d` | `600dc8dd6e07480561c2a9fcde31893f05ab82a995eb218b5ecdc8494529e4e0` |
| lifecycle B `f1f54908e651` | `1ebca6d0615c1dbd79f15d88c71e743ac422cb609f8296173d26f98989311469` |

- Full projected Site A/B Connector state matched the baseline; A remains v2,
  sequence 2/two original markers, B v2, sequence 0/zero markers.
- Historical Outbox row-level metadata digests unchanged; no event was changed,
  requeued, removed or generated by OAuth revocation.
- Seven service projections, images, health, OOM flags and restart counts
  unchanged and healthy. Authorization digest unchanged.
- Migration name/hash aggregate remained
  `b4ada268cd5c3c3e639fcb7f63d014ab0be4ed01a0c27876224667819617fcc4`,
  exactly 001–013. No migration 014/P4-A was executed.
- Post-run six-sample resource evaluation allowed: minimum 1040.480 MiB available,
  final 1089.102 MiB, disk 15021 MiB; no sustained severe PSI/paging, no new OOM or
  restart. Historical host OOM total stayed 174. No service was resized/stopped.

## State and stop boundary

```text
P3B3_APPLICATION_PASSWORD_PASS=True
P3_CORE_OAUTH_MCP_PASS=True
P3B2_PRODUCTION_ISOLATION_TESTED=True
P3B2_SITE_ISOLATION_PASS=True
SAME_TENANT_CROSS_SITE_RESOURCE_GRANT_ISOLATION=True
REVOCATION_PROPAGATION_ISOLATION_TESTED=False
TENANT_ISOLATION_INDEPENDENTLY_TESTED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

This acceptance does not by itself change aggregate readiness. The new Draft
record PR is stacked on #61 and changes this record only. PRs #57–#61 were not
merged. No OAuth reauthorization/refresh/replay/revocation, Connector or service
deployment, Site B removal, platform Site cleanup or P4-A action occurred.
`design/` remains untracked, unmodified and unstaged. Stop after evidence filing.
