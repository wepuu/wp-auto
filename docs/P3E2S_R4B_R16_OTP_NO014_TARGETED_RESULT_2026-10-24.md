# WPAuto P3-E2S-R4B-R16: OTP fourteen-migration fixture targeted acceptance

## Outcome and scope

The approved R16 targeted database gate passed. The existing OTP file ran once:
both top-level cases and their subtests completed, with six reported results,
zero failures and zero skips. Both actual fixture child databases had verified
before/after ledgers of exactly001–013 plus015. Console tables were absent.

This validates the historical OTP regression on the14-file no014 profile. It
does not establish complete017 candidate, full database, Console, startup, A/B,
image-release or production acceptance. R15's preflight stop remains historical.

Frozen implementation: `b65d91ef7efac1a061ce7c907f4740e11178f9f0` on
`codex/p3e2sr4b-source-integration`, after R15 record `207fd0b`. Source was clean
at execution and at postcheck before this documentation addition.

## Minimal changes and preserved assertions

Only the second OTP case's `p3dFixture(t, true)` changed to
`p3dFixture(t, false)`, explicitly selecting the existing14-file historical
profile. Both cases now call test-only `recordOtpLedger(pool, 'before')` and
register its after-observation through the fixture's existing `cleanup()` API.

`p3d-fixture.ts` itself is byte-identical to the R15/R10 source. Its global
configuration semantics, migration selection, resource cleanup and application
Database class were not changed. No prototype/migration interception was used.
The ledger helper uses the actual fixture pool, not the outer `postgres` database.

The original cleanup callbacks run in reverse registration order; the ledger
after-callback was registered first, so later mock-auth/app/writer resources close
before it executes, and it executes before the fixture closes/drops the database.
Original test business assertions were neither removed nor relaxed.

The offline comparison restored only the one selector line and removed the new
instrumentation/import, then compared with `207fd0b`; the resulting source was
identical. Original assertions still cover quota atomicity, normalized identities,
blocked resend preserving the prior OTP, fail-closed sending/storage, verification,
delivery outcomes, metrics privacy, public error/UI behavior and no implicit retry.

No application source, SQL, dependencies, production settings or database grants
were changed. The fixed images were reused without build/pull/install. Real mail
was not sent: the original mock sender and fake identities remained in use.

## Offline gate before the database attempt

`scripts/r16-otp-ledger.synthetic.mjs` passed six groups without database access:

1. Closed14-file expectation, excluding014/016/017.
2. Original business assertions and global fixture source unchanged as described.
3. Missing ledger, wrong hash, additional014 or Console objects rejected.
4. Exactly two distinct child identities, each with before and after evidence.
5. Parent-database identity rejected.
6. Evidence-save failure propagates instead of silently passing.

Mock pool/filesystem hooks are confined to the test helper's synthetic tests;
the actual OTP calls pass no overrides and use real SQL, filesystem ownership,
permission and exclusive-write checks. Syntax checks for the JavaScript tools and
`git diff --check` passed. This is not a whole-repository typecheck/lint result.

## Single actual execution

```text
run: r16-20261024114830436
UTC start: 2026-10-24T11:48:30.454Z
UTC finish: 2026-10-24T11:48:53.980Z
testAttempts: 1
target: packages/database/test/otp-send-budget.test.ts
expected top-level cases: 2
report total / fileCount: 6 / 1
category / reportStatus: PASS / VALID
child completed / exitCode: true / 0
spawnFailed / timedOut / outputLimitExceeded: false / false / false
outputBytes: 0
missing / failures / unmapped events / skips: 0 / 0 / 0 / 0
topLevelCountsMatch: true
actualFixtureLedgerVerified: true
inputsUnchanged: true
evidenceSaved: true
```

Unlike the uncounted full unit profile, this invocation supplied the explicit
two-top-level-case expectation. Each original case retained its90-second limit;
the file/report process retained150000ms, with200000ms outer transport. No
timeout/output budget was increased to obtain a pass.

The probe rechecked fixed Node24.22.1/Krypton/UID1000, tsx4.23.13 and loader hash:
`7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d`.
The compiled163-file fingerprint remained
`e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373`.
Host Node26 was used for orchestration/synthetic tooling only.

```text
Test image: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
Test image revision: c404ed52228ce5492a85674547998d2f5d31772e
PostgreSQL image: postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
PostgreSQL major: 16 / linux-amd64
```

## Evidence from the actual child databases

The helper reads `current_database()`, requires the original run-generated
`wepuu_p3d_…` child-name shape, then reads only ledger names/hashes and checks the
absence of `platform.console_auth_transactions` and `platform.console_sessions`.
It compares every ledger entry against the exact source-file hash and closed
001–013,015 list. Full child identities are SHA-256-bound in the evidence; no
connection string or credential is recorded.

| Child identity hash (display prefix only) | Before | Before destruction | Console objects |
|---|---|---|---|
| `88be18f1e723…` | 14 exact entries | identical14 entries | absent at both reads |
| `fa81dd68e09b…` | 14 exact entries | identical14 entries | absent at both reads |

All four observations have the same canonical ledger digest:
`72defd8a6c11928a89aa557e89c6b5cc836b38b4780f56b0ed4a178528c39256`.
The validator compares full identities and entries, not these display prefixes.
014/016/017 remain source files in the image, but were not in either fixture's
copied/applied migration profile. No Console capability is inferred from OTP.

The original fixture normally closes and drops its own child databases after
the checks. No additional database deletion/recovery was performed and no database
backup was created. The temporary cluster and evidence volumes remain retained.

## Isolation, cleanup and evidence custody

The new network was internal, no host ports were published, and the test joined
only the PostgreSQL container's network namespace using loopback credentials.
Test/probe containers were UID1000 with read-only root, capability drop,
no-new-privileges, no healthcheck, log driver none and bounded temporary tmpfs.
Nine explicit source/helper binds were read-only; the dedicated evidence volume
was writable for structured results. No Docker socket, SSH, production config or
whole user/repository directory was mounted.

The dedicated evidence-volume preparation helper used root with all capabilities
dropped except CHOWN, no network and read-only root. Its sole task was preparing
the new volume at0700, copying one private local synthetic credential file at0600
and assigning ownership to1000. It did not run tests or application services.
PostgreSQL used its fixed image's normal initialization and writable dedicated
data volume, not the test's UID/read-only-root settings. Test-admin credentials
were synthetic; this is not a general application-runtime least-privilege result.

All four owned containers were independently inspected stopped, exit0, without
OOM and with matching run labels:

```text
wepuu-r16-20261024114830436-otp
wepuu-r16-20261024114830436-pg
wepuu-r16-20261024114830436-seed
wepuu-r16-20261024114830436-probe
```

Retained labeled resources (no automatic deletion):

```text
network: wepuu-r16-20261024114830436-net
volume:  wepuu-r16-20261024114830436-data
volume:  wepuu-r16-20261024114830436-evidence
```

The host evidence directory and synthetic credential files were restricted to the
current user, SYSTEM and Administrators and checked using the existing ACL
verifier. Container evidence files had UID1000,0600 files and0700 ledger directory;
symlinks/oversized files were rejected. Secrets were not put in command arguments
or published metadata. Necessary child environment carried only the temporary
loopback DSN; raw environment/connection strings were never exported.

Private result (not committed):
`C:\Users\liulo\AppData\Local\Temp\wepuu-r16-otp-X2lNJe\result.json`

```text
result SHA-256: aef15aa2573a2dea495ac4d132576b941f85498420846df920de76e2d14e1446
OTP test SHA-256: 516f7101651614df07941ababa49bfdbfdd4c56769b9d8a27c9b24876b030ec0
ledger helper SHA-256: 4869350a03ab7d0b01cdb08a412431424910727c25691f89826af444d8e1b23f
original fixture SHA-256 (unchanged): 75db5cd0db3882fe8f5830d00eb2606dd0672920f7a484f8b1b450198e703d42
target driver SHA-256: 07d55b20e1414193963d6beca176f2337fd4c74ab15c9a45d86b8abf8d017033
host coordinator SHA-256: f5c00bd79d3843597b91f99e297b23300ee9be01e327a46ad0228f43eb35fe05
synthetic tool SHA-256: 9842457a86927866ca9f7db49d9df00fbbbdc5a057772fe88fb596c1bb590f2b
```

The result holds complete safe migration observations and input hashes, not raw
test logs, OTPs, cookies, signing secrets, email bodies or authentication material.
Source/input hashes stayed unchanged. D: free bytes were6321836032 before and
6288281600 at postcheck, above the initial5GiB/subsequent2GiB gates. No resource
threshold was lowered, no unrelated Docker objects were cleaned, and no Hosted
CI, push, PR, merge, deployment or external data-plane call occurred.

## Final state and stop

```text
P3E2SR4BR16_OTP_NO014_PROFILE_PASS=True
P3E2SR4BR16_OTP_TARGETED_DATABASE_PASS=True
P3E2SR4BR16_ACTUAL_FIXTURE_LEDGER_VERIFIED=True
P3E2SR4BR16_FULL_DATABASE_REGRESSION_EXECUTED=False
P3E2SR4BR16_LEGACY_CONSOLE_EXECUTED=False
P3E2SR4BR16_AB_EXECUTED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

R14's earlier pass and R15's stop remain historical records; R14 was not rerun
against the newly modified OTP test. These candidate flags neither revoke nor
revalidate the separately authorized historical bounded internal trial.

Stop here. A new frozen plan is required to resume complete candidate/retained
database regression and independent Console regression. Its exact overlays must
include both the changed OTP test and the new ledger helper; the retained old
image does not contain this repair. Keep actual-child migration evidence,014
Console-only isolation, fail-closed reporting and the no-automatic-retry boundary.
