# P3-E2S-R4B-R92: Hosted PostgreSQL image preflight stop

## Identity and bounded execution

The single ordinary append commit is
`1349f468a7d646dae6330569f61365799fa36939`, parent
`5cda5f299036df3df561aabb87c52914328ec48d`, on
`codex/p3e2sr4b-r68-ci-20261027`. It contains only the fixed-runtime test
context repair and the R90/R91/R92 candidate documentation (four files).
PR #104 remains open and Draft.

Actual Hosted evidence: Phase 2 Platform pull_request run
[40532423245](https://github.com/wepuu/wp-auto/actions/runs/40532423245),
attempt 1, job `122288540429`, with the exact commit above. The run was
created at `2026-10-27T15:35:06Z` and last updated at
`2026-10-27T15:37:20Z`; its final conclusion is failure. Dates in this
record use the run's UTC date, not a claim about local calendar time.

The fresh local preflight passed all seven grouped checks, including
45 wiring checks and four typecheck-core tests. Its independent receipt is
`.tmp/r92-preflight-1Xc6df/result.json`, SHA-256
`e0a8d8b7ceea0273adf9dc4d4f7fafe45bfcadce849a6453189792b540ca0dc4`.
Local synthetic and host checks are not real image-runtime acceptance.

## Actual coverage

| Hosted stage | Result and scope |
| --- | --- |
| Wiring, pinned installs, deployment-manifest syntax | PASS |
| Root typecheck and full lint | PASS |
| Root tests | PASS: 372 registered, 337 pass, 0 fail, 35 skipped, 0 cancelled |
| Complete database-test typecheck | PASS: unchanged 18-file gate |
| Frozen-input check | PASS |
| Portable OCI build and application-image non-root checks | PASS |
| Persistent Authorization isolated image matrix | FAIL at preflight |
| Three real fixed-runtime startup cases in the image | NOT_RUN |
| Signing OCI, PostgreSQL backup/restore, PHP interoperability | NOT_RUN |
| Audit, SBOM/license, retained conformance and evidence checks | NOT_RUN |
| Hosted job container cleanup | PASS |

The root output explicitly reports all three fixed-runtime cases skipped
with `Requires the pinned /workspace image runtime`. They are the readonly
typed-fixture case, assertion/missing-module case, and invalid-reporter/
timeout case in `scripts/fixed-node-test.test.mjs`. This confirms host
context routing only. It does not prove execution in the image. The
unchanged report policy still rejects skipping these cases in the image;
that policy was not reached in this run.

## First failure and evidence limits

The matrix's safe structured result at `2026-10-27T15:37:15.5028752Z` is:

```json
{
  "passed": false,
  "results": [],
  "failedStage": "preflight",
  "category": "POSTGRES_IMAGE_MISSING",
  "productionAccessed": false,
  "networkCreated": false,
  "cleanup": []
}
```

The source revision in that result matches the submitted Head. The three
candidate image identities were checked before the failure:

| Role | Image ID |
| --- | --- |
| authorization | `sha256:aa38c5bfce247d4cff82a069e631816129eba8d5c896f4559697df38ed744327` |
| control | `sha256:5aa14141ac8ad794fb1a74bdd65286aef43cb168f084bfea1df9a8def5653c69` |
| test | `sha256:b05f2a603e688f8d29c5318a6f12f30353bc43fe3f72214f28b98abd9345bfd2` |

Authorization and Control image metadata report default user `node` and
direct main execution. Test-image metadata reports default user `root`;
the harness explicitly sets `1000:1000` for its unit/database/legacy
scenarios, which were not reached. Do not label the test image's default
user as a successful runtime non-root probe.

The exact preflight requests Docker image inspection of
`postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`.
The current workflow service specifies `postgres:16.10-alpine`. These are
different reference forms; their availability/equivalence on this runner
has not been independently established. The inspection catch maps any
failure to `POSTGRES_IMAGE_MISSING`, so the fixed category alone does not
prove whether the underlying cause was an absent digest reference, Docker
inspection failure, timeout or another command error. No raw exception or
stack was retained, and no underlying cause is invented here.

`results=[]` and `networkCreated=false` show that no matrix scenario or
its database network began. This is not a helper, refresh, OAuth or MCP
behavior failure. Signing and all later required coverage remain NOT_RUN;
the successful OCI build does not substitute for them.

## Protection and final state

After observation, all 117 R89 candidate input hashes still match, as do
the R91 supplementary test and fixed-runtime-verifier hashes. Local Head
matches the Hosted Head. Tracked working-tree and index differences are
empty before adding this independent, uncommitted result record.

Only this one push-triggered run was observed. No dispatch, rerun,
corrective push, result-only push, merge, publication or deployment was
performed. No local Docker run, production access, migration, actual OAuth,
MCP, OTP, Site/Grant or Connector operation was performed. Historical
R88/R90 failures and R91 offline evidence remain unchanged.

```text
R92_R91_CANDIDATE_VERIFIED=True
R92_LOCAL_PREFLIGHT_PASS=True
R92_MINIMAL_COMMIT_CREATED=True
R92_HOSTED_CI_HEAD_MATCH=True
R92_HOST_CONTEXT_ROUTING_PASS=True
R92_REAL_IMAGE_STARTUP_TESTS_PASS=NOT_RUN
R92_HOSTED_STRICT_CHECKS_PASS=True
R92_FULL_DATABASE_TYPECHECK_PASS=True
R92_HOSTED_IMAGE_MATRIX_PASS=False
R92_FULL_REGRESSION_PASS=False
R92_HOSTED_CI_PASS=False
R92_CI_RUN_ATTEMPTS=1
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
R92_PRODUCTION_DEPLOYED=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop here. A separate next task may inspect the pinned PostgreSQL image
provisioning and safe diagnostic boundary offline. This record does not
authorize changing an image pin, pulling an image, changing workflow
security or automatically repeating Hosted CI.
