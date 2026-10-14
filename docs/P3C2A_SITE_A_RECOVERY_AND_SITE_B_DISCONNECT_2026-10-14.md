# P3-C2A: Site A recovery and Site B disconnect checkpoint

## Scope and result

This record captures the separately authorized Site A pairing/OAuth recovery
and Site B's platform and local Connector disconnect. Both disconnects are
verified; Site B infrastructure and its historical platform records remain
retained and have not been deleted.

The new Site A pairing and positive OAuth recovery passed on 2026-10-14. The
existing Site A test account and Tenant were used through the normal pairing,
Consent, Authorization Code + PKCE, RS256 token, MCP and Refresh flows. The
new Codex Grant is active with `mcp:read`. The prior Codex Grant remains
revoked; it was not restored.

The reviewed runner was the production OAuth script from main
`85d013716fd67bbc394db30315847e0e320fc365`, SHA-256
`33b7b0a343e2d6b984fcc8c65b89b8473805fd631842f7a522a981dc8e54d2a6`.
The run used `positive-rotation` and passed issuer, state, account/resource
binding, PKCE S256, RS256, MCP initialization, the exact 23-tool catalogue,
site health, normal R0-to-R1 rotation, and MCP access with the rotated access
token. No Replay or RFC 7009 Revocation request was made.

## Site A recovery evidence

- New active Site A resource:
  `https://test.wpauto.cc/wp-json/wp-auto/mcp`
- New Site ID SHA-256:
  `23af9c00adf6691d117618fe60f6d9be5c10a9c40e21389e2e0a4ada960b0ee0`
- New active Codex Grant SHA-256:
  `a290a8dc95c3870f1a2015d35404d584a3a53e4f076e4fd0adb802c209f9a64e`
- Grant scope: `mcp:read`; revocation reason: none.
- Site A Connector state: v2, sequence 0, zero grant deny markers,
  `deny_all=false`; its state Site ID matched the active platform Site.
- The prior Site A Site ID remains revoked. Its sequence-5
  `site_disconnected` event remains undelivered with `http.401`; it was not
  modified or requeued.

## Site B pre-disconnect checkpoint

The latest read-only query found Site B active at
`https://test2.wpauto.cc/wp-json/wp-auto/mcp`, Site ID SHA-256
`e818f1b1ba88cbf2e39a5be93d7f87a12a88273f5406326df468ede0624e79b6`, in the
same Tenant as the new Site A. Its only lifecycle Grant has SHA-256
`f1f54908e651f294912063c07ed660b0f452c696a7cf3aebd0e5311f9e7650ab`, is
already revoked with `platform_user_revoked`, and has no live Grant remaining.
The existing sequence-1 Grant event is delivered. Site B Connector state is
v2, sequence 1, one grant deny marker, and `deny_all=false`.

The platform currently has two active Sites: the newly paired Site A and Site
B. The original Codex Grant remains revoked. The new Site A Codex Grant remains
active with `updated_at=2026-10-14T15:06:19.849847Z`.

The full Outbox digest at this checkpoint is
`9445a319312709cca55aca6a40f6027fd09776e5c9fd7091c4a74a29abab8cd1`.
It differs from the pre-OAuth recovery digest
`2484ed75ef54a8db6536f987df6e4fdb38864d69a7f8238fef819613ee1b42e2`.
The current read-only query shows the old Site A sequence-5 event at 10
attempts with `http.401`; the earlier checkpoint did not retain a row-level
snapshot sufficient to attribute the aggregate digest difference. No manual
Outbox operation was performed.

## Backup before Site B disconnect

- PostgreSQL custom-format backup:
  `/opt/wpauto/backups/pre-site-b-disconnect/20261014T151709Z/postgres.dump`
- SHA-256:
  `724b2bf0c2c69606d19f89822b1b7567abdbf978c4c99f79d8efef84947c2bad`
- Owner/mode: `root:root`, `0600`; directory: `root:root`, `0700`.
- SHA-256 verification and `pg_restore -l` in the PostgreSQL container passed.
- This backup is for recovery evidence only; no restore was performed.

## Site B platform disconnect

After the pre-disconnect backup, the operator submitted the normal platform
Disconnect for the exact Site B resource. A read-only postcheck confirmed:

- Site B is revoked; the platform has one active Site (the recovered Site A).
- Site B's site-level revocation event is sequence 2, reason
  `site_disconnected`, and was delivered successfully. It was created at
  `2026-10-14T15:20:21.352662Z` and delivered at
  `2026-10-14T15:20:24.593737Z` after one attempt, with no delivery error.
- Site B's earlier sequence-1 Grant revocation event remains delivered.
- The lifecycle Grant remains revoked; no Grant or Outbox row was manually
  changed.
- The new Site A Codex Grant remains active with the same ID digest and
  `updated_at=2026-10-14T15:06:19.849847Z`.
- Site B WordPress and MariaDB remain online. The Connector's local Disconnect
  has not yet been confirmed.

## Site B local Connector disconnect

After the operator confirmed the local Disconnect in the Site B Connector UI,
a one-shot read-only WP-CLI inspection confirmed that
`wp_auto_connector_platform_connection` is absent. The retained revocation
state is v2, sequence 2, with one grant deny marker and `deny_all=true` from
the delivered site-level disconnect event. No Site ID, credential, or option
payload was emitted by the inspection.

Read-only postchecks confirmed:

- Site A is the sole active platform Site; Site B is revoked.
- The Site A Codex Grant still matches its recorded active-state,
  `updated_at=2026-10-14T15:06:19.849847Z`, and empty revocation-reason
  baseline.
- There are no live lifecycle Grants on either resource; the Site B lifecycle
  Grant remains revoked.
- Site B has two Outbox events, both delivered; its site-level
  `site_disconnected` event is delivered at sequence 2. No Outbox rows were
  changed manually.
- Site A Connector remains active with revocation state v2, sequence 0, zero
  grant deny markers, and `deny_all=false`.
- Authorization, Control, PostgreSQL, and both Sites' WordPress/MariaDB
  containers are healthy. Applied migrations remain 001 through 013.
- All seven relevant containers report running/healthy, `OOMKilled=false`, and
  restart count 0. The host sample showed 1062 MiB MemAvailable and 2637 MiB
  Swap used; memory PSI avg10/avg60 were 0.00 for both `some` and `full`, with
  no new OOM or container restart observed.

No Site B infrastructure or historical platform records were removed.

## Current stop point

At the latest postcheck, all seven core, Site A, and Site B containers were
healthy, with no OOM kills or container restarts. The Authorization image was
`ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.
The database still has migrations 001 through 013.

The platform Disconnect, event delivery, and the operator's local Site B
Connector Disconnect are complete and verified. Do not submit another
platform Disconnect. Site B infrastructure remains available but locally
unpaired; preserve all Site B data unless separately authorized.

No Site B container, database, volume, network, WordPress files, vhost,
certificate, DNS record, platform history, or Outbox row has been deleted.
Infrastructure removal requires a separate explicit approval.

```text
SITE_A_OPERATIONAL_RECOVERY_PASS=True
SITE_B_PLATFORM_DISCONNECTED=True
SITE_B_CONNECTOR_DISCONNECTED=True
P3B2_SITE_ISOLATION_PASS=True
P3B3_APPLICATION_PASSWORD_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

