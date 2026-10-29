# P3-E2S-R4B-R10-R1 offline report-channel repair

## Scope and outcome

Operator requested offline report-chain completion and a next implementation plan.
Input was R10 stop record `0130ee7009101de0c142c8258f345f396b02f903`.
Tool-only repair commit: `a91342003a72aa5c76fa6e0778b9a47c46b5fe58`.
No R10 full unit, database,014, service startup, A/B or production attempt was rerun.
Application implementation, migrations, dependencies, production and Desktop config
were not modified. No real mail, WordPress, MCP or credentials were accessed.

Core report repair is validated. A newly added positive **pnpm launcher** synthetic
probe failed and remains unresolved. Therefore this is not an end-to-end launcher
PASS or permission to resume the full regression.

## Proven defects and evidence boundaries

1. Previous unit/DB wrappers parsed all package-manager stdout as JSON. Any prefix,
   suffix or unrelated stdout can destroy the report framing.
2. A parsed failing report could be lost when the following assertion threw:
   catch then inspected only `error.stdout` and replaced the already-parsed report.
   This exact control flow is reproduced with synthetic values.
3. On Windows, a raw drive-letter reporter path is not a portable ESM import
   specifier. `file:` URL conversion fixed the new host synthetic transport test.

These are confirmed local tooling problems, **not proof of the exact original R10
unit failure**. The historical detailed report remains unavailable. In development,
one new-test bracket typo was corrected and a Windows-path synthetic failure led
to the file-URL fix; those development failures are not erased or labelled passes.

## Report design

- Use Node's custom reporter output with `--test-reporter-destination` to a fresh,
  private per-invocation directory, not package-manager stdout.
- Bind schema version, random run ID, phase and expected file manifest. Reject
  foreign runs, unknown fields, inconsistent PASS, missing/partial/oversized report,
  symlink/directory and access failures.
- Preserve process completion, exit code, allowed signals, timeout/spawn/output-limit
  state **separately** from test results. A report failure or process failure wins.
- Preserve valid report even after nonzero exit or timeout; a successful test child
  cannot overwrite a later database-gate failure.
- Do not retain or export stdout/stderr, assertion actual/expected, test titles,
  original exception messages/stacks or secrets. Only fixed codes, counts, manifest
  file identifiers and line numbers are accepted. Unmapped event count is retained.
- Windows temporary report directories restrict ACLs to current user/SYSTEM/admin;
  Linux directories are0700. Process output is discarded with a bounded byte budget.
- Unit and DB callers use the same helper. Full DB integration remains NOT_RUN.
- Unit manifest now explicitly includes the new synthetic test file:54 files;
  the manifest was updated offline, not executed. Existing acceptance conditions,
  migration profiles and skip policy were not relaxed.

Primary references checked2026-10-24:
[Node24 custom reporters and destinations](https://nodejs.org/docs/latest-v24.x/api/test.html#custom-reporters).

## Offline validation

All named containers used retained Test image
`sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c`,
Node24.22.1, UID1000, network none, read-only root/helper mounts, no ports,
no credentials/sockets, cap-drop ALL/no-new-privileges and64MiB tmpfs.
Image code was not rebuilt; only reviewed local diagnostic helpers were overlaid.

| Run | UTC interval | Actual result |
| --- | --- | --- |
| `wepuu-r10r1-reports-20261024a` | 2026-10-23T23:29:07Z–23:29:12Z |33/33 synthetic core/tool tests passed,0 skips; exit0 |
| `wepuu-r10r1-reports-20261024b` | 2026-10-23T23:31:05Z–23:31:16Z |33 passed,1 failed; new real pnpm→tsx positive probe produced MISSING report; exit1 |
| `wepuu-r10r1-reports-20261024c` | 2026-10-23T23:34:56Z–23:35:00Z |34 core/tool tests passed; the known failed optional pnpm probe was NOT_RUN/skip1, not converted to a pass; exit0 |

Dates above are recorded UTC; client-local date was2026-10-24 Asia/Shanghai.
All three were read back as exited; no report-test container remained running.
No network/data volume or database was created. Read-only version/source probes
used disposable `--rm` containers. Temporary synthetic files were removed only from
each test's exact owned directory; no global Docker/filesystem cleanup occurred.

The final core set covers mixed/prefixed output, nonzero exits, contradictory verdicts,
reporter exceptions, missing/malformed/oversized/wrong-run reports, symlink/permission
denial, output limits, timeouts with/without reports, spawn failure, secret sentinels,
and outer evidence projection. It includes actual Node reporter subprocesses, not
only mocked event streams. Initial host Node26 results were31 passed/2 platform
skips out of33 at that earlier source stage; these are tooling evidence, not the
application runtime gate.

## Newly reproduced launch blocker — not the historical root cause

The actual single-fixture pnpm probe was deliberately enabled only in run b using
`WEPUU_REPORT_SYNTHETIC_PNPM=1`. It was **not** the54-file R10 unit list. It failed
to produce a reporter file, demonstrating that report framing alone is insufficient
to resume this launcher. Its assertion was not changed to expect success or removed.

Additional bounded network-none, UID1000, read-only version probes showed:

- `pnpm --version` in `/tmp` and `/workspace`:11.19.0, exit0.
- `pnpm exec node --version`: exit1;1098 output bytes; fixed observed code `EROFS`;
  an install-reference boolean was true; raw output suppressed.
- `pnpm exec tsx --version`: same exit1/1098 bytes/EROFS/install-reference observation.

These are direct evidence of a current local pre-reporter launch problem. The
[pnpm11 release notes](https://pnpm.io/blog/releases/11.0) document default
`verifyDepsBeforeRun=install`, consistent with an attempted write at execution time.
The later [11.28.4 notes](https://pnpm.io/zh/blog/releases/11.28.4) discuss behavior
when that install fails in read-only/offline environments. Those sources support
an explanation, not a retrospective claim about the missing R10 failure. No pnpm
upgrade, install, writable-root workaround or package-manager setting change was made.

One auxiliary version-probe script initially assumed a `.cjs` pnpm entry; the fixed
image actually has `/usr/local/lib/node_modules/pnpm/bin/pnpm.mjs`. Correcting that
read-only probe did not modify the image or a runtime setting.

## Frozen core helper hashes

```text
reported-process.mjs 3ecb0d405e7a80ed9230a58aab37d02265bbe389ab8d32bced3caa0bc357f165
report-schema.mjs    414e7b3fc37a995809e9b92a6d65799bf8065f38eef395aa0da6162227e772ca
reporter.mjs         63d9ce88223fa41365116e7ffdc692a20b2b8e49e1eb8293f7179c5de81223cc
```

## State

```text
P3E2SR4BR10R1_CORE_REPORT_CHAIN_SYNTHETIC_PASS=True
P3E2SR4BR10R1_READONLY_PNPM_TRANSPORT_PASS=False
P3E2SR4BR10R1_END_TO_END_LAUNCH_READY=False
P3E2SR4BR10_HISTORICAL_UNIT_FAILURE_CAUSE_CONFIRMED=False
P3E2SR4BR10_COMPLETE_LOCAL_REGRESSION_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The next plan is recorded separately. No automatic formal retry follows this task.
