# Continuous existing-account OTP: bounded production deployment

## Result and scope

The operator-approved archive deployment passed at
`2026-10-21T07:02:43.117771+00:00`. Existing-account OTP send/resend is persistently
enabled; signup remains disabled. Normal existing-account login no longer
requires per-message agent approval or an automatic-close window.

Only Control was recreated, once, and Nginx normally reloaded, once. No rollback
occurred. No email, OAuth, MCP, WordPress, PHP, NTP, Connector, Client registration,
migration, database restore or registry publication operation was performed.
The operator must still provide evidence of actual inbox receipt/login; none is
claimed from the credential-free smoke checks.

## Immutable candidate and archive custody

The deployed code remains the original validated candidate, not this later
documentation commit:

```text
Source: 69e94218c946fc620af71bfca750657465a9f26c
Source tree: 080b541c9a202dcc1193746e7f845ef6f3af2574
Archive SHA-256:
92eea1aafb5c84565e049d52d201eea924913e5a8c6934ce0628e8abeff6035f
CI config digest / historical-store image ID:
sha256:8ea1dc31e9d2e7019a4fb0a1ade409c1a5fa4e40d9844e2d573ae3c7159c693d
Loaded OCI manifest ID / actual runtime reference:
sha256:3e60de660d8e2c344a0464cf6b8b65d008834d5517c55c57877bd7b15e080338
```

[Candidate CI 39538026057](https://github.com/wepuu/wp-auto/actions/runs/39538026057)
passed. Its real isolated Better Auth/PostgreSQL tests cover existing-account
mock login, unknown-recipient suppression and no registration/reservation,
unknown-recipient IP limiting, old-code signup denial, neutral public responses,
raw API denial and Origin rejection. Quota/storage tests and the retained broader
security/data-flow gates passed. This is hosted candidate evidence, not actual
production inbox evidence.

The local archive was rehashed, transferred to a root-private host directory and
rehashed there. The OCI index points to the pinned manifest; the manifest's
config descriptor points to the pinned CI config. Both raw JSON blobs' hashes
were independently checked. Loaded config and RootFS matched the archive
exactly; linux/amd64, non-root user, direct Control command, source labels, all
202 frozen source/compiled/root-file hashes and unchanged migration hashes
matched the CI manifest. No-network, read-only, capability-dropped temporary
containers verified the inventory and exported fixed registration/session/quota
constants. Their execution did not start the Control business service.

No GHCR image was published. `registryDigest` remains null; neither local ID is
represented as a newly published registry reference. Existing workflow publishing
permissions remain unchanged. The previously rejected publication expansion was
not retried indirectly.

## Preserved stops and compatibility correction

The prior `HOST_OOM_DRIFT` stop and historical count 174 are retained in
[the gate-stop record](OTP_EXISTING_ACCOUNT_DEPLOYMENT_GATE_STOP_2026-10-21.md).
After the bounded read-only follow-up, the operator explicitly approved a fresh
boot-bound count-175 deployment window. The historical extra OOM's exact time
and cause remain unconfirmed; no historical RCA or tuning was performed.

The fresh window began at `2026-10-21T06:52:42.041192+00:00`, used a 1,800-second
monotonic deadline and rejected any boot change or count other than 175.
MemAvailable remained subject to at least 524288 KiB and memory full avg10 below
1. These thresholds were not lowered.

The first worker in that window stopped at `archive_identity` with
`COMMAND_FAILED`, before any config change, Control recreate or Nginx reload.
The old worker, single-use markers, receipt and backup were preserved. The
original worker did not record a command-specific failure substage, so its
precise failed subprocess is not independently reconstructed from stderr.

A bounded same-archive import diagnostic returned exit 0. Read-only checks then
reproduced the helper's incorrect assumption: this Docker 29.7.2 containerd
store could inspect the manifest ID but not the CI config digest as an image
reference. The original archive contains both, cryptographically linked. The
loaded config and RootFS matched exactly. This is not evidence of changed image
contents or a need to rebuild/publish. Docker documents the containerd store
and its version-29 default in the [official storage documentation](https://docs.docker.com/engine/storage/containerd/);
the exact observed ID relationship is direct host/archive evidence.

Only the local deployment helper was corrected to distinguish the two IDs and
strictly verify their binding. Fourteen offline tests passed, covering the actual
archive binding, wrong manifest/config/RootFS rejection, exact two env changes,
exact ingress change, resource boundaries, new OOM/boot changes, deadline expiry,
rollback ordering and concurrent-modification refusal. They are local helper
tests, not an asserted hosted run of this helper.

A separate staging/backup directory and single-use worker were used after that
correction. The original 06:52 window and deadline were carried forward unchanged;
no failed task or marker was reset. The corrected worker only inspected the
already-loaded pinned image; it did not import another artifact or build one.
Successful completion was 601.077 seconds into the original window.

## Protected backups and changes

Final protected backup directory, host-local only:

```text
/opt/wpauto/backups/otp-existing-only/20261021T070104Z-dawlbb5h
Database SHA-256:
74ce7180f216f6f41d55b437ad65d3693c994d14739164c0fcfb771dbcb0a373
```

The root-owned directory is 0700; configuration/database backups, manifest,
archive, helper and private records are 0600. The 185012-byte custom PostgreSQL
dump completed successfully, had the expected header and a readable restore
catalogue. This is integrity/readability verification, not a full restore drill.
Backups, credentials and business-row values did not leave the host. The first
window worker's earlier backup remains separately retained at
`/opt/wpauto/backups/otp-existing-only/20261021T065243Z-tmhctct7`.

The exact runtime changes were:

- Set only `WEPUU_CONTROL_IMAGE` to the pinned loaded manifest ID and
  `WEPUU_EMAIL_OTP_SEND_ENABLED` to `true` in the current runtime env file.
- Remove only the two exact send/resend 503 locations from the existing ingress
  include. Retain the rest, including raw `/api/auth/` 404 denial.
- Keep the direct `node apps/control-api/dist/main.js` command and existing
  read-only HMAC mount. No compose, HMAC, quota, Session lifetime or other env
  value changed. The normal create command used `--no-deps --no-build --pull never`.

Nginx configuration checks passed. The owned worker was detached from SSH and
bounded by a transient systemd runtime deadline with rollback handling; it did
not create a persistent or per-message send-closing task. Rollback would close
ingress before returning to the old signup-enabled image. No rollback or
database restore was needed.

## Direct production postchecks

The worker's complete receipt returned `OTP_EXISTING_DEPLOY_PASS`:

| Check | Actual result |
| --- | --- |
| Actual and persisted send flag | true |
| Fixed existing-account-only signup policy | false registration constant; exact accepted image |
| Per-recipient hourly/daily and global daily limits | 3 / 6 / 100, unchanged |
| HMAC value/custody and read-only mount | unchanged |
| New Control container | healthy, non-OOM, restart count 0 |
| Other four container IDs/start identities | unchanged and healthy |
| Sites, Grants, existing Outbox, pairing rows, account/owner links | unchanged protected projections |
| Authentication-only orphan users | zero before deployment; unchanged afterward |
| Existing quota reservation rows | unchanged; no reset |
| Migrations | exact 001–013 plus 015; no 014 or DDL |
| Empty public and TLS-verified origin send/resend POST | 403, existing request protection retained |
| Empty public and origin raw auth POST | 404 |
| Production mail attempt / acceptance counters during worker | zero |
| New OOM within window | none; count remains 175 |
| End-window MemAvailable / memory full avg10 | 1231376 KiB / 0.0 |

The empty POST probes carried no email, Cookie, OTP or auth material and discarded
response bodies. Their 403 results prove rejection of those invalid requests,
not successful OTP delivery. Signup denial and valid-login semantics are tied
to the accepted immutable code/CI tests, not a negative live signup experiment.

An independent final read-only snapshot again found all five services healthy,
zero container OOM flags/restarts, sending true, the accepted image source label,
and the expected new guard hash. Authorization's existing shell startup command
was not altered or run; it was not restarted. Its historical migration command
must not be misreported as having been removed. The old release display env
value remains unchanged and is not the deployed-source provenance; immutable
archive, descriptor/config/file hashes and source labels provide that evidence.

## Evidence and handoff

Deployment actions and postchecks are assistant-collected SSH/process receipts.
The operator supplied the deployment and fresh OOM-window approvals. No browser
login or inbox receipt was collected here. No Codex setting, credential store,
target MCP enablement, OAuth consent, code exchange or tool invocation occurred.
WordPress 148.135.106.145 was not accessed.

Future E2K checks must explicitly accept this ADR-023 image and sending policy;
they must not require the obsolete `SEND_ENABLED=false`/old-image baseline or
falsely mark it unchanged. Account login is available for normal operator use
without another single-email approval. Actual real-login evidence and any next
OAuth/MCP execution remain separately scoped.

```text
EXISTING_ACCOUNT_ONLY_OTP_CODE_PASS=True
EXISTING_ACCOUNT_ONLY_OTP_HOSTED_CI_PASS=True
EXISTING_ACCOUNT_ONLY_OTP_ARCHIVE_VERIFIED=True
EXISTING_ACCOUNT_ONLY_OTP_DEPLOYED=True
EXISTING_ACCOUNT_ONLY_OTP_CONTINUOUS_LOGIN_AVAILABLE=True
EXISTING_ACCOUNT_ONLY_OTP_PRODUCTION_INBOX_RETEST=NOT_RUN
OTP_EXISTING_ACCOUNT_DEPLOYMENT_GATE_PASS=True
OTP_EXISTING_ACCOUNT_DEPLOYMENT_CONFIGURATION_CHANGED=True
OTP_EXISTING_ACCOUNT_DEPLOYMENT_ROLLBACK_PERFORMED=False
PRODUCTION_EMAIL_SENT=False
REGISTRY_IMAGE_PUBLISHED=False
CI_PACKAGES_WRITE_PERMISSION_ADDED=False

P3D_EMAIL_SEND_PAUSED=False
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

These are this deployment's results; earlier paused/failed/candidate records are
historical and unchanged. No full product acceptance or public readiness follows
from this narrowly accepted OTP operation. Draft PRs remain unmerged.
