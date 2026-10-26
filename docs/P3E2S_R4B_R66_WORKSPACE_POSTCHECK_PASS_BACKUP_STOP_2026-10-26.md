# P3-E2S-R4B R66 — Workspace postcheck passed; pre-materialization backup stopped

Date: 2026-10-26  
Source HEAD: 24fba1c4dc8c30eb1c66a329a59d5b402651f67a  
Scope: one supplemental read-only inspection of the existing stopped R65 container

## Outcome

The missing R65 filesystem gate is now confirmed: one complete streaming
Docker diff returned exit 0, with zero A/C/D changes at /workspace or beneath it.
The stopped container's identity and projected state matched before and after.
The retained R65 evidence, formal artifacts and source baseline passed both
pre- and post-inspection verification.

R66 then stopped at original_file_backup, before the materialization gate.
The backup preparation / original-permission capture was not confirmed.
The originals directory is empty; no formal candidate file was written.

R66 overall remains false. R65 overall remains false and its record was not
rewritten. Successful supplemental evidence does not override the later
backup failure or authorize bypassing it.

## New tools and offline verification

Added:

- scripts/supplement-r66-postcheck-once.mjs
- scripts/finish-r66-materialization.mjs
- test/persistent-authorization/r66/diff-stream.mjs
- test/persistent-authorization/r66/evidence.mjs
- test/persistent-authorization/r66/contracts.synthetic.mjs
- test/persistent-authorization/r66/identity.synthetic.mjs
- This record

The finish script was created and syntax-checked, but **not executed**.
Existing R65 and earlier tools were not changed.

Offline checks:

| Suite | Result |
| --- | --- |
| Streaming parser, process lifecycle and safe-output checks | 59 passed |
| Container identity, state, mount and time-bound checks | 24 passed |
| New module / entrypoint syntax checks | Passed |

The streaming suite included split UTF-8/records, CRLF, missing final newline,
unknown markers, ambiguous paths, workspace-prefix boundaries, byte/line
limits, failed spawn, nonzero exit, timeout, stream failure, late failure and
sensitive-sentinel filtering. One real local Node utility child emitted
2,700,000 bytes; this was not an application, compiler, installer or Docker
process. The synthetic stream test also covered 2,700,000 bytes.

The identity suite rejected wrong image/run/phase/ID, live or abnormal state,
nonzero exit/OOM/restart, attached networks, invalid execution times and
wrong/writable/duplicate/missing mounts.

No full repository regression or Hosted CI is claimed.

## Actual execution

Supplement started UTC: 2026-10-26T15:33:19.706Z  
Main checks stopped UTC: 2026-10-26T15:33:51.393Z  
Monotonic main duration: 31.6885775 seconds; receipt verification followed.

Local Docker context was verified as desktop-linux before inspecting the
container. Only context metadata, two whitelisted container inspections and
one streaming diff were requested. No full inspect environment or credentials
were exported.

Retained container:

- Name: wepuu-r65-formal-20261026151245462
- ID: 6c35578657757cb48597f2cb369a2bda027bd42c6987343ea36455a9bec38f7b
- Image: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
- Created: 2026-10-26T15:12:55.396105952Z
- Started: 2026-10-26T15:12:56.157967238Z
- Finished: 2026-10-26T15:15:47.963036282Z
- Stopped, exit 0, no OOM, restart count 0, PID 0
- No networks; six expected read-only bind mounts

These timestamps fit the recorded R65 window. The complete whitelisted
inspection projections were equal before and after the diff. This is bounded
identity/state evidence, not a claim that unrecorded historical activity is
cryptographically excluded.

## Complete streaming diff result

| Field | Observed value |
| --- | --- |
| Invocation count | 1 |
| Process closed / exit | true / 0 |
| Timeout / signal / spawn error / stream error | false / null / false / false |
| CLI kill requested | false |
| Parsed rows | 21,239 |
| A / C / D counts | 21,235 / 4 / 0 |
| /workspace A / C / D counts | 0 / 0 / 0 |
| stdout bytes | 2,960,723 |
| stderr bytes | 0 |
| Output complete | true |
| Raw path list saved | false |
| stdout SHA-256 | d3e823f798e88011b885424e38c53430ca9df0930c768ef8a24c184b5775c324 |

The fixed limits were 120 seconds, 64 MiB stdout, 64 KiB stderr and 64 KiB
per line. The actual output was larger than the R65 launcher's 2 MiB capture
limit. This substantiates the output-volume risk of that old design, but
does not backfill R65's missing child-process error/timeout classification.

Only change-type counts, workspace counts, byte counts, process status and
stream hashes were retained. Non-workspace path contents were not submitted
or treated as additional product acceptance.

References:
[Docker diff semantics](https://docs.docker.com/reference/cli/docker/container/diff/)
and [Node child-process buffering and streams](https://nodejs.org/api/child_process.html).

## Backup stop and evidence limits

First recorded R66 failure:

    stage=original_file_backup
    category=CUSTODY_INPUT_OR_INTERNAL_FAILURE
    operation=NOT_OBSERVED
    code=NOT_OBSERVED

The stage includes creating/protecting/checking the new backup directory and
capturing the three originals' permission metadata. The originalPermissions
and backupFiles fields were not produced. A final read-only check found the
new originals directory empty.

The retained classification does not identify whether the remaining failure
was directory ACL validation, permission metadata collection, JSON/encoding
handling, or another internal assertion. It must not be described as a proven
Windows access denial or a proven encoding error. The raw exception, stderr,
SDDL and stack were not exported.

No helper was fixed and rerun after this failure. No further Docker command,
permission collection, installation or compilation was executed. The
post-materialization verifier was not run. No rollback was needed because
none of the 11 formal files had been applied.

A minimal subsequent task should first validate the permission-backup
boundary and its safe failure classification offline, then reuse the pinned
R66 diff evidence after preservation checks. It should not automatically
repeat Docker diff, the successful R65 installs or compilation.

## Evidence and unchanged state

New private root:

C:\Users\liulo\AppData\Local\Temp\wepuu-r66-custody-CUSmIp

| Evidence/tool | SHA-256 |
| --- | --- |
| receipts/result.json | 1aa0147a288cb0b1615590999df0ec080a0da18223f580465ef37af10c68b29d |
| completion.json | c9a504095650169bf7e8442b3d8d04650bf745e35d42c21eeb31bba166018f20 |
| R66 supplement entry | d91783f2b35eeab9629d52f5eccabfe36e42e3d08c2acf5539bb4fb1f0cf01b0 |
| Unexecuted finish entry | 1688dc9589e3a0d927ca21992e23fc5590b7eec17d30e1c3b9e9631b8a1edb77 |
| Streaming reader | 1592326b82ecbefcc8ad9b7975c0f7b8faf07ac5258b443cd5c1a9cca19067c8 |
| Evidence/identity helpers | e5e9d0f29569e3e9475acbe9d614d97d9826da6f1f1834e2d0a47431d8fa1b6a |
| Stream synthetic suite | 3e90e1172a8cbd15ffe0a833b913269b08435cfa9691ef479a3fc87790768dc7 |
| Identity synthetic suite | d85e7d6301ff6a64745a4b2a0b51c96f02150ac3583f1e94a49de66da411735b |

The private completion confirms the failed supplement's receipt was protected
and verified. It does not claim materialization succeeded. The three source
files retain their original hashes:

- pnpm-workspace.yaml:
  876d3dcad94455e53c19db4c6f8b860435c1e1e17fe7458fecbd07e88f9967a8
- pnpm-lock.yaml:
  cea3bc64773f878a668cabeb9d366086f69ad2c6921e5095ed6d49292bddad87
- packages/database/test/tsconfig.json:
  380061e9a8be3ef243d544ce7bffdceb0115afe0c71103584b8b5984c84e6676

All eight proposed new formal files remain absent. Tracked diff and diff-check
were empty. Existing untracked task work and all historical evidence remain.

No production, business service/database, WordPress, OAuth/MCP, OTP, migration,
deployment, real node_modules, design/, credentials, commit, push, PR or merge
operation occurred. No existing container/image/volume/cache or evidence was
deleted. No WordPress tool input/output or content entered the control plane.

## Status

    P3E2SR4BR66_STREAMING_DIFF_TESTS_PASS=True
    P3E2SR4BR66_RETAINED_CONTAINER_IDENTITY_PASS=True
    P3E2SR4BR66_WORKSPACE_POSTCHECK_PASS=True
    P3E2SR4BR66_ARTIFACT_REVALIDATION_PASS=True
    P3E2SR4BR66_ORIGINAL_BACKUP_VERIFIED=False
    P3E2SR4BR66_EXACT_11_FILES_MATERIALIZED=False
    P3E2SR4BR66_SUPPLEMENTAL_RECEIPT_VERIFIED=True
    P3E2SR4BR66_OVERALL_PASS=False
    P3E2SR4BR66_CONTAINER_START_ATTEMPTS=0
    P3E2SR4BR66_DIFF_INVOCATIONS=1
    P3E2SR4BR66_INSTALL_ATTEMPTS=0
    P3E2SR4BR66_COMPILER_INVOCATIONS=0
    P3E2SR4BR66_LOCK_GENERATION_ATTEMPTS=0
    P3E2SR4BR65_OVERALL_PASS=False
    P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
    NOT_READY_FOR_PUBLIC_REGISTRATION=True

Stop. Full repository regressions and Hosted CI remain NOT_RUN. Historical
limited internal read-only trial authorization is not changed by this result.
