# P3-E2S-R4B-R87: accepted four-helper exact landing pass

## Outcome and scope

R87 landed the exact four R85 helper candidates accepted by R86, together
with the exact accepted file-scoped ESLint globals. All landing checks
passed: accepted hashes, executable AST, syntax, owner/ACL preservation,
five-entry manifest derivation, 112 unchanged other inputs, historical
artifact identities and 187 host behavior comparisons.

This is a workspace source landing, not a commit, release or deployment.
No container/Docker command, dependency installation, database connection,
migration execution, production request, OAuth/MCP/OTP, Hosted CI or full
application regression occurred. The full candidate acceptance flag stays
False. R86's Node 24 evidence is referenced, not represented as rerun here.

## Fixed acceptance and application baseline

R86 actual receipt `.tmp/r86-batch-LYC9hz/result.json`, SHA-256:
`53e1ec467dab02cb0cd9c8f7c63cd88fce055fa680ebd1ba391a7410aaea3c48`.
Its single-start, complete lint/type/contract/behavior acceptance,
restoration, stop and host-protection results were checked before and after
landing. The tested tool identities and candidate bytes remain unchanged.

Before applying, the host matched all 117 entries in the R80 derived input
manifest. This preserved the native helper accepted/landed by R79/R80 and
the earlier ESLint draft. No historical baseline was rewritten or relaxed.

Only the following five existing files changed in R87:

| Exact accepted target | Landed SHA-256 |
| --- | --- |
| packages/database/test/otp-migration-evidence.mjs | `34806061a680d5427fd4b16f0909a04c096454144422cb39e0ca4510485e4880` |
| packages/database/test/r17-migration-evidence.mjs | `03d44172d2aa07129abc59d8901a91dd70bd37f7c82c810fec10f075a9ff5f48` |
| packages/database/test/r19-target-ledger.mjs | `8ce96cfa2e2753c3332a4e7e297ef4687218795ce4fb980357bf51af77b6d471` |
| packages/database/test/reconsent-diagnostic.mjs | `2b0cff4b488d066d50a46a869a368e0bd386cc5120b090a5f0600ddb5d89c0a0` |
| eslint.config.mjs | `d378e2be5000a5aeff59eee695014d6d849cdf662e25ea9217efb7a8f9d04dc3` |

The four helper diffs are annotation-only according to the unchanged R76
AST comparator. No runtime expression, timeout, validation branch, return
structure or error path changed. Public `.d.mts` files are unchanged.

ESLint changes are exactly the four baseline-justified readonly global
blocks: process for OTP/R17, process and Buffer for R19, process/Buffer/
structuredClone for Diagnostic. The existing native-helper Buffer block,
rules, parser and unrelated configuration remain unchanged. Reconstructing
the configuration from the pre-R87 backup using the R86 neededGlobals
recipe yields exactly the landed bytes.

## Preparation, backup and controlled patch

Backup and state directory:
`.tmp/r87-landing-lnYXdy/` (outside tracked source directories).
Five original files are retained under `backup/`; accepted bytes, derived
manifest bytes, permission metadata and hash identities are also retained.
Only source/configuration artifacts are backed up, not credentials or a
production database. No raw owner/ACL metadata is exported in this record.

Preparation verified each target is a normal file without a symlink,
recorded owner/group/SDDL/mode metadata through the previously verified
PowerShell 7 ACL reader, and verified original/accepted backup hashes.
The reader executable identity is saved and checked again at verification.

Five synthetic checks passed: exact five-entry derivation; missing input
and unrelated manifest alteration denial; wrong-hash denial and partial
replacement recovery; concurrent restore refusal; and corrupted-byte hash
rejection. These are bounded local controls, not a production restoration
or complete filesystem fault-injection exercise.

Prepare receipt `.tmp/r87-landing-lnYXdy/prepare-result.json`, SHA-256:
`f886cbc619259e638d1db41c8b2741e83e279e9db4850f8c9260db1150b9493b`.
Preparation UTC window: `2026-10-27T14:18:36.439Z` to `14:18:42.462Z`.

Immediately before application, all five original hashes and accepted
hashes were rechecked and the new manifest was confirmed absent. One
controlled apply_patch updated only the five targets and added the new
manifest. No whole-worktree reset, checkout, formatter or shell overwrite
was used. File ownership/ACL equality was checked after application.

## New explicit accepted input lineage

New file `test/persistent-authorization/r87/accepted-inputs.json`, SHA-256:
`8286d4011cbc2ba5f31861abec36c195a54b73e4307179c3f22683bf939fb74d`.

It derives from `test/persistent-authorization/r80/accepted-inputs.json`,
SHA-256 `250873e9e3dcab5b8592ea2639bc66995512f97883831f29cd8d4c09271e8f14`,
and references the exact R86 acceptance receipt/hash. Its overrides are
exactly the five targets above; its files map retains exactly 117 entries.
The other 112 hashes, including the native helper and public declarations,
are unchanged. The manifest itself is separate acceptance metadata, not an
unexplained extra entry in the historical 117-input set.

The new manifest is recomputed from the verified parent and closed target
map, not accepted by observing arbitrary current bytes. R80 and earlier
manifest/guard implementations remain intact. Their old host-state guards
must not be invoked as if R87 were still R80: future work should explicitly
select and validate this new lineage instead of ignoring expected changes.

## Actual landing verification

Verification receipt `.tmp/r87-landing-lnYXdy/verify-result.json`, SHA-256:
`0e267b3d105b23f127481ae41e7eef05ea065ddfd87f72c4704846806acc11dc`.
UTC window `2026-10-27T14:19:39.547Z` to `14:19:55.090Z`
(22:19 Asia/Shanghai). No verification or recovery failure occurred.

- All five target hashes equal actual R86 accepted hashes.
- Syntax checks passed; four original-versus-landed ASTs are identical.
- All five files retain their recorded owner, group, SDDL and mode metadata.
- Exact config reconstruction and all 117 new-manifest hashes passed.
- 82 historical/current tooling, evidence and fixed-artifact identities
  match the saved preparation snapshot.
- All 187 host Node 26.11.1 behavior comparisons passed, including the
  existing 14 golden assertions outside matching-error capture.

Behavior uses the real pre-R87 backup graph, not the newly landed source
on both sides. The old four helpers and 17 hash-checked SQL data files are
copied into a private original graph; candidate modules come from the landed
files. Existing loadTrees/compareBatch checks both linked module graphs.
The child is bounded to 90 seconds, reports fixed safe categories on failure,
and never connects to a database or executes the copied SQL.

Host Node behavior is a landing precheck only. Full lint, Node 24 behavior,
Linux private writes and complete type sources remain the R86 historical
acceptance results. No new container result or Hosted CI result is claimed.

R87 tooling identities:

- landing.mjs: `5409181daeda3ffc4f2ed3c147563e2e39dc3af93db5c3b966fd8fff8ee87c3d`
- behavior.mjs: `f3d184afce52049766961163f596be6f5c91c56508b675a9303dcdea0f6deec9`

The resulting tracked diff has six files, 309 insertions and 75 deletions.
That includes the pre-existing native/R80 and earlier ESLint draft changes;
R87 itself updated four helpers and the config, not the native helper.
New tools, the manifest and this record remain uncommitted. No design/ file
or unrelated user edit was changed. git diff --check passed.

## Status and stop

```text
R87_ACCEPTANCE_EVIDENCE_VERIFIED=True
R87_BACKUP_VERIFIED=True
R87_EXACT_SOURCE_LANDING_PASS=True
R87_EXACT_CONFIG_LANDING_PASS=True
R87_DERIVED_INPUT_MANIFEST_PASS=True
R87_EXECUTABLE_AST_PASS=True
R87_HOST_BEHAVIOR_PRECHECK_PASS=True
R87_PERMISSIONS_UNCHANGED=True
R87_CONFIGURATION_ROLLBACK_PERFORMED=False
R87_OVERALL_PASS=True

R87_CONTAINER_STARTED=False
R87_FULL_APPLICATION_REGRESSION_PASS=NOT_RUN
R87_HOSTED_CI_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop with the accepted source/config changes retained. The next separately
authorized task may plan full-candidate regression and CI closure against
this explicit landed state. This does not authorize production operations,
repeated annotation repair, account/Grant changes, deployment or merging.
