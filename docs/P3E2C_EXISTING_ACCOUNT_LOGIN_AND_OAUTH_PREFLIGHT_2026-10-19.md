# P3-E2C: existing-account login recovery and OAuth prerequisite checks

Date: 2026-10-19, Asia/Shanghai. **Existing-account login recovery PASS;
read-only prerequisite checks PASS; target Desktop GUI configuration NOT_RUN;
production OAuth/MCP NOT_RUN.**

## Authority and evidence separation

The operator approved E2C read-only preparation, then separately approved one
bounded OTP recovery using the original P3-D5 account, at most one email and no
resend, with immediate restoration of both sending protections. They confirmed
the browser was ready before the window, subsequently reported one send, then
confirmed receipt, login, refresh and the correct original account/workspace.
No email address, OTP, Cookie or credential was requested or collected.

Assistant direct evidence: platform read-only checks, public and direct-origin
HTTP checks, actual Desktop/backend identity and local compatibility probes,
plus the authorized platform recovery and final custody checks. WordPress
identity/NTP/backup evidence was returned by the operator from the reviewed
read-only command; it is not represented as assistant SSH access to that host.
Browser receipt/identity confirmation and database Session existence remain
separate evidence; no browser Session Token was extracted for comparison.

Prior PR85 metadata failure and PR86 repair history remain unchanged. PR86 was
verified Draft/unmerged at Head f19caef45e431b37c6d0a3130a07281d036359cf.
No WordPress Nginx/E2B rule, pairing, plugin, time source or production Client
registration was modified here. The sole temporary Nginx exception was the
separately authorized **platform OTP guard**, not the WordPress vhost.

## Fixed target and read-only gates

```text
WordPress: https://www.wepuu.com
Resource: https://www.wepuu.com/wp-json/wp-auto/mcp
Issuer: https://auth.wpauto.cc
Client: wepuu-e2e-codex
Future scope: mcp:read only
Reserved Desktop server: wepuu-p3e2a-wepuu (not added)
```

Platform checks at06:17:37.865055Z and06:43:26.173244Z confirmed the original
active account/Home Tenant/owner, expired Session, exact active Site and zero
target Grants. Existing observer visibility was checked; no RLS, role or
privilege was changed. Site/key digests matched E1K (Site235dc1100e44,
public materialbc675abdfbd7, kidc4da574d9692 prefixes only). Site A/current Codex
Grant/Connector, Site B history, prior Attempts and Outbox retained their
protected comparisons. No new Site, Attempt, Grant or Outbox was created.
Legacy checker fields newAttemptCount=1/newSiteCount=1 refer to historical E1K
additions against its older baseline, not new E2C records.

Five services were healthy, fixed startup/images and migration hashes remained
001-013+015/no014, OTP actual/persisted false, public/origin guards passing,
HMAC custody unchanged, budget99 before recovery. No new OOM was found.

Public metadata/Discovery at06:18:38.622Z and origin metadata at06:20:23.871Z:

| Check | Result |
| --- | --- |
| Advertised metadata path without slash | One allowed same-origin301 then200, both channels |
| Same path with slash | Direct200, both channels |
| Metadata contract | Exact resource, issuer, five frozen scopes and header-only Bearer |
| Unauthenticated MCP GET | 401 and matching metadata challenge, both channels |
| Authorization Discovery | Exact issuer, issuer identification, S256, code and public client supported |
| Existing Client | Active pre-registered Client; stable loopback path registered; two redirects, row digest unchanged |

Normal TLS verification, Host/SNI and the known origin address were retained.
No authenticated MCP initialization, alternative resource, cache purge or
production authorization request was used. Bodies were not saved. Existing
Discovery also advertises openid/offline_access and implicit/code/refresh grant
types; these are retained metadata, not requested permissions or a new change.

## WordPress time gate: stop preserved, natural update accepted

The first two operator runs stopped at time_sync. Plugin/identity checks passed
but sample38 was Ignored=yes, despite synchronized=yes, Offset-1.051ms and
Root distance36.277ms. No time/daemon/configuration change was made to force a
pass. The same sample was read again before the expected next polling time.

Upstream v249 prints Ignored from its spike flag and does not adjust the clock
from a flagged sample: [timedatectl source](https://github.com/systemd/systemd/blob/v249/src/timedate/timedatectl.c#L679-L688),
[timesyncd processing](https://github.com/systemd/systemd/blob/v249/src/timesync/timesyncd-manager.c#L506-L552).
This explains the strict sample gate, not an absolute clock fault or the cause
of every historical timeout. Distribution patch differences remain a limit.

The operator then observed natural sample39 at06:36:54Z, Ignored=no,
Offset-1.332ms, Root distance52.550ms, Leap normal, stratum3. Full read-only
preflight at06:42:22.018554Z passed with that stored sample, active/synchronized
daemon, exact source64.69.34.90, approved source lists and unchanged daemon
identity. No active NTP probe, service restart, time setting or source change.

Five conservative WordPress-PHP minus Control-reference intervals:

| Sample | Interval, seconds | Measurement window, ms |
| --- | --- | --- |
| 1 | [-1.099958, 1.900042] | 1166.760 |
| 2 | [-0.964675, 2.035325] | 1113.337 |
| 3 | [-0.816013, 1.183987] | 1143.261 |
| 4 | [-0.699632, 1.300368] | 1138.254 |
| 5 | [-0.542361, 1.457639] | 1139.019 |

Every interval contains0 and is inside[-3,+3]. Reference was TLS-verified
direct-origin HTTP Date with1000ms allowance per reading, not direct Node/FPM
measurement. PHP CLI was bracketed by host time; wall/monotonic difference was
2-3 microseconds. No claim of exact zero skew or historical failure-time skew.

The bounded journal summary covered current boot/last24h,42 entries without
truncation: one initial synchronization,36 timeout entries, zero recognized
clock/set failures and five other entries. Aggregate timeouts were not assigned
to the current source or deemed individually resolved; absence of recognized
clock failures does not prove no historical jump.

All789 plugin files matched the original ZIP manifest. Identity, active
connection, exact bindings, absent pending and zero local Grant mappings
matched the paired baseline; revocation v2/sequence0/deny_all=false/zero markers.
Final readback was unchanged; homepage and login HEAD returned200.
Inherited identityChanged=true describes the historical E1K replacement only.

## Backups and recovery preparation

Existing WordPress backup reverified for custody and recorded hashes:
`/root/wepuu-e1k-backup-20261018T135222Z-a931ba4ba8a7`.
Existing platform dump reverified in
`/opt/wpauto/backups/p3e1c/20261016T012328Z-QmANC0`, SHA-256
780cddefc54feae34ad842fb824b940d4db8a64b66b7a418b37a76f138b014e6.
Both predate the new paired identity/Site; neither is a current combined
recovery point. No new database export, restore or restore drill was performed.

New **platform configuration/helper/state** backup only:

```text
/opt/wpauto/backups/p3e2c-login/20261019T065237Z-LDifhj
```

Directory root-owned0700, files0600; regular-file custody/readback verified.
No plaintext configuration or private snapshots are submitted in this PR.

| Private backup file | SHA-256 |
| --- | --- |
| login.py | 3f05d463d74a7eba217bbcb08e7fccdf286569f820177670c49efa5276242cce |
| runtime.env | 2ba36de04cbb114cbcb9c3c717148e7175e53ffde97e280566c007574cee238a |
| guard.conf | 6485a5f0df233ed8ce8c48bf03cdcc6f6aea1be8684711abd44e3b3b48a87f9c |
| rollback.image | dee4a381eab487aab27713243f4149818e144ed80e2a588fc750adfbc44fb214 |
| initial.json | 857ef09b56ead607c722bd38752e63f6523b7bf1b49d96eef0c778e5eaeed738 |

The recovery extension reused hash-pinned E1K/E1D helpers and the accepted
pairing reader. A separate full read-only checker validated E1K additions
before the legacy pre-pairing guard saw its old Site projection; real current
rows were retained in the recovery snapshot and protected by before/after
comparisons. No real row or permission was rewritten to satisfy an old gate.
The extension kept resend denied and made restoration idempotent so a second
restore could not overwrite the pre-rebuild sending metrics snapshot.

## Single email, immediate protection restoration and login

Independent server-side systemd recovery used OnActiveSec=5min and a monotonic
deadline. A watcher closed ingress on the first new reservation, never sent
mail, and restored the application flag under the deployment lock. Both ran
independently of the assistant/SSH session. Guard was fully closed while the
same Control image was recreated with sending enabled; only then was send
opened. Resend remained configured503 and raw auth remained configured404.

| Event | UTC |
| --- | --- |
| Window opened | 06:53:44.047879Z |
| Guard confirmed restored by | 06:54:39.227355Z |
| Application false/healthy restoration completed | 06:54:46.622482Z |
| Independent maximum deadline | 06:58:27.089591Z |
| Valid original Session direct recheck | 06:55:59.557983Z |
| Full platform/Session postcheck | 06:56:09.063567Z |

Ingress was confirmed closed within55.2seconds of opening, before the maximum
deadline and without waiting for browser login. Only Control was normally
recreated to true and then false; no image was rebuilt/pulled/published or code
rolled back. Other four container IDs/images/start times remained unchanged.

Actual new reservations1, Provider calls1, outcome accepted1. Pre-disable
metrics snapshot: attempt1/accepted1; rejected0/unknown0/storage_failed0; all
rate-limit dimensions0. Rolling budget99→98; retained reservations1→2.
No expired records were removed in this run, no non-expired history changed,
and no quota refund/reset or HMAC rotation occurred. Counters were captured
before the closing Control recreation reset process-local counters.

Operator confirmed inbox receipt and successful original-account login with
refresh/correct workspace. Direct metadata checks confirmed an unexpired
Session, original owner and unchanged canonical account/Home Tenant identities;
no new account/Tenant was created. Provider accepted is distinct from inbox
receipt. Resend Dashboard delivered/complaint status was **NOT_RUN** here;
neither accepted nor operator receipt is presented as Dashboard evidence.

Final guard content/runtime bytes/rollback reference matched backups. Public
and origin send/resend503 and raw auth404 were verified without email input.
Actual/persisted flag false, HMAC unchanged, five healthy, no new OOM;
MemAvailable928440KiB/full-memory avg10=0 at the platform postcheck. All business
Site/Grant/Attempt/Outbox comparisons and Site A Connector passed. Control
identity changed as expected; containerIdentitiesUnchanged in the reused
read-only checker means within that checkpoint, not across the whole recovery.

Temporary timer/service files were removed and timer, restore and watch units
were independently confirmed inactive. Private backups and legitimate OTP
records remain; no broad cleanup or credential removal was done.

Runtime images and direct Control entry remained:

```text
Control: ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e
Authorization: ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742
Control command: node apps/control-api/dist/main.js
```

## Desktop compatibility: static PASS is not GUI/OAuth PASS

OpenAI Docs was used to verify current scope/callback semantics. Official
guidance notes scope selection from server metadata and issuer-dependent
callback selection: [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp).
These docs do not replace actual executable/configuration evidence.

Actual running GUI path and package manifest: OpenAI.Codex26.1013.4894.0,
whose GUI executable is named ChatGPT.exe. Actual backend:
codex-cli0.163.0-alpha.10.2, SHA-256
f6dbf48cb70f62649c645f26c87dc9bf84cc36986202dfad8e12fb5b8ca70312.
Appx inventory was unavailable/access-denied, so process paths and manifest
were used instead of claiming inventory success or choosing another backend.

Read-only config/read found the target entry absent from enabled/project/user
layers. No project config, global entry, trust change, Bearer header or client
secret was added. Actual target GUI loading is therefore **NOT_RUN**.

Fresh localhost-only probes in an isolated CODEX_HOME mirrored all five
resource scopes and the real AS openid/offline_access advertisement. Both
omitted and explicit login-scope modes generated only mcp:read, code/S256,
exact mock resource and stable loopback/callback with a listener port. Six
requests reached only mock metadata; zero unexpected requests, no browser
authorization submission or token exchange and no real credential-store access.
This is **isolated backend compatibility**, not GUI loading or production OAuth.
Neither a callback extension nor a new Client/DCR registration was attempted.

## Validation, delivery and stop

Local execution:18 retained Desktop tests,19 read-only helper tests,
13 synthetic E2C metadata/discovery/error-filtering cases,14 retained recovery
tests and8 new extension restore/custody/monotonic/send-only tests PASS. Two
new exact-backend mock variants also passed. WordPress command transport was
round-trip hash-verified before operator execution. No safety check or TLS
verification was disabled to turn an incomplete result green.

This independent branch adds this document only, preserving original dirty
files and design/. Hosted CI/current Head are linked in the Draft PR and final
handoff; CI does not substitute for operator/production evidence. No PR is
merged, and no production runtime change is proposed by the document commit.

The complete E2A gate is deliberately not marked PASS: target project definition
and actual GUI loading still require separately authorized preparation. A later
single Desktop OAuth/Consent/PKCE and site-health acceptance remains separately
gated. Session validity is a timestamped result, not a guarantee of later validity.

```text
P3E2C_EXISTING_ACCOUNT_SESSION_VALID=True
P3E2C_EXISTING_ACCOUNT_LOGIN_RECOVERED=True
P3E2C_READONLY_PREFLIGHT_PASS=True
P3E2A_PREFLIGHT_PASS=False
P3E2A_TARGET_DESKTOP_GUI_CONFIG_LOADED=NOT_RUN

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

Stop after the Draft PR/CI handoff. No OAuth, MCP, pairing, WordPress write,
schema migration, new image deployment or public registration is authorized.
