# WPAuto P3-E2S-R4B-R40 RT link HTTP revalidation

## Result

R40 built a new candidate containing the offline-tested R39 fix and passed the
single isolated normal/missing-RT-link HTTP revalidation. The normal Refresh
returned200 with valid rotated tokens. A separate RT with exactly one deleted
persistent link returned400 invalid_grant, with no AT/RT fields, no new stored
Token artifacts and no original RT consumption.

Both protection and lifecycle postchecks passed. This accepts the targeted
error-mapping fix through the real compiled HTTP service. It does not accept
the complete matrix, the B-stop/A transition, Desktop account switching or a
production deployment. R36 and R38 failure records remain unchanged.

## Source and helper preparation

```text
approved application baseline: f020e0065664ae2f98cc65f343bcf79b05f807fd
application fix commit: 06b011de6de7b491f883e073f9f2f27e2af50bb3
execution source revision: 2ab57076511732fb2b2fbb1c50a03ee6c59ece4d
source manifest: dde36cc57b4b1a7de3b433cb13e68d846e889d4a1555ea135aa9670d8c7cb641
database source SHA-256: 8d59679bdc93517480e3fe634d13798bb7dfa5d896568e894b6f5279dcd08f35
```

Only six independent R40 build/runner/contract/report files were added before
execution. Applications, packages, deployment recipe, migrations, dependency
inputs and frozen R38 scenario were unchanged from the approved R39 baseline.
The manifest covers103 files,18 source/test directories and10 projects.

The historical builder would reject the new source, and the old runner would
use R34's unchanged images. R40 instead pins the R39 manifest and recipe hash,
requires a clean checkout and exact application diff, and accepts candidate IDs
only from this successful protected build receipt. It verifies all three roles,
revision, artifact linkage, attempts, compilation fingerprint and patch probes;
there is no old-image fallback.

The R40 verifier additionally requires the explicit privilege checks, normal
response fields, both complete A/B startup/exit records and bounded log evidence.
Protocol assertions were not weakened. The generator and generated driver are
the frozen R38 implementations, with identical generated hashes:

```text
scenario: 40be549393cd3daff5dba57d62f505070c8f39e94ed676da4e45fdb024e661f0
driver: 9e290bd3e4c88fb5e8aa9c68a84cb222ca094e649d7f18ee084094f5b7ec93f8
recipe: 1c0958507b326c5d1a036f6e7988968c9042864b62752b2353cb493606172bc4
```

An initial local syntax error in the new synthetic script was corrected before
any Docker invocation. The complete R40 helper suite then passed90 checks; the
unchanged R38 helper suite passed113. These covered wrong source/receipt/image,
missing compiled patch, failed build, duplicate attempts, zero/multiple deletes,
incorrect status/Token fields, incomplete postchecks/lifecycle, sensitive output
filtering and generated source syntax. They made no protocol or database calls.

## One offline candidate build

```text
build run: r40-build-20261025110904282
UTC start: 2026-10-25T11:09:04.282Z
UTC finish: 2026-10-25T11:11:00.813Z
```

Each of Test, Authorization and Control had one successful build invocation,
without retries, from the same compiled stage. BuildKit used the local verified
desktop-linux builder, network none, pull=false and existing digest-pinned
parents. No dependency install, registry push or image deployment occurred.
New aliases/tags did not overwrite old candidate tags.

| Role | Loaded image ID |
| --- | --- |
| Test | sha256:f22b9a507d6d713f678fe5d35a6c83b9324572503c1dbba28cd0433f5348d7c9 |
| Authorization | sha256:a5062dbc9f3fb52b9eeecd6ba5d8273cc5ac223a09fa3c07d632f48356a7eaaa |
| Control | sha256:93577d94ba77b0f1f6c5350ef29b8f8809e67c5dabb1b5589b16bd104d0ed937 |

Build metadata and loaded descriptors identified these IDs as OCI_INDEX,
not configuration digests; configDigest was NOT_PRESENT. Each verified image
has revision2ab57076511732fb2b2fbb1c50a03ee6c59ece4d and linux/amd64 platform.
Authorization and Control retain user node and their direct compiled main CMDs;
the Test image retains root and pnpm check. That CMD was not executed as a full
repository check during this run.

UID1000 read-only, network-none probes verified all three compiled identities:

```text
compiled fingerprint: 6179918471d90689ce8693ee1423488bfcb1fcd48b357ac01a8c7963cb86b35d
compiled files:163
runtime: Node v24.22.1, Krypton
```

This differs from R34's fingerprint. Separate probes verified the R39 database
source hash and the exact RT/P0001/artifact_link_missing mapping clause inside
compiled find(). Metadata revision alone was not used as proof of the fix.
The received private build receipt passed ACL/file checks and was hashed before
candidate IDs were accepted by the protocol runner.

## Single two-scenario HTTP run

```text
run: r40-20261025110903548
UTC start: 2026-10-25T11:09:03.549Z
UTC finish: 2026-10-25T11:11:29.547Z
Asia/Shanghai:2026-10-25 19:09:03 to19:11:29
total monotonic duration:145990 ms, including build
inner scenario monotonic duration:6690.082 ms
targeted attempts:1
authorization flows:2
Code exchanges:2
Refreshes:2
```

The inherited driver routing argument is matrix, but its mounted generated
scenario is the hash-pinned two-case R38 body, not the complete matrix. No
transition, Replay test or direct adapter probe was executed.

A fresh internal network, PostgreSQL data volume and evidence volume were used,
with no published host ports or production credentials. The local Better Auth
account and provider artifacts were synthetic, email used Mock delivery and
Site approval used the existing signed Grant-service fixture, not WordPress.
The Control application was not started; A and B were Authorization instances.

The driver explicitly migrated a new disposable database to001–013 plus015–017,
without014. Separate migration/runtime identity and runtime privilege-denial
checks passed. Application startup did not run a migration command. The exact
ledger and schema were unchanged after the scenarios:

```text
schema before/after:80134a8e4305642b05f47520355272a868b478087893e278f7fd3db7722e21f6
```

### Normal control

B authorized and exchanged one fresh Code. A refreshed the resulting RT once,
returning200 with AT and a different RT. The fixture verified issuer, resource
audience, Site, Tenant, Grant and mcp:read binding, old RT consumption, new RT
link/artifact/classification, persistent classification and expected rotation.

### Missing RT link

A different Code/Provider Session supplied the second RT. Before deletion it
had exactly one link, artifact and classification and was not consumed. The
isolated administrator deleted exactly one current-lookup RefreshToken link;
the readback confirmed its absence while retaining artifact/classification.
The application continued using its restricted database role.

| Observation | Result |
| --- | --- |
| Fault Refresh status |400 |
| OAuth error |invalid_grant |
| Response JSON parsed |True |
| AT/RT fields present |False/False |
| Original RT consumed before/after |0/0 |
| Matching links before/delete/postcheck |1/0/0 |
| Matching artifacts before/delete/postcheck |1/1/1 |
| Matching classifications before/delete/postcheck |1/1/1 |
| Stored RT count before/delete/postcheck |3/3/3 |
| Stored AT artifact count before/delete/postcheck |0/0/0 |

AT artifact counts refer to database persistence, not to the AT JWTs returned
by the successful normal scenario. Both strict denial assertions and rejection
state postchecks passed. All synthetic Grant rows and existing Outbox records
matched their protection snapshots. Both bounded log projections had no matching
failure events and no overflow. This establishes no successful native fallback
for this case, not acceptance of every native/persistent combination.

## Cleanup and evidence

A and B each passed one readiness check, returned their complete lifecycle
snapshot and stopped exit0 without forced termination or deadline expiry. All
seven owned runner containers stopped exit0 without OOM: three identity probes,
seed, PostgreSQL, targeted driver and exporter. Builder probes were transient
network-none read-only invocations. No production host or Desktop was accessed.

Whitelist projections were exported through a read-only evidence mount with
network none. Files and original source inputs remained unchanged. Private
Windows ACL checks passed; no Token, Code, Cookie, SQL parameters, exception
body or WordPress content was exported.

```text
build receipt: C:\Users\liulo\AppData\Local\Temp\wepuu-r40-build-EK99jY\result.json
SHA-256:a822a61661024af9d3f05bcdebadba223b7cb3133acb2a95ba348ba03c65a619
run receipt: C:\Users\liulo\AppData\Local\Temp\wepuu-r40-targeted-KSlseW\result.json
SHA-256:5ce8a0cb4f919c65c9e77b9de8837a0fcb529f334cffba28fabd1d21d7c004df
```

Disk checks and the build monitor retained the initial5 GiB/ongoing2 GiB
thresholds. Reported host free space was5807009792 bytes at the recorded samples.
No pruning, cache cleanup or historical resource deletion ran. The new images,
stopped containers and these run-owned resources were retained:

```text
wepuu-r40-20261025110903548-net
wepuu-r40-20261025110903548-data
wepuu-r40-20261025110903548-evidence
```

## Status and stop

```text
P3E2SR4BR40_CANDIDATE_BUILD_PASS=True
P3E2SR4BR40_NORMAL_REFRESH_CONTROL_PASS=True
P3E2SR4BR40_MISSING_RT_HTTP_DENIAL_PASS=True
P3E2SR4BR40_POSTCHECK_PASS=True
P3E2SR4BR40_CLEANUP_PASS=True
P3E2SR4BR40_TARGETED_ACCEPTANCE_PASS=True

P3E2SR4BR36_AB_MATRIX_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The targeted HTTP fix is accepted for this isolated candidate. This does not
retroactively capture R38's underlying exception or change its failed result.
No complete matrix, production deployment, push, PR or merge followed. The next
separately authorized step is the complete isolated matrix against these exact
candidate IDs, with its own stop conditions; do not rebuild or deploy by default.
