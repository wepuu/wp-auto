# WPAuto P3-E2S-R4B-R26 R24 failure evidence extraction

## Result

The single authorized evidence extraction passed. Both retained original reports
agree that R24 stopped at `expired_code` with `ASSERTION_FAILED` and the inner
assertion `DENIED_STATUS`. The retained Token diagnostics contain200 with
`NOT_OBSERVED`, followed by500 with `server_error`. The latter is consistent
with the status assertion expecting400, rather than evidence that a successful
exchange violated an expiry guard.

The exact internal runtime cause remains NOT_CONFIRMED. No A/B mode identifier,
SQL exception or response body was retained in these diagnostics, and none was
manufactured from request order. Token absence, consumption rollback and the
specific SQL rejection path are not independently established by this report.
This result supports R25's error-mapping hypothesis but does not prove it.

No database or Authorization/Control service was started, no protocol flow was
repeated, and no production host, WordPress, Desktop credential or real email
was accessed. No application, SQL, migration, dependency, image or production
configuration changed. R24's failed matrix and unexecuted transition remain so.

## One bounded invocation

```text
implementation: 015f8995ca24855be3a82f30bbcd0547a0a2367c
run: r26-20261024161237040
UTC start: 2026-10-24T16:12:37.041Z
UTC finish: 2026-10-24T16:12:41.843Z
Asia/Shanghai window: 2026-10-25 00:12:37 to00:12:41
monotonic duration:4801ms
extraction attempts:1
service reproduction attempts:0
```

The source was clean before execution. The Docker Context was verified as
`desktop-linux` with the local Linux-engine named pipe. The retained volume's
local driver and `wepuu.run=r24-20261024144904933` /
`wepuu.phase=r24-ab` labels matched. All seven owned R24 containers were stopped
with their expected exits (matrix1, others0) and no OOM at the initial check.
No running container mounted the evidence volume. A separate final read-only
listing confirmed all seven R24 containers remained exited.

Only one new container was created:
`wepuu-r26-20261024161237040-extract`. Its fixed image was:

```text
Authorization image: sha256:186da8a26977741ee8b1a2f1399448216a80986e0af9a87ebd661a0f4779379f
image revision: c404ed52228ce5492a85674547998d2f5d31772e
platform:linux-amd64
actual extraction runtime:Node v24.22.1 / UID1000
extractor SHA-256:f21c640df3a4bd06307e69887782c2ed56eb6e365248519fd435a2f190545d01
```

The image was inspected, not rebuilt or pulled. Its command was overridden to
run only the Node evidence extractor; no application module was imported.
The container used network=none, UID/GID1000:1000, a read-only root, disabled
healthcheck/logging, all capabilities dropped and no-new-privileges. Limits
were128MiB memory with no additional swap,32 PIDs and0.5 CPU,30seconds attached
transport and64KiB output. There were no published ports, Docker socket or
database/data-volume mounts. Only the exact evidence volume and extractor file
were mounted, both read-only. Post-extraction inspection confirmed network=none,
read-only root, user, memory/PID limits, disabled logging and both read-only
mounts. The new container stopped normally with exit0 and no OOM; no retry or
forced stop occurred. Stopped containers and old volumes were retained.

## Retained report identity and projection

Only these two fixed paths within the read-only evidence mount were read:

| File | Bytes | Raw source SHA-256 |
|---|---:|---|
| matrix-fd255ef5ec6d/integration.json |13832|31acc3a718d02e3a6bde192ea33b78765c42b092e6d47ca977d0d267a209fb2c|
| matrix-fd255ef5ec6d/driver-result.json |15489|1ca7c29a86f302bcf6d72e5422d69e693f6c6e3c136cc634f75b9d041eba9971|

The reader rejects symlink directories/files, non-regular files, empty reports,
reports over1MiB, malformed JSON, context mismatch and conflicting projected
reports. It opens with O_NOFOLLOW where supported and compares handle metadata
before/after a bounded read. These checks and the read-only mount do not claim
a whole-volume immutable snapshot or scan of all volume files.

JSON parsing occurred inside the container. Only fixed stages, categories,
assertion/check names, bounded counters, cleanup booleans and safe Token status/
error categories crossed to the host. Arbitrary strings and unknown fields were
discarded. There was no export of original reports, full diagnostics, exception
text, response bodies, Code, Token, Cookie, Session UID, DSN or secrets. The
`postgres.private.*` files were not opened.

The independent primary integration projection and the driver's nested matrix
projection matched. The outer driver retained `SERVICE_MATRIX_FAILED`; the
inner result supplies the newly recovered `DENIED_STATUS`. Both reports still
have passed=false. Child evidence and cleanup passed, while protocol assertions
did not. Request counts were9 authorization and6 Token requests, with one local
mock delivery and24 completed known checks. This is historical R24 observation,
not new protocol activity or a complete37-check pass.

The private host result is:

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-r26-extract-pJwv3N\result.json
SHA-256:9da7497b293135f2e985266328e8d68d875352b36872bbc42127af53135a9089
```

The new directory and result ACLs were verified for the current user, SYSTEM
and administrators. No R24/R25 host result was overwritten. Only safe summaries
and hashes are documentation artifacts; the actual private result is not added
to Git.

## Interpretation and remaining boundary

The status evidence narrows R24 from an unspecified `expired_code` assertion to
an unexpected HTTP denial status, with a recorded500/server_error. It does not
identify which database function or branch produced that response, and does
not prove an expired Code was exchanged successfully. A/B mode attribution is
explicitly `NOT_RECORDED`.

R25's static path remains the leading explanation: the fixed upstream
[authorization-code handler](https://raw.githubusercontent.com/panva/node-oidc-provider/v9.12.2/lib/actions/grants/authorization_code.js)
consumes before issuing tokens; the
[consumption helper](https://raw.githubusercontent.com/panva/node-oidc-provider/v9.12.2/lib/helpers/grant_source.js)
awaits adapter consumption. The project's migration016 rejects an expired
original Session with a SQL exception, and the database adapter has no explicit
mapping of that exception at the query boundary. The later `findAccount` guard
cannot be assumed to classify an earlier consumption failure. R26 did not inspect
raw exceptions or execute this path, so this remains a supported hypothesis.

The next task, if approved, should narrowly establish this mapping with fixed
candidate artifacts and separate fresh A/B first-use fixtures. Required evidence
includes exactly-one-row Session expiry/readback, mode and sub-stage, fixed
internal error classification, HTTP status/error and absent Token fields. Use
synthetic identities and private files; do not expose raw exceptions or convert
every database error to invalid_grant. Do not rerun the complete matrix or
transition to diagnose this single failure. Any application fix and full A/B
regression remain separately authorized steps.

## Offline validation and final state

`scripts/r26-extract.synthetic.mjs` passed82 checks once before Docker access.
The checks cover white-list projection, unknown/sensitive fields, bounds,
conflicting/missing/invalid/oversized reports, directory junction rejection,
resource ownership, historical stopped states, active-volume-user denial,
container isolation arguments and fail-closed result validation. Temporary
synthetic fixtures were retained; they contain only dummy sentinel data. Host
Node was v26.11.1; the actual extractor independently reported v24.22.1.
Runner syntax and `git diff --check` passed. No whole-application regression or
Hosted CI result is claimed. R24/R25 historical source-freeze guards were not
modified or bypassed. The document uses the repository format, with the writing
skill applied to distinguish observations from causal hypotheses.

```text
P3E2SR4BR26_EVIDENCE_EXTRACTION_PASS=True
P3E2SR4BR26_FIRST_ASSERTION_CONFIRMED=True
P3E2SR4BR26_EXACT_RUNTIME_CAUSE_CONFIRMED=False
P3E2SR4BR26_CLEANUP_PASS=True
P3E2SR4BR26_SERVICE_REPRODUCTION_PERFORMED=False

P3E2SR4BR24_AB_MATRIX_PASS=False
P3E2SR4BR24_B_STOP_A_TRANSITION_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after this extraction and record. No application repair, protocol replay,
additional container attempt, image publication, push, PR, merge or deployment
was performed.
