# WPAuto P3-E2S-R4B-R20: reviewed native fixture adaptation and single-target pass

## Outcome and product boundary

R20 PASSED its authorized scope: the obsolete re-consent fixture now uses the
existing reviewed native Code-to-Refresh issuance contract, and the target file
passed once in a fresh isolated PostgreSQL cluster. All original assertions and
four added rejection checks completed. Main/cleanup diagnostics and exact target
migration ledgers passed. No retry was performed.

This removes one known candidate-regression blocker. It does not validate the
full candidate, Console, default startup, A/B, production deployment, or actual
Desktop account switching. The product goal remains stable, safe single-site
read-only MCP use across the approved Desktop/account lifecycle; no production
OAuth fix or readiness promotion is claimed from this fixture-only result.

Implementation: `895eabaf8c191b08030f743bf214ed95ee29578a`, following the R19
failure result at `435e49e`. R17 failure, R18 offline diagnosis and R19 first-failure
evidence remain unchanged. Local commits only, no push, PR, merge or deployment.

## Minimal fixture changes

Only the target test, one synthetic fixture helper and a new host wrapper/offline
test were changed. Application sources, migration SQL, dependencies, permissions,
protocol guards, shared reporter and prior diagnostic/ledger worker were not
changed. No ADR or public contract change was required.

The three former generic RefreshToken writes were replaced by:

1. Issue first Grant's fully bound native-offline AuthorizationCode through the
   existing adapter, consume it, then issue R0 using `upsertNativeRefresh()` and
   its actual Code parent lookup candidates.
2. Consume R0, then issue R1 with R0 as the parent.
3. For the second Grant, issue and consume a separate Code with a distinct
   synthetic session UID, then issue its explicit-revocation Refresh token.

The new `reconsent-native-fixture.mjs` constructs only synthetic test payloads
and formats parent references from the existing codec's public `candidates()`
API. It implements no cryptographic/OAuth primitives. Bindings retain account,
Client and resource, with the appropriate Grant/session for each chain. Fixture
input is restricted to synthetic HTTPS `.example.test` resources.

The synthetic native scope is `mcp:read offline_access`, required by the existing
native-offline issuance contract. Both business Grants retain their original
`mcp:read` scope; production Desktop/client configuration and authorization are
untouched. Code TTL is90 seconds and Refresh TTL remains3600 seconds. There are
no hand-inserted classifications, guessed real parent keys or profile downgrades.

### Original behavior and four rejection checks

Every original re-consent, old-token denial, Grant separation, revocation reason,
Outbox, claims resolution, Client suspension/conflict/reprovision assertion was
preserved. The offline comparison reverses only the exact approved fixture
replacements and compares the entire file with `435e49e`: identical after newline
normalization. No original assertion was deleted or weakened.

The four additional real-database checks require precise failures:

| Invalid issuance | Required SQLSTATE | Post-rejection evidence |
|---|---|---|
| Code parent not consumed | P0001 | Refresh artifact/classification counts unchanged; token lookup absent |
| Parent does not exist | P0001 | same |
| Resource binding does not match Site | P0001 | same |
| Second Refresh successor from the same Code parent | 23505 | same |

These use known synthetic IDs through the reviewed codec. They do not send OAuth
requests, inspect production tokens or modify a real Grant. Rejection by an
unrelated permission/timeout error would not satisfy the strict SQLSTATE check.
The valid sequence succeeds after the rejection checks, so they did not poison
the fixture's legitimate issuance path.

The original test's `refresh_replay` reason still uses its historical explicit
revokeByGrantId setup; it is NOT represented as a newly executed real R0 replay
or provider-level refresh lifecycle acceptance. Actual replay remains separately
gated in subsequent acceptance.

## Offline and syntax validation

`scripts/r20-reconsent.synthetic.mjs` passed76 checks before the actual database
attempt. Coverage includes exact native binding/scope construction, distinct
Grant/session chains, public codec delegation and parent key formatting, malformed
lookup candidates, refusing production/extra input, original assertion/source
preservation, the four rejection call sites, and mocked single-target process,
missing evidence and save-failure handling. No mock loop launched a real process
or database.

JavaScript syntax, non-executing TypeScript strip-types syntax, change-scope and
`git diff --check` passed. A source-generation anchor was corrected locally before
the offline pass/freeze; it did not launch a formal test. This is not a whole-repo
typecheck/lint or hosted CI result. Host Node26 was used only for orchestration
and pure tooling; actual test execution used the fixed Node24 runtime.

## One actual isolated invocation

```text
run: r20-20261024131812131
UTC start: 2026-10-24T13:18:12.132Z
UTC finish: 2026-10-24T13:18:28.099Z
target: packages/database/test/grant-reconsent.test.ts
target attempts: 1
host / test result: PASS / PASS
report category / status: PASS / VALID
completed / exitCode / signal: true / 0 / null
spawnFailed / timedOut / outputLimitExceeded: false / false / false
raw output bytes: 0
top-level expected / observed: 1 / 1
report total / fileCount: 1 / 1
missing / failures / skips / unmapped events: 0 / 0 / 0 / 0
topLevelCountsMatch: true
diagnostic coverage: COMPLETE
main / cleanup: PASS / PASS
inputs unchanged / evidence saved: true / true
```

The four negative checks are assertions within the original single top-level
test, not four additional top-level cases. PASS of that complete case with no
skips supports their completion; the test manifest was not expanded to create
an artificial count match.

R20 reuses the unchanged, pinned R19 worker/ledger schema and R18 diagnostic
schema. Their fresh internal identifiers are respectively
`r19-20261024131812131-target` and `r18-20261024131812131`. These are compatibility
namespaces for this new R20 timestamp, not reuse of historical R18/R19 results or
resources. Actual containers/network/volumes and host evidence are labeled R20.

The companion diagnostic's constant `testVerdict=NOT_CONFIRMED` and
`ledgerStatus=NOT_CONFIRMED` remain intentional. The independent original process
report supplies test PASS, and exact actual-pool observations supply ledger PASS;
the companion does not grant either verdict itself.

## Actual target ledger and fixed artifacts

```text
actual target DB SHA-256: 7103c8b8e90c7da8e25d213728755952a803793f1bdd843e23fcebcb13f121c4
observations: before business fixture mutation / before close
exact entries per observation: 16 (001–013,015–017)
014 / Console objects: absent / absent
canonical ledger SHA-256: 797bb34ec9ce55f1b34e5f0648f2e6982e335bcb8c1c76f5eb7580643b896879

Test image: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
Image revision: c404ed52228ce5492a85674547998d2f5d31772e
PG image: postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
PG: 16 / linux-amd64
Test Node: v24.22.1 / Krypton / UID1000
tsx: 4.23.13
loader SHA-256: 7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d
compiled163-file hash: e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
fixed-Node24 helper import probe: PASS
```

No image rebuild, pull or package installation occurred. Explicit read-only
source overlays include the adapted test and new fixture helper, plus the frozen
report/diagnostic/ledger tools. No Database prototype or migrator interception
was used. The original test executed its explicit authorization migration profile;
the actual target pool's identity and full names/hashes were checked, not the
outer postgres database or an empty scheduling parent.

## Isolation, data boundary and cleanup

The run created a fresh internal network, data/evidence volumes and synthetic
credential. No host ports were published. The UID1000 test used only the PG
container namespace's loopback, readonly root, capability drop, no-new-privileges,
bounded tmpfs and log driver none. No Docker socket, production config, user
credential directory or whole workspace was mounted. Only structured metadata
and fixed diagnostic classifications leave the test process; no WordPress
content, actual user information, Token or raw payload was exported.

The no-network seeder had readonly root and only CHOWN above cap-drop ALL,
restricted to the new evidence volume. It prepared0700 directories and0600
synthetic credential ownership for UID1000. PostgreSQL used its normal fixed-image
initialization and dedicated writable data volume. This is isolated test-admin
evidence, not general application-runtime least-privilege acceptance.

File/group/transport caps remain150000/300000/330000ms. There was no failed-test
retry or relaxation of timeout, migration, skip or report conditions. The host
private evidence directory was ACL-verified for the current user, SYSTEM and
Administrators; secrets are not placed in Git or command arguments.

All four run-owned containers were independently inspected stopped, exit0,
matching run labels, no OOM and zero published ports:

```text
wepuu-r20-20261024131812131-probe
wepuu-r20-20261024131812131-target-tests
wepuu-r20-20261024131812131-target-pg
wepuu-r20-20261024131812131-target-seed

retained network: wepuu-r20-20261024131812131-target-net
retained data volume: wepuu-r20-20261024131812131-target-data
retained evidence volume: wepuu-r20-20261024131812131-target-evidence
```

Nothing was automatically deleted, and no old failure cluster was reused.
D: free bytes were6186053632 at entry and6152499200 at the runner postcheck,
above the unchanged initial5GiB and ongoing2GiB gates. Runner and separate host
verification found no changed frozen input hashes. Worktree was clean before
this documentation addition.

Private result, not committed:
`C:\Users\liulo\AppData\Local\Temp\wepuu-r20-reconsent-qAA8BL\result.json`.

```text
result SHA-256: 86d63d1acc1e29f816f6ebbe0dbca328a6bed5958605b229ce47a2ed58c1c980
target test: a05421184ee623c6ebe8912bcb63bba5f80e07fdc125508e05aac064d429ca0b
native fixture helper: 421e75a05bd82fc97b92a3485379615aa1e2efbe3fe4728b080a25fcf01639d6
host wrapper: f56489956cbf4cfec8f3fa99f583f9d2bcb4364fca066a20d56e87d93af9e147
offline synthetic tool: b955f9ec0bde72851408207b57939cd98a37f1e3b93a892b213ad21b696446ff
```

## Final state and next step

```text
P3E2SR4BR20_FIXTURE_ADAPTATION_PASS=True
P3E2SR4BR20_SINGLE_TARGET_DATABASE_PASS=True
P3E2SR4BR20_TARGET_MIGRATION_COVERAGE_PASS=True
P3E2SR4BR20_CLEANUP_PASS=True
P3E2SR4BR20_TARGET_ATTEMPTS=1
P3E2SR4BR20_FULL_DATABASE_REGRESSION_EXECUTED=False
P3E2SR4BR20_LEGACY_CONSOLE_EXECUTED=False
P3E2SR4BR20_SERVICE_STARTUP_EXECUTED=False
P3E2SR4BR20_AB_EXECUTED=False

P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Next: a separately authorized complete candidate-plus-retained database
regression, followed only on success by the independent isolated Console
regression. That later gate must include this new helper and adapted target in
the exact overlays; historical single-target success is not a substitute for
the complete run. R20 stops here, without production access, startup, A/B,
real Desktop OAuth/MCP or any other acceptance expansion.
