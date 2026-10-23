# P3-E2S-R4B-R2: explicit local load and OCI-index validator stop

Status: one authorized build completed and loaded; acceptance stopped at the validator. No automatic retry or production operation.

## Scope and source

Starting record: `20dc23ee995fd2acb1b90a214c7ce90d8ed20e9d`. Build source: `a3aaf70780adc93aadba030716e61ed9648a00df`, clean before invocation. Only build-helper code/tests/documentation were added; application logic, dependencies, lockfile, Containerfiles and deployment configuration were unchanged. The original dirty worktree and `design/` were not modified.

The operator authorized a single Authorization build/load plus artifact verification and a network-disabled version/UID probe, with stop-on-failure. Database/A-B/Hosted CI continuation was excluded. This record does not replace R4B or R1 failure history.

## Implementation and pre-build checks

The repository now contains `scripts/build-authorization-artifact.mjs`, `authorization-build-contract.mjs`, contract tests and usage documentation. The entrypoint requires an explicit absolute Docker executable, context, builder and expected revision. It removes ambient endpoint/builder overrides from its own child environment, without modifying global settings. It records source hashes, executable identity, invocation, private logs, IID, metadata, bounded process exit and safe stage results.

At this attempt's preflight, context/builder were both `desktop-linux`, driver `docker`, with one running node on the selected local Docker Desktop named-pipe endpoint. No builder was created, globally selected, bootstrapped or reconfigured. This current observation cannot establish the cause of the earlier R1 missing-image event.

Ten synthetic contract tests passed in the existing fixed Node24 test image, network disabled, UID1000. They exercised absent outputs despite exit0, unrelated metadata/IID, stale tags/revisions, platform/user/CMD/entrypoint mismatches, remote builders, timeout and secret filtering. Mounting test scripts read-only for these unit tests was not an application-image integration test or rebuild.

## Single real invocation

```text
source: a3aaf70780adc93aadba030716e61ed9648a00df
tag: wepuu-r4br2-authorization:a3aaf70780ad-fdf45454dea0
context / builder: desktop-linux / desktop-linux
platform: linux/amd64
delivery: explicit --load, separate --iidfile and --metadata-file
build process: exit0, no signal, no timeout
whole failed entrypoint: approximately4.6 seconds
```

The subprocess successfully completed its one build/load. The stage then failed with `BUILD_METADATA_DIGEST_MISSING` in `artifact_linkage`. The runtime probe and postflight were **NOT_RUN**. No second build, retag, cache purge, probe or full gate execution followed.

## Bounded read-only diagnosis

The new unique tag is present in the intended local daemon. White-listed inspection established:

```text
image.Id / IID / metadata.containerimage.digest:
sha256:26c094ab8280e5071bf42e072597ef364f04b57cec2817137d2ed15f874497d3

metadata and loaded image descriptor:
mediaType = application/vnd.oci.image.index.v1+json
digest = the same sha256 above
size = 856

metadata.containerimage.config.digest = absent
image platform = linux/amd64
image user = node
image CMD = [node, apps/authorization-service/dist/main.js]
image revision = a3aaf70780adc93aadba030716e61ed9648a00df
```

The R2 verifier incorrectly required `containerimage.config.digest` and assumed the loaded image ID must equal that config digest. The actual local image store exposes a typed OCI index identity here. **The new failure is a validation-tool false negative, not evidence that the image was absent or that OAuth failed.** The typed descriptor association was inspected diagnostically; the corrected automated gate was not rerun against the real artifact.

The earlier R1 event remains NOT_CONFIRMED. This result demonstrates this explicit-load invocation's output visibility, not the precise reason for R1's absent tag.

Private logs and raw metadata remain in the protected local evidence directory. ACL inspection confirmed inheritance disabled and no access entries beyond the current user, SYSTEM and administrators. No raw build logs, provenance payload, user configuration or credential values were exported.

## Offline correction after stop

Only the pure contract and its tests were corrected. It now distinguishes:

- Explicit config-digest metadata matching a config-based image identity.
- Supported OCI/Docker index or manifest identities, requiring matching typed metadata and loaded descriptors, export digest, size and related IID.
- Missing/unknown/mismatched descriptors, unrelated IID, and explicit null/invalid config metadata, all denied.

It does not accept untyped equality alone or equate manifest, index and config identifiers. A synthetic reproduction of this non-sensitive descriptor structure plus negative variants passed: **14 tests, zero failures**, on local orchestration Node26. This post-stop correction was not rerun in a Node24 container and was not used to promote the real artifact to acceptance PASS. The earlier10-test Node24 result and later14-test host result are separate evidence.

The current implementation is not a full source-check, database, startup or Desktop acceptance. No application/security condition was relaxed. Authentication, tenant isolation and control-plane data boundaries were untouched.

## Final state and minimum continuation

The successfully loaded local image and private evidence are retained. No Authorization main, database, OAuth flow, MCP request, real mail, production connection, migration, deployment, credential-store read, global Docker change or Hosted CI occurred. No new PR was created or merged. The optional-in-design probe is still required by this fixed-purpose helper's successful path, but was not reached.

The minimal continuation should **reuse this existing image**: freeze the corrected verifier, run its tests under the fixed Node24 runtime, then perform one separately authorized read-only linkage revalidation and one network-disabled version/UID probe against the retained immutable image. There is no demonstrated need to rebuild, change builder, clear caches or investigate historical production failures. The image must remain attributed to its actual `a3aaf707...` build source, not relabeled as a later verifier commit.

```text
P3E2SR4BR2_BUILD_HELPER_TEST_PASS=True
P3E2SR4BR2_LOCAL_BUILDER_CONFIRMED=True
P3E2SR4BR2_LOADED_IMAGE_PRESENT=True
P3E2SR4BR2_AUTHORIZATION_ARTIFACT_PASS=False
P3E2SR4BR2_RUNTIME_PROBE_PASS=NOT_RUN
P3E2SR4BR2_DATABASE_RUN_PERFORMED=False
P3E2SR4BR2_AB_RUN_PERFORMED=False
P3E2SR4BR2_HOSTED_CI_RUN_PERFORMED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

These candidate states do not revoke or revalidate the separately authorized existing single-site read-only trial.
