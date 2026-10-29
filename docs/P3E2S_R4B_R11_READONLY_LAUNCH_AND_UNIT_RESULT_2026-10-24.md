# WPAuto P3-E2S-R4B-R11: read-only launcher and single unit result

## Scope and outcome

The approved R11 plan was implemented locally. The selected read-only Node/tsx
launch and synthetic report chain passed. The single standalone unit gate failed
with a valid, safely projected report. No formal retry or post-failure repair was
performed. This is not database, Console, A/B, image-release or production acceptance.

Frozen source: `fc0b154c2832c2a389998354e16b934e5c1ab4d8` on
`codex/p3e2sr4b-source-integration`. Application source, migrations, dependency
inputs and package-manager settings are unchanged from the R10 image revision
`c404ed52228ce5492a85674547998d2f5d31772e`.

## Launcher change and synthetic evidence

Unit and database test drivers now obtain an argv-only command using the fixed
container's `process.execPath` and already installed tsx loader. The database
driver change was source-checked only: no database tests ran in this task.

The adapter rejects runtime/version/UID/entry/hash mismatch:

```text
Node v24.22.1 / LTS Krypton / UID1000
tsx 4.23.13
/workspace/node_modules/.pnpm/tsx@4.23.13/node_modules/tsx/dist/loader.mjs
loader SHA-256 7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d
```

The read-only, network-none synthetic container
`wepuu-r11-launch-synthetic-20261024a` exited0: **39 tests passed, zero failures,
zero skips**. Cases include actual typed TS execution, assertion/module failure,
invalid reporter, timeout, report framing, safe evidence and runtime mismatch.
Its stopped state and exit code were checked before the formal unit run.

The failed pnpm positive probe and its original assertions remain in
`scripts/persistent-pnpm-r1.legacy-probe.mjs`, outside the selected unit manifest.
It was not rerun and pnpm is not claimed repaired. The new mandatory fixed-node
tests replace it as the selected launch contract. The current frozen unit
manifest contains55 files (previous54 plus the new fixed-node test file).
Existing skip acceptance policy was not changed.

The host one-shot coordinator was syntax-checked and reviewed before execution;
its successful and test-failure aggregation path was exercised by this actual
run. Not every coordinator setup/cleanup fault branch was injected. Host Node26
only orchestrated Docker; application/tests ran on fixed Node24.

## Single formal invocation

```text
run: r11-20261024101955915
UTC start: 2026-10-24T10:19:55.924Z
UTC finish: 2026-10-24T10:20:48.509Z
unitAttempts: 1
Test image: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
compiled SHA-256: e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
compiled file count: 163
```

`scripts/run-r11-unit.mjs` required clean source, local desktop-linux context,
fixed image/revision, unchanged application inputs, exact helper-directory
inventory and the existing disk budgets. It ran only `node /harness/r10/unit.mjs`
under UID1000, read-only root, network none, no ports, capabilities dropped,
no-new-privileges and Docker logging disabled. Private temporary report/evidence
storage used bounded tmpfs. No credentials, user configuration, Docker socket or
service main were mounted/started. No package-manager install or image build ran.

Reviewed helpers were mounted individually, read-only, into the fixed retained
image. Therefore this is **diagnostic overlay acceptance**, not proof that the
unchanged image includes the new helpers. The internal unit deadline remained
240000ms; output/report budgets were not increased.

| Result | Observed value |
|---|---|
| Overall unit | FAIL / `TEST_FAILURE` |
| Structured report | VALID |
| Child completed / exit | true / 1 |
| Timeout / output limit / spawn failure | false / false / false |
| Reported events / files | 321 / 55 |
| Missing files / unmapped events | 0 / 0 |
| Expected top-level count check | true |
| Recorded skips | 33; governed by unchanged offline skip policy |
| Failures | one: `scripts/persistent-r10.test.mjs:41` |
| Fixed error / cause | `ERR_TEST_FAILURE` / `ERR_ASSERTION` |
| Container stopped / OOMKilled | true / false |
| Input hashes and clean source after run | unchanged |

Line41 is the test declaration location reported by Node, not a captured exact
inner assertion location. No raw assertion values, stdout/stderr or error stack
were retained. No failed report was replaced by later successful cleanup.

### Static failure indication (not a rerun)

The test at line41 spreads `process.env` into its nested test process, replaces
`WEPUU_R10_REPORT_CONFIG`, deletes `NODE_TEST_CONTEXT`, but does not delete
`WEPUU_R10_REPORT_RUN_ID`. The outer unit driver intentionally supplies that
run ID for the dedicated report envelope. The nested test still expects
`JSON.parse(output.stdout).passed` directly (line48); the reporter emits an
envelope when a run ID exists, with the verdict under `report.passed` instead.

This statically identifies a current nested-report contract conflict consistent
with the recorded assertion failure. The sanitized report does not distinguish
its inner assertions, so no exact inner assertion or historical R10 first-failure
root cause is claimed proven. The isolated synthetic invocation lacked the outer
run ID, which explains why its pass cannot establish nested full-unit acceptance.
No environment isolation/assertion change or repeat test was made after failure.

## Safe evidence and immutable overlays

Private result location (not committed):
`C:\Users\liulo\AppData\Local\Temp\wepuu-r11-unit-Q679NH\result.json`.
Directory access was restricted to the current user, SYSTEM and Administrators.
The result contains fixed metadata/projections, not raw test output or secrets.

All overlay files and SHA-256 values, identical before/after:

```text
test/persistent-authorization/r10/evidence.mjs 8130445249f9b015d9b58505fc452a99132be89587092982d8e54f41671c438e
test/persistent-authorization/r10/export-evidence.mjs 742612ade7615d62b1daa2d130cdf08d19533cb1d1861a6e1a80f47db04eda01
test/persistent-authorization/r10/fixed-node-test.mjs 7d3eed6e61d4c91df9c18898dfe741b78f4250c27e4628ddcb3df2e2613863db
test/persistent-authorization/r10/profiles.mjs d531216b1454f787244813d05ecc0e1f75e354f57e2b4f2bc1cb06596a078f0c
test/persistent-authorization/r10/report-schema.mjs 414e7b3fc37a995809e9b92a6d65799bf8065f38eef395aa0da6162227e772ca
test/persistent-authorization/r10/reported-process.mjs e9958598b30c06df3ca68c1b264b23a3b3e1805a1fa71df106716b5a69053824
test/persistent-authorization/r10/reporter.mjs 63d9ce88223fa41365116e7ffdc692a20b2b8e49e1eb8293f7179c5de81223cc
test/persistent-authorization/r10/unit-manifest.json 21015dbd9ac05d662b3036dd4a29b6f0911330c1f87dbc8e85cee2ef54a040c9
test/persistent-authorization/r10/unit.mjs 6122fcc5fcaa749ee1b6b09d49dd9e701b243244f81bff5dffe7c51f1307f223
test/persistent-authorization/database-tests.mjs ec1d58629510448d7ac6620f8f7af24280bf02c2d217feecbc4e2ad619659ace
scripts/persistent-report-channel.test.mjs 2c0588263b5e9573889e7bae60e8eefd9c0af298b45a045ba338aca6b79ce8cd
scripts/persistent-test-result.mjs e61cf56caded067c928be703b9794d5776298714bfae78e3eb85ba06c48d8417
scripts/fixed-node-test.test.mjs 3755fd04fcb1018756285d91327826ef11a371ef5a985e3f419db031410248d0
scripts/persistent-pnpm-r1.legacy-probe.mjs d1c36fa9eaa99e230d91f3b8a6a7fb6025546c216311efded71e457c712bd7f5
```

D: free bytes were6315933696 before and after; initial5GiB and subsequent2GiB
minimums passed. Only the owned test container was considered for stop/inspection;
no other Docker objects or user files were removed. Container artifacts remain
stopped. No production, WordPress, Desktop, OTP, OAuth or MCP access occurred.

## State and next scope (not executed)

```text
P3E2SR4BR11_READONLY_LAUNCH_PASS=True
P3E2SR4BR11_SINGLE_UNIT_GATE_PASS=False
P3E2SR4BR11_DATABASE_EXECUTED=False
P3E2SR4BR11_AB_EXECUTED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

These candidate flags do not revoke or revalidate the separately authorized
historical bounded internal trial. Historical R10/R1 failures remain unchanged.
No Hosted CI, push, PR, merge or deployment was performed in R11.

Next scope, requiring a separate implementation request: isolate the nested
reporter's environment/contract in synthetic tests; preserve the outer envelope
and failure assertions; verify positive and negative nested execution under an
outer run ID. Only after that evidence should another single unit gate be
considered. Database, Console and A/B remain separately gated.
