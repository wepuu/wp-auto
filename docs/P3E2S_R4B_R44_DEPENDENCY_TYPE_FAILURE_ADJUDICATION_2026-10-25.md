# WPAuto P3-E2S-R4B-R44: dependency declaration failures and repair adjudication

Date: 2026-10-25. Source baseline: `f23cc8305d3cbf867ddc88c270bd7971996760c4`.
Disposition: diagnosis/reproduction complete; repair NOT_APPLIED and full
candidate acceptance remains BLOCKED. This is not an OAuth runtime diagnosis.

## Fixed boundary

Only new R44 diagnostic helpers, structural type fixtures and this record were
written. Application/package/test source, existing configs, manifests,
pnpm-lock.yaml, migrations, R43/R10 records and R40 artifacts were unchanged.
No dependency installation, package download/execution, image build/pull,
application/DB start, production access, OAuth/Refresh/MCP, Hosted CI, push,
PR or merge occurred. Public official documentation was read separately from
network-none local evidence collection.

Fixed compiler image:
`sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c`,
revision `c404ed52228ce5492a85674547998d2f5d31772e`.
Runtime Node 24.22.1/Krypton, TypeScript 5.9.3; the unchanged image/package
metadata pins pnpm 11.19.0. The image lock matched:
`cea3bc64773f878a668cabeb9d366086f69ad2c6921e5095ed6d49292bddad87`.

Containers used --pull=never, network=none, cap-drop=ALL,
no-new-privileges, no healthcheck and no Docker log persistence. Host
application sources were not mounted into the probe containers. The harness
and input manifest were read-only; generated fixtures stayed in disposable
container filesystems. Host baseline/tool hashes were checked before/after.
Private evidence directories used the existing verified ACL helper.

## Five rows, three proven branches

### 1. @better-auth/core 1.7.7: unconditional Bun declaration import

The exact R43 source was verified against its SHA-256:
`d4f9d2f16a86638724a5c84698ca32262dc461ac39d70422f582aadd28119863`.

dist/types/init-options.d.mts:16:26 imports Database from **bun:sqlite**.
A TypeScript AST walk to the enclosing ImportDeclaration, plus actual
NodeNext module resolution, identified that module and returned unresolved.

This is not @opentelemetry/api. Its optional peer listing did not identify the
failing import. No OpenTelemetry installation is proposed.

The declaration graph references multiple runtimes, but the diagnostic does
not mean the WePuu Node process attempted to execute Bun or SQLite.
Bun's official documentation names @types/bun for its built-in API declarations:
[TypeScript definitions](https://bun.com/docs/typescript).
Only that package guidance is used; the Bun runtime, bundler configuration,
TypeScript version and skipLibCheck example are not adopted.

### 2. Resend 6.32.1: unavailable React declarations

The verified declaration SHA-256 is:
`fa1e12dbd8a5aba9905ffdfcb597682882fb15244b3956276c91299e75bb2355`.

dist/index.d.mts imports React$1 from react at 1:26. It also references the
React namespace at 945:11 and 2198:10. In the pinned environment, react does
not resolve, producing one TS2307 and two TS2503 rows.

The installed published manifest itself lists @types/react 19.3.0 among its
development dependencies. That is evidence for a real declaration dependency,
not proof this version is compatible with our TS5.9.3/@types-node24 setup.
No React renderer or runtime installation was performed or justified.

### 3. Better Auth 1.7.7: generic role indexing declaration defect

Verified declaration SHA-256:
`13aac5f7f97201416ff8126028f99f0b75f9a7af09f505a1e59c99ed3103c51d`.

At dist/plugins/organization/routes/crud-members.d.mts:1012:9, the enclosing
generic is O extends OrganizationOptions. The return role is extracted by
indexing ["role"] into a conditional/mapped/intersection member type.
The AST projection preserved the exact original indexed expression in private
evidence. It was not replaced or evaluated as code.

The original declaration-only reproduction fails with TS2536 independently
of WePuu source. A second, structurally reduced model with no imported
dependencies and types=[] also fails with the same diagnostic. Thus this
particular generic-indexing failure does not require missing Bun/React types
or application logic. The reduced model has synthetic local helper types;
it is not a byte-identical copy or a replacement for the published declaration.

Official upstream changelog records the matching fix in **1.7.8**, PR #11637,
commit 2627237fae3d02c53b3ba68b3812cbc31905a24b: getActiveMemberRole returns the
inferred organization role names directly instead.
[Official changelog](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/better-auth/CHANGELOG.md)
The immutable commit/PR file fetch was unavailable during this session;
no exact upstream patch artifact was downloaded or claimed verified.
Current official source corroborates the direct-role design, but main is not
an immutable substitute for that release.

This evidence supports a dependency declaration compatibility defect under
TS5.9.3/skipLibCheck=false. It does not identify a production permission,
tenant isolation or OAuth failure, nor prove every compiler version is affected.

## Bounded execution record

Exactly **two compiler invocations** occurred, no full R43 command rerun.

| UTC run identifier | Observation |
| --- | --- |
| r44-metadata-20261025123406836 | Metadata collector rejected before output; zero compiler calls. Exit 1. |
| r44-metadata-20261025123443732 | Added fixed-stage diagnostics localized collector rejection to declaration_ast; zero compiler calls. Exit 1. |
| r44-metadata-20261025123528921 | AST collector accepted the explicitly allowed bun: protocol and identified bun:sqlite. Zero compiler calls; container exit 0. |
| r44-minimal-20261025123626755 | Compiler call 1: three imports of exact installed declarations reproduce the original five rows. tsc exit 2; diagnostic collector/container exit 0. |
| r44-generic-20261025123832119 | Compiler call 2: reduced negative/control model. Exactly one TS2536 at generic-negative.mts:15:57, no positive-control/dependency diagnostics. tsc exit 2; collector/container exit 0. |

The first two failures were **collector syntax-policy failures**, not compiler
or dependency failures. The earlier safe module projection accepted node: but
not bun:, explaining why the exact module had remained NOT_CONFIRMED.
The new projection permits only explicit node:/bun: schemes plus bounded public
package/path syntax; it does not expose arbitrary import strings or raw errors.

All five owned containers ended stopped with OOMKilled=false.
A collector's successful exit means expected evidence was collected; it never
means the failing declarations passed typecheck.

### Minimal reproducibility

The minimal mode generates three .mts roots containing only imports of the
hash-verified installed core init-options, organization crud-members and
Resend declarations. Their exact container paths and fixture hashes are in
private evidence. It extends the frozen base with noEmit=true,
composite=false and ES2024/DOM/DOM.Iterable. strict and skipLibCheck=false remain.

Observed dependency counts:

```json
{
  "@better-auth/core:TS2307": 1,
  "better-auth:TS2536": 1,
  "resend:TS2307": 1,
  "resend:TS2503": 2
}
```

The generic mode uses the committed generic-negative.mts and
generic-positive.mts fixtures. Its config has types=[] and ES2024 only.
The negative mapped/conditional intersection cannot prove its role key.
The direct-role control checks default/custom closed role sets and contains
two expected invalid-role assignments. It produces no extra diagnostic.

Future separately authorized reproduction entry points are:
`node scripts/run-r44-diagnostics.mjs minimal` and
`node scripts/run-r44-diagnostics.mjs generic`.
They are not an instruction to rerun after this budget has been exhausted.

The new result contracts were checked with **24 pure assertions/replays**,
including wrong counts/identities, missing rows, process success instead of
expected failure, timeout, signal, primary-source errors and type pollution.
Both saved compiler results passed contract replay. No compiler ran during replay.
The final verifier calls/hash-list wiring was syntax-checked and replay-validated
after the two invocations; **that final wiring was not container-rerun**.

## Repair preview: exact direct candidates, unresolved closure

No manifest, lockfile or installed declaration has been changed.

### Declaration dependencies

The published Better Auth 1.7.7 manifest uses @types/bun ^1.3.14 and
@types/react ^19.2.17 in development; published Resend 6.32.1 uses
@types/react 19.3.0. Therefore the explicit direct candidates for evaluation are:

```json
{
  "devDependencies": {
    "@types/bun": "1.3.14",
    "@types/react": "19.3.0"
  }
}
```

These are candidate pins from actual package metadata, **not installed/tested
resolutions or an approved lockfile delta**. Registry metadata retrieval through
the browser tool was unavailable; transitive versions, integrity, TypeScript5.9
compatibility and duplicate @types/node effects remain NOT_CONFIRMED.

Prefer an isolated test-type-support manifest/lock outside apps/packages over
root auto-discovery, with explicit database-test-only type loading. Do not
silently expose Bun/React globals to every source project. Exact paths/type
visibility must be validated against real module resolution before acceptance.
No typeRoots/config edit is applied or represented as already working.

A later dependency-resolution preview must show all new transitive packages,
integrity fields, engine/compiler requirements and ambient type collisions.
It must not silently upgrade @types/node, TypeScript, production packages or
change workspace peer snapshots. A lock-only resolution still writes metadata
and needs the next explicit approval; no force/ignore-integrity workaround.

### Organization declaration

Two choices require a distinct decision:

1. **Minimal runtime-preserving candidate:** review a declaration-only backport
   of the upstream direct-role return type for pinned Better Auth1.7.7.
   The proposed exact target is the one hashed indexed role expression at
   crud-members.d.mts:1012:9; replacement:
   `InferOrganizationRolesFromOption<O>`.
   Do not replace it with string, any, an ambient wildcard, a cast or a
   skipLibCheck exception. No patch was created/applied in node_modules.
   Before applying, verify immutable upstream provenance, exact AST uniqueness,
   package-manager patch/overlay mechanism, affected declaration variants and
   runtime-JS byte identity. Any patch/lock changes must be explicitly recorded;
   an overlaid compiler environment is not the untouched R40 artifact.
2. **Official package upgrade candidate:** assess the aligned Better Auth1.7.8
   family containing the documented fix. This also includes other runtime
   changes and is **not a test-only repair**. It requires separate compatibility,
   security/data-flow and artifact/regression approval. Do not mix core1.7.8
   into better-auth1.7.7 or upgrade to latest automatically.

Neither branch is an approved executable package diff yet. The direct pins
and exact declaration target are known; the resolved closure and verified
upstream patch artifact are not. Full repair remains gated rather than filling
those gaps with guessed hashes or package versions.

## Finite next task and stopping point

The next useful task is one approved **repair-resolution preview**, not another
unchanged full compile or production/OAuth test:

- Resolve the isolated test-type candidates into an exact reviewed closure.
- Select declaration-only backport versus aligned runtime upgrade.
- Show proposed file/lock/patch differences and provenance before applying.
- With that specific approval, validate the unchanged complete database-test
  command and retained declaration/profile/lint/43-test gates under a new bound.
- Only after its success, proceed to R42's residual unit/DB/Console/startup
  package and separately authorized final Hosted CI decision.

No complete database typecheck was run or cleared in R44. No 58-test, DB,
Console, startup, R40 HTTP, R41 matrix or transition test was repeated.

```text
P3E2SR4BR44_ROOT_CAUSE_CLASSIFICATION_COMPLETE=True
P3E2SR4BR44_MINIMAL_REPRO_EVIDENCE_PASS=True
P3E2SR4BR44_DEPENDENCY_CHANGE_APPLIED=False
P3E2SR4BR44_DEPENDENCY_FIX_VALIDATED=False
P3E2SR4BR44_RESOLVED_LOCK_PREVIEW_CONFIRMED=False

P3E2SR4BR43_FULL_DATABASE_TEST_TYPECHECK_PASS=False
P3E2SR4BR41_AB_VALIDATION_PASS=True
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Historical records, approved single-Site trial and OTP policy remain unchanged.
Stop; do not install, patch, migrate, start services or access production.
