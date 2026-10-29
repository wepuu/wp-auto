# WPAuto P3-E2S-R4B-R46: single offline corrected-patch lock refresh

Date:2026-10-25. Baseline:
`61a73ac9a7be397ff3f60e7a8104fe7524ab611e`.
Result: **FAIL / STOPPED ON TIMEOUT**. No consistent new lock preview was
produced. No retry, network fallback, hand-edited lock or repair application.

## Authorized scope and fixed inputs

This phase allowed one additional offline, lock-only metadata refresh in an
independent shadow workspace. Actual sources/configs/manifests/root lock,
installed packages, migrations, R45 evidence and R40 images remain unchanged.
Only new R46 local verification helpers and this report were written.

Pinned image:
`sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c`.
Revision:`c404ed52228ce5492a85674547998d2f5d31772e`.
Observed Node24.22.1, pnpm11.19.0, TypeScript5.9.3.
Loading version metadata and Node syntax checks are not compiler invocations.

| Input | SHA-256 |
| --- | --- |
| Frozen original root lock | cea3bc64773f878a668cabeb9d366086f69ad2c6921e5095ed6d49292bddad87 |
| R45 shadow root lock, still naming rejected patch | f93bfcd02138dcc4dacfdc7f40e2c0affaa2b79e94eb97d5916913caf94ad238 |
| Corrected declaration diff |33dc3ecb325a9092ae4bab170890a3bab05e7fc9127783dbc334c766dcbe1d3c |
| Frozen six-package type support lock |d33085b902e69bcffcbf840d072ac003d8d243a1f18c1014bd79e642624b12a8 |

The old shadow lock was a controlled input, not an accepted candidate.
The independent type-support closure was not re-resolved or installed.
R45's successful corrected-patch applicability result remains historical;
R46 did not turn it into compiler acceptance or newly repeat it after failure.

## Public metadata cache and pre-execution corrections

The existing R45 source container
wepuu-r45-patch-lock-20261025131610383 was verified by image/run label and
stopped state. Only its public registry subtree was copied:

```text
/tmp/wepuu-r45-home/.cache/pnpm/v11/metadata/registry.npmjs.org
```

No complete HOME, user/global config, credential file, store package contents
or application filesystem was copied. The first inventory pattern expected an
older metadata directory layout; read-only path inventory identified pnpm v11.
The prior store had zero content-addressed package files.

Cache inventory:263 JSONL files,92876100 bytes (about88.6MiB).
All JSONL records were readable. Paths were restricted to public package/scoped
package names, links and unknown file types rejected. Each file was hashed and
the copied manifest hash was:
`6dabcb6859658c59ab641b238b0795edc7a57d073da48e5639b6b99bc84e9d90`.
The cache and manifest were read-only mounts and were copied into a fresh
container-local pnpm cache; host hashes were rechecked afterwards.

Two local launcher issues occurred **before any pnpm refresh**:

1. An escaped regex syntax error was caught by Node --check and corrected.
2. Run r46-offline-20261025141839467 rejected the copied cache at the locally
   selected64MiB aggregate cap. It created no container and ran no pnpm command.
   The error initially had a generic wrapper category; the subsequent bounded
   inventory localized the size rejection. That failure is preserved.

The internal copy budget was explicitly revised to128MiB after measuring the
complete public cache, keeping the16MiB per-file cap,400-file cap, path/hash
checks, private ACLs and5GiB initial workspace disk gate. This was a local
preparation-budget change, not a dependency, compiler, integrity or production
resource acceptance relaxation. It did not consume or reset the one pnpm
invocation allowance. No claim is made that the original64MiB preflight passed.

## Single actual offline attempt

Run:`r46-offline-20261025142217847`.
Observation window:2026-10-25T14:22:17.850Z to14:24:42.276Z.
Exactly one container and **one pnpm lock refresh invocation** occurred.

The container used network=none, --pull=never, cap-drop=ALL,
no-new-privileges, no healthcheck and no Docker log persistence.
Harness, prior evidence, public cache and manifests were read-only host mounts.
No host application source directory was mounted for writing.

Inside a new shadow workspace, the old shadow lock and the corrected diff
were placed together without manually modifying any hash in the lock.
All copied project package manifests were hash-checked. The pnpm environment
used a fresh HOME/config/store, empty user/global npmrc, explicit offline config
and COREPACK_ENABLE_NETWORK=0.

Executed once:

```text
pnpm install --lockfile-only --offline --ignore-scripts --ignore-pnpmfile --no-frozen-lockfile --fetch-retries=0 --reporter=ndjson --config.store-dir=/tmp/wepuu-r46-store
```

The process reached its **120000ms timeout**:

```json
{
  "completed": true,
  "exitCode": null,
  "timedOut": true,
  "outputLimitExceeded": false,
  "category": "OFFLINE_REFRESH_FAILED",
  "stdoutBytes": 146151,
  "stderrBytes": 0
}
```

The primary stopping stage is single_offline_lock_refresh.
The wrapper's later GATE_NOT_CONFIRMED does not replace that process timeout.
No pnpm-specific ERR_PNPM code was observed by the fixed diagnostic projection.

The shadow lock hash after the timeout remained
f93bfcd02138dcc4dacfdc7f40e2c0affaa2b79e94eb97d5916913caf94ad238:
the **old rejected-patch lock**, not a newly generated candidate. It is retained
privately as failure evidence and not committed as a valid root lock preview.

This does not prove missing cache, network retries, resource pressure or a pnpm
defect. The helper retained safe process metrics and fixed error categories,
not raw NDJSON; the final internal pnpm substage is **NOT_CONFIRMED**.
No extra diagnostic resolution or production investigation followed.

## Verification, protection postchecks and incomplete gates

A new closed comparison contract permits only:

- patchedDependencies.better-auth@1.7.7 matching the corrected diff;
- the exact account-auth importer reference for that package;
- that package's corresponding snapshot key.

It does not generically strip every patch_hash or ignore other dependency
changes.18 pure synthetic checks passed, including wrong/old hashes, extra
patches, package count changes, integrity/specifier/peer/settings drift,
nonzero exit, timeout, incomplete result and output-limit cases.
These checks do not substitute for the full comparison, which was NOT_RUN
because the refresh timed out.

Read-only owned-container postcheck confirmed:

```json
{
  "stopped": true,
  "exitCode": 1,
  "oomKilled": false,
  "networkMode": "none",
  "workspaceChanges": 0,
  "shadowNodeModulesChanges": 0,
  "storePackageContentFiles": 0
}
```

Host source/tool baselines and private prior/cache input hashes were unchanged.
No package was installed, no lifecycle script executed, no patch applied, no
candidate image built/pulled and no application/database service started.
There were zero compiler, OAuth, Refresh, MCP, production/SSH or Hosted CI calls.
No actual dependency/config/lock, design/ or unrelated user file was modified.

| Gate | R46 result |
| --- | --- |
| Fixed input identities and six-package lock hash | PASS |
| Public cache provenance, JSONL/path/hash checks | PASS after documented local preparation correction |
| Pure comparison/failure contracts |18 PASS |
| Single offline pnpm refresh | FAIL:120s timeout |
| New corrected patch/root-lock pair | NOT_CONFIRMED; retained lock still has old hash |
| Full285-package comparison against original lock | NOT_RUN |
| New standard patch applicability check | NOT_RUN after stop; R45 evidence preserved |
| Installation/repair/full typecheck/regression tests | NOT_RUN |
| Owned-container and protected-input postchecks | PASS |

No later successful syntax test, cleanup or git command overrides the failed
refresh. The operation stopped without retrying, increasing the120s process
budget, enabling networking or hand-editing the lock.

## State and stop

```text
P3E2SR4BR46_OFFLINE_LOCK_REFRESH_PASS=False
P3E2SR4BR46_PATCH_LOCK_PAIR_CONFIRMED=False
P3E2SR4BR46_RUNTIME_CLOSURE_UNCHANGED=NOT_CONFIRMED
P3E2SR4BR46_READY_FOR_REPAIR_APPROVAL=False

P3E2SR4BR46_DEPENDENCY_CHANGE_APPLIED=False
P3E2SR4BR43_FULL_DATABASE_TEST_TYPECHECK_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

RUNTIME_CLOSURE_UNCHANGED above concerns a **new refreshed candidate closure**,
not the actual working tree: actual protected runtime/dependency input bytes
were unchanged. R45's static review and historical R41 A/B results are not
rewritten, broadened or newly revalidated.

Any later action requires a separate bounded decision. First clarify the local
pnpm timeout/last-stage evidence gap from offline tooling and retained public
artifacts; do not automatically repeat the refresh, widen the deadline or
reopen the network. Do not enter application, installation or production
acceptance with this mismatched lock+patch pair.
