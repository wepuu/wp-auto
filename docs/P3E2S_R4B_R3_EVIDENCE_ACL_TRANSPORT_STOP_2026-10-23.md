# P3-E2S-R4B-R3: evidence ACL transport stop and isolated fix

Status: authorized existing-image-only attempt stopped before artifact/probe. No automatic retry.

## Source, boundary and tests before execution

Starting candidate: `284554172a43e017a5d7259b1c6a9931fa00f98b`. The new verification-only entrypoint was frozen at `728db6648e8a2a77a5972901cdbc52fede1e6414`. It is separate from the builder and exposes only a closed set of local-context/image reads and one fixed network-disabled Node probe plus owned-container cleanup. It has no rebuild/pull/load/push/retag fallback.

The image remains attributed to its actual build revision `a3aaf70780adc93aadba030716e61ed9648a00df`, not the later verifier. The fixed R2 tag and index identity are unchanged in code. Comparing reviewed application/dependency/Containerfile inputs from the build revision to the verifier revision found no changes. Neither the original dirty worktree nor `design/` was modified.

Before the real attempt, the fixed Node24 test image ran **20 pure synthetic tests: 14 repaired artifact-contract +6 read-only-flow tests**, all passed, zero skipped/failures. Network was disabled and UID1000 was explicit. The mounted test scripts did not replace application code in a service integration test; no test image was rebuilt. Entry tests covered absent evidence/artifacts, wrong source/receipt, probe-not-started on failure, one probe only, postflight failure propagation and a closed Docker operation set.

## One actual attempt

```text
verifier revision: 728db6648e8a2a77a5972901cdbc52fede1e6414
image build revision: a3aaf70780adc93aadba030716e61ed9648a00df
context: desktop-linux, verified local endpoint
started: 2026-10-23T10:19:39.768Z
finished: 2026-10-23T10:19:41.582Z
elapsed: 1795ms (monotonic)
failed stage: evidence
original public category: BUILD_GATE_NOT_CONFIRMED
actual Docker operation list: [context]
```

The current-source and local-context preflight completed. Permission checking failed before original evidence bytes were parsed or hashed, and before either real image inspection. The actual artifact validator, retained-image runtime probe and postflight were **NOT_RUN**. No probe container was created, so no owned probe cleanup was necessary. The failure result remains unchanged in its new private directory; original R2 evidence was not modified.

## One bounded read-only diagnosis

The permission-check command parsed successfully, and required input filenames/sizes were present. A safe child error projection then showed:

```text
exception type: CommandNotFoundException
error ID: CouldNotAutoloadMatchingModule
failed command (allowlisted): Get-Acl
```

The cause of this attempt's failure is the tool's dependency on module autoload in its child PowerShell process. It is **not** a finding that the retained evidence ACL was public or invalid. The deeper system reason that this module could not autoload was not investigated. No raw exception body, path-bearing diagnostic, metadata payload, original log or secret was exported. The real gate was not rerun after diagnosis.

## Post-stop tool repair and actual Windows fixture test

The ACL reader now calls the child PowerShell CLR ACL APIs directly, with no Get-Acl, Join-Path or JSON-cmdlet dependency. It retains the same directory-inheritance protection, owner and current-user/SYSTEM/administrators access-rule checks. No permissions were changed on the retained R2 input directory or files.

Transport/parser failures are now `R3_ACL_READ_NOT_CONFIRMED`; confirmed broad access remains distinct from inability to read/parse an ACL. Exceptions and unrelated result fields are not exported. The Docker command set, artifact acceptance and runtime checks were not loosened.

Independent temporary fixture testing used the actual Windows child transport with **empty PSModulePath**:

- Created a task-owned synthetic directory/file, restricted inheritance and access.
- Verified the private fixture was accepted.
- Added an Everyone read ACE to only the synthetic file and verified rejection.
- Deleted only that fixture file and its now-empty directory, without recursive deletion.

Post-stop host Node26 tests: **9 passed, zero failed/skipped** (6 synthetic flow +3 ACL tests, including this real Windows transport test). These do not constitute a rerun against R2 evidence, image acceptance or runtime probe. No additional container was launched after the real attempt stopped. The repaired permission reader was not rerun under Node24 in this attempt; earlier20-test Node24 evidence and later Windows-host transport evidence are separate.

## Final state and continuation boundary

The next continuation can reuse the existing image and repaired verifier, without rebuilding. It should first review the fixed transport and fresh source/permission prerequisites, then explicitly authorize one existing-artifact read-only verification and one fixed network-disabled probe. The current stop cannot be promoted to PASS based on isolated fixture success. No additional database/A-B/Hosted CI work follows automatically.

Only helper scripts, tests and documentation changed. No application API, protocol, dependency, migration, Containerfile, production setting, Desktop credential, WordPress content or real authorization was accessed or changed. There was no rebuild, image pull, registry push, real mail, OTP, service start, database, OAuth, MCP, production connection, CI trigger or PR merge. R2's loaded-image observation remains historical; this stopped attempt does not claim it freshly reverified image availability.

```text
P3E2SR4BR3_NODE24_VALIDATOR_TEST_PASS=True
P3E2SR4BR3_WINDOWS_ACL_TRANSPORT_FIX_PASS=True
P3E2SR4BR3_EXISTING_ARTIFACT_REVALIDATED=NOT_RUN
P3E2SR4BR3_RUNTIME_PROBE_PASS=NOT_RUN
P3E2SR4BR3_PROBE_STOPPED=NOT_APPLICABLE
P3E2SR4BR3_IMAGE_REBUILT=False
P3E2SR4BR3_DATABASE_RUN_PERFORMED=False
P3E2SR4BR3_AB_RUN_PERFORMED=False
P3E2SR4BR3_HOSTED_CI_RUN_PERFORMED=False
P3E2SR4BR3_ACCEPTANCE_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Candidate states do not revoke or revalidate the separately authorized existing single-site internal read-only trial. Historical R4B/R1/R2 records remain unchanged. This work is retained only in local candidate commits, not pushed to trigger CI.
