# WPAuto P3-E2S-R4B-R21: complete database regression and isolated Console pass

## Outcome and scope

R21 PASSED. One candidate-plus-retained invocation completed all15 frozen files
and31 expected top-level cases. Only after that group passed and its cluster
stopped, one independent Console invocation passed its1 file/1 top-level case.
All process reports and actual fixture migration checks passed, with no skips,
failures, timeouts or OOM. There was no retry or business-code repair.

This establishes the approved database-regression gate for the current candidate.
It is not default-startup, A/B, production-deployment or actual Desktop account
switching acceptance. Those remain separate steps toward stable safe read-only
MCP use; controlled-use/full acceptance flags remain false.

Frozen implementation: `b4e5f99be0446fee3d1324064df0244c27639496`, following R20
result `4368a59`. R17/R19 failures, R18 offline analysis and R20 fixture repair
history are retained unchanged. Local commits only, no push, PR, merge or deploy.

## Minimal wiring and offline validation

Only two new local tooling files were added:

- `scripts/run-r21-database.mjs`: reuses R17's bounded group worker and safe
  projector; adds R20's test/helper overlays, fixed-Node helper import probe,
  strict successful process checks and an explicit candidate-stopped Console gate.
- `scripts/r21-database.synthetic.mjs`: runs the unchanged78-check R17 pure suite
  and61 additional R21 wiring/result/gate checks.

The new gate rejects absent/failed reports, missing or mismatched ledger evidence,
false successful process states and skipped tests. Console also requires the
complete candidate/retained pass plus exactly one stopped exit0/no-OOM record for
each owned candidate test, PG and seeder container. No threshold was relaxed.

The offline checks passed before execution, including frozen13+2+1 file counts,
28+3+1 top-level expectations, exact R20 source/helper and unchanged worker hashes,
required overlays, failed process/report rejection, Console gating and secret
sentinel exclusion. Formal group/database attempts in these checks were zero.
JavaScript syntax and `git diff --check` passed. This is not a new whole-repo
typecheck/lint or hosted CI result.

No application, SQL, dependency, permission, protocol, fixture assertion or
production setting changed in R21. The R20 adapted re-consent file and helper
were mounted explicitly read-only. Shared fixtures, the repaired historical OTP
file/helper and the actual-ledger helper were also overlaid, rather than using
stale image copies. The image/application implementation was not rebuilt.

The complete worker provides only its R17-schema context. R18/R19 single-file
diagnostic/ledger switches are NOT enabled; those helpers load as dependencies
but do not replace full-group ledger verification. Their historical success is
not substituted for a newly executed full test.

## Actual run and per-file results

```text
run: r21-20261024133540839
UTC start: 2026-10-24T13:35:40.840Z
UTC finish: 2026-10-24T13:37:07.457Z
candidate-plus-retained attempts: 1
independent Console attempts: 1
candidate worker duration: 59914 ms
Console worker duration: 2480 ms
inputs unchanged / evidence saved: true / true
```

| Group | File | Reported results | Result / migration scope |
|---|---|---:|---|
| candidate | account-auth-link.test.ts | 1 | PASS /16 |
| candidate | account-login-transaction.test.ts | 2 | PASS /16 |
| candidate | account-workspace.test.ts | 1 | PASS /16 |
| candidate | deletion-lifecycle.test.ts | 4 | PASS /16 |
| candidate | grant-reconsent.test.ts | 1 | PASS /16 |
| candidate | local-signing-lifecycle.test.ts | 1 | PASS /16 |
| candidate | migration-profile.test.ts | 2 | PASS / NO_MIGRATION |
| candidate | multi-site-provider.test.ts | 1 | PASS /16 |
| candidate | oauth-client-callback.test.ts | 3 | PASS /16 |
| candidate | persistent-readonly.test.ts | 6 | PASS /16 |
| candidate | secret-artifact.test.ts | 3 | PASS / NO_MIGRATION |
| candidate | tenant-isolation.test.ts | 2 | PASS /16 |
| candidate | tenant-provider-http.test.ts | 1 | PASS /16 |
| retained | otp-send-budget.test.ts | 6 | PASS /14 |
| retained | pairing-diagnostics.test.ts | 1 | PASS /13 |
| isolated legacy | console-auth.test.ts | 1 | PASS /17 |

Candidate has28 top-level cases and28 reported results; retained has3 top-level
cases and7 reported results because OTP includes four nested subtest results.
Thus the first group has31 top-level cases/35 reported results, not35 top-level
cases. Console adds1 top-level case/1 result. No manifest/count expectation was
changed to fit the output.

Every returned file report had category PASS, reportStatus VALID, completed
process with exit0, null signal, no spawn failure, timeout or output overflow,
zero raw output bytes, no missing/unmapped/unexpected events, zero skips and
`topLevelCountsMatch=true`. Each required migration verification also passed.

The R20 re-consent test really ran in this complete group, including its original
assertions and added strict rejection checks. Its pass is not inferred from the
prior single-target result. It still does not turn the historical manually
configured replay-reason fixture into a new provider-level Replay acceptance.

## Actual fixture migration coverage

| Profile | Actual DB identities | Observations | Exact ledger | Checked Console objects |
|---|---:|---:|---|---|
| candidate | 16 | 24 |001–013,015–017 (16) | absent |
| historical OTP | 2 | 4 |001–013,015 (14) | absent |
| historical pairing | 1 | 2 |001–013 (13) | absent |
| independent Console | 1 | 1 |001–017 (17) | detection true |

The first group therefore has30 observations over19 actual DB identities; the
independent Console adds one observation/identity. Pure/static files have no
invented ledger. Direct fixtures use retained per-file databases inspected after
the file (`post` records); these are not claimed to be per-case before/after
snapshots. Child fixtures have paired observations before assertions and before
destruction: multi-site1 child, persistent-readonly6, tenant-provider1, OTP2 and
pairing1. Empty parent scheduling databases do not satisfy child coverage.

Every migration name and SHA-256 matches the closed source expectation.014 is
absent from all candidate and retained actual ledgers and appears only in the
separate legacy Console cluster. Console detection checks
`platform.console_auth_transactions` OR `platform.console_sessions`; false means
both checked objects absent, not an exhaustive catalog of every possible object.

Canonical ledger digests:

```text
candidate16: 797bb34ec9ce55f1b34e5f0648f2e6982e335bcb8c1c76f5eb7580643b896879
OTP14: 72defd8a6c11928a89aa557e89c6b5cc836b38b4780f56b0ed4a178528c39256
pairing13: ce0df7fd631d4c8b4b47132ed45751c7bb7c6c92720af358883a57b576844d95
Console17: 228beb70d79be97b670c03f8097894bbc1c0c47cac5e579a35bf5f5887dff5d3
```

The unchanged worker/ledger schema uses fresh internal run IDs
`r17-20261024133540839-candidate` and `r17-20261024133540839-legacy`. These are
schema compatibility namespaces tied to this new R21 timestamp and separate
new resources, not reuse of any R17 run, result or cluster.

## Sequential gate and fixed runtime

Independent Docker state timestamps confirm sequencing:

```text
candidate tests finished: 2026-10-24T13:36:52.108910331Z
candidate PG finished:   2026-10-24T13:36:53.038306274Z
legacy seeder started:   2026-10-24T13:36:55.527503340Z
legacy PG started:       2026-10-24T13:36:56.540268651Z
legacy tests finished:   2026-10-24T13:37:03.734523439Z
```

```text
Test image: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
Image revision: c404ed52228ce5492a85674547998d2f5d31772e
PG image: postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
PG identity: 16 / linux-amd64
Test runtime: Node v24.22.1 / Krypton / UID1000
tsx: 4.23.13
loader SHA-256: 7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d
compiled163-file hash: e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
fixed-Node fixture helper import probe: PASS
```

Host Node26 ran only orchestration and pure checks. No install, pull, build,
default application startup or automatic migration entry point was invoked.
Original test fixtures may start their own bounded local HTTP services; this is
not represented as acceptance of the default application/container startup path.
Per-file150000ms, per-group300000ms, outer transport330000ms and existing output
budgets were preserved, with no skip or acceptance relaxation.

## Isolation, evidence custody and cleanup

Each phase has a new internal network, data/evidence volumes and independent
synthetic credential, with no published ports. Tests run UID1000, readonly root,
cap-drop ALL, no-new-privileges, bounded tmpfs and log driver none, joining only
that phase's PG namespace for loopback database access. Explicit file overlays
are read-only; no Docker socket, whole user/workspace directory, production
configuration or Desktop credential store was mounted.

Evidence preparation used a no-network readonly-root seeder with only CHOWN above
cap-drop ALL, restricted to its new owned volume and0700/0600 custody. PG used its
normal fixed-image initialization and writable data volume. This remains
test-admin isolation evidence, not application-runtime least-privilege proof.

The tests used synthetic control metadata/protocol fixtures. No real WordPress
content, real OTP delivery, production account or actual Desktop authorization
was exercised. Structured results exclude Token/payload/credentials, arbitrary
exceptions/stacks, environments and raw stdout/stderr. Host evidence ACLs were
verified for the current user, SYSTEM and Administrators. Container evidence
uses owned private directories/files and bounded fixed-schema parsing.

All seven run-owned containers were independently inspected stopped, exit0,
matching labels, no OOM and zero published ports:

```text
wepuu-r21-20261024133540839-probe
wepuu-r21-20261024133540839-candidate-tests
wepuu-r21-20261024133540839-candidate-pg
wepuu-r21-20261024133540839-candidate-seed
wepuu-r21-20261024133540839-legacy-tests
wepuu-r21-20261024133540839-legacy-pg
wepuu-r21-20261024133540839-legacy-seed
```

Retained labeled resources, not automatically deleted:

```text
networks: wepuu-r21-20261024133540839-{candidate,legacy}-net
data volumes: wepuu-r21-20261024133540839-{candidate,legacy}-data
evidence volumes: wepuu-r21-20261024133540839-{candidate,legacy}-evidence
```

D: free bytes were6151897088 initially and5883461632 at postcheck, above the
unchanged5GiB initial/2GiB ongoing gates. No cleanup was used to change the
result. All frozen inputs matched at the runner and independent host verification;
worktree was clean before this document was added.

Private result, not committed:
`C:\Users\liulo\AppData\Local\Temp\wepuu-r21-database-3nBL3z\result.json`.

```text
result SHA-256: 85d3836f0ab79df97d5ca92c187d2ddfac4cfd9e1ca2024fb83fe1e37773cb64
host coordinator: 052ccb3ffad674d39d3c20487798bd3ee1e6758b3717dc8dcaf7355cda0624e0
R21 synthetic tool: d83dea497b3109e31cab128e274b9b1421da94506fbd4e88d49a8b571518d2a4
unchanged worker: 55616b500101ec0af4ffa3082fc6d9103bf365d5c2a6244d7df43225c2051fe8
R20 target test: a05421184ee623c6ebe8912bcb63bba5f80e07fdc125508e05aac064d429ca0b
R20 native fixture helper: 421e75a05bd82fc97b92a3485379615aa1e2efbe3fe4728b080a25fcf01639d6
```

## Final state and stop

```text
P3E2SR4BR21_CANDIDATE_DATABASE_PASS=True
P3E2SR4BR21_RETAINED_DATABASE_PASS=True
P3E2SR4BR21_LEGACY_CONSOLE_RESULT=PASS
P3E2SR4BR21_ACTUAL_MIGRATION_COVERAGE_PASS=True
P3E2SR4BR21_CLEANUP_PASS=True
P3E2SR4BR21_SERVICE_STARTUP_EXECUTED=False
P3E2SR4BR21_AB_EXECUTED=False

P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after documenting this gate. The next separately scoped step is local
default-startup and A/B synthetic acceptance; no production or actual Desktop
account-switch outcome is inferred or authorized by this database pass.
