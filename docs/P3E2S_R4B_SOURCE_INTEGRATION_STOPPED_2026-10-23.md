# P3-E2S-R4B: source integration and bounded validation stop

Status: implementation candidate; full acceptance NOT_CONFIRMED. No production operation.

## Scope and source

An independent worktree/branch `codex/p3e2sr4b-source-integration` starts at main `e8778da33d850303d1ccbdfbebf088610bf6ac5f`. The original dirty worktree and `design/` were not modified. Prior R8/R4A validation remains historical evidence, not validation of this newly integrated source. ADR-024 is proposed, not an accepted production rollout decision.

The candidate integrates persistent read-only consent, PostgreSQL receipt/Code bindings, mode A/B guards, explicit migration profile and portable synthetic image harness. Existing main Console/account/client additions remain present. Node 24.22.1 LTS and pnpm 11.19.0 are fixed; the lockfile is unchanged. Authorization and Control image CMDs run their main directly, with read-only schema/ledger preconditions and no automatic migration.

The Authorization migration profile selects exactly 001–013, 015 and 016. Source migration 014 remains unchanged. The operator explicitly approved 014 only in separate, disposable legacy regression databases. It is not permitted in candidate/startup/matrix databases or production. Local synthetic runtime identities are intended to lack DDL, ledger-write and migrator privileges; the new integrated image-level assertions have not yet executed.

## Executed evidence

| Check | Actual result and scope |
| --- | --- |
| Frozen dependency install and candidate builds | PASS in local Docker; no deployment |
| TypeScript, ESLint and non-database unit suite | PASS using test image, network disabled, database environment absent |
| First test image attempts | FAIL due missing existing deployment fixtures/OpenSSL, then missing Bash; retained as test packaging failures |
| Corrected test image | OpenSSL 3.5.9-r0 and Bash 5.3.9-r1 exist only in test stage; release runtime does not install them |
| First portable image runner invocation | STOPPED during offline GrantService fixture; no test database/network created |
| Earliest offline assertion | `EXACT_REJECTION_CATEGORY`: actual `NOT_CONFIRMED`, expected `INVALID_SIGNATURE` |
| Cause | Main's reviewed `PairingDiagnosticError(proof, proof.signature_invalid)` wraps the JOSE exception; old helper classified only the exposed JOSE code |
| Focused offline correction | Exact public `proof.signature_invalid` / `proof.claims_invalid` classification; no production verification logic changed |
| Corrected offline checks | PASS: 15 wiring +15 GrantService fixture +15 response checks, Node v24.22.1/Krypton, UID1000, network disabled |
| Full database regression, including isolated legacy014 | NOT_RUN: stopped before this stage |
| New image startup/Control/A-B/B-to-A checks | NOT_RUN: no automatic full retry after stop |
| Hosted CI | NOT_RUN for this candidate |

The first runner's private evidence directory is retained locally. Its only owned scenario container, `wepuu-persistent-offline-94bfd6d0f251`, exited1 and was confirmed stopped. Its evidence volume was retained. No PostgreSQL container, data volume or internal network was created in that attempt. Private local paths and synthetic administrative material are not public artifacts.

The successful unit check precedes the final test-helper diagnostic classification, database-reporter and example-configuration edits. The corrected offline checks cover the classifier change; this is not represented as a final all-source/CI pass. Runtime image IDs from this local build are not published release digests.

## Test design retained for the next separately authorized run

The committed harness requires its own private internal network and PostgreSQL, no published host ports, non-root services and separate migration/runtime identities. It checks exact migration names/hashes, startup with missing schema or ledger permission, repeated normal starts without schema writes, typed consent boundary/CSRF/account/scope failures, tenant RLS, 90-day limits, atomic Code/link persistence, concurrent one-use consumption, SQL permission denial and lock timeout, then the existing complete A/B and B-stop-before-A cases. No production URL or credential override is accepted.

The failure is preserved; the full runner was not retried. Next work must first review the integrated patch, then obtain a bounded continuation decision for the first database/startup/protocol execution on this revision. Any subsequent failure must retain its exact stage and stop later scenarios. Publishing a candidate PR or running Hosted CI must not be described as already completed.

## Data and authorization boundaries

No production connection, migration, real email, WordPress request, MCP invocation, Desktop configuration change, credential-store read, backup/restore or account reauthorization occurred. No content enters the control plane. Production OTP policy and existing Site/Grant state were not rechecked or changed.

```text
P3E2SR4B_SOURCE_INTEGRATION_CANDIDATE=True
P3E2SR4B_LOCAL_STRICT_CHECK_PASS=True
P3E2SR4B_OFFLINE_CORRECTION_PASS=True
P3E2SR4B_COMPLETE_DATABASE_REGRESSION_PASS=NOT_RUN
P3E2SR4B_IMAGE_AB_MATRIX_PASS=NOT_RUN
P3E2SR4B_HOSTED_CI_PASS=NOT_RUN
P3E2SR4B_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

These are this candidate's results only; earlier production OAuth/MCP and the narrowly authorized internal read-only trial are not overwritten.
