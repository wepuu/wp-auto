# P3-E2M phase two: current backup coverage, partial result and stop

## Outcome and authorization

**Platform backup VERIFIED; WordPress stopped before backup creation.
Overall recovery coverage remains incomplete and the trial candidate BLOCKED.**

The operator explicitly approved one protected current-state backup on each host,
integrity and binding-coverage checks, with no restore, reauthorization or MCP.
This phase follows the bounded inventory in
[Draft PR #101](https://github.com/wepuu/wp-auto/pull/101), Head
`e6f406aa161025c8da1ed2326c7ef6be31761a9d`.
It preserves E2L/PR #100's earlier H6/H7 decision and E2K/PR #99's historical
OAuth/MCP PASS; it does not rewrite those observation windows.

Execution was one sequential dispatch: platform, then WordPress. There was one
platform database export and **zero WordPress database exports**. The WordPress
precheck failure was not retried. One subsequent bounded read-only source-file
metadata diagnostic was performed, not another backup attempt.

No restore, OAuth, MCP, OTP send, deployment, service reload/restart, migration,
production chmod/chown, PHP setting/content change or Desktop edit occurred.
New files were limited to host-private backup/receipt/run-marker artifacts.
No historical file or backup was deleted or overwritten.

## Tool identity, reuse and validation

Authorized run ID: `c79133f225d7`.
Embedded executable bundle SHA-256:
`7560f9ad9433c7182c9d88bc1f4fa13456a4820daa0548f1e4fc9be86a88ebcd`.

The coordinator reused E1K's archive construction, content verification and
temporary-credential cleanup components; its reviewed PHP dump routine was
adapted only for the E2M directory and individual INSERT rows. E2K's restricted
read-only identity/mapping and SQL binding projections were reused without their
login, full-preflight, repair or deployment dispatchers. Historical helper hashes
were verified before import. No obsolete zero-Grant or paused-send gate was used.

Normal backup and protocol operations were never substituted for testing a
helper. Eighteen local synthetic tests passed before execution, covering MySQL
literal escaping, exact option-row coverage, missing/duplicate rows, PostgreSQL
COPY decoding/completeness, wrong Tenant/Scope/owner/Home Tenant, revoked or
duplicate Grants, Provider resource mismatch, archive tampering and the absence
of a restore database argument. Six result-aggregation tests passed after the
run, ensuring partial/transport/custody failures cannot become aggregate PASS,
nor backup success become restore or readiness success. Total: **24 PASS**.

These are bounded helper and adversarial binding tests, not new production OAuth,
tenant-isolation acceptance or restoration exercises. Hosted CI belongs to this
document candidate and cannot replace the production receipts.

## Platform: protected current backup verified

Host: `5.255.99.225`.
Assistant UTC request interval: `2026-10-21T12:20:55.027Z` through
`2026-10-21T12:21:02.205Z`, 7.177 seconds local monotonic transport duration.
Host-reported completion: `2026-10-21T12:21:05.081511Z`;
host workflow monotonic duration: 2.335 seconds. Observer clocks are not assumed
identical and this is not a new clock-accuracy acceptance.

```text
/opt/wpauto/backups/p3e2m/20261021T122103Z-c79133f225d7
```

Directory root-owned 0700; all backup files root-owned 0600. A new, exclusive
run marker prevents automatic duplicate execution. Existing backups remain.

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| `database.dump` | 193,356 | `cd5448251c7bd25296bdac8b0b0c1734a118545dd7baa54f0595c9e787602d4a` |
| `recovery-config.tar.gz` | 2,834 | `ecdc478794553f5470ef2500e61ba2450975fac218ea4451b9b4e1946f2b4e95` |

Manifest SHA-256:
`96b358c157079d210ee80b5ccf92d7cd336d2d2add6a47b5c136f6767e62657e`.

The consistent PostgreSQL custom dump covers the full current database, including
existing history, Site A, current Site, business and Provider artifacts, grants,
revocations and control metadata. It used the existing database container and
client, no installation, with bounded statement and lock-wait timeouts.
No RLS, permissions or schema were changed to obtain visibility.

The recovery archive contains the current runtime environment, ingress guard,
Compose and approved override configuration. Its members and content hashes were
verified on-host without extraction. The existing original accepted OCI archive
was verified against its known SHA-256 and referenced, not rebuilt or republished.
Running Control retained source `69e94218c946fc620af71bfca750657465a9f26c` and
manifest reference `sha256:3e60de660d8e2c344a0464cf6b8b65d008834d5517c55c57877bd7b15e080338`.
Authorization retained `e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.
The existing migration hashes and set were unchanged; no migration ran.

### Actual archive binding check, without restore

The PGDMP header and archive catalogue were checked. Then `pg_restore` rendered
the archive to process memory **without `--dbname` or `-d`**, using `--file=-`.
No rendered SQL was executed, written to a public file, printed or transferred.
It was decoded and discarded on the platform host. This is archive inspection,
not a restore into any database.

The actual archive's COPY records established:

- Exactly one active target Site with the accepted resource, Tenant, Site ID and
  Ed25519 public-key/kid binding.
- Exactly one current active target business Grant with the accepted account,
  Site, Tenant, Client and only `mcp:read`.
- Exactly one corresponding Provider Grant, matching business Grant ID, account,
  Client and sole resource/scope, with no added OpenID scope or claims.
- The accepted active Account, active Home Tenant and active owner membership.

Safe correlation fingerprints:

```text
Site SHA-256:
235dc1100e449ffecd0100b16d18f7db4e2b7fbda0e3eb17c3b5cf4929300042
Business Grant SHA-256:
40c99c4a94771bdca049fb3bdbd979cbb7991cfbd7c925ea2fcd3f5f874a0f90
```

No raw identifier, authentication artifact, full Provider payload, private key,
Token, user data or WordPress content left its host in the verification output.
No inference was made from a newer timestamp alone.

### Protection and remaining recovery limits

Before/after source queries and artifact checks confirmed:

- Critical original Site/Grant/Pairing/Outbox/migration records matched E2K's
  accepted protected-state digest and stayed unchanged during backup.
- Site A's Connector protection digest was unchanged.
- Five services remained healthy with unchanged identities; no OOM/restart.
- Existing-account OTP actual and persistent send settings stayed true, with the
  accepted ingress configuration intact. No mail test was sent; registration
  policy was not changed.
- MemAvailable 982,920 to 1,048,688 KiB; memory full avg10 0.01 at both checks;
  host OOM counter remained 175 on the accepted boot. Thresholds were unchanged.

Four existing read-only container secret-mount custody references were recorded
for signing-keyring/account-auth secrets across Control and Authorization;
files were nonempty and private. HMAC custody was also checked by the retained
component. Secret bytes were not exported or added to this backup archive.
**Signing-key backup-copy recovery coverage was not confirmed by this task.**

The dump omits owner/ACL commands as the accepted backup component does; the
accepted migrations/runtime provisioning are needed to recreate roles and
permissions. This is not a full PostgreSQL cluster/OS backup, proof of recovery
after host loss, off-host disaster recovery or an isolated restore exercise.
Platform current-binding coverage is verified at the artifact/readability level;
complete system recoverability is not claimed.

## WordPress: precheck stopped, no new backup

Host: `148.135.106.145`.
Assistant UTC attempt interval: `2026-10-21T12:21:02.210Z` through
`2026-10-21T12:21:06.515Z`, 4.305 seconds local monotonic transport duration.

```text
Status: E2M_BACKUP_NOT_CONFIRMED
Stage: wordpress_precheck
Category: CUSTODY_NOT_CONFIRMED
Backup directory created: False
Database export executed: False
Automatic retry: not performed
```

The exclusive attempt marker remains
`/root/wepuu-e2m-backup-c79133f225d7.started`, root-private. It is a run-control
file, not a backup or current recovery point. Existing E1K/E2B artifacts are
untouched and their known coverage limitations remain.

### Bounded follow-up source metadata

One read-only diagnostic inspected six explicit paths. It did not query the
database or read `wp-config.php` contents. Host-reported time:
`2026-10-21T12:21:58.448089Z`.

| Source | UID:GID | Mode | Observation |
| --- | --- | --- | --- |
| Frozen read-only helper | 0:0 | 0600 | Regular, no symlink; retained SHA-256 matches |
| E1I utility worker | 0:0 | 0600 | Regular, no symlink; retained SHA-256 matches |
| `/www/wwwroot/www.wepuu.com/wp-config.php` | 1000:1000 | **0666** | Regular, no symlink |
| Current Nginx vhost | 0:0 | 0600 | Regular, no symlink |
| Current rewrite file | 0:0 | 0600 | Regular, no symlink |
| Connector directory | 1000:1000 | **0777** | Directory, no symlink |

Code order, the retained helper hashes and this metadata localize the first
failing custody call to the `wp-config.php` source check, before directory
creation or dump. That local checker requires root ownership and no group/other
writes for this source. **UID 1000 ownership alone is not proof of a fault**:
trusted site-owned source files must be distinguished from root-private backup
outputs. However, 0666/0777 separately expose group/other write mode bits, so
blindly accepting the source or merely removing the root-owner check is not a
safe continuation.

No effective ACL, immutable attribute, mount restriction, local-user access
path, internet exploitability or compromise was assessed. Mode bits are direct
facts, not proof that the files were exploited or that a remote visitor can
write them. No historical cause or actor is inferred. There was no automatic
permission repair, PHP configuration edit, identity cleanup or backup retry.

The pre-execution synthetic tests did not model this actual source ownership/
mode combination. They do not validate relaxing the gate. New tests must
separate legitimate trusted source ownership from genuinely unsafe write mode
bits before any newly approved continuation.

## Next minimal decision — not executed

Do not repeat the successful platform backup. Keep it and its private receipts.
Do not weaken the WordPress source gate to manufacture H6 PASS.

The next separately scoped task should first verify the effective access and
the expected aaPanel/PHP/update ownership model for these exact paths, and
present an exact least-privilege permission plan. Do not recursively chmod/chown
the site, change PHP runtime settings, disable updates or assume root ownership
is appropriate everywhere. The current authorization does not cover such a
repair. Any fix needs explicit target/mode/owner/impact/rollback approval.

Only after that issue is resolved or safely explained should a newly approved
single WordPress backup attempt be considered. It must preserve identity,
mapping, revocation and plugin bindings, rerun the corrected local source-custody
tests and verify actual dump rows; it must not redo platform backup, OAuth/MCP,
pairing or production restore. No new retry is implied by this record.

## Final bounded status and stop

```text
P3E2M_BACKUP_SUPPLEMENTATION_COMPLETE=False
P3E2M_WORDPRESS_CURRENT_BINDING_COVERED=NOT_CONFIRMED
P3E2M_PLATFORM_CURRENT_BINDING_COVERED=True
P3E2M_NEW_WORDPRESS_BACKUP_CREATED=False
P3E2M_NEW_PLATFORM_BACKUP_CREATED=True
P3E2M_WORDPRESS_SOURCE_CUSTODY_CONFIRMED=False
P3E2M_ISOLATED_RESTORE_VALIDATED=NOT_RUN
P3E2M_PRODUCTION_RESTORE_PERFORMED=False

P3E2L_CURRENT_RECOVERY_COVERAGE_CONFIRMED=False
P3E2L_CONTROLLED_TRIAL_CANDIDATE=BLOCKED

P3D_EMAIL_SEND_PAUSED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

True platform coverage is limited to the actual current-binding archive evidence
above, not restored usability or host-loss recovery. No trial starts. Submit this
independent sanitized Draft PR, retain the partial result and stop. Do not merge,
modify permissions, repeat a backup, revoke or restore under this task.
