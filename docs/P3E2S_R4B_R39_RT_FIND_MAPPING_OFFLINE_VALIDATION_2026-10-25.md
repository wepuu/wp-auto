# WPAuto P3-E2S-R4B-R39 RT find mapping offline validation

## Result

R39 reproduced the RT lookup exception propagation using the actual database
transaction and adapter with a synthetic PoolClient. A narrowly scoped source
candidate now converts only `RefreshToken` classification-query rejection with
an Error whose exact SQLSTATE/message is `P0001 / artifact_link_missing` to the
existing generic OAuth `invalid_grant` error. The transaction rolls back before
the caller receives that error; a rollback failure still takes precedence.

Both baseline and fixed validation passed 43 unit tests, the strict focused
typecheck and three-file lint. The baseline test asserted unchanged propagation;
the fixed test asserted the intended generic rejection and safe error fields.
These are different expectations against different recorded source commits, not
two protocol attempts or evidence that the old behavior was acceptable.

The helper suite passed 53 synthetic checks. No database, application service,
OAuth/Refresh request, Desktop operation or production access occurred. Existing
test images were used for offline compiler/test processes, not rebuilt. R38's
HTTP 500 remains a failed protocol result pending separately authorized testing
of a newly built candidate.

## Failure mechanism and evidence boundary

The local database adapter first loads a matching secret artifact, then calls
`oauth.artifact_classify`. Migration017 raises `artifact_link_missing` when a
`PERSISTENT_READONLY` classification lacks its matching receipt link. The
original RT `find()` had no conversion at that query. The provider adapter
wrapper delegates `find()` directly to the database adapter.

The locked upstream version is `oidc-provider` 9.12.2. Its
[BaseModel.find](https://github.com/panva/node-oidc-provider/blob/v9.12.2/lib/models/base_model.js)
awaits the adapter outside the later payload verification catch. Its
[Refresh handler](https://github.com/panva/node-oidc-provider/blob/v9.12.2/lib/actions/grants/refresh_token.js)
awaits that lookup, and its
[error handler](https://github.com/panva/node-oidc-provider/blob/v9.12.2/lib/shared/error_handler.js)
uses status500 when a propagated exception has no statusCode. This explains how
the unconverted database rejection can become the response observed in R38.

PostgreSQL's [RAISE documentation](https://www.postgresql.org/docs/16/plpgsql-errors-and-messages.html)
defines P0001 as the default for an otherwise unspecified exception. P0001 alone
is not an authorization-denial discriminator.

The baseline test injected the exact reviewed exception only at the actual
classification-query boundary and observed its identity unchanged after
ROLLBACK/release. This verifies the local propagation mechanism. It does not
retroactively capture the exception raised during R38: that run retained only
an `unknown` service event. The exact historical SQL exception remains
NOT_CONFIRMED; the source mechanism is established independently.

## Minimal candidate and preserved behavior

Only the classification-query await in `PostgresOidcAdapter.find()` gained a
local try/catch. Conversion requires all of:

- The model is exactly RefreshToken.
- The exception comes from that classification query.
- The value is an Error, SQLSTATE equals P0001 and the message exactly equals
  artifact_link_missing.

All other errors are rethrown. The code does not catch the entire transaction,
return undefined for infrastructure failures, expose SQL error details, disable
classification or retry through the native path. It uses the existing
OAuthInvalidGrantError rather than implementing a new protocol primitive.

The baseline and fixed tests use the real `Database.withAuthorizationService`
and `PostgresOidcAdapter`, with only pool.connect/client.query replaced by a
synthetic client. No socket connection is made. They verify rollback, release,
no COMMIT on denial, no write statements, normal payloads, consumed RT shape,
missing tokens, second lookup key and unchanged Code/Session behavior.

Adversarial cases preserve identity for other P0001 messages, incorrect or
missing SQLSTATE, permission/connection/cancellation/timeout errors, arbitrary
Error values, plain objects and strings. Matching text from BEGIN, SET ROLE,
artifact SELECT or COMMIT is not converted. Code, AccessToken and Session cannot
use the RT-specific mapping. Rollback failure wins. The fixed positive test
checks status/statusCode400, generic error/description and suppression of the
original SQL message and sensitive sentinel.

All 19 existing Code-consume tests are unchanged and included alongside 24 new
RT-find tests. This is focused synthetic regression coverage, not real
cross-Tenant protocol, PostgreSQL or Refresh Replay acceptance.

Public interfaces, schema, migration/lock/dependency files, key custody, provider
configuration, scope, resource and revocation rules are unchanged. The patch
restores the already required error response for this one classified rejection;
it adds no authorization policy or native fallback. No ADR contract expansion
was required. Data-flow review found no WordPress content/input/output path:
the only runtime change is a local authorization error conversion with generic
public fields. No Connector source or production deployment changed.

## Validation identities and results

```text
baseline commit: 5f26502c5e6a0821ece3e69301d3260b8b4b63e8
fixed commit: 06b011de6de7b491f883e073f9f2f27e2af50bb3
baseline database source SHA-256:
f27582998d85485c51124b0c5e501fe30fde2e664399b2f68a1ef5ca7a5f7708
fixed database source SHA-256:
8d59679bdc93517480e3fe634d13798bb7dfa5d896568e894b6f5279dcd08f35
unchanged Code-consume test SHA-256:
3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16
fixed RT-find test SHA-256:
4a66ec574fe35cc7812b418e1669b68fd8cce12cfa63b8030a978bac7fbcdee0
```

| Phase | UTC window | Offline container attempts | Unit tests | Typecheck and lint |
| --- | --- | ---: | --- | --- |
| Baseline | 2026-10-25 10:48:42.462 to 10:49:22.053 | 1 | 43/43 | PASS |
| Fixed | 2026-10-25 10:49:44.036 to 10:50:20.397 | 1 | 43/43 | PASS |

There were no failed, skipped, cancelled or TODO tests. The actual runtime was
Node24.22.1/Krypton, pnpm11.19.0 and TypeScript5.9.3. Host Node26.11.1 ran only
the helper tests/report transport; it did not run the application unit suite.

Both phases used the already reviewed compiler image:

```text
image: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
revision: c404ed52228ce5492a85674547998d2f5d31772e
```

These disposable compiler processes used network none, no capabilities,
no-new-privileges, no credentials or Docker socket mounts and read-only host
source/test mounts. They ran UID0 with writable disposable container filesystems
for prerequisite TypeScript outputs, as in R33; they were not runtime service
containers. No image pull, dependency installation, database or application
startup occurred. Both stopped exit0 without OOM; input hashes remained unchanged.

The manifest covered 103 files, 18 complete source/test directories and 10
projects. The focused TypeScript program contained 306 transitive files. Its
only test roots were the two mapping tests; imported source and declaration
files were not stubbed out. Strict options, NodeNext, ES2024, noEmit and
skipLibCheck=false were preserved. Prerequisite source compilation also passed
inside the disposable filesystem. This does not clear R30's broader database
test-project typing failure or claim a full repository test pass.

```text
baseline manifest: 125f9c5cba06f164c05b850e2839b35c51a298ea701d0acda258df6d79a4bab4
fixed manifest: dde36cc57b4b1a7de3b433cb13e68d846e889d4a1555ea135aa9670d8c7cb641
baseline receipt: C:\Users\liulo\AppData\Local\Temp\wepuu-r39-focused-b73NHD\result.json
SHA-256: 3611d9ea009911e5d453e836b93c700352eadd96ca72e09183bbe5df49daa1ff
fixed receipt: C:\Users\liulo\AppData\Local\Temp\wepuu-r39-focused-nwr8HO\result.json
SHA-256: 94cbe66a8413d85169e268f16c5dcb4c0488d62b7d56a0f5e1d89f4d02e4d41d
```

Both private receipts passed the existing Windows ACL verifier and retained
only safe diagnostics/counts and public source paths. No raw assertions,
exception bodies, SQL parameters or credentials were exported.

## Status and stop

```text
P3E2SR4BR39_ADAPTER_FAILURE_PATH_REPRODUCED=True
P3E2SR4BR39_TARGETED_MAPPING_FIX_PASS=True
P3E2SR4BR39_FOCUSED_TYPECHECK_PASS=True
P3E2SR4BR39_REGRESSION_PASS=True
P3E2SR4BR38_MISSING_RT_DENIAL_PASS=False
P3E2SR4BR36_AB_MATRIX_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The current deliverable is an offline-tested source candidate only. The old
R34 image is unchanged and does not contain this fix. A separately authorized
next task must build/identify a candidate and repeat only the R38 normal and
missing-link scenarios before considering the complete matrix. No protocol
retry, candidate image build, production access, push, PR, merge or deployment
followed this offline validation. Recovery of this local source patch, if
needed, is a reviewed inverse diff, not restoration of unrelated working files.
