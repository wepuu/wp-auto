# P3-B2D two-Site OAuth isolation production revalidation — 2026-10-14

## Outcome and authorization

One production revalidation run passed after the resource-bound Grant hotfix:
two official OAuth authorizations, two code exchanges and one six-step matrix.
The operator explicitly corrected the prompt's `mcp` scope to `mcp:read` before
execution. No `openid`, `offline_access`, refresh, replay or revocation occurred.
The existing two active lifecycle business Grants were reused, not replaced.

The result establishes same-account, same-Tenant **Site/resource/Grant combined
binding isolation**. It is not independent tenant-claim/site-claim proof or a
cross-Site revocation propagation test. Historical production failure remains
preserved in PR #57 and its 2026-10-13 record; it is not rewritten as a pass.

## Reviewed runner and baseline

- Runner source: PR #57 Head `abe59a1668fd1ed6ee0334adbd37b736cebb8419`.
- Hosted CI <https://github.com/wepuu/wp-auto/actions/runs/38420064117> passed.
- The exact reviewed `scripts/test-production-wordpress-site-isolation.mjs`
  was executed directly, not an older main script or a newly modified runner.
  Its six-result reporter, second authorization budget, issuer/state validation,
  strict Token bindings and 45-second matrix deadline were present.
- Local Node `26.11.1`: syntax check and all 38 targeted isolation/OAuth script
  regression tests passed, zero failures/skips. No runner code was changed.
- Authorization before and after:
  `ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.
- Fixed issuer `https://auth.wpauto.cc`, public Client `wepuu-e2e-lifecycle`,
  scope exactly `mcp:read`, existing strict dynamic loopback `/callback` rule.
- Resources:
  - A: `https://test.wpauto.cc/wp-json/wp-auto/mcp`
  - B: `https://test2.wpauto.cc/wp-json/wp-auto/mcp`
- Both active Sites belong to the existing test account and Tenant. Their
  IDs/resources and Connector bindings are distinct and consistent.
- Exactly two lifecycle live Grants were active; there were no extra pending
  or suspended Grants in the combinations used for this run.
- Complete business Grant IDs were compared to the protected pre-hotfix dump
  in memory, not merely matched by 12-character prefixes. The dump was read as
  SQL output only, never restored. Account, Tenant, Client, Site/resource and
  scope bindings matched. Grant identifiers below are SHA-256 summaries only.

| Site | Original Grant SHA-256 | Before/after state |
|---|---|---|
| A | `623c362c435da485d42d6980a9c2d4bf9a4f8a7ff088b0f8329b58974a8b57c2` | active / active, same ID and full row digest |
| B | `f1f54908e651f294912063c07ed660b0f452c696a7cf3aebd0e5311f9e7650ab` | active / active, same ID and full row digest |

Before execution A's Provider Grant existed; B's did not. After normal Consent
both corresponding Provider Grants existed. No artifact payload was read or
copied, and no Provider Session was manually changed.

## New backup

`/opt/wpauto/backups/pre-site-isolation/20261014T062235Z/postgres.dump`:
PostgreSQL custom format, 164512 bytes, root:root/0600, parent directory 0700.
SHA-256:
`5f42c00a17c9a452aa66d2280b57f17dd989d1450b8086978a928cf472796531`.
Checksum and `pg_restore -l` passed. No database restore was performed.

## Actual execution

The operator prepared both WordPress administrator sessions and the original
WePuu account before the unique script run. Recorded UTC execution window:
`2026-10-14T06:26:08Z` through `06:26:52Z` (includes human/tool observation time).
Site A succeeded, then the runner automatically opened Site B; Site B succeeded
without retry, Cookie clearing, account switching or a new Client.

- Both official Consent/Authorization Code + PKCE S256 flows completed.
- Exact callback issuer/state/path checks passed before each exchange.
- RS256/JWKS, algorithm/type/key/time, account, Tenant, Client, Site, Grant,
  audience and exact scope binding checks passed.
- Runner Grant summaries matched the original A/B Grant summaries above.
- Only Access Tokens were issued/used by the runner; unexpected refresh tokens
  would have failed the assertion. Tokens, codes and verifiers stayed in memory.
- Both Tokens had at least 60 seconds remaining at matrix entry. Every step
  passed within the runner's 10-second operation / 45-second matrix limits.

| Matrix step | Result |
|---|---|
| A Token → A: initialize / exact 23 tools and order / site-health | PASS |
| B Token → B: initialize / exact 23 tools and order / site-health | PASS |
| A Token → B: HTTP 401 + unique Bearer `invalid_token` | PASS |
| B Token → A: HTTP 401 + unique Bearer `invalid_token` | PASS |
| A Token → A: repeated full positive probe | PASS |
| B Token → B: repeated full positive probe | PASS |

Each positive probe independently initialized MCP and used only its own Session
ID when supplied. Cross probes sent no MCP Session ID and followed no redirect.
Only `wp-auto-site-health` was called (four total calls); no content-write tool
was invoked. The frozen 23-name/order comparison was real, not a UI tool count.

Origin Apache metadata within the run window confirmed direct WordPress access:

| Origin | MCP POST 200 | MCP POST 401 | First/last matching request UTC |
|---|---:|---:|---|
| A | 6 | 1 | 06:26:31 / 06:26:39 |
| B | 6 | 1 | 06:26:35 / 06:26:40 |

These are path/status/time counters, not request/response content. In combination
with the runner's exact Bearer challenge and lifetime assertions, the cross
denials were confirmed at the WordPress origins, not inferred from Cloudflare,
403, 429, timeout or natural Token expiry. The matching origin request window
spanned nine seconds, consistent with the enforced matrix deadline.

## Read-only postchecks

- All seven services healthy, no new OOM or unexpected restart. Authorization
  digest unchanged; no service or plugin was deployed during this run.
- Applied migrations remained exactly 001–013; canonical filename/hash digest
  `b4ada268cd5c3c3e639fcb7f63d014ab0be4ed01a0c27876224667819617fcc4`
  unchanged. Migration 014/P4-A were not executed.
- Complete row SHA-256s of both lifecycle Grants and the original Codex Grant
  were unchanged, not merely their state/counts. No additional business Grant
  was created. Both lifecycle Grants remain active with original bindings.
- Original Codex Grant remains active, original
  `updated_at=2026-10-12T12:03:49.698212+00:00`, null revocation reason.
- Site A remains v2, sequence 2, its original two G1/G2 Grant deny markers.
- Site B remains v2, sequence 0, zero deny markers. Full projected Connector
  summaries and marker-set digests unchanged.
- All seven historical Outbox rows matched their pre-run metadata digests;
  no new revocation event, deletion, mutation or requeue occurred.
- Pre/post Client summary matched. Normal Consent created only expected OAuth
  protocol artifacts/audit records; these were not manually altered.
- Six-sample dynamic resource precheck allowed execution: minimum available
  memory 935.293 MiB. Postcheck also allowed: minimum 805.578 MiB, final
  859.859 MiB, disk available 15048 MiB. Historical host OOM count remained 174;
  all seven container OOM/restart deltas were zero. Swap in use and bounded
  precheck pressure were warnings, not sustained severe-pressure failures.

## Status and next boundary

```text
P3_CORE_OAUTH_MCP_PASS=True
P3B2_PRODUCTION_ISOLATION_TESTED=True
P3B2_SITE_ISOLATION_PASS=True
SAME_TENANT_CROSS_SITE_RESOURCE_GRANT_ISOLATION=True
REVOCATION_PROPAGATION_ISOLATION_TESTED=False
TENANT_ISOLATION_INDEPENDENTLY_TESTED=False
P3B3_APPLICATION_PASSWORD_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The independent evidence PR is stacked on PR #57 so its diff contains only this
new record. It does not merge #57/#58/#59 or overwrite their historical evidence.
No Application Password test, Grant cleanup, Site B deletion or P4-A work was
started. Test Grants remain active pending separately authorized cleanup.
`design/` remains untracked, unmodified and unstaged. Stop after evidence filing.
