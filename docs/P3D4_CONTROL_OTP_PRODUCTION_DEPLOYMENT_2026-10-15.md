# P3-D4: Control OTP hotfix production deployment — sends paused

Date: 2026-10-15. The operator explicitly authorized P3-D4 publication,
backup/restore validation, send guard, selective 015 and Control-only deployment
in the chat body after the initial execution-review block. Deployment and
bounded health/security checks passed. This is NOT real-email/onboarding
acceptance, a public launch, or permission to remove the send guard.

## Artifact verification

PR #70 remains Draft/unmerged at ecacb7999004a6e74ebb5163ff337de4a12b5508.
CI 38699757640 succeeded. Image artifact 11955506837 and manifest 11956096306
are unexpired, expiring around 2026-10-22 15:37 Asia/Shanghai.
The retained archive SHA-256 matches
fb41bc30a1aa9381be8161fdcb91e6262f7c6a5cbf98fa750998b5a09aa51c3d.
Approved config/Image ID remains
sha256:5db506d0a488e24410796dbe9ec5577963dcca01121d2b46de46f95b3e1d235a.
The final original artifact was published without rebuilding; see below.

## Read-only VPS preflight

Checks starting approximately 2026-10-15 20:00 Asia/Shanghai confirmed:

- Exact old Control reference:
  ghcr.io/wepuu/wp-auto-control@sha256:3a4eed82715339076947aaa9ada0a8a065b1784041bc2f4c353d79f8a3d6038f.
- Authorization reference unchanged:
  ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742.
- Five scoped services running/healthy, OOM flags false, restart counts zero.
  Unrelated VPS workloads were not inspected beyond name/health inventory or changed.
- Migrations exactly 001–013; all thirteen hashes match the candidate's fixed
  manifest. No 014/015 ledger entry or auth.otp_send_reservations table.
- One active Site A; current replacement Codex Grant remains active with
  updated_at 2026-10-14T15:06:19.849847Z and no revocation reason. Its SHA-256
  prefix is a290a8dc95c3; revoked original Grant is not the current baseline.
- No live lifecycle Grant. Site B revoked; both corresponding Outbox events
  delivered. Active Site has zero undelivered events; historical terminal
  delivery failures including old sequence-5 http.401 retained.
- Connector active, v2, sequence 0, Site ID hash matches platform, revocation
  state hash retained for future comparison; no state mutation requested.
- Samples showed roughly 1.1–1.2 GiB MemAvailable, low memory PSI, no sustained
  severe paging in the short vmstat sample. Historical oom_kill count 174 was
  unchanged. Disk available about 14.9 GB, inode availability ample. This does
  not replace a fresh sample before a future restore/deploy.
- HMAC file and P3-D override did not exist. Compose version 5.5.0.
- Actual /opt/wpauto/bin/deploy-service SHA-256 matches repository script:
  b1e8fc2a93d2c107a6198df776c4a2b7f54e05f6b219373501597e2dc049bcdc.
- Base Compose SHA-256:
  98b06b187c0dde90b0a40e3939f4442b3133086944b5d8a48b3864174601a941.
- auth vhost SHA-256:
  f44e9086951b488c5763f3d9adfd516cc8fad51ac7a4954df2fb4bdaccb57656.

Two initial read-only helper queries failed due to bigint hashing and an
incorrect assumed Outbox status column. They were corrected to id::text and
delivered_at using the reviewed schema. These were diagnostic-query errors,
not application failures, migrations or authorization retries.

## Initial publication stop (retained history)

A dedicated unmerged workflow branch was prepared at commit 174711a to load
and publish only the original Control archive. It contains no image build or
Authorization publication. Read-only GitHub inspection confirmed this scope.

The workflow-dispatch command was blocked by execution auto-review before it
ran. A same-command review request with the verified scope was also rejected:
the reviewer did not consider current trusted authorization sufficient for this
P3-D4 registry publication. No alternate API, host or indirect route was used.
GitHub run inventory for this publication branch was empty after the first
block. No publication command was executed by the agent.

The operator subsequently supplied explicit chat-body approval for the exact
P3-D4 publication, backup, send guard, selective migration, Control-only deploy
and sanitized Draft PR. Fresh production baseline checks passed before action.

At that earlier stop, no backup, key/config, ingress, migration or deployment
had occurred and sending was not paused. That snapshot is historical, not the
final production state below.

## Original archive publication

Only the unmerged single-Control publication workflow was executed. The
publication branch commit 174711a is not merged to main and is not a new runtime
build. First dispatch attempt failed an initial GitHub API GET with network
EOF; run inventory confirmed zero runs. A metadata/dispatch retry started
[38733299978](https://github.com/wepuu/wp-auto/actions/runs/38733299978), which
succeeded. No image build or Authorization push was performed.

- Approved source Head: ecacb7999004a6e74ebb5163ff337de4a12b5508.
- Synthetic CI source commit: 2b1474dd3b2d892df1f5d89e2fcafdde02884ff2.
- Source Tree: 38bc13da5bf08b3d44f8d2ff4bba25961b2d9c9a.
- Original Image ID/config digest:
  sha256:5db506d0a488e24410796dbe9ec5577963dcca01121d2b46de46f95b3e1d235a.
- New Registry reference:
  ghcr.io/wepuu/wp-auto-control@sha256:7c7308a6064740f9f732d2fb12a8f4c4c9dd3fd284edd26cea09df79b976c8fe.
- Unique tag: p3d1-hotfix-ecacb799-38699757640; no stable tag overwritten.

The publisher verified the original archive SHA, independent Manifest, exact
image files/user/CMD/source tree/migration hashes, and pulled after publication.
The VPS independently pulled the immutable reference and checked Registry
Manifest config digest against the original Image ID. Docker 29's local image
identity representation was not mistaken for the config digest.

## Fresh backup and isolated restore

Backup directory:
`/opt/wpauto/backups/p3d4/20261015T121732Z-sdITnP` (2026-10-15 20:17:32 Asia/Shanghai).
Directory root:root/0700, protected files root:root/0600.

PostgreSQL custom-format dump SHA-256:
`016c9fde3d666878a70e0dbb527108647435ef71e062ecc4387a5e382d84cd74`.

Backups include actual base Compose, runtime config, auth vhost, real-IP include,
deploy executable, original Control reference, prior rollback reference and
migration hash list. SHA256SUMS and pg_restore -l passed. No backup content,
database credentials or key material is committed here.

A uniquely labeled temporary PostgreSQL instance used the already installed
16.10 image, network none, no published port, 256 MiB cap/no additional swap
allowance and 0.5 CPU. Restore ran with --exit-on-error --single-transaction,
--no-owner and --no-privileges after creating only synthetic NOLOGIN role
placeholders. Schema/data restoration and counts passed: 13 migration rows,
5 Site rows, 11 Grant rows, 12 Outbox rows. This is not a claim of complete
ownership/ACL reconstruction; live permissions were checked separately.
The production cluster was NOT a restore destination. Only the owned temporary
container, labeled data volume and generated restore password were removed.

## Protected configuration and ingress

- Stable independent 32-byte key generated once at
  /opt/wpauto/secrets/email_otp_limit_hmac_key, canonical unpadded base64url.
  Owner matches actual node UID 1000, mode0600, regular file, read-only mount.
  Separate root-owned0600 backup matches by in-memory comparison. Neither key
  nor its hash was printed or recorded in GitHub.
- Reviewed override /opt/wpauto/config/p3d-control.override.yaml installed;
  COMPOSE_FILE persisted in protected runtime.env with absolute base/override
  paths. An actual Compose invocation without a temporary shell export resolved
  the direct runtime command and false send switch. Peer service configuration
  comparison passed.
- SEND_ENABLED=false, recipient rolling maxima3/hour and6/day, global100/day.
  Existing runtime secrets, issuer, Session/signing keys and other old config
  values unchanged; only approved OTP/Compose keys and Control image changed.
- Exact reviewed /opt/wpauto/config/p3d-otp-send-deny.conf included only in
  auth.wpauto.cc HTTPS server. nginx -t passed and one normal reload succeeded.
- Origin TLS probes and public send/resend probes returned503 using EMPTY
  request bodies, no email/OTP/cookie/login transaction. Encoded send and
  repeated-slash normalization probes passed; raw /api/auth/ returned404.
  Verification GET was not intercepted with503; this does not claim a real
  OTP verification transaction. Guard stays active after deployment.

## Selective migration and Control-only deploy

Only approved original Control digest ran explicit node entrypoint with
`packages/database/dist/p3d-migration-cli.js apply-p3d-015` and the explicit
approval environment flag. Existing DB connection was injected via root0600
temporary file and removed, not a command-line credential. The helper used
read-only root, dropped capabilities, no-new-privileges and existing internal
network. It executed ONCE, returned applied, and the atomic result was verified.

Ledger is exactly001–013 plus015, with old13 SHA values unchanged and no014.
015 hash: 35a2efb46872e3b195a9363e5a1f0dfce5b50346b30f431146a60e734c43d0ac.
Writer SELECT/INSERT/UPDATE/DELETE verified; account-auth reader SELECT false.
Budget rows0. No generic/full migrate or manual migration-history edit.

Actual /opt/wpauto/bin/deploy-service, matching reviewed b1e8fc2a... SHA,
deployed only Control at the new immutable reference. Deployment exit0.
COMPOSE_FILE was explicit for the invocation and persisted for its Compose
operations, including automatic rollback. Effective and actual container CMD:
`node apps/control-api/dist/main.js`; no startup migrate.

`/opt/wpauto/rollback/control.image` exactly equals the captured previous
3a4eed827... reference. Old image retained. No rollback was necessary or
performed; this checks the reference and guard, not a production rollback drill.
If later needed, keep the guard and selective schema/key, roll back Control
only, then independently verify health rather than trusting script output.

## Actual postchecks and bounded anomaly

- Five scoped services healthy, OOM flags false, restart counts0. Only Control
  container ID changed; all four peer IDs, image refs and started times unchanged.
  Host oom_kill count remained174. No sustained severe pressure observed.
- Control live/ready and standard curl public health returned200.
  Authorization public Discovery/JWKS returned200, issuer correct, public-only
  keys. Site A WordPress login HEAD200; no WordPress content or MCP tool data read.
- Protected internal metrics returned real budget100, Provider attempts0,
  accepted/rejected/unknown counters0. No synthetic production quota consumption.
- Send flag false and actual read-only key mount verified; Nginx send/resend
  still503, nginx configuration check passed, temporary restore resources absent.
- Current replacement Codex Grant full row hash unchanged, still active with
  original2026-10-14T15:06:19.849847Z timestamp and no revocation reason. All11
  tracked Grant row hashes, all5 Site states and all12 historical Outbox row
  hashes match preflight. Active Site undelivered count0. Site B's two delivered
  events and old sequence-5 failure preserved.
- Connector state hash unchanged, active/v2/sequence0 and current Site binding.

An additional Python urllib public health probe returned403 while internal
health and standard curl public health/Discovery/JWKS returned200. The403
response had Server:cloudflare but no cf-mitigated header; those facts do NOT
prove Cloudflare originated the denial or establish its cause. This remains a
transport-dependent public probe anomaly for separate read-only investigation.
No browser impersonation, WAF/TLS relaxation, runtime repair or OAuth retry was
used. The accepted deploy script's curl checks and normal curl postchecks pass.
Do not claim all possible clients or genuine mail/onboarding were revalidated.

## Final state

```text
P3D4_READ_ONLY_PREFLIGHT_PASS=True
P3D4_PUBLICATION_BLOCKED=False
P3D_HOTFIX_PUBLISHED=True
P3D_PRODUCTION_DEPLOYED=True
P3D_PRODUCTION_HEALTH_PASS=True
P3D_EMAIL_SEND_PAUSED=True
P3D_EMAIL_OTP_PROTECTION_CANDIDATE_PASS=True
P3D_TENANT_OAUTH_ISOLATION_CI_PASS=True
P3D_REAL_EMAIL_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Existing candidate and historical P3 PASS results remain unchanged. This Draft
record does not merge #70, open registration or authorize P4-A. Primary dirty
files and design/ are untouched; backups, tokens, headers and keys are not in
this record. No production secrets were copied to GitHub. No real Resend send,
Consent, Token/Refresh/Replay/Revocation, pairing, MCP tool test, Site/Grant/Outbox
change or Site B recreation was performed. Sending is PAUSED for all new OTP
logins/resends. Removing guard/unpausing/real-mail/onboarding require separate
authorization. Stop after this deployment record; do not schedule a follow-up.
