# P3-E2S-R4B-R4: existing Authorization artifact and isolated runtime PASS

## Scope and identity

The operator authorized implementation of the R4 plan. One existing-artifact verification and one network-disabled Node probe were performed. The clean verifier commit was `24b1ff1f23b4f7eb8bb1e37aabd3a309e6b73963`, on the independent candidate worktree. The original dirty worktree and `design/` were not changed.

The image remains attributed to its actual build commit `a3aaf70780adc93aadba030716e61ed9648a00df`:

```text
tag: wepuu-r4br2-authorization:a3aaf70780ad-fdf45454dea0
immutable local ID: sha256:26c094ab8280e5071bf42e072597ef364f04b57cec2817137d2ed15f874497d3
context: desktop-linux
local endpoint: npipe:////./pipe/dockerDesktopLinuxEngine
```

Application/dependency/Containerfile inputs were unchanged from the build revision. The later verifier identity did not replace the image revision label. The existing R3 entrypoint, internal labels and error categories were reused without renaming; the new evidence directory was unique. R2 and R3 historical results remain unchanged.

## Focused verification

The retained test image `sha256:1d62d1e7f6646ddbd117505c77fd54f872d1fec20e73ab8c7ece9f2df8c544e2` ran the artifact-contract, revalidation-flow and ACL tests with network disabled, a read-only filesystem, UID 1000, dropped capabilities and a read-only scripts mount.

Result: **22 passed, 0 failed, 1 skipped**. The skipped test requires Windows child ACL transport; its actual independent Windows fixture result is retained in `P3E2S_R4B_R3_EVIDENCE_ACL_TRANSPORT_STOP_2026-10-23.md`. Linux execution is not represented as Windows transport coverage. No image was built or pulled for testing.

## Single real verification

```text
started UTC: 2026-10-23T10:43:57.981Z
finished UTC: 2026-10-23T10:44:03.163Z
monotonic elapsed: 5169 ms
stages: evidence -> artifact -> probe -> postflight
Docker operations: context, tag, identity, probe, context, tag, identity, probe-list
private evidence: .tmp/authorization-revalidation/r4br3-5azKla/
```

The repaired CLR ACL reader accepted the actual retained evidence permissions. Receipt, original build-process result, IID and metadata passed their linkage checks. Tag and immutable-ID inspections agreed. Exported digest, IID and loaded image identity were classified as OCI index identities; `containerimage.config.digest` was absent and was not invented or conflated with those identities. The image was `linux/amd64`, with default user `node` and the reviewed direct application main command.

The immutable image was probed exactly once using `--pull=never`, network none, read-only filesystem, no healthcheck, dropped capabilities and no-new-privileges. It had no mounts, published ports or injected business credentials. The Node entrypoint override returned:

```json
{"version":"v24.22.1","lts":"Krypton","uid":1000}
```

The probe used the image's default user. It did not execute Authorization main. The orchestrator was the fixed Windows host Node26 executable, separate from the measured application runtime. The probe exited successfully and the owned-container check confirmed it stopped. No stop fallback or automatic retry was needed.

Postflight confirmed unchanged source, local context, evidence hashes and artifact identities. These hashes were first recorded in this run and remained equal during postflight; they are not retrospective historical attestations:

| Input | SHA-256 |
| --- | --- |
| attempt.json | 34ea22a78ab180a570d5b5ef2e8ae2b30f876033751a7013aa5023d3ed0075e6 |
| build-process.json | 02bbf332c18e9080017afc46c7cf0aa786223ff7eb6544b22f163139b5884955 |
| image.iid | 54986d4cd938588201845db162abdfc3b106cb2087de18e6c7c31c5809a58fc0 |
| build.metadata.private.json | d464f755514214c36e4a91a3e2362384d1ade740aa5de30c8821218b714c6eca |

Raw metadata, provenance, environment values and build logs are not included in this record. All execution evidence above was collected directly by the assistant's bounded local tools.

## Acceptance limits and final states

This PASS confirms retained artifact linkage and the isolated Node runtime only. Application startup, absence of automatic migration during service startup, database privilege behavior, complete A/B integration and Hosted CI remain unexecuted. No API, protocol, schema, dependency or application code changed in this run. No database, OAuth, MCP, OTP, production connection, Desktop configuration, registry push, CI trigger or PR merge occurred. There was no rebuild, pull, relabel or repair of retained evidence permissions.

```text
P3E2SR4BR4_NODE24_VALIDATOR_TEST_PASS=True
P3E2SR4BR4_EVIDENCE_PERMISSION_PASS=True
P3E2SR4BR4_EXISTING_ARTIFACT_REVALIDATED=True
P3E2SR4BR4_RUNTIME_PROBE_PASS=True
P3E2SR4BR4_PROBE_STOPPED=True
P3E2SR4BR4_ACCEPTANCE_PASS=True
P3E2SR4BR4_IMAGE_REBUILT=False
P3E2SR4BR4_DATABASE_RUN_PERFORMED=False
P3E2SR4BR4_AB_RUN_PERFORMED=False
P3E2SR4BR4_PRODUCTION_ACCESSED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The next phase may plan a consistent frozen candidate for database and A/B integration. It was not started automatically. Existing separately approved single-site internal read-only trial permissions are neither revoked nor revalidated by these candidate flags. This record is retained in a local commit only, with no push or Hosted CI.
