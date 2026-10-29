# P3-E2S-R4B-R85: offline annotation candidates and controls pass

## Outcome and limits

R85 prepared four independent annotation-only candidates. All 12 offline
checks passed, including exact reproduction of R83's 16 lint findings,
clean targeted lint/root checkJs, six rejecting type controls, reversible
cause controls, executable AST preservation and 187 host behavior comparisons.

No formal helper, public `.d.mts`, existing ESLint/tsconfig, dependency,
lockfile, R81 candidate or historical receipt was modified. The current
host R80 baseline and all 117 protected inputs remain unchanged. No
container start, Docker operation, installation, database connection,
migration execution, production access, OAuth/MCP/OTP, full CI, commit,
push, PR change or deployment occurred.

This is OFFLINE PREPARATION, not fixed-container acceptance. Host Node is
v26.11.1, TypeScript 5.9.3, parser/plugin 8.70.0 and ESLint 9.39.5. The
targeted lint replay enables only the five categories observed in R83;
it does not claim that the complete strict ESLint preset has passed.

The compiler inherits the actual database test tsconfig, including strict,
noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitReturns,
noPropertyAccessFromIndexSignature, skipLibCheck=false, module resolution
and libraries. It overrides only noEmit/allowJs/checkJs and automatic
ambient `types=[]` for the explicitly limited host projection. It reads
real pg declarations, not a replacement declaration or fake Codec. The
container's complete Node/Bun/React type environment remains separately gated.
Diagnostics cover the four candidate roots and explicit virtual consumers,
plus global/options diagnostics; this is not full dependency/contract checking.

## Exact annotation changes

The generator reads the hash-pinned four R81 files. It does not regenerate
or rewrite the formal helper bodies.

1. The internal query view describes only the used operations:
   `query(config: string | (pg.QueryConfig & {query_timeout:number}))`
   returning `Promise<{rows:unknown[]}>`. The public QueryClient is unchanged.
   A positive type fixture proves native QueryClient is assignable to this
   view; all SQL strings, timeout values, method calls and runtime binding
   behavior remain unchanged.
2. R17 expectedLedger's internal profile becomes unknown, preserving the
   invalid-profile branch. Its public MigrationProfile remains unchanged.
3. R19 validation run/database hash and Diagnostic validation run accept
   nullish values in their internal annotations. The existing checks reject
   those values exactly as before. Diagnostic options retain their real
   public shape except for the internal nullable run field.
4. The two JSON.parse callee annotations expose an unknown result at the
   actual call boundary. No wrapper, call, global type override, reviver or
   JSON behavior is added. Existing outer shape annotations and validators
   remain; this does not assert that arbitrary JSON is already trusted.
5. A local number annotation is applied only to the comparison after the
   existing short-circuit Number.isSafeInteger check. No new predicate,
   validation branch or runtime conversion is introduced.

These changes preserve all executable AST nodes under the original R76
comparator. No `any`, suppression comment, disabled rule or public
declaration edit was added.

## Reproduction, controls and behavior

Original R81 text is mapped in memory to the original module paths.
Its five-rule replay exactly matches all 16 saved R83 rule/severity/location
records. With the strict inherited compiler options it also reproduces four
TS2769, four TS2339 and one TS18046 root diagnostics. These are offline
observations, not retroactively fabricated R83 type results.

New candidates have zero findings in the five-rule replay and zero
options/global/root/positive-consumer compiler diagnostics.

Six explicit negative consumers each fail at its own expected line:

| Rejected type case | Actual diagnostic |
| --- | --- |
| Synchronous row object as query Promise | TS2739 |
| Promise lacking rows | TS2322 |
| Numeric query argument | TS2345 |
| unknown row assigned to trusted string | TS2322 |
| Invalid public migration profile | TS2345 |
| unknown JSON result assigned to trusted string | TS2322 |

These are static negative fixtures, not runtime checks inserted into the
helpers. The unchanged behavior corpus still governs JS runtime behavior.

Cause controls provide direct regression evidence:

- Reverse only the internal conditional annotations: exactly five
  no-unnecessary-condition findings return.
- Reverse only the query/JSON boundary annotations: exactly the other
  eleven unsafe/await/member findings return.
- Reverse only the local numeric annotation: exactly one TS18046 returns.
- Runtime call-target and throw/return mutations in each candidate are
  rejected by the original AST comparator (eight negative comparisons).

The existing R81 compareBatch corpus passed all 187 comparisons on host
Node 26, including its 14 golden assertions outside matching-error capture.
It covers invalid profiles/observations, opt-in denial, query/I/O traces,
first-error preservation, malformed diagnostic schema, getter/Proxy safety,
bounded causes, sequencing and cleanup behavior. Only private generated
module trees and copies of the 17 SQL fixture files are written; SQL is
not executed. This is not Node 24 behavior or Linux private-write acceptance.

Child type/behavior work is bounded to 90 seconds per invocation. Explicit
timeout, malformed JSON and nonzero-child controls return fixed categories
without exposing the synthetic secret marker. Candidate syntax checks pass.
Root diagnostics are safely projected without raw messages or stack traces;
oversized output fails rather than being treated as clean diagnostics.

## Preserved first preparation failure

First receipt: `.tmp/r85-offline-3zqobe/result.json`, SHA-256:
`94891737d1e17094cc55e175f012453f30b289d439c6558269624c60ddf8e460`.

It stopped at the negative-type control. All six cases actually rejected,
but the test expected TS2322 for the synchronous-object case; TypeScript
reported the more specific TS2739 (missing Promise members). No candidate
repair followed this tooling mismatch. The expectation was corrected to
the exact per-case list above, with exact count/line/code checks retained.
The later pass pins the preserved first-failure hash. No prior record or
candidate was replaced to hide the failed preparation attempt.

## Final frozen preparation artifacts

Pass receipt: `.tmp/r85-offline-wTTZ0b/result.json`, SHA-256:
`85a1c2bbca86cd9a8c3f0b289f7547fed99d8bbda65cb5f72ea04cc926ad6e93`.

UTC window `2026-10-27T13:50:02.188Z` to `13:50:39.721Z`
(21:50 Asia/Shanghai), monotonic elapsed 37,534 ms.

Generated candidates are retained only under
`.tmp/r85-offline-wTTZ0b/candidates/`; they are not formal source landing.

| Frozen candidate | SHA-256 |
| --- | --- |
| otp-migration-evidence.mjs | `34806061a680d5427fd4b16f0909a04c096454144422cb39e0ca4510485e4880` |
| r17-migration-evidence.mjs | `03d44172d2aa07129abc59d8901a91dd70bd37f7c82c810fec10f075a9ff5f48` |
| r19-target-ledger.mjs | `8ce96cfa2e2753c3332a4e7e297ef4687218795ce4fb980357bf51af77b6d471` |
| reconsent-diagnostic.mjs | `2b0cff4b488d066d50a46a869a368e0bd386cc5120b090a5f0600ddb5d89c0a0` |

| R85 tool | SHA-256 |
| --- | --- |
| candidates.mjs | `46b337d4313c36ece8d340c6f74cafeb2416a4ce9bf54b2cabb41c8fd9678ecb` |
| type-replay.mjs | `8a939d8d3602809d3339c672ae97a27c81c78135966c8eb8e9b5fdf78cc60b53` |
| behavior.mjs | `0617a2fd80e916efc0279d7dc6822ab9fd2b3c0a3e1d4a9350606ccbed116b1b` |
| validate-offline.mjs | `d91b6fdb04245ef11f7800579b75811607ab5829ae27b43b7038d83e94e4bd5a` |

All 66 historical/current pre-R85 tool identities and the derived 117-input
R80 manifest passed before/after checks. The tracked diff remains R80's two
files, 35 insertions and 7 deletions including the older ESLint draft.
Historical candidates and failed receipts remain intact. New R85 tools,
generated artifacts and this record are local and uncommitted.

## Status and stop

```text
R85_OFFLINE_PREPARATION_PASS=True
R85_ORIGINAL_16_FINDINGS_REPRODUCED=True
R85_TARGETED_FIVE_RULE_LINT_PASS=True
R85_HOST_ROOT_CHECKJS_PASS=True
R85_QUERY_VIEW_COMPATIBILITY_SMOKE_PASS=True
R85_NEGATIVE_AND_REVERSAL_CONTROLS_PASS=True
R85_EXECUTABLE_AST_PASS=True
R85_HOST_BEHAVIOR_PRECHECK_PASS=True
R85_FORMAL_INPUTS_UNCHANGED=True

R85_CONTAINER_STARTED=False
R85_FULL_FIXED_ENVIRONMENT_LINT_PASS=NOT_RUN
R85_FULL_PUBLIC_CONTRACT_PASS=NOT_RUN
R85_NODE24_BEHAVIOR_PASS=NOT_RUN
R85_CONTAINER_PRIVATE_WRITE_PASS=NOT_RUN
R85_FORMAL_SOURCE_MATERIALIZED=False
R85_HOSTED_CI_PASS=NOT_RUN
R83_OVERALL_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop. A separately approved fixed-container trial may use these exact
candidate hashes with a new claim/namespace and the existing restore/stop
protections. Full lint, real type contracts and Node 24 behavior remain
required; offline success is not permission to start that trial or land
the four formal helpers.
