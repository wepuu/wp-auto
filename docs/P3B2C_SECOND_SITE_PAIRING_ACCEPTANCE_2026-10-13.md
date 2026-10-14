# P3-B2C: formal Site B pairing acceptance

## Result and scope

The operator completed one formal WordPress-to-platform pairing for
`https://test2.wpauto.cc`. Read-only postchecks at
`2026-10-13T14:02:10Z` confirmed a new active Site bound to the existing test
account and the same Tenant as Site A. This phase did not create an OAuth
Grant, issue a test Token, invoke MCP tools, or execute Application Password,
Replay, or Revocation tests.

PR [#56](https://github.com/wepuu/wp-auto/pull/56) was reviewed at head
`3df16e153ab00f7ac8365f0cdfd2b70961413258`; its only changed file was the
retained-Site-B recovery record. It was merged using a normal merge commit,
`dbf19ea10c3cbd91dc773d92116f0210c8a59822`. Post-merge main
[CI run 38404631938](https://github.com/wepuu/wp-auto/actions/runs/38404631938)
completed successfully. The original WP-CLI failure and subsequent recovery
remain in `P3B2B_TEMPORARY_SITE_DEPLOYMENT_2026-10-13.md`.

## Pre-pairing configuration issue

Before formal pairing, Site B had no platform connection, Site ID, or pending
pairing; the platform had one active Site and no Site B resource row.

The first local **Enable platform pairing locally** submission returned to an
empty form. Read-only WordPress checks found an empty `permalink_structure`:
Site B's `rest_url('wp-auto/mcp')` contained a query and failed the Connector's
canonical resource validation. Site A's resource validation passed.
`ConnectionSettings::enable()` computes `CanonicalResource::current()` before
writing its option; `AdminPairingController::enable()` catches that validation
failure and redirects with a generic invalid status. The local form does not
preserve the rejected values. No platform pairing attempt was created by this
local enable action.

The operator changed Site B's permalink setting through the WordPress admin
UI, saved the existing platform origins and Tenant, and reported the
`unpaired` state and Connect button. The operator then clicked Connect once
and reported pairing success. A configuration check overlapping that action
already observed the active connection; it is not presented as a distinct
pre-Connect `unpaired` snapshot. Subsequent read-only checks confirmed the
canonical resource and successful formal pairing. No Connector code change
or manual database repair was required.

## Site and connection verification

| Check | Site A | Site B |
| --- | --- | --- |
| Masked platform Site ID | `site_FxJE3...XBxA` | `site_ldlav...lZ6b` |
| Resource | `https://test.wpauto.cc/wp-json/wp-auto/mcp` | `https://test2.wpauto.cc/wp-json/wp-auto/mcp` |
| Platform and Connector status | active | active |
| Platform/connection/revocation-state Site ID match | true | true |
| Revocation state version | 2 | 2 |
| Last sequence | 2 | 0 |
| Grant deny markers | 2 | 0 |
| Token/key deny markers | 0/0 | 0/0 |
| deny_all | false | false |
| Pending local pairing | absent | absent |

The platform had exactly two active Sites, two distinct Site IDs, two distinct
resources, and one distinct Tenant. Site/connection comparison SHA-256 values
matched on both sides:

- Site A: `b8502eaf973dbc9feff82f6328abc45374bb5ded287b025aacac57a7cead18d3`.
- Site B: `e818f1b1ba88cbf2e39a5be93d7f87a12a88273f5406326df468ede0624e79b6`.

There was exactly one Site B platform pairing attempt, in active state. Its
initiating account matched the subject of the existing active Codex Grant.
Both connectors had the expected Control origin and issuer, and their Tenant
comparison hashes matched the platform records. Site B had zero OAuth Grants,
zero Outbox events, and no historical revocation state copied from Site A.
The lifecycle client still had zero live Grants.

## Existing authorization and history preservation

Codex Grant `grant_Q0YY...GETM` remained active with
`updated_at=2026-10-12 12:03:49.698212+00` and a null revocation reason.

Site A retained sequence 2 and exactly two Grant deny markers. The marker-set
comparison matched the hashes of the delivered sequence-1 and sequence-2 Grant
events from the prior G1/G2 tests. No token/key markers or deny_all appeared.

Outbox totals stayed at seven rows, four delivered. The digest of the ordered
non-sensitive metadata (ID, Site, sequence, reason, not_before, attempts,
delivered_at, and last_error_code) was identical before and after pairing:
`eac4bb5a2cf8f3913af5bb52a67d023a`. This includes the five old-Site history rows.
No event was modified, deleted, requeued, or manually marked delivered.

## Service, HTTPS, and resource checks

Control, Authorization, PostgreSQL, and both WordPress/MariaDB pairs were
healthy before and after pairing. All seven container OOM flags were false
and restart counts remained zero. Site A and Site B public login endpoints
returned HTTP 200 with TLS verification result 0. Production migrations
remained at 13, latest `013_email_otp_login.sql`.

The final resource collector produced six samples over 25 seconds. The
repository's `test`-stage evaluator returned `allowed=true`:

- Minimum/latest available memory: 1049.410 / 1131.043 MiB.
- Maximum observed Swap I/O: 0.273 MiB/s.
- Memory PSI some/full averages: zero throughout the sample window.
- Host OOM count: 174 before and after, with no new OOM.
- Disk available: 15340 MiB; inodes available: 3999519.
- No deployment conflicts, core restarts, or new container OOMs.

Occupied Swap and the historical OOM count remained non-blocking warnings.
This short observation establishes conditions during this acceptance window;
it does not assert indefinite capacity on the 4 GB VPS. Fixed Connector
installation and source HTTPS evidence are reused from the accepted P3-B2B
record. No service or plugin was deployed in this phase.

## Acceptance status and stop point

```text
P3_CORE_OAUTH_MCP_PASS=True
P3B2_SITE_B_DEPLOYED=True
P3B2_SITE_B_CONNECTOR_INSTALLED=True
P3B2_SITE_B_HTTPS_PASS=True
P3B2_SITE_B_PAIRED=True
P3B2_SITE_B_SEQUENCE=0
P3B2_SITE_B_DENY_MARKERS=0
P3B2_PRODUCTION_ISOLATION_TESTED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Formal pairing is complete. Dual-Site OAuth Grant/Token creation and the
cross-resource isolation matrix, Application Password testing, and eventual
temporary Site B cleanup require their separately scoped authorizations.
No migration 014, P4-A change, production deployment, Connector modification,
or unrelated-site action occurred. `design/` remained untracked and untouched.

This record contains control metadata only, with masked Site/Grant IDs and
comparison digests. It contains no password, key, Token, Cookie, verifier,
Proof, MCP input/output, or WordPress content.
