# P3-E2S-R4B-R89: single contract-fixture offline lint repair pass

## Outcome and precise scope

R89 changes only the existing compiler fixture
`packages/database/test/r43-helper-types.ts`. It reproduces the exact four
R88 lint findings and clears them without changing helpers, public
declarations, ESLint rules/options, tsconfig, dependencies or workflows.
All six negative type cases and two type-regression controls pass.

This is an uncommitted offline candidate. No commit, push, CI invocation,
container/Docker command, production access, OTP, OAuth/MCP, migration or
fixture runtime execution occurred. R88's Hosted failure is not rewritten.

Head remains `29ba03f642c32125d9c74dfc129ee9dd1f80530c`. The index was empty
before and after. Previous tracked source was clean before R89; unrelated
untracked task artifacts were preserved.

## Backup and exact modification

The R87 parent manifest SHA-256 was checked:
`8286d4011cbc2ba5f31861abec36c195a54b73e4307179c3f22683bf939fb74d`.
All 117 original inputs matched before application. Target original SHA-256:
`201988e9e3ac9b42940e08806b05a9765f88644853929a8711913543e014fa4e`.

Backup/state directory `.tmp/r89-offline-oF0A54/` retains original.ts,
candidate.ts, hash identities and ACL metadata. The target was verified as
a regular non-symlink file at the expected canonical path. Original bytes,
owner/group/SDDL/mode and the existing PowerShell ACL-reader identity were
recorded and checked after application; raw ACL metadata is not exported.

Prepare receipt SHA-256:
`914c7aeb8609077d9e6e5c37bce88577e2d1f0495990234c65d88fca2575d82b`.
Preparation UTC window `2026-10-27T14:49:42.657Z` to `14:49:43.680Z`.

One controlled patch made three substitutions:

- Export the existing typed kind witness and remove its variable void.
- Export the existing category witness and remove its variable void.
- Replace the erroneous message-property variable with the exported
  type-only `RejectedDiagnosticMessage` indexed-access assertion, keeping
  the existing descriptive @ts-expect-error immediately above it.

All six original @ts-expect-error purposes are preserved. No any escape,
new suppression, rule exclusion, unsafe cast or public API change is added.
The exports are compile-only fixture witnesses, not application interfaces.

The type alias is deliberately one line. A separate in-memory formatting
control confirms that splitting the indexed access onto the next line
would leave the directive unused (TS2578) and expose TS2339 below it. This
is a directive-placement requirement, not a relaxation of the message ban.

Actual candidate SHA-256:
`08fa756a03d0e3da320217b151944f5800fefd95dd0e36238b41ffca24266836`.
Tracked source diff: one file, three insertions and five deletions.

## Actual offline validation

Result `.tmp/r89-offline-oF0A54/result.json`, SHA-256:
`202ec392265051b17f24ea7aca9ed6993f40d8346f282f868e1c10599fd2d386`.
UTC window `2026-10-27T14:50:17.250Z` to `14:50:40.388Z`
(22:50 Asia/Shanghai). No validation failure or rollback occurred.

The original text from the backup is mapped in memory to its actual module
path. Its full-rules lint projection exactly matches R88:

| Original line:column | Rule |
| --- | --- |
| 15:1 | @typescript-eslint/no-meaningless-void-operator |
| 30:7 | @typescript-eslint/no-unsafe-assignment |
| 31:1 | @typescript-eslint/no-meaningless-void-operator |
| 31:16 | @typescript-eslint/no-meaningless-void-operator |

Both original and candidate compiler roots have no unexpected diagnostics
with all expected-error directives present. Candidate full-rules single-file
lint has zero errors/warnings. No rule configuration was changed or filtered
to only the previously failing rules.

Each expected-error marker is separately removed only in memory:

| Retained negative contract | Actual unsuppressed diagnostic |
| --- | --- |
| Invalid migration profile | TS2345, 16:21 |
| Invalid ledger stage | TS2345, 18:32 |
| Missing native binding fields | TS2345, 20:22 |
| Unsupported fixture parent model | TS2345, 22:36 |
| Invalid diagnostic stage | TS2345, 26:23 |
| Forbidden diagnostic message type | TS2339, 29:70 |

Exactly one corresponding diagnostic is required in each case. In-memory
public-declaration mutations additionally verify:

- Adding message:string to SafeError triggers unused-directive TS2578 at
  28:1, so the negative case fails if the public ban is weakened.
- Changing the declared kind to AuthorizationCode triggers TS2322 at
  14:14, preserving the positive RefreshToken witness.

No mutated public declaration is written to disk. The fixture is never
imported, transpiled for execution or run; its compile-only pool declaration
does not cause a database connection.

## Environment and evidence limitations

Host Node v26.11.1, TypeScript 5.9.3, typescript-eslint 8.70.0 and ESLint
9.39.5 are used. The original database test compiler options are verified
with the existing strict-option guard before constructing a noEmit Program.
All strict language settings are retained; automatic ambient types are
explicitly isolated with types=[]. Actual public module declarations are
read from disk, not replaced with permissive stubs.

The actual repository rule configuration is loaded unchanged. Only the
in-memory diagnostic invocation substitutes its supplied Program for
projectService discovery. Consequently this proves full configured rules
on this one fixture under the declared host projection, not the complete
Node/Bun/React project-service environment, whole-workspace typechecking,
Node 24 acceptance or Hosted CI.

The validation child is bounded to 90 seconds and safe output limits.
Malformed JSON, nonzero-child, timeout and oversized-result controls all
reject without returning their synthetic secret marker. Reports contain
only fixed categories, rule IDs, diagnostic codes and positions, never raw
exception bodies, stacks or synthetic request data.

## Candidate lineage and final protections

New local `test/persistent-authorization/r89/candidate-inputs.json`, SHA-256:
`7278900d8fdc99ec5f044ed5ccf84325712616aa210d665242f27a127555c934`.
Its status is `OFFLINE_CANDIDATE_NOT_FULL_ACCEPTANCE`. It references R87 as
parent, retains 117 input entries, and overrides exactly the fixture above.
The other 116 input hashes and the historical parent manifest are unchanged.
It is not an accepted full-candidate baseline or a change to old guards.

All 85 recorded history/tool/evidence identities match after validation.
The target's original ACL/ownership remains equal, its backup hash is
verified, and the tracked diff remains confined to the one file. New R89
tools, candidate metadata, backups and this record remain local/uncommitted.

Tool hashes:

- worker.mjs: `cfdf384343edbdd3fb9560832c02bee1282f1d68472db52967420e0cce2785fb`
- validate.mjs: `7b40aa5ee2d56885d331a39f4f8149cae5c2143ddd6d3b864c4188872bdb040b`

## State and stop

```text
R89_ORIGINAL_FOUR_FINDINGS_REPRODUCED=True
R89_TARGETED_FIXTURE_LINT_PASS=True
R89_SCOPED_TYPECHECK_PASS=True
R89_SIX_NEGATIVE_CONTROLS_PASS=True
R89_CONTRACT_WEAKENING_CONTROLS_PASS=True
R89_SINGLE_INPUT_CHANGE_VERIFIED=True
R89_PERMISSIONS_UNCHANGED=True
R89_OFFLINE_CANDIDATE_PASS=True
R89_CONFIGURATION_ROLLBACK_PERFORMED=False

R89_CONTAINER_STARTED=False
R89_HOSTED_CI_PASS=NOT_RUN
R88_HOSTED_CI_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop with the single-file repair retained. A later separately authorized
minimal commit and Hosted run may test this candidate; no such operation
or renewed helper-annotation repair follows automatically.
