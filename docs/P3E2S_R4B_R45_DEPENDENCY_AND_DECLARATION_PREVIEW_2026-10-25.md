# WPAuto P3-E2S-R4B-R45: isolated dependency and declaration-patch preview

Date: 2026-10-25. Baseline:
`3796bd54089af9ad57bc126f7d651ed7b64db335`.
Disposition: **PARTIAL / NOT READY FOR REPAIR APPROVAL**.
The type closure and corrected declaration diff are known; the generated root
lock still refers to the superseded diff hash. It was not hand-edited or rerun.

## Scope and protections

Only new R45 helpers, inactive .preview files and this record were written.
Actual application/test sources, package manifests, root lock/workspace,
database-test tsconfig, migrations, installed dependencies, production, R40
artifacts and prior records remain unchanged. All previews are inert:
no actual package.json, patch registration or compiler config was added at its
proposed application location.

No package installation, tarball download/execution, lifecycle script,
compiler, application/database start, image build/pull, OAuth/Refresh/MCP,
production/SSH, Hosted CI, push, PR or merge was performed.

Two pnpm invocations occurred, each once and only with --lockfile-only:
one independent type-support closure, one shadow root patch-registration
preview. They used --ignore-scripts, --ignore-pnpmfile, zero fetch retries,
the official HTTPS registry and a fresh isolated HOME/config/store.
The CLI name install does not mean packages were installed: the patch shadow
had no node_modules, and the original type container's filesystem delta showed
zero node_modules and zero archive-path changes. No tarball was requested by
the explicit metadata fetcher.

Network-enabled disposable fixed-image containers were used only for public
registry/GitHub reads and isolated metadata resolution. No user credentials,
host npmrc or application source directories were mounted. The fetch helper
allows HTTPS public registry URLs and this specific official GitHub repository,
rejects credentials/ports/fragments and non-registry dependencies, enforces
timeouts/body limits and does not follow redirects. pnpm had an explicit
registry and independent config; metadata requests are not production access.
Results were saved under private ACL-checked evidence directories.

Image:
`sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c`.
Revision: `c404ed52228ce5492a85674547998d2f5d31772e`.
Node24.22.1, pnpm11.19.0, TypeScript5.9.3. AST parsing was used, not typechecking.

## 1. Type dependency closure: CONFIRMED as metadata, not compiler compatibility

Public npm metadata confirmed both exact R44 candidates and registry integrity.
The independent support manifest adds the already accepted @types/node24.13.5
pin alongside them, not a new Node type version. bun-types declares a wildcard
@types/node dependency, so the isolated override satisfies that declared range;
no incompatible constraint was forcibly overridden.

| Package | Exact version | Dependency link |
| --- | --- | --- |
| @types/bun | 1.3.14 | bun-types1.3.14 |
| bun-types | 1.3.14 | @types/node24.13.5 |
| @types/react | 19.3.0 | csstype3.2.3 |
| csstype | 3.2.3 | none |
| @types/node | 24.13.5 | undici-types7.18.2 |
| undici-types | 7.18.2 | none |

All six lock integrity values were independently compared with exact-version
registry metadata. There are no React runtime/renderer packages, no second
Node type version and no Better Auth runtime version change in this closure.

Inactive candidates are under
test/persistent-authorization/r45/preview/:
type-support-package.json.preview,
type-support-pnpm-workspace.yaml.preview and
type-support-pnpm-lock.yaml.preview.

The support lock SHA-256 is:
`d33085b902e69bcffcbf840d072ac003d8d243a1f18c1014bd79e642624b12a8`.

Proposed eventual location is the separate
test/persistent-authorization/type-support project, outside apps/* and packages/*.
The inactive database-test-tsconfig.json.preview explicitly selects node/bun/react
types and support/root typeRoots. Source project configs are not changed.
The exact module/global resolution and Bun/Node/DOM compatibility are
**NOT_RUN** because this phase prohibits installation and compilation.
Metadata declares minimum TS5.3 for @types/bun and TS5.6 for @types/react;
that does not prove this graph compiles under strict TS5.9.3.

### Preserved post-resolution collector failure

Run r45-type-lock-20261025131052495 executed the single lock-only command,
which exited0. Subsequent collection rejected the package because its initial
hasLifecycleScripts flag incorrectly treated every script key as a lifecycle
risk. The collector/container exited1 and that record remains unchanged.

The lock was extracted read-only from the owned stopped container. No second
resolution ran. Run r45-type-review-20261025131411785 reviewed those exact bytes
and registry metadata without invoking pnpm, producing the confirmed closure.

Packages are not asserted to be script-free: bun-types has build/test keys and
csstype has build/release/prepublish keys. No script body was executed.
The diagnostic names are not permissions to run those scripts; subsequent
approved installation must still use --ignore-scripts.

## 2. Immutable upstream provenance: CONFIRMED

Official repository API returned commit:
`2627237fae3d02c53b3ba68b3812cbc31905a24b`.
Parent:
`a5d582aaffce1a7457e3da0835a046ba6738c442`.

Target:
packages/better-auth/src/plugins/organization/routes/crud-members.ts.

Immutable before SHA-256:
`eb2dab0fa0634037feb77182b5332425e7198bcd877a4b613bf681722d241b33`.
After SHA-256:
`f5194c8def8a4f2330f9e52066260d87f1fe39a7651fe6287cdc4f7adce5c8b7`.

GitHub content blob identifiers matched the commit-file metadata.
AST comparison verified exactly two ctx.json role-type annotations and one
member?.role to member.role change; after erasing only those differences,
the normalized source trees matched. Thus copying the complete upstream source
change would not be purely a declaration change. **It was not copied/applied.**

The preview instead changes only the emitted role type in pinned1.7.7:
`InferOrganizationRolesFromOption<O>`.
The installed declaration owner and AST location were checked uniquely as
getActiveMemberRole. Parsing before/after had zero syntax diagnostics; no
compiler acceptance claim follows from parsing.

The relevant .d.mts file is the only declaration variant changed. This is not
acceptance of CJS or unexamined export variants; those remain outside the
currently observed ESM resolution evidence.

## 3. Declaration-only candidate and patch registration

Original declaration SHA-256:
`13aac5f7f97201416ff8126028f99f0b75f9a7af09f505a1e59c99ed3103c51d`.
Candidate declaration SHA-256:
`7d630c56ab1dcd4e575772d12e50345ed0b69b3684da5fbc66628a67f2242343`.

Only the type expression changes: 31473 ->30457 bytes.
No JavaScript or package manifest is changed. The installed Better Auth package
remained identical before/after collection:467 files, whole-tree digest
`004032a3785ec979e530f1319448450ccbadb1b170bfccb9cfc2d61b90ab6d4a`.

The shadow workspace adds only exact patchedDependencies registration:
better-auth@1.7.7 -> patches/better-auth@1.7.7-role-types.patch.
The single root lock-only invocation exited0. Its285 package records retained
versions and integrity. After normalizing only patch identities, all importer,
package and snapshot data matched the original frozen root lock.

Original root lock SHA-256:
`cea3bc64773f878a668cabeb9d366086f69ad2c6921e5095ed6d49292bddad87`.
Generated shadow root lock SHA-256:
`f93bfcd02138dcc4dacfdc7f40e2c0affaa2b79e94eb97d5916913caf94ad238`.

### Why this root lock is NOT an approvable final candidate

The first unified-diff generator omitted the standard marker for a source file
without a final newline. The emitted declaration does end without LF.
A real git apply --check against the exact original bytes failed; pnpm lock-only
generation by itself had not established patch applicability.

Initial diff hash, now **superseded/rejected**:
`a9a06eb6031b5308dea5fb5397749d17fc35c86099b2948da68a8f663bd356e2`.

The generator was corrected offline to preserve LF/no-LF style and add
the required no-newline marker. This does not change candidate declaration
bytes, but the patch hash changes.

Corrected diff SHA-256:
`33dc3ecb325a9092ae4bab170890a3bab05e7fc9127783dbc334c766dcbe1d3c`.
The corrected diff passed **standard git apply --check**, without whitespace,
EOF-repair or unsafe-path options. No patch was applied; the original private
check file retained its original hash.

The generated root lock still names the old a9a06e... hash. A pure pairing
check explicitly rejects it against33dc3e.... **Do not apply or approve that
lock together with the corrected diff.** It is retained in private evidence,
not committed as a ready-to-use root lock preview.

The one allowed patch-registration resolution was already consumed.
No second invocation, manual lockfile hash substitution, runtime upgrade or
dependency retry occurred. No pnpm/store/global config was changed to
circumvent that budget.

The corrected patch is committed only as
better-auth@1.7.7-role-types.patch.preview. No actual patches/ entry or live
patchedDependencies registration exists.

## Verification and execution record

| Evidence | Result |
| --- | --- |
| Public type metadata and immutable source, r45-metadata-20261025130852163 | PASS |
| Type lock resolution, r45-type-lock-20261025131052495 | pnpm exit0; collector FAIL, retained |
| Existing type lock review, r45-type-review-20261025131411785 | PASS; zero resolution invocations |
| Shadow patch lock, r45-patch-lock-20261025131610383 | PASS as generated; later applicability rejected initial diff |
| Initial standard patch check | FAIL; not hidden by subsequent successful commands |
| Corrected diff standard patch check | PASS; zero lock resolutions, original unchanged |
| Pure preview-boundary/EOF/closure/hash-pair tests |29 PASS |
| Committed preview hashes and JSON syntax | PASS |
| Full typecheck, declaration checks,43 mapping regressions | NOT_RUN |
| Installation or actual config/patch application | NOT_RUN |

All four owned containers ended stopped with OOMKilled=false.
Public response bodies were bounded, and raw CLI stdout/stderr or exception
bodies are not in the committed report. Private evidence retains the exact
preview artifacts and safety metadata. Neither successful metadata collection
nor a patch applicability check is a full typecheck PASS.

## Remaining authority and exact next action

Only one metadata step remains before a complete repair approval package:
**one additional isolated, preferably offline lock-only refresh for the
corrected patch hash**, with the same285-package/version/integrity comparison.
It must use the corrected33dc3e... diff and retain the same frozen declarations,
type closure and runtime pins. No new dependency versions, full re-diagnosis,
compiler run, installation, source upgrade or production access is needed
for this metadata step.

That extra invocation exceeds this phase's one-per-candidate resolution budget
and is **NOT authorized/performed**. If approved later, any missing offline
metadata or unexpected closure change must stop without network fallback or
retries. Do not hand-edit the final lock to imitate pnpm output.

Only after a consistent lock+patch preview is reported and explicitly approved
may the separate application/validation phase install under ignored scripts,
apply the registered declaration patch and run the unchanged full database-test
typecheck plus retained declarations/profile/lint/43-test gates. Global type
visibility, strict checking and runtime provenance remain mandatory reviews.

This is a local type-validation dependency candidate, not a protocol/security
rollback or a change to OAuth tenant/audience/grant/WordPress permission rules.
If later application changes approved public behavior or runtime code, stop
for the separately required ADR/compatibility decision.

## State and stop

```text
P3E2SR4BR45_TYPE_LOCK_PREVIEW_CONFIRMED=True
P3E2SR4BR45_PATCH_CONTENT_APPLICABILITY_PASS=True
P3E2SR4BR45_PATCH_LOCK_PAIR_CONFIRMED=False
P3E2SR4BR45_DECLARATION_PATCH_PREVIEW_CONFIRMED=False
P3E2SR4BR45_RUNTIME_IMPACT_REVIEW_PASS=True
P3E2SR4BR45_READY_FOR_REPAIR_APPROVAL=False

P3E2SR4BR45_DEPENDENCY_CHANGE_APPLIED=False
P3E2SR4BR43_FULL_DATABASE_TEST_TYPECHECK_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Runtime impact PASS above is limited to the reviewed declaration-only
candidate's files and unchanged normalized lock closure. It is not installed
artifact identity, ambient-type compatibility, runtime or production acceptance.
Historical trial permissions and OTP policy are neither revalidated nor changed.
Stop without using the previews as active configuration.
