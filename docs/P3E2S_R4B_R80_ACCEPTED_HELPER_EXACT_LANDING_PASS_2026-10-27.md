# P3-E2S-R4B-R80: exact landing of the accepted single helper passes

## Outcome and boundary

R80 materialized the exact R79-accepted helper and its exact narrow Buffer
configuration on the host. The files match the container-accepted hashes,
their original owner/group/ACL and mode were retained, the unchanged AST
gate passed, and 172 host behavior comparisons passed. A new derived
117-input manifest accepts precisely those two changes and preserves the
other 115 entries. Historical tools/manifests/receipts were not rewritten.

R80 did not repeat container acceptance, start Docker, process the remaining
four helpers, run full lint/type checking/CI, commit, push, merge or deploy.
R79's real Node 24 typed-lint/checkJs/public-contract/behavior evidence is
linked by exact byte equality; it is not presented as newly rerun evidence.

HEAD remains `1db6d3429876862025eab24ad2466c5f90aa030c` on
`codex/p3e2sr4b-r68-ci-20261027`. Existing user/earlier work, including the
pre-existing ESLint draft, was preserved. Public API, `.d.mts`, Codec types,
runtime validation, OAuth/Refresh contracts, database and production settings
are unchanged.

## Exact existing-file changes

| File | Before SHA-256 | Landed SHA-256 |
| --- | --- | --- |
| packages/database/test/reconsent-native-fixture.mjs | `421e75a05bd82fc97b92a3485379615aa1e2efbe3fe4728b080a25fcf01639d6` | `2e1bedc491e07ee733d2e9d409b46f5cc3987ccbb27e06d91cc51d237e22897f` |
| eslint.config.mjs | `75caf71db48e2e46448cdb664706ba5b8f9f49a774301d24ca0cf97f213375e3` | `48f441f06813133caf39e6440333ce005e3e5b2cf865c870e3ab15b737734ee0` |

The implementation is byte-for-byte the R78 candidate accepted by R79.
Its existing runtime guards/expressions are retained; JSDoc and type
expressions provide the checked types. No further candidate repair occurred.

Relative to the current pre-R80 ESLint draft, the only added block is:

```js
{
  files: ['packages/database/test/reconsent-native-fixture.mjs'],
  languageOptions: { globals: { Buffer: 'readonly' } }
},
```

It is inserted immediately before the existing `**/*.test.ts` block using
the same recipe as R79. All other configuration bytes are retained, with no
global Node settings, suppressed rules or whole-file formatting. Formal
edits and the derived manifest were applied with exact patches after
rechecking both original and accepted hashes.

Public declaration still has SHA-256
`6a5b60adb3e9aaaede2efaec346be44049f29b6e74aeb527d1c7011f4ba30239`.

## Preparation, backups and permission-tool interruption

The R80 `landing.mjs` helper validates the pinned successful R79 receipt,
every referenced accepted tool hash and all 117 original inputs before
application. Seven synthetic tests cover:

1. Exactly two derived-manifest entry changes.
2. Rejection of third-entry changes or missing entries.
3. Rejection of wrong original hashes.
4. Partial-file restoration and mode preservation.
5. Stale-hash rejection and refusal to overwrite concurrent drift.
6. Exact pilot-only Buffer configuration recipe.
7. Original public declaration identity.

Two preparation attempts stopped in the backup stage, before any formal
file changed or any two-file patch was applied:

- `.tmp/r80-landing-ZIlnHT/prepare-result.json`, SHA-256
  `adc2121307a0c23965cec7aea551d9816251f550865ccf9ff813be6fbc93b363`.
- `.tmp/r80-landing-9sSU9r/prepare-result.json`, SHA-256
  `92b5be22dc627b49de50959d986176128fc7bc15347f8da24a7dfda7c80af9d0`.

The first failure was generic backup-not-confirmed; the second safely
identified an ACL-reader subprocess failure after encoded-command/error
classification was added. Neither backup attempt contained a source/config
backup, and neither authorized bypassing the permission gate.

Read-only diagnosis established that the actual path is the expected regular
file and the active shell can read its ACL. A Windows PowerShell subprocess
could run Get-Date, but Get-Acl failed with command-missing/module-load
classifications, without access-denied/path-missing/execution-policy matches.
Raw subprocess errors were not printed or saved. This supports a local
command/module-loading problem, not an assertion that ACL access was denied
or a definitive diagnosis of the underlying module environment.

One inline read-only Node diagnostic had a quoting syntax error; it made
no file changes. A separate `acl-read-diagnostic.mjs` provided fixed metadata
classification without raw errors/stacks. The local permission helper was
then corrected to use the exact available PowerShell 7 executable already
used by the working shell:

`C:\Users\liulo\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe`

Its identity hash was recorded before application and verified afterward.
The same ACL read/check remained mandatory. No ACL, privilege, execution
policy, installed package or formal helper candidate was changed to make
the check pass. Earlier preparation receipts were preserved.

Successful backup directory:
`.tmp/r80-landing-zuzCSh/backup/`, containing `pilot.mjs` and
`eslint.config.mjs` with the exact original hashes above. Its parent also
contains permission metadata, tool/history identities, accepted bytes and
the prepared derived manifest. These local backups/metadata are not for
Git publication and contain the actual pre-R80 bytes, including the earlier
ESLint draft, not a historical HEAD replacement.

Successful preparation receipt:
`.tmp/r80-landing-zuzCSh/prepare-result.json`, SHA-256
`53aebd8f9cd715ecec0ba1a596f1f4becf7af1759a2f30aeb350c56a289ab48a`.
UTC `2026-10-27T11:33:05.299Z`–`11:33:06.869Z`.

## Derived manifest and verification

New durable manifest:
`test/persistent-authorization/r80/accepted-inputs.json`, SHA-256
`250873e9e3dcab5b8592ea2639bc66995512f97883831f29cd8d4c09271e8f14`.

It records schema/phase, parent manifest identity, R79 acceptance receipt
identity, the two exact overrides and all 117 expected file hashes.

Parent remains unchanged:
`.tmp/r72-env-yrNqai/input/.input-manifest.json`, SHA-256
`0bdb6a80021fb9b3733f789ff624f0af3afd4e68d8c9aefc47c5e5af12da2911`.
Acceptance receipt remains `.tmp/r79-pilot-Hto49X/result.json`, SHA-256
`0447ab9ab4f1b0cc812bfef598a022565c67192582a5160276c5e35e5f0dd878`.

The derived manifest is independently checked against that original parent:
exactly two hash substitutions, no added/removed entries and no changes to
the other 115. All actual files must be regular, nonsymlink, resolved within
this worktree and match their expected hashes.

After landing, the historical original-only `baseline()` intentionally no
longer matches the two accepted host files. Do not change that historical
function, overwrite its manifest or introduce ignores. Future host checks
must explicitly select the new derived manifest and verify its provenance.
R79's container was last observed stopped/restored to the old original
inputs. R80 neither inspected nor modified it; do not assume it has the new
host bytes. Any future container trial must explicitly handle that distinction.

Post-application results:

- Both files exactly match R79 accepted bytes and original permissions
  (mode/uid/gid/Windows owner/group/SDDL).
- Backup bytes still match the pre-R80 hashes.
- Derived manifest verifies all 117 inputs; unrelated 115 remain unchanged.
- Helper, ESLint config and landing tool pass Node syntax checks.
- Original/new helper AST hash is
  `569890f5ef9a0a755a1899204956e834b0d1a62c7e2659af750389dbaf0c8e19`.
- Configuration bytes equal exactly the original backup plus the known block.
- Existing 172 host outcome/call-trace comparisons pass on Node v26.11.1.
- R75-R79 module hashes, parent manifest and R79 receipt remain unchanged.
- Final owner/group/ACL/mode recheck passes. No rollback was necessary.

These host checks are preparation/byte-provenance evidence, not a fresh
fixed-container typed-lint or full-program check. R79 remains the accepted
real Node 24.22.1 evidence for the exact two landed byte sequences.

## Final evidence and stop

Verification receipt `.tmp/r80-landing-zuzCSh/verify-result.json`, SHA-256
`7a1c9e193a643106765379ac803460395cfe7b09acec00fbfc9da96451a4a32d`.
UTC window `2026-10-27T11:34:05.453Z`–`11:34:09.033Z`
(19:34 Asia/Shanghai).

| R80 asset | SHA-256 |
| --- | --- |
| landing.mjs | `39085896303b68c3f76c91e992b43beaec4125d1006fdfc8d9793009d793633a` |
| acl-read-diagnostic.mjs | `d4be5a929fdc909bdebc8ddefc9d02d7bcb34746f6c6090c8aa6578803a1579c` |
| accepted-inputs.json | `250873e9e3dcab5b8592ea2639bc66995512f97883831f29cd8d4c09271e8f14` |

Tracked changes from HEAD now total 35 insertions/7 deletions across the two
existing files: ESLint 17 insertions/2 deletions (including its pre-existing
13/2 draft), helper 18 insertions/5 deletions. `git diff --check` passed.
New tools/manifest/record are local and uncommitted. No `design/`, production,
WordPress, OAuth/MCP/OTP, credentials or unrelated user-file operation occurred.
The client-to-WordPress data-plane boundary and limited trial authority are
unchanged. This helper is a synthetic test fixture, not a production change.

```text
R80_EXACT_SOURCE_MATERIALIZED=True
R80_EXACT_CONFIG_MATERIALIZED=True
R80_DERIVED_MANIFEST_PASS=True
R80_HOST_PRECHECK_PASS=True
R80_UNRELATED_INPUTS_UNCHANGED=True
R80_CONFIGURATION_ROLLBACK_PERFORMED=False

R79_OVERALL_PASS=True
R80_CONTAINER_STARTED=False
R80_FULL_HELPER_LINT_PASS=NOT_RUN
R80_HOSTED_CI_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop. The single accepted pilot is now landed. Remaining four helpers,
complete lint/regression and hosted CI are later scoped tasks; do not
automatically reopen the accepted pilot experiment or promote readiness.
