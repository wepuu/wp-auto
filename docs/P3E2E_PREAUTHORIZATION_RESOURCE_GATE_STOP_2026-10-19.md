# P3-E2E: pre-authorization resource gate stop

Date: 2026-10-19, Asia/Shanghai. **Stopped before enable and OAuth.**
This records a successful initial platform check, operator-returned WordPress
checks, and a later failed resource gate. Subsequent resource observations do
not erase the failed gate or establish complete readiness.

## Scope, authority and unchanged configuration

The operator requested implementation of E2E with a fresh approval gate after
successful preflight. They confirmed both the original P3-D5 account/workspace
and WordPress local user remained logged in, and returned the existing reviewed
WordPress read-only reader output. The later explicit enable/OAuth approval was
not requested or obtained because the final platform gate failed.

No target enable, Desktop reload/restart, Authenticate, Consent, code/token
exchange, MCP initialize/list/tool call, credential-store inspection, pairing,
mail, time/network change, database write or production deployment occurred.
Only read-only checks and local evidence/document files were produced.

The target project file remained 349 bytes, SHA-256:

```text
00610c38465e25c1b90adf21108581f95f78fe50174156eecea1e6cf231ed139
```

It retains wepuu-p3e2a-wepuu, exact resource
https://www.wepuu.com/wp-json/wp-auto/mcp, client wepuu-e2e-codex,
scope mcp:read, loopback /callback, prompt approval and enabled=false.
No rollback was required. The local configuration is not part of this PR.

Desktop/backend remain OpenAI.Codex26.1013.4894.0 and
codex-cli0.163.0-alpha.10.2, backend SHA-256
f6dbf48cb70f62649c645f26c87dc9bf84cc36986202dfad8e12fb5b8ca70312.
Direct app-server config/read confirmed the readable project layer, exactly one
target definition, no same-resource conflict and the exact disabled definition.
Its IPC initialization is not a target MCP initialize.

The user-level file/node_repl definition had changed since E2D. That unrelated
state was not reverted: its current file hash was
8e6aea6411c0e9a296b0f8dffe7ab8c0933db451ca759468d8da0f205b3651a0
at both current inventories. No target override was present. Original dirty
files and design/ were preserved.

## Checks completed before the stop

Assistant-direct platform check at16:31:52 confirmed the original account,
Home Tenant and owner mapping, a valid Session, the exact paired Site with zero
Grants, historical Attempts, unchanged Site A/its Codex Grant/Connector and
Outbox, five healthy services, fixed images/direct startup, migration hashes
001-013+015/no014, HMAC custody and actual/persisted OTP false with public/origin
guards. The checker used read-only database options and confirmed SELECT
visibility without altering RLS/permissions. Budget remaining was98.
Legacy newAttemptCount=1/newSiteCount=1 refer to historical E1K pairing, not
new E2E additions.

At16:32, public and TLS-verified direct-origin Metadata checks passed: no-slash
same-origin301 then200, slash direct200, exact resource/issuer/five frozen
scopes/header-only Bearer; unauthenticated MCP returned401 with the expected
challenge. Discovery retained issuer identification, code/S256 and public
client support. Existing pre-registered Client retained its two redirects,
stable callback and unchanged row/metadata digests. Existing platform backup
hash/custody passed; no new database backup was made.

Operator WordPress evidence started16:43:54 and completed its normal bounded
reader flow. This is operator-returned evidence, not assistant SSH to WordPress:

- All789 plugin files match the accepted ZIP manifest.
- Identity/Site/resource/Tenant/platform key bindings match E1K; local active,
  no pending, zero local Grant mappings; v2/sequence0/deny_all=false/zero markers.
- timesyncd remains synchronized with64.69.34.90, accepted stored sample42,
  Ignored=no, Leap normal, offset+0.155ms, root distance32.752ms.
- Existing E1K backup custody/hashes pass. It predates the current identity and
  is not a current combined recovery point; no restore or new backup occurred.
- Homepage/login HEAD200; local state unchanged during checks.
- Bounded journal:26 entries,20 timeouts, zero recognized clock/set-failure
  events. These counts do not establish absence of historical clock jumps or
  attribute every timeout to the current source.

Five conservative PHP-minus-Control reference intervals:

| Sample | Interval, seconds | Measurement window, ms |
| --- | --- | --- |
| 1 | [-1.250981, 1.749019] | 1191.191 |
| 2 | [-1.102231, 1.897769] | 1113.364 |
| 3 | [-0.951649, 2.048351] | 1188.648 |
| 4 | [-0.797707, 1.202293] | 1141.863 |
| 5 | [-0.635269, 1.364731] | 1137.972 |

All contain0 and lie inside[-3,+3]. Reference is TLS-verified direct-origin
HTTP Date with1000ms allowance per reading, not direct Node/FPM measurement.
The reader's historical identityChanged=true refers to E1K, not an E2E reset.

## Final failed gate and read-only follow-up

At16:45:18 the final platform check returned:

```text
stage=runtime_protections
category=RESOURCE_PRESSURE
```

The retained gate requires MemAvailable>=524288KiB and memory full avg10<1.
The failure result did not retain the individual instantaneous measurements;
which threshold failed is therefore NOT_CONFIRMED. No threshold was relaxed.
Later gate stages, including the final Session requirement/binding return, were
not completed. Earlier PASS is not substituted for this failed final gate.

One bounded read-only follow-up observed:

| Time (Asia/Shanghai) | MemAvailable KiB | Memory full avg10 | Existing numeric gate |
| --- | ---: | ---: | --- |
| 16:46:14 | 1344200 | 0.20 | PASS |
| 16:46:24 | 1294920 | 0.19 | PASS |
| 16:46:34 | 1238356 | 0.79 | PASS |

These three samples show later values within threshold, not a confirmed root
cause, durable stability or a successful rerun of the full preflight.
No memory tuning, process termination, swap change or service restart occurred.

The first diagnostic's container snapshot was NOT_CONFIRMED because two names
did not match the existing deployment; this was not a reported container health
failure. A separate read-only snapshot using the retained deployment's exact
names at16:47:33 confirmed all five running/healthy, OOMKilled=false and
RestartCount=0. It did not rerun or bypass the resource gate. Container OOM flags
are not an assertion that the host has never had an OOM.

Final Desktop config inventory at16:45:21 still confirmed enabled=false and
unchanged target/user configuration relative to this stage's first inventory.

## Validation, delivery and next gate

Local synthetic validation passed27 configuration cases plus13 metadata/error
filtering scenarios. These cover exact single-field enable, original drift,
Scope/secret mismatch, duplicates, trust/backend changes, user/other-server
preservation, non-regular files, failed-disable concurrency and no credential
cleanup. No production OAuth was used to validate helpers. Historical output
directories were not overwritten; E2E receipts use separate timestamps.

This independent docs-only branch starts from main
e8778da33d850303d1ccbdfbebf088610bf6ac5f. Hosted CI/immutable Head are recorded
in its Draft PR; CI cannot replace production checks. No WordPress content,
raw logs, credentials, Proof, Token, full user IDs or authorization URLs are
included. No PR is merged.

```text
P3E2E_PREFLIGHT_STOP_REASON=RESOURCE_PRESSURE
P3E2E_WORDPRESS_READONLY_PREFLIGHT_PASS=True
P3E2E_DESKTOP_DISABLED_CONFIG_VERIFIED=True
P3E2E_DESKTOP_ENABLE_PERFORMED=False
P3E2E_DESKTOP_ENABLED_CONFIG_PASS=NOT_RUN
P3E2E_DESKTOP_RUNTIME_CONNECTED=NOT_RUN
P3E2E_FAILURE_DISABLED_RESTORED=NOT_APPLICABLE
P3E2A_PREFLIGHT_PASS=False
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3E2_NEW_SITE_GRANT_ACTIVE=False
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=True
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Grant/mail/business protection results are timestamped at the successful early
platform check, not newly claimed from the later resource-only diagnostic.
Stop with the definition disabled. A later continuation needs a fresh complete
preflight after the resource condition is understood or shown stable; if it
passes, report it and obtain the plan's explicit enable/single-OAuth/single-tool
approval. Session validity must be checked again without opening OTP. No
automatic repair, threshold change, retry, production authorization or tool
call follows from the later numeric observations.
