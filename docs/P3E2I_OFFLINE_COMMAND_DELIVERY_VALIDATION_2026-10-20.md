# P3-E2I: offline delivery PASS; approved transfer stopped at SSH authentication

Date: 2026-10-20, Asia/Shanghai. Stage A completed; stage B attempted and
stopped. Server file integrity and business preflight remain **NOT_RUN**.

## Result and authorization boundary

Local delivery validation passed. During stage A, no connection to a production host, file
transfer, server-side integrity check or production preflight was attempted.
The real WordPress checker was not executed. No Desktop enable, OAuth,
Consent, token exchange, MCP call, OTP, pairing, NTP change, service restart,
deployment or migration occurred in this round.

At the stage A handoff, stage B required separate explicit approval for transmitting the frozen
files to the target host and checking their integrity only. That approval was
subsequently received; its single failed attempt is recorded below. Stage C business
checks are not implied by that transfer approval. Do not ask the operator to
paste the old long Base64 command or bypass its failed integrity check.

PR #93 retains the E2H transport failure and overall NOT PASS. These local
results do not identify where the previous chat/terminal bytes differed and
do not turn the E2H production gate into a pass.

## Unchanged checker and new transport wrapper

The frozen command's stored local SHA-256 was checked before extraction:
`1d0b03a243db66d207876ba2819fc0fb5b3b033c9d8d28ba5b1a5ef63d3418af`.
It decoded into the exact original 20,438-byte UTF-8/LF checker, SHA-256
`73d319abd8459ca5896e1348b81ab4d92875d97eaeb0a1c79cdcb3abfe767ed4`.
No business condition, identity binding or acceptance threshold in that
checker was modified. The decoded checker and its private dependencies are
not uploaded in this docs PR.

The new standard-library-only launcher:

- Separates `verify` from `run`. Verify checks custody, hashes, syntax and
  target host without invoking the WordPress checker or creating its run marker.
- Requires the approved `/root/wepuu-e2i-delivery-<16 hex>` directory, no
  unknown symlink, root ownership, directory0700 and ordinary single-link
  files0600 in server strict mode. The `/root` parent is also checked.
- Checks an independently supplied manifest digest, exact file inventory,
  bounded sizes and each file hash. The launcher must itself be externally
  hash-verified before its first invocation; self-verification alone is not
  proof of an authentic first execution.
- Compiles in memory without pycache writes. Integrity and custody failure
  stop execution before the real checker.
- Executes only the already-verified in-memory bytes, not a later reopened
  payload path. It uses an isolated Python child, a120-second monotonic limit
  and a65,536-byte stdout cap; stderr and raw failures are not forwarded.
- Reserves one business-check execution for the whole delivery directory
  with exclusive creation, even if a caller changes the run identifier.
  A consumed marker is not automatically removed after failure.
- Limits termination to its own child/session; no process-name selection or
  host-wide scanning/killing. Only the POSIX child-group branch applies on
  the intended Ubuntu host.
- Emits an allowlisted projection and wrapper run/timing/hash metadata.
  Unknown fields and raw exceptions are not exported. Wrapper success is
  not sufficient for complete preflight; the existing semantic validator
  still must check the projected result and fresh evidence window.

The payload does not embed database passwords, Site private keys, tokens or
cookies. Its normal read-only host-local custody checks remain unchanged.
No WordPress content or tool input/output is sent to the control plane.

## Frozen final delivery identity

Final local candidate: `p3e2i-delivery-v3`. Earlier local candidates are retained
but are **not the approved transfer candidate**.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `wordpress-readonly.py` | 20438 | `73d319abd8459ca5896e1348b81ab4d92875d97eaeb0a1c79cdcb3abfe767ed4` |
| `launcher.py` | 12867 | `74356cd3adaf2e561f8b321472128fbe65b656853fc5571f5f430a22dfc6d2a7` |
| `manifest.json` | 405 | `9d9a0b831573d9018b623557d155e643578077221fa7f4d0bd4ff3049b1e75f3` |

Proposed host: `148.135.106.145`.
Approved destination, not created during stage A; its remote creation is
NOT_CONFIRMED after the stage B transport failure:

```text
/root/wepuu-e2i-delivery-de920b0276c91044
```

Local freeze occurred15:00:07.302; final bridge receipt15:00:16.661.
These are local preparation times, not production samples or a preflight
window. Exact local file copies and their hashes were compared in both
directions. That demonstrates a filesystem roundtrip, not SFTP network
transport or terminal rendering correctness.

## Fresh local test evidence

Final result: **83 tests passed; zero failed; zero skipped**.

- 42 delivery tests: original bytes, copying, in-memory compilation,
  truncation, one-byte corruption, CRLF conversion, wrong/missing file,
  changed manifest/launcher, mocked unknown links, ownership/permissions,
  hardlinks, unsafe path/non-root, once-only reservation including a changed
  nonce, bounded synthetic child success/timeout/oversized output/nonzero
  exit, stderr/exception suppression, schema projection and secret sentinels.
- 35 existing configuration-protection, timing, read-only dispatch and
  WordPress-result validator tests were rerun without enabling configuration.
- Six integration cases passed through the actual delivery launcher's
  projection into the existing semantic validator: an accepted safe historical
  fixture and rejection of missing clocks, ignored NTP, local Grant, identity
  drift and stale evidence. The fixture used a deliberately historical
  synthetic window, not fabricated current production evidence.

Python3.10 grammar was checked. Local runtime tests used Windows Python;
actual Ubuntu Python execution, real root/POSIX file custody, SSH transfer and
POSIX process-group termination were **NOT_RUN**. POSIX ownership/process-group
branches were tested with synthetic metadata/mocks, not represented as actual
Linux execution. Synthetic child timeout tests confirmed child exit locally.

Initial local tests exposed a Windows-only path-mocking incompatibility and
an integration fixture window which excluded the fixture's own start/end.
Both test harness issues were corrected, preserving the earlier receipts.
The checker and production freshness/resource rules were not weakened.
The final candidate additionally changed a per-nonce reservation into a
whole-directory reservation before refreezing and rerunning its tests.

## Stage A local transport inventory

Local inventory confirmed existing PSCP/PSFTP and SFTP clients; no software
was installed. Existing PSFTP reported release0.81. Only the saved PuTTY
session's hostname, SSH protocol, port and cached-host-key entry existence
were inspected: the session matched148.135.106.145:22 and one key entry existed.
No password/private key, full session settings or host-key values were read
or exported. Cache-entry existence is not a fresh remote identity verification.

After approval, use the existing trusted SSH/SFTP connection, without accepting
unknown or changed host keys. Recheck candidate hashes before transmitting.
Create only the proposed new protected directory, transfer only the three
listed files and enforce their custody. No overwrite, new trust entry,
installation, WordPress bootstrap or business-check execution is authorized
by this preparation result.

External file SHA-256 checks must precede launcher execution. Only then may
`verify` be invoked with the pinned manifest hash. Any mismatch/tool absence/
identity uncertainty stops stage B. Verification and any later `run` are
separate actions, not an automatically chained command.

## Stage A stop and subsequent gate

Stage A stopped for explicit approval to transfer and verify only. Do not provide a command
that silently proceeds from verification into the WordPress checks.

Once delivery is separately verified and stage C is approved, prepare the
operator before starting a new15-minute UTC/monotonic window. Use initial
platform resource/Session gates, one complete platform preflight, public/origin
metadata and disabled Desktop checks, one frozen WordPress execution and one
lightweight ending gate. Any necessary failure/unknown/expiry stops without
retry. No old samples fill a missing current stage.

No production readiness, current Session, NTP, email pause, Grant or database
state was revalidated during the offline stage or failed transfer. Earlier accepted product
states remain historical and are not newly asserted.

## Stage B: approved transfer attempt, stopped before SFTP upload

The operator explicitly approved transmitting the three frozen files and
checking integrity, **without business checks**. The approval did not authorize
OTP, account recovery, authentication-policy changes or installing software.

Before connecting, exact local file sizes/hashes and saved-session target,
SSH/port22 and existing cached-key-entry presence were rechecked. Twelve
additional offline delivery-dispatch/filesystem tests passed: exclusive
directory creation, exact three-file finalization, no overwrite of unknown
files, corrupt/extra transfer blocking, fixed dispatch, host rejection,
exception suppression and verified-launcher `--mode verify` only.
These tests were mocked/local filesystem tests, not target-host execution.

The prepared file-only flow would receive files in a newly owned private
temporary subdirectory, validate them and commit without replacing existing
final names. It would remove only the owned empty temporary directory and
externally recheck all pinned bytes before invoking launcher verify. None
of those upload/finalization/verification stages was reached.

One PLINK batch connection was attempted using the existing PuTTY saved
session, Pageant and cached host-key policy. No unknown key was accepted and
no password/private key was requested or exported. The attempt returned:

```json
{
  "action": "bootstrap",
  "utc": "2026-10-20T07:09:34.196Z",
  "passed": false,
  "exitCode": 1,
  "transportPass": false,
  "category": "AUTHENTICATION_NOT_CONFIRMED",
  "rawOutputSuppressed": true,
  "businessChecksExecuted": false
}
```

This is15:09:34.196 Asia/Shanghai and is a local capture time, not a remote
host clock sample. The safe category comes from the bounded transport
failure; no authenticated remote structured success was returned. It is
not proof of a hash mismatch, NTP fault, missing SSH key, Pageant failure or
a particular server-side authentication policy.

| Stage | Actual result |
| --- | --- |
| Local integrity/session metadata | PASS |
| One SSH bootstrap attempt | FAIL: authentication not confirmed |
| Remote host gate/directory creation | NOT_CONFIRMED; no success receipt |
| SFTP upload | NOT_RUN; zero upload invocations |
| No-overwrite finalization | NOT_RUN |
| External remote hashes/syntax/launcher verify | NOT_RUN |
| WordPress business checker or fresh production preflight | NOT_RUN |

No second SSH attempt, SFTP fallback, password prompt, installation, remote
cleanup or authentication/configuration change followed. Local failure and
once-started markers remain preserved. Directory existence is not guessed
from an authentication error; any later approved retry must first account
for that uncertainty and must not overwrite unknown files.

Continue only after the operator restores/confirms the existing batch SSH
authentication path and explicitly approves another bounded file-only
attempt. An already-open interactive PuTTY window alone does not establish
that a separate batch process can authenticate through Pageant. Do not ask
the operator to send a password, private key or verification code.

The initial stage A document Head
`48cfa47eb839d339a2294f6a7a38fee8d6466f46` passed Hosted CI
`39384001763`. This append receives its own commit/CI; the old success must
not be presented as validation of the new Head or as production success.

```text
P3E2I_DELIVERY_LOCAL_VALIDATION_PASS=True
P3E2I_FILE_TRANSFER_ATTEMPT_PERFORMED=True
P3E2I_FILE_TRANSFER_PASS=False
P3E2I_SERVER_FILE_INTEGRITY_PASS=NOT_RUN
P3E2I_COMPLETE_PREFLIGHT_PASS=NOT_RUN
P3E2A_PREFLIGHT_PASS=False

P3E2E_DESKTOP_ENABLE_PERFORMED=False
P3E2E_OAUTH_ATTEMPT_PERFORMED=False
P3E2E_MCP_TOOL_CALL_PERFORMED=False
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

## Repository delivery

Docs-only independent worktree from main
`e8778da33d850303d1ccbdfbebf088610bf6ac5f`; no runtime/helper bundles, actual
project/user configuration, credentials or backups committed. Original dirty
worktree and `design/` are preserved. Draft PR only, no merge. Hosted CI for
this document candidate is reported separately and cannot replace any of the
unexecuted target-host or production gates.
