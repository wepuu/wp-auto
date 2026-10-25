# WPAuto P3-E2S-R4B-R30 coherent typecheck diagnosis

## Result

R30 established a coherent current-worktree source/test baseline and identified
all46 dependency-error locations by locked package identity. The original
project-wide typecheck still failed, now with62 error records: the same46
dependency records plus16 current test/helper records. The previous mixed
input was real, but eliminating it did not fix the typecheck.

Known blockers are now concrete: Web/Crypto ambient type references in the auth
dependency declarations, an unresolved React import/namespace in Resend, and
missing declarations for imported local `.mjs` test helpers. Eight other test
type errors remain, and two dependency records need more specific explanation.
No direct error was reported at the R28 mapping test or database source; this
does not establish the patch's behavioral correctness or execute its unit tests.

No R28 application/test/configuration byte changed. No dependency installation,
upgrade, source repair, Lint, unit test, candidate image, service, database,
OAuth, MCP or production access occurred. This was diagnosis, not repair.

## Frozen inputs and one invocation

```text
implementation:4296559fddefc02678b3522abcc65d748e79b3ac
run:r30-20261025034531031
UTC start:2026-10-25T03:45:31.033Z
UTC finish:2026-10-25T03:46:05.967Z
Asia/Shanghai window:2026-10-25 11:45:31 to11:46:05
container attempts:1
authoritative typecheck attempts:1
```

The committed worktree was clean. Host and container verified the same100
tracked source/test/config inputs across18 entire source/test directory mounts
and10 workspaces. Extra source files, unexpected projects/directories, missing
files, symlinks and hash differences fail the baseline gate. The fingerprint
before and after prerequisite compilation/typecheck was:

```text
fc39e06e4d7c431a50cbec1f01b949828ad6725a80e7f071cc48a16fdca1f741
```

All existing source/test directories were mounted read-only as complete trees,
not overlaid as two individual files. Installed dependencies and disposable
compiled outputs remained in the fixed image/container. Root and workspace
package/config/lock files matched the committed manifest. Thirty direct external
dependency entries matched declared exact versions, installed metadata and the
lockfile. Workspace links were covered by their config/source baseline instead.
No dependency resolver or installer changed the tree.

The test image remained
`sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c`,
revision `c404ed52228ce5492a85674547998d2f5d31772e`, linux-amd64.
Actual Node v24.22.1/Krypton, pnpm11.19.0 and TypeScript5.9.3 were verified.
The R28 source/new-test hashes remain respectively:

```text
f27582998d85485c51124b0c5e501fe30fde2e664399b2f68a1ef5ca7a5f7708
3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16
```

The database test config again selected23 roots, with no project references.
Strict checks and NodeNext module/resolution remained unchanged, including
skipLibCheck=false and lib inherited as ES2024. One prerequisite `pnpm build
--pretty false` passed without starting services or migrations. Then the only
authoritative check was the unchanged command:

```text
pnpm exec tsc --project packages/database/test/tsconfig.json --noEmit --pretty false
```

It completed exit2, with no signal, spawn failure, timeout or output truncation.
Stdout was19286bytes with62 parsed and35 unparsed lines; stderr was empty. Raw
messages and unparsed text were discarded, not asserted harmless or complete.
Diagnostic completion/exit0 of the container does not override the inner failed
typecheck.

## Dependency identities and located references

| Locked package | Error records | Located references |
|---|---:|---|
| @better-auth/core1.7.7 |15|JsonWebKey; CryptoKey; one init-options module error|
| better-auth1.7.7 |5|BufferSource; CryptoKey; one organization generic/indexing error|
| better-call1.4.0 |22|HeadersInit|
| resend6.32.1 |4|HeadersInit; unresolved react import; React namespace|

For each diagnostic path, the helper resolved the actual file inside the fixed
pnpm store, checked the nearest package name/version against recognized exact
lockfile keys, and retained only package-relative path, position, TS code,
metadata/file SHA-256 and a public declaration token at the diagnostic offset.
Symlink escape, unknown identity, oversized files and unverified versions remain
NOT_CONFIRMED. All46 observed identities passed these checks; no package's runtime
module was imported or executed. Version/hash linkage is not a new registry
integrity or supply-chain audit.

Examples of confirmed declaration locations include:

- `@better-auth/core/dist/oauth2/client-assertion.d.mts`: JsonWebKey.
- `@better-auth/core/dist/social-providers/*.d.mts`: CryptoKey as a type reference.
- `better-auth/dist/crypto/index.d.mts`: BufferSource and CryptoKey.
- `better-call/dist/context.d.mts`, `endpoint.d.mts`, `error.d.mts`: HeadersInit.
- `resend/dist/index.d.mts`: TS2307 on module react, which the current TypeScript
  resolver did not resolve; TS2503 on React and TS2304 on HeadersInit.

The existing base config supplies only ES2024, not the browser/Web API ambient
library. This explains a concrete mismatch with these dependency declarations'
ambient requirements; it is not evidence that Node runtime fetch/crypto is
missing. TypeScript's [lib documentation](https://www.typescriptlang.org/tsconfig/lib.html)
distinguishes standard-library type sets from runtime implementation.
The source-only account-auth project already has skipLibCheck=true, while this
database test project inherits false and imports raw account-auth source. That
existing profile difference helps explain why a successful prerequisite build
cannot substitute for this broader strict test-project check. R30 changed neither
setting and does not recommend copying skipLibCheck=true to conceal the failures.

The init-options TS2307 and organization TS2536 locations were identified but
their exact missing module/type relationship was not recovered as a safe public
token. They remain unresolved; do not assume every declaration error is fixed
by supplying DOM or React types.

## Current local test failures

Eight TS7016 records are missing declarations for five local `.mjs` helpers:

| Importing test/helper | Missing typed helper imports |
|---|---|
| grant-reconsent.test.ts |reconsent-diagnostic; r19-target-ledger; reconsent-native-fixture|
| multi-site-provider.test.ts |r17-migration-evidence|
| otp-send-budget.test.ts |otp-migration-evidence|
| p3d-fixture.ts |r17-migration-evidence|
| pairing-diagnostics.test.ts |r17-migration-evidence|
| persistent-readonly.test.ts |r17-migration-evidence|

Their current import statements and actual helper exports were checked offline
after the one run. They are not pnpm installation failures or permission errors.
These diagnostics appeared when the complete current helper/test tree replaced
the stale image test inputs. Their presence must not be removed by dropping the
tests or declaring a wildcard any module.

The other eight test diagnostics remain:

```text
multi-site-provider.test.ts:250:28 TS2769
otp-send-budget.test.ts:175:37,199:37,207:39 TS2345
tenant-provider-http.test.ts:146:37 TS2345
tenant-provider-http.test.ts:190:27 TS2379
tenant-provider-http.test.ts:215:13 TS7022
tenant-provider-http.test.ts:262:28 TS2769
```

They identify actual current calls, optional properties/inference or overload
sites. R30 did not establish that each is independent of the declaration-type
environment. Do not add broad casts or weaken the negative protocol assertions
before resolving and checking the upstream type context.

## Minimal repair preview not applied

The next change should separate the narrow OAuth fix validation from the
existing whole-project type defects, rather than silently presenting one as
the other. Two explicit lanes are possible and require approval:

1. A dedicated strict focused test project rooted at the new mapping test and
   its actual source dependencies. Preserve the existing strict/noEmit checks;
   label any PASS as focused only. Do not change or claim PASS for the original
   whole-database command. This can unblock direct validation of the approved
   adapter patch without first rewriting unrelated lifecycle fixtures.
2. A whole-database test-type repair, tracking the following exact preview:
   - Evaluate a test-only Web API ambient library declaration in the test config,
     not a production base-config change. A candidate is
     `lib: ["ES2024", "DOM", "DOM.Iterable"]`; it is not applied or proven sufficient.
     DOM also introduces browser globals absent from Node, so its scope/tradeoff
     must be reviewed rather than treated as an automatic fix.
   - Resolve the confirmed react declaration dependency through an explicitly
     reviewed, pinned type dependency or a tested SDK type-boundary design. No
     package version is selected here and no dependency or lockfile changes are
     authorized. Do not invent a fake React/any module.
   - Add accurate `.d.mts` companion signatures for the five actual `.mjs`
     helpers, reflecting existing exports. Do not use `declare module '*.mjs'`
     or any casts as replacements for contracts.
   - Resolve remaining init-options/organization declarations and re-evaluate
     the eight concrete test sites before making fixture-only typing changes.

Neither lane changes OAuth protocol, SQL, signatures, Tenant boundaries or
runtime behavior. A focused green result cannot erase the broader project's
known failures. This is a preview, not an applied patch or an authorization to
continue building the candidate.

## Validation safety custody and stop

61 offline synthetic checks passed once before Docker: source selection,
complete manifests, hash drift, stale files, extra projects/directories,
junction rejection, scoped/peer lock identities, metadata mismatch, safe public
AST tokens, unknown dependency handling and runner boundaries. Synthetic Node
output was not an application typecheck. Host helper syntax and diff formatting
passed; no complete lint/unit or Hosted CI result is claimed.

The one compiler container was network=none, UID0 with a disposable writable
root, disabled healthcheck/logging, capabilities dropped and no-new-privileges.
All host mounts were read-only and no Docker socket or production credential
was present. The writable layer only held prerequisite compilation outputs;
it was not committed or built into an image. It stopped exit0, no OOM, with no
automatic retry. This is not service UID1000 or runtime authorization acceptance.

Disk was5810561024bytes initially and5810495488bytes finally, above5GiB/2GiB gates.
Host/container source/config manifests and tool inputs remained unchanged. The
private result and input manifest had ACLs restricted to current user, SYSTEM
and administrators:

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-r30-coherent-Za26Jq\result.json
SHA-256:094d0a5a65c38fae84194a023fb4a491e574b16848323b7dae030d31327e395a
```

The stopped container `wepuu-r30-20261025034531031` is retained. Only local helper
code and this record changed; no application, test, tsconfig, dependency,
migration, deployment, production, WordPress or MCP state changed. No push,
PR or merge occurred.

```text
P3E2SR4BR30_INPUT_BASELINE_COHERENT=True
P3E2SR4BR30_DEPENDENCY_DIAGNOSTICS_IDENTIFIED=True
P3E2SR4BR30_KNOWN_TYPE_BLOCKERS_IDENTIFIED=True
P3E2SR4BR30_TYPECHECK_CAUSE_CONFIRMED=False
P3E2SR4BR30_TYPECHECK_PASS=False
P3E2SR4BR30_CLEANUP_PASS=True

P3E2SR4BR28_SOURCE_FIX_PASS=NOT_CONFIRMED
P3E2SR4BR28_FOCUSED_TESTS_PASS=False
P3E2SR4BR28_CANDIDATE_BUILD_PASS=NOT_RUN
P3E2SR4BR28_EXPIRED_SESSION_PROTOCOL_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The cause flag remains false for complete attribution of all62 errors, not for
the confirmed ambient/React/helper blockers. Stop after diagnosis and preview;
no repair or further execution is automatic.
