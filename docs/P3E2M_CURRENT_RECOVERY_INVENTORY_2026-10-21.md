# P3-E2M phase one: bounded current-recovery inventory

## Decision and authority

**Inventory completed within its stated scope; H6/H7 remain NOT_CONFIRMED and
the E2L controlled-trial candidate remains BLOCKED.** This is an evidence gap,
not proof that no other usable backup exists. No backup creation was authorized
or performed in this phase. Stop before the separately approved supplementation.

The operator requested implementation of the E2M plan. Phase one permits a
read-only inventory on WordPress `148.135.106.145` and platform `5.255.99.225`.
The next backup phase still requires one explicit approval of the listed scope.
No browser Session, login recovery or additional OTP is required for inventory.

Historical [E2L, Draft PR #100](https://github.com/wepuu/wp-auto/pull/100), Head
`9d401f38a885a9b7233d7af1c98c7400eb330e74`, and
[E2K, Draft PR #99](https://github.com/wepuu/wp-auto/pull/99), Head
`b7b09b88c5872f49d0e694eadd70b5f7f6fa0313`, were reread through GitHub metadata
and remained Draft/open at this check. E2K's existing successful OAuth/MCP result
is not repeated or expanded. This document branch starts at main
`e8778da33d850303d1ccbdfbebf088610bf6ac5f`, not an asserted production source.

## Execution and evidence scope

The assistant directly collected both host inventories through existing PuTTY
authentication, batch mode and the saved WordPress session. The expected public
host IP was matched against local interface metadata before enumeration.
Remote Python executed from standard input; no remote helper or receipt file
was created. No old deployment/backup entry point was executed.

| Observation | Platform | WordPress |
| --- | --- | --- |
| Assistant UTC request window | 2026-10-21 11:56:57.184–11:57:01.155Z | 2026-10-21 11:57:01.159–11:57:05.256Z |
| Host-reported UTC at completion | 11:57:03.915132Z | 11:57:08.188971Z |
| Local monotonic transport duration | 3.969 s | 4.097 s |
| Enumeration root | `/opt/wpauto/backups` | `/root`, only `wepuu-` directory names containing `backup` |
| Directory metadata records | 55, including 10 skipped custody gates | 7 |
| Allowlisted files inspected | 40: 29 artifacts, 11 receipt projections | 20: 14 artifacts, 6 receipt projections |
| Entries considered | 290 | 68 |
| Read errors / size-time-count limits reached | 0 / none | 0 / none |

Host UTC and assistant UTC are different observers; this is not a new clock
comparison or synchronization acceptance. The body of SQL, configuration,
private keys, tokens and arbitrary JSON strings never appeared in output.
Artifacts were hashed on their own hosts; only hashes and metadata left them.
No WordPress data was sent to the platform.

The local inventory has maximum depth 3, 2,500 entries, 160 matching files,
45-second monotonic host budget, 2 MiB per JSON receipt and 64 MiB per artifact.
The transport has a 65-second timeout. Only fixed artifact names/patterns and
receipt names are opened. Symlinks are skipped, regular artifact/receipt files
must be root-owned and private, and opening uses `O_RDONLY | O_NOFOLLOW`.
Receipt projection returns only approved booleans, counts and binding/artifact
hashes; no arbitrary values, JSON paths, exceptions or stack traces are emitted.

The inventory is **not** an exhaustive host/off-host inventory. Unmatched file
names, deeper trees, other backup roots, panel-managed storage, cloud snapshots
and unindexed operator copies are outside this observation. No gzip/archive
expansion, PostgreSQL catalogue command, restored-data query or full restore was
performed. A valid PGDMP header or matching hash is not a restore result.

### Preserved initial incomplete observation and tool correction

The initial attempt at assistant UTC 11:56:14.512–11:56:21.746Z stopped at both
enumeration-parent custody checks and read no backup files. The checker had
incorrectly required parent directories to meet private-backup-directory mode.
It did not establish unsafe backup files or an absent backup.

The corrected local checker distinguishes a root-owned, non-group/world-writable
enumeration parent from private backup directories and files. Actual observed
parents were platform mode 0750 and WordPress `/root` mode 0550. Server
permissions were not changed. The original receipts remain separate and are
not reported as a successful inventory.

Original checker SHA-256:
`e5e92d2c686239065888d27e3e80ddb9c3bc365d03c909ef25ed9afaeaaa47c0`.
Corrected checker SHA-256:
`93e714a3df90380a48585acc9f9543db654fd78c549adfa20ddc1b59e7b77e9b`.

## Findings: coverage, not chronology alone

### H6: WordPress current identity and local mapping

The known E1K recovery directory remains:

```text
/root/wepuu-e1k-backup-20261018T135222Z-a931ba4ba8a7
```

Its root-private directory and artifact modes are 0700/0600. Fresh hashes match
the retained phase-one records:

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| `database.sql.gz` | 9,319,763 | `518a3600bcc9fbfe7f5b651d764337891d7df2db91da0faf623327a5020b2934` |
| `connector-config.tar.gz` | 590,658 | `19c04dc8064b586cf2ae87d00fbb76d6f6052f2dbebcd19721be64664ec06a45` |

The retained host-local E1K precheck identifies the **old** Site/public-key
identifier and zero local Grant mappings. Both identity fingerprints differ
from E2K's accepted replacement identity. Its result records 32 tables,
single-transaction export and historical gzip/archive/hash validation. Those
historical checks are not claimed to have been rerun by this inventory.

Other matched directories were older E1D/E1F/E1I snapshots, the E1K execution
receipt and the E2B ingress backup. An ingress configuration backup does not
supply a current identity/database/local-Grant recovery point. No inspected
receipt established recovery coverage for E2K's accepted identity and mapping.
**H6 remains NOT_CONFIRMED.** This does not exclude an unknown other backup.

### H7: platform new business/Provider Grant

The inventory adds actual daily artifacts to the previously reviewed policy:
files named for October 13–21 were present, root-owned mode 0600, with PGDMP
headers. The latest date-named daily artifact inspected was:

```text
/opt/wpauto/backups/daily/wpauto-20261021.dump
Bytes: 188842
Observed mtime: 2026-10-21T10:17:01Z
SHA-256: 6e2983c900fe0f9feec60ee920256eb01ccd4c273157853c593b494d7985b333
```

Its mtime precedes E2K's new Grant observation around 10:37Z. Mtime is not a
trusted creation timestamp or a proof of database contents; this ordering and
the missing current-binding manifest cannot establish H7 PASS. No SQL payload
was decoded to infer that the current Grant is definitely absent.

The known OTP deployment backup also remains present:

```text
/opt/wpauto/backups/otp-existing-only/20261021T070104Z-dawlbb5h/database.dump
Bytes: 185012
SHA-256: 74ce7180f216f6f41d55b437ad65d3693c994d14739164c0fcfb771dbcb0a373
```

Its matching host-local receipt and hash confirm the known artifact, not later
Grant coverage. Weekly and other inspected historical dumps similarly supplied
no reviewed current-binding coverage evidence. **H7 remains NOT_CONFIRMED.**

### Separate custody observation and limits

Ten historical platform subdirectories were root-owned mode 0755. Under the
private-backup-directory policy their descendants were not inspected. This is
a coverage/custody qualification, not proof that a particular secret file is
readable: file permissions, ancestor access and contents were not assessed.
No chmod, deletion, retention adjustment or further security investigation was
performed. Do not claim the entire backup tree has private custody or that all
possible later backups were excluded.

Signing-key custody, current live business rows, Site A/Grant health, browser
Sessions, OTP delivery and runtime resource/NTP state were **not rechecked**.
Historical accepted values retain their original observation windows.

## Minimum separately approved supplementation

Existing evidence does not close either gate. The minimum proposed next action
is one new host-local backup on each affected host, under one approval covering
both hosts. An operator-provided already-existing verified recovery point may
instead close the relevant gap; do not mechanically create a duplicate.

1. Use new unique root-private directories under
   `/root/wepuu-e2m-backup-<UTC>-<random>` and
   `/opt/wpauto/backups/p3e2m/<UTC>-<random>`. Preserve every existing backup.
2. Immediately before backup, use only the necessary host, disk, service,
   resource and current binding checks. Do not rerun Desktop/OAuth/MCP or require
   browser login. Keep MemAvailable >= 524288 KiB and memory full avg10 < 1;
   unexplained OOM/restart or security-binding drift stops the task.
3. Reuse reviewed dump/archive components, not the old complete runners. Replace
   obsolete zero-Grant, pre-identity and paused-send assumptions with the
   approved E2K binding and continuous existing-account-OTP baseline. Validate
   changes locally before production. Do not deploy or run migration 014.
4. WordPress: consistent full database including current identity, connection,
   revocation and local mapping; matching Connector and necessary configuration.
   Confirm InnoDB consistency assumptions. Unknown/nontransactional tables stop
   rather than trigger unreviewed locks. Keep temporary DB credentials host-local
   mode 0600, out of argv/output, and precisely remove them on all exits.
5. Platform: one consistent PostgreSQL custom dump including current Site,
   business/Provider Grant and all existing control metadata/history, plus
   necessary protected recovery configuration and immutable artifact references.
   Audit existing key-custody references using metadata only; no private-key or
   HMAC export, secret transfer, new key or Credential Store extraction.
6. Compare critical binding/revocation state and file manifests before/after.
   Normal background refresh/session activity is not a distributed transaction
   or proof of drift-free snapshots. Explain allowed dynamic changes; stop on
   unexplained security changes. Do not auto-disable jobs or reset sequences.
7. Verify exit codes, nonempty artifacts, protected custody, SHA-256,
   compression/archive readability and associated snapshot-generation binding
   evidence. Record cross-host snapshot intervals. Do not claim a shared atomic
   snapshot or close gates from timestamp/hash/header alone.
8. No automatic retry, restore, identity reset, re-consent, revocation or cleanup
   of historical evidence. On failure retain private partial outputs marked
   incomplete, remove only this run's temporary credentials, and report.

Integrity/readability, isolated restoration and production restoration remain
separate. The proposed backup approval includes neither restore, off-host secret
transfer nor a trial start. Current backups do not guarantee recovery from host
loss. Missing key custody or other newly identified dependencies must be reported
as limits, not silently treated as covered.

## Validation, status and stop

Ten local Python synthetic tests cover output filtering, exact safe-field types,
binding-mention limitations, artifact-name exclusions, custody/parent distinction,
bounded projection and read-only source constraints. Seven Node aggregation
tests cover incomplete parent/transport/host/error/limit evidence, false coverage
from timestamps or mentions, retained OTP policy, no restore and no readiness
promotion. All 17 tests passed. These are tool/policy tests, not authentication,
tenant-isolation or disaster-recovery production acceptance.

No application contract or security check changed. No database connection,
OTP/OAuth request, MCP call, backup creation, restore, deployment, restart,
permission change, PHP edit or actual Desktop configuration edit was performed.
Existing SSH/system audit logging may occur normally; no claim is made that the
live hosts or unrelated business activity were frozen during read-only access.

```text
P3E2M_RECOVERY_INVENTORY_COMPLETE=True
P3E2M_INVENTORY_SCOPE=BOUNDED_KNOWN_ROOTS_WITH_EXPLICIT_EXCLUSIONS
P3E2M_WORDPRESS_CURRENT_BINDING_COVERED=NOT_CONFIRMED
P3E2M_PLATFORM_CURRENT_BINDING_COVERED=NOT_CONFIRMED
P3E2M_NEW_WORDPRESS_BACKUP_CREATED=False
P3E2M_NEW_PLATFORM_BACKUP_CREATED=False
P3E2M_ISOLATED_RESTORE_VALIDATED=NOT_RUN
P3E2M_PRODUCTION_RESTORE_PERFORMED=False

P3E2L_CURRENT_RECOVERY_COVERAGE_CONFIRMED=False
P3E2L_CONTROLLED_TRIAL_CANDIDATE=BLOCKED
P3E2L_BLOCKERS=H6,H7

P3D_EMAIL_SEND_PAUSED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Inventory complete means the bounded phase-one requests and their exclusions
were recorded, not that every host backup or current binding was verified.
OTP False is preserved policy, not a fresh send test. E2K historical OAuth/MCP
PASS is preserved and not rerun. This independent documentation candidate and
its CI cannot replace production evidence. Stop and request the single backup
authorization before any supplementation; do not merge or start a trial.
