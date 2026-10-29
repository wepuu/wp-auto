# P3-E2S-R4B R67 — Protected originals backed up; exact 11-file candidate materialized

Date: 2026-10-27 (Asia/Shanghai)  
Source HEAD: 24fba1c4dc8c30eb1c66a329a59d5b402651f67a  
Branch: codex/p3e2sr4b-source-integration  
Scope: local permission bridge, protected three-file backup and exact candidate materialization

## Outcome

R67 passed. The actual Windows permission/backup bridge passed on a private
Unicode-and-space fixture path. The three real original files were backed up,
read back and protected; current R65/R66 evidence and candidate bytes were
verified before writing. Exactly 11 formal candidate files were materialized
with apply_patch and matched the already-tested artifact bytes afterwards.

The three existing files retain their Owner/Group/DACL. The eight new files
have allowed owners, inherited access rules and no unexpected explicit rules.
All other selected source inputs and historical tools/evidence were preserved.

This closes the local backup/materialization gate. It is not full candidate
acceptance, Hosted CI, production acceptance or deployment.

## Evidence chain and authority

- R65: two standard frozen installs, actual patch application, disconnected
  current-source build and full strict 18-test-file typecheck passed.
  Its overall failure remains immutable.
- R66: one complete filesystem diff confirmed zero /workspace changes;
  identity/state matched before and after. Its backup-stage failure and
  overall false result remain immutable.
- R67: the missing backup gate was supplied with a new protected backup;
  the formal source files now exactly match the R65 tested artifacts.

R67 invoked no Docker command and did not inspect the current container.
R65/R66 observations are historical evidence tied to pinned receipts and
artifact hashes, not fresh container/production-health claims.

R66 acceptance was not broadly relaxed: the new retained-evidence checker pins
its original failed receipt, permits only the recorded original_file_backup
stop with no source materialization, verifies its complete successful diff,
and requires its original tools and R65 artifact chain to match. The old R66
finish script was not used or modified.

## New local bridge and permission boundary

R67 uses Windows PowerShell 5.1 CLR APIs with an ASCII-only fixed command.
Absolute paths are input data and are never echoed into its output. Responses
use fixed file IDs and base64-encoded UTF-8 security descriptors. Node strictly
decodes UTF-8, validates the exact schema/IDs and canonical base64, and retains
descriptor contents only inside the private local backup.

It does not depend on ConvertTo-Json or PowerShell module autoload. It
explicitly reads/serializes Owner + Group + Access (DACL), enum mask 14.
It does not request Audit/SACL, change privileges or write source ACLs.

**SACL is not covered.** This is not a complete security-descriptor/audit
backup, and SACL preservation was not independently measured. No SACL-write
API was invoked. Backup readback is not a restore drill; no restoration was
performed.

References:
[File.GetAccessControl](https://learn.microsoft.com/en-us/dotnet/api/system.io.file.getaccesscontrol?view=netframework-4.8.1),
[AccessControlSections](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.accesscontrolsections?view=net-9.0)
and [PowerShell encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding?view=powershell-5.1).

The new successful bridge does not prove the historical R66 failure was caused
by encoding, JSON module loading, access denial or SACL handling. That older
underlying failure remains unconfirmed.

## Tests and actual execution

### Offline checks

45 pure checks passed, with zero real PowerShell or Docker calls in that
suite. Coverage included malformed/missing/duplicate/reordered identifiers,
wrong sections/schema, invalid UTF-8/base64, unexpected fields, process
failure/timeout/stderr, unsafe input paths, link/hardlink stat rejection and
sensitive-error filtering. New module and entrypoint syntax checks passed.

### Real public-data rehearsal

One continuous rehearsal used the owned private subdirectory named
"中文 路径", three public synthetic files and a separate backup tree.

Positive byte backup, descriptor capture, descriptor stability, complete
readback and private ACL checks passed. Nine expected controls rejected:

| Control | Expected stopping point |
| --- | --- |
| Injected directory protection failure | backup_directory_protect |
| Mock directory verification failure | backup_directory_verify |
| Injected permission access denial | permission_process |
| Missing synthetic source | source_files_validate |
| Wrong expected source hash | original_bytes_backup |
| Injected failure after first copied file | original_bytes_backup |
| Deliberately corrupted copied bytes | backup_readback |
| Mock permission-descriptor drift | permission_process |
| Already-existing backup directory | backup_directory_create |

Faults were confined to owned synthetic scopes or mock callbacks. No real
source permission was broadened and no production fault was injected.
The partial-copy control left exactly its first public fixture file and did
not proceed. Synthetic source bytes and actual descriptors remained stable.

The rehearsal's per-control permissionCalls field counts the default mock
callback only; it is not a total of real PowerShell processes or custom
injected callbacks and must not be aggregated as such.

### Real backup and materialization

Backup gate UTC: 2026-10-26T17:15:10.200Z to 17:15:32.018Z
(2026-10-27 01:15:10.200–01:15:32.018 Asia/Shanghai).
Monotonic gate duration: 21.8180515 seconds; receipt verification followed.

Post-write verification completed:
2026-10-26T17:16:43.361Z
(2026-10-27 01:16:43.361 Asia/Shanghai).

The private backup contains raw original bytes for:

- pnpm-workspace.yaml
- pnpm-lock.yaml
- packages/database/test/tsconfig.json

It also contains a fixed manifest and the three permission descriptors.
The original permissions were captured before and after backup and matched.
Files were copied exclusively, verified nonempty where expected, read back
with exact byte counts/hashes, and checked under the protected private ACL.

Before applying, all three original hashes and eight absent destinations were
checked again. A single precise apply_patch applied the formal changes.
Post-write verification independently checked all 11 files and the modified
source manifest, original Owner/Group/DACL equality, new-file ownership and
inheritance, backups, prior receipts and historical tool hashes.

## Exact formal candidate scope

| File | Change | SHA-256 |
| --- | --- | --- |
| pnpm-workspace.yaml | Existing | a1c207a09fddb9c5a639e4e3f9757e46a72147b49ad920621e9949534289787c |
| pnpm-lock.yaml | Existing | 24d62efb3d26ff866f7c295198c28c73c85a8e05363b0148a666c2aee0596ff0 |
| packages/database/test/tsconfig.json | Existing | acaf68874d166c97f36f0cbcb785c9598a15ff65c09d5083fd56cc559616e8f3 |
| patches/better-auth@1.7.7-role-types.patch | New | 33dc3ecb325a9092ae4bab170890a3bab05e7fc9127783dbc334c766dcbe1d3c |
| test/persistent-authorization/type-support/package.json | New | d2dbe0711ca5c2e22727bad99ebee40d519bada4703318c3ec6d53a437665513 |
| test/persistent-authorization/type-support/pnpm-workspace.yaml | New | c466fd914e5ce86ff91f8020c4637d123f0fe5dadf5d12ecbfbaa549ac587d32 |
| test/persistent-authorization/type-support/pnpm-lock.yaml | New | 0998fa8988c40cf13f25116f517edd56c54ce5cca8694c7902c5272cd1ae1482 |
| test/persistent-authorization/type-support/patches/bun-types@1.3.14-node24-types.patch | New | 6cad3e6716be56191cf403574f666a217e7196f55194d6d6cf88cb3feb09f829 |
| scripts/typecheck-database-tests.mjs | New | 138c6de752c913c3252de7982601d405875f62ad16d0f479bddcd5dc0687998f |
| scripts/database-test-typecheck-core.mjs | New | d5a099dc5bbe06a4003643565627497028d9321f3e145416d157af02be371c9a |
| scripts/database-test-typecheck-core.test.mjs | New | a6e295f227869ebcbcc45e8a36e629d07d47ef42f32d598db5ae47a3d5878ac7 |

The three tracked modifications are 13 insertions and 2 deletions; eight new
formal files are additional, not included in that tracked-only diff stat.
The root package manifest, runtime source, original lock package versions and
strict compiler baseline were not changed outside the approved artifacts.
Both patches are declaration-only; R65 verified the corresponding runtime
package bytes unchanged. No skipLibCheck relaxation or manual node_modules
patching occurred.

The new root core.test.mjs contains three tests. Future full regression
inventory must include it; an old inventory does not prove that new file ran.
Those exact bytes were tested in R65. R67 did not rerun them or claim that
the host dependency installation was synchronized.

## Evidence custody

New private root:

C:\Users\liulo\AppData\Local\Temp\wepuu-r67-custody-0bBjR5

| Evidence | SHA-256 |
| --- | --- |
| receipts/result.json | c55452a7f79d0c44fa9561359801f80f3efbc7bd7fcb0cc4e057764ed048423f |
| completion.json | e761d46149d6f19635f70967f57734f5e048f8827642e23ff310b9ea6c448d82 |
| materialization.json | bed7a10ef6baff5e6a645bcb756d6bde6a15266addd8c87bbbd608357c9dd8d4 |
| originals/permissions.json | f78d43d178941a4906d4e4a65e80f6df8a82e6a2c178fc7189def33d242ef66e |
| originals/manifest.json | 5192640260fb26835479c83494ea86546763163b5e7fe3a6a649d305bb68305b |

The first receipt is scoped to the backup gate before materialization.
completion.json confirms its protected receipt/readback. materialization.json
records the later successful exact-source and permission verification.
The permission file's raw-byte hash differs from the canonical JSON hash
because the file includes a final newline; both were checked in their
respective representations.

New execution tool hashes:

| Tool | SHA-256 |
| --- | --- |
| scripts/prepare-r67-backup-once.mjs | de0f0c2ecad1c0f52fa27b09b5085d86bd534fd0932819f1d9002d0046c7c874 |
| scripts/finish-r67-materialization.mjs | 723e9e5f3e2918e029de8700d12e15c30577565e03fafb95a1d306bb4d7ffd55 |
| r67/permissions.mjs | 577f3ab80d68a185e323904d61b4795569cd1ff65cff5dd29f6c8dcafe69b85d |
| r67/backup.mjs | 959320af691ad0ddbcb121039d07a6cc795feeb2cccb6b367b29eb65a5a25f73 |
| r67/retained.mjs | 9a2d2bd19e7feab48048712e5ce94cd5ef221fd81482188dc312b056b3e293ba |
| r67/rehearsal.mjs | 22bfaf1d5d0eceaa0199824ecf97e16bc396242dd0a85c6b943027e184149379 |
| r67/contracts.synthetic.mjs | 9460bf9eb07d8a17430dc250560e01d571001e8d8ab6ab052b43d6c1da0f0d27 |

Only the 11 formal candidates, seven new R67 tools/tests and this document
were added/changed by R67. Existing untracked task work was retained.
git diff --check passed. No actual configuration backups, descriptors or
private evidence contents were added to Git.

## Boundaries, status and stop

There were no Docker calls, installs, compiler invocations, lock generation,
production/WordPress/database/business-service requests, OAuth/MCP/OTP calls,
connector changes, migrations, deployment, credential-store access, design/
edits, commits, pushes, PRs or merges. Real node_modules was not modified.
No existing container, image, volume, cache, backup or evidence was deleted.
No WordPress content/tool input/output entered the control plane.

    P3E2SR4BR67_PERMISSION_BRIDGE_TEST_PASS=True
    P3E2SR4BR67_RETAINED_EVIDENCE_PASS=True
    P3E2SR4BR67_ORIGINAL_BACKUP_VERIFIED=True
    P3E2SR4BR67_EXACT_11_FILES_MATERIALIZED=True
    P3E2SR4BR67_POST_WRITE_PRESERVATION_PASS=True
    P3E2SR4BR67_OWNER_GROUP_DACL_PRESERVED=True
    P3E2SR4BR67_SACL_BACKUP_COVERED=False
    P3E2SR4BR67_OVERALL_PASS=True
    P3E2SR4BR67_DOCKER_INVOCATIONS=0
    P3E2SR4BR67_INSTALL_ATTEMPTS=0
    P3E2SR4BR67_COMPILER_INVOCATIONS=0
    P3E2SR4BR67_LOCK_GENERATION_ATTEMPTS=0
    P3E2SR4BR65_OVERALL_PASS=False
    P3E2SR4BR66_OVERALL_PASS=False
    P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
    NOT_READY_FOR_PUBLIC_REGISTRATION=True

Stop. Full repository regressions, Hosted CI and release/deployment remain
separately gated. Historical limited internal read-only trial authorization
is not changed by these candidate statuses.
