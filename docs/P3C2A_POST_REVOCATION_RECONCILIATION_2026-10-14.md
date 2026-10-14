# P3-C2A: post-revocation reconciliation and Site A recovery handoff

## Result and scope

The operator reported revoking both Sites after manually using the platform
Grant list. Authoritative read-only checks on 2026-10-14 establish that **both
platform Sites and both Connector connections remain active**. Three business
Grants were revoked: the original protected Codex Grant and the two lifecycle
test Grants. All three corresponding Grant events were delivered and their
deny markers exist at the intended Connectors.

The original Codex Grant preservation condition failed. This is not a successful
completion of the original P3-C2A cleanup contract. Site B has not undergone
platform Site Disconnect or local Connector disconnect. No restoration, new
Consent, pairing, Grant creation or further revocation was submitted by the
agent during this reconciliation. Site B resources remain online and retained.

The execution branch starts at main `85d013716fd67bbc394db30315847e0e320fc365`.
The GitHub connector confirmed the same remote main. Historical P3-B2/P3-B3
production acceptance remains unchanged; it describes the earlier tested state,
not continued validity of the now-revoked Codex authorization.

## Evidence and identity checks

The screenshot shows client labels and revoked statuses, without Site/resource
bindings. It was treated as a report requiring verification, not as proof that
either Site was disconnected or that the intended Grant alone changed.

After the operator restored the existing PuTTY/SSH access, a read-only database
transaction selected Site/Grant/Outbox metadata. A separate in-memory comparison
read the verified pre-action archive without restoring it:

`/opt/wpauto/backups/pre-p3c2a/20261014T120601Z/postgres.dump`

SHA-256:
`5c9c49ac6155ee64a4b9421367579387312b7895ba097fba4de9e9109fa68d40`.

For all three target Grants, complete IDs and stable account/Tenant/Client/Site/
scope bindings matched the archive. The Codex ID also matched the protected
`grant_Q0YY...GETM` pattern. Identity was not inferred solely from abbreviated
hashes. All seven pre-existing Outbox rows were compared as complete COPY rows
and matched the pre-action archive exactly.

Only hashes, statuses, times and control metadata were emitted. No artifact
payloads, private keys, credentials, Token values or WordPress content were read
or included in the record.

## Actual Grant changes and delivered events

All three Grants changed from active to revoked with
`revocation_reason=platform_user_revoked`. Bindings and complete IDs were retained.
Times below are UTC.

| Target / Grant SHA-256 prefix | Revoked at | Outbox ID / sequence | Delivered at |
|---|---|---|---|
| A original Codex / `721b22f53cda` | 13:32:18.731416 | 8 / A:3 | 13:32:23.723080 |
| A lifecycle / `623c362c435d` | 13:32:21.125824 | 9 / A:4 | 13:32:25.033376 |
| B lifecycle / `f1f54908e651` | 13:32:23.299077 | 10 / B:1 | 13:32:27.691877 |

Each event is `event_type=grant`, reason `platform_user_revoked`, attempts 1,
with non-null `delivered_at` and null `last_error_code`. No new Site event exists.
The old Codex `updated_at=2026-10-12T12:03:49.698212+00:00` baseline no longer
holds: its update/revocation time is now the first row above. A later replacement
Grant cannot make the original preservation result true.

## Platform and Connector state

| Field | Site A | Site B |
|---|---|---|
| Resource host | `test.wpauto.cc` | `test2.wpauto.cc` |
| Site SHA-256 prefix | `b8502eaf973d` | `e818f1b1ba88` |
| Platform Site | active | active |
| Connector connection | active | active |
| Connection/Connector Site ID match | true | true |
| Revocation state | v2 | v2 |
| Last sequence | 4 | 1 |
| Grant deny-marker count | 4 | 1 |
| `deny_all` | false | false |
| Pending pairing | absent | absent |

A retains both original G1/G2 deny markers and now contains the exact original
Codex and A lifecycle markers. B contains its exact lifecycle marker and none
of A's markers. Marker-set digests:

- A: `4a13ba5b2d180a9b06e1e38e7df7d8ed80ea9808854a10e76c781b6f2dee0d48`.
- B: `631d0658d6cbe9b51b3ae0ba12773b10b0e61990c6c091eb937b40ef08f11ccf`.

These are delivery/state observations, not a new live-Token revocation acceptance
test. No old Token was fetched or replayed. Sequence must follow actual events;
the original expected A:3/B:0 cleanup baseline is no longer applicable.

## Services, resources and migration boundary

All seven WPAuto/Site A/Site B containers were healthy, OOM flags false and
restart counts zero. Existing memory limits remain Control/Authorization 256 MiB,
PostgreSQL/MariaDB 384 MiB, WordPress 512 MiB.

Authorization remains:
`ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.
Control remains:
`ghcr.io/wepuu/wp-auto-control@sha256:3a4eed82715339076947aaa9ada0a8a065b1784041bc2f4c353d79f8a3d6038f`.
The applied migration list contains exactly 13 entries, 001 through
`013_email_otp_login.sql`; no 014 was applied by this work.
Public Authorization readiness and Site B `/wp-login.php` each returned HTTP
200 with TLS verification result 0 after the backup. No authenticated MCP
request or OAuth authorization was used for these reachability checks.

The existing six-sample resource evaluator returned `allowed=true`: minimum
MemAvailable 988.621 MiB, latest 1033.117 MiB; memory PSI some/full remained zero,
maximum sampled Swap I/O 0.245 MiB/s, host OOM count stable at 174, and all seven
container OOM/restart deltas zero. Available disk was 15014 MiB. Occupied Swap
and historical OOM count were warnings, not newly observed failures.

## New post-action backup

`/opt/wpauto/backups/pre-p3c2a-reconciliation/20261014T135259Z/postgres.dump`

- PostgreSQL custom format, 189408 bytes, root:root, mode 0600; parent mode 0700.
- SHA-256: `4fe69e9f67b504b6fe1e6c7b63083ec328bdd5919e2ec3dcc3a489769d91d524`.
- Recomputed checksum and container `pg_restore -l` passed.
- `SHA256SUMS` retained with protected permissions.
- No database restore occurred. Archive readability is not an isolated restore
  test, and this new archive records the post-revocation state.

Initial connection attempts were denied until the operator restored access.
Two read-only diagnostic wrappers needed corrections: explicit `pg_restore -f -`
for SQL output and CRLF normalization for the existing Bash sampler. Both then
succeeded. No failed wrapper was a database restore, OAuth retry or service
change, and no exception was treated as production PASS.

## Concrete next operations and boundaries

1. Restore Site A authorization first, after explicit approval for the newly
   required OAuth operation. Keep its current active Site ID and pairing. Use
   `wepuu-e2e-codex`, the original account/Tenant, exact Site A resource and
   `mcp:read`; execute one normal Local/WePuu Consent and PKCE flow to create a
   **new** business Grant. Migration 004 permits this because the old Grant is
   revoked. Do not alter the old Grant, its deny marker or Provider artifacts.
2. Verify the new Grant is active and distinct, with correct RS256/issuer/
   audience/Site/Grant/scope bindings and direct MCP initialize, frozen 23-tool
   catalog and site-health success. If using the existing acceptance runner,
   select `--mode positive-rotation` explicitly; default `normal` also revokes
   and is unsuitable. Do not repeat G1/G2. Targeted Desktop re-login, if needed,
   requires the reviewed exact callback/config and no broad credential cleanup.
3. After Site A is usable and the protected-object deviation is accepted,
   resume the previously authorized Site B platform Disconnect. Its lifecycle
   Grant is already revoked; do not revoke it again. With no intervening event,
   the new Site event would be B sequence 2. Observe the actual value instead of
   forcing it. Verify delivery while B remains connected, then perform its normal
   local Connector disconnect. No manual Outbox edits or retries are permitted.
4. If any Site event is not delivered, retain the online resources and report
   its fixed error/status. Never mark delivery successful based only on a
   revoked Grant or disconnected UI state.
5. Resource deletion remains a separate P3-C2B authorization. Retain the exact
   `wpauto-wordpress-e2e-b` project and `/opt/wpauto-wordpress-e2e-b`, its two
   containers, `wpauto_wordpress_e2e_b_database`/`wpauto_wordpress_e2e_b_files`
   volumes and `wpauto_wordpress_e2e_b_internal` network (`172.30.52.0/24`).
   Retain the dedicated `test2.wpauto.cc.conf` vhost and certificate directory,
   and check actual DNS ownership before any future removal. Shared/wildcard
   DNS, certificates and Site A resources are not deletion targets.

The current phase stops after reconciliation, backup and evidence preparation.
There is no migration, deployment, Connector modification, Site B deletion,
database repair, new OAuth run or automated credential cleanup.

The retained Site B identities were re-read and matched the deployment ledger:

- WordPress container: `16f4661588c8e1468a8195cba34bd284558f1ac4eaf4ebe4c909c3e3935d4831`.
- MariaDB container: `fe7d9f0ab8fef52d8787facad145fde92b3833ee3f2f1e4f4fc3febd357b5524`.
- Both have Compose project label `wpauto-wordpress-e2e-b` and the expected
  dedicated WordPress/database volume mounts.
- Network: `e93732b833b7a7c2dedac7c94e4824f957bdabb46871748f353a5a5f51d96c95`.
- Dedicated vhost: `/www/server/panel/vhost/nginx/test2.wpauto.cc.conf`.
- Dedicated certificate directory:
  `/www/server/panel/vhost/letsencrypt/test2.wpauto.cc`.

No DNS ownership was re-inspected during reconciliation, and no DNS deletion
target is inferred from these filesystem/network observations.

## Status

```text
P3C2A_POST_ACTION_STATE_VERIFIED=True
P3C2A_TEST_GRANTS_REVOKED=True
P3C2A_OBSERVED_GRANT_EVENTS_DELIVERED=True
P3C2A_SITE_A_CODEX_GRANT_PRESERVED=False
P3C2A_SITE_B_DISCONNECTED=False
P3C2A_REVOCATION_EVENTS_DELIVERED=False
P3C2A_COMPLETE=False
P3_CORE_OAUTH_MCP_PASS=True
P3B2_SITE_ISOLATION_PASS=True
P3B3_APPLICATION_PASSWORD_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

`P3C2A_REVOCATION_EVENTS_DELIVERED=False` means the full requested cleanup
sequence is incomplete: Site B's required Site event has not been created or
delivered. It does not contradict successful delivery of the three observed
Grant events. Historic acceptance booleans remain historic evidence; they do
not imply that the revoked original Codex Grant is currently usable.

This change adds only this record. `design/` remains untracked and untouched.
