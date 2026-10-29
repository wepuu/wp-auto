# P3-E2S-R4B-R93: offline PostgreSQL preparation and diagnostics

Status: offline tooling PASS; real pin provenance NOT_CONFIRMED. The candidate
is deliberately blocked before Docker and is not ready for submission or CI.
No image pin was silently replaced. No Docker, database, production, OAuth,
MCP, OTP, commit, push or new Hosted run was performed.

## Basis and official semantics

Parent Head remains `1349f468a7d646dae6330569f61365799fa36939`.
The prior R92 run `40532423245`, attempt 1, is historical, not rerun.
Its matrix stopped at preflight with `POSTGRES_IMAGE_MISSING` and no
scenario results. R92 root checks and database typecheck remain passed;
image startup and later regression are still NOT_RUN.

The offline review found these distinct issues:

1. The workflow prepares service tag `postgres:16.10-alpine`, but the matrix
   previously inspected `postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`
   without an explicit preparation step for that reference.
2. Historical `scripts/run-r16-otp-target.mjs` compares the same value with
   inspected `.Id`. R6 records it as an image identity. These records do not
   establish a repository manifest/index digest or its mapping to the ID.
3. The inner inspect catch replaced every error with `POSTGRES_IMAGE_MISSING`,
   losing the original timeout/spawn/exit classification before the outer
   failure projector could use it.

The previously reviewed R92 initialization log reports a pull digest
`sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297`
for the service tag. That is recorded as an observation only, not adopted
as a replacement pin. A different textual digest is not by itself proof
about config ID, platform-manifest or multi-platform-index equivalence.

Official documentation used in the review:

- [Docker image pull](https://docs.docker.com/reference/cli/docker/image/pull/):
  explicit pull prepares a repository reference; immutable digest pinning
  differs from pulling a mutable tag.
- [Docker Registry manifest](https://docs.docker.com/reference/api/registry/latest/operations/GetImageManifest/):
  the manifest describes config and layer digests; the reference and its
  nested config are not interchangeable identifiers.
- [Docker run pull policy](https://docs.docker.com/reference/cli/docker/container/run/#set-the-pull-policy---pull):
  `--pull=never` prohibits implicit preparation and errors when unavailable.
- [GitHub service image](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idservicesservice_idimage):
  the service image setting defines the service, not a second independently
  required image reference for a custom test harness.
- [Node child-process API](https://nodejs.org/api/child_process.html):
  process exit status, termination signal and output are separate evidence.
  The new adapter uses its own deadline flag rather than treating killed
  as proof of a timeout. No fixed Node24 runtime execution is claimed here.

No public registry metadata lookup or Docker inspection was performed in
R93. Available repository records contain no confirmed RepoDigest-to-ID
mapping for the historical ID. This is an evidence limitation, not a claim
that no such mapping exists anywhere.

## Exact candidate boundary

Four existing files change:

- `.github/workflows/phase-2-foundation.yml`: add preparation after the
  existing wiring check and before dependency installation/build. Existing
  service, job timeout, versions, triggers and later gates remain intact.
- `scripts/test-persistent-images.mjs`: read the separate pin record; reject
  unconfirmed provenance before Docker; inspect the validated immutable
  reference with safe failure projection; retain accepted identity evidence.
- `scripts/persistent-image-contract.mjs`: recognize fixed PostgreSQL error
  categories, retaining the historical code for compatibility.
- Its existing test file: extend the current failure-code test; no new root
  test file or change to the frozen 59-file inventory.

New `scripts/postgres-image-gate.mjs` separates plan validation, explicit
preparation and inspection. `scripts/postgres-docker-executor.mjs` bounds
output and command time and projects exit/signal/spawn metadata.
`scripts/prepare-persistent-postgres.mjs` validates the pin first, then
checks that the default Docker context is local before any future pull.
Remote context/invalid context/timeout fail closed. No registry login or
tag fallback is provided.

The pin record `test/persistent-authorization/postgres-pin.json` keeps:

```text
repository = docker.io/library/postgres
repositoryDigest = null
expectedImageId = sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
platform = linux/amd64
major = 16
version = 16.10
dataDirectory = /var/lib/postgresql/data
provenanceConfirmed = false
provenanceStatus = HISTORICAL_IMAGE_ID_ONLY
```

This state intentionally denies the preparation entry and matrix before
any Docker command. If submitted unchanged, the early gate would reject;
it is not a runnable or accepted CI candidate. Neither the evidence record
nor passing synthetic fixtures may be used to flip provenance to true.

After a separately evidenced pin becomes available, the proposed sequence
is: local-context check, one explicit platform-specific immutable pull,
then inspect ID, RepoDigest, platform, version and data directory. The
matrix does not pull and retains every `--pull=never` use, internal network,
no host database ports, existing source guards and migration boundaries.
Image IDs and repository digests have separate fields and comparisons.

New failure categories distinguish proven exact-reference absence,
deadline, other inspect/pull failure, malformed metadata, identity mismatch
and unconfirmed pin. Only an exact daemon absence response for the exact
requested image with the expected exit shape qualifies as NOT_FOUND;
translated, ambiguous or differently named responses remain generic.
Raw output is inspected only in memory, never copied into diagnostics.
Context failure also retains safe exit/signal/deadline metadata.

The adapter uses normal termination followed by a bounded hard-stop signal
only for the future owned Docker CLI child. R93 exercises this solely with
an injected fake child; actual platform process termination behavior is
not independently verified. No existing process was stopped.

## Offline verification

Host Node is `v26.11.1`; record captured at `2026-10-27T15:57:05.494Z`.
This is not fixed Node24, real Docker transport or full Hosted acceptance.

The first new test-entry invocation failed module resolution because its
relative import traversed one directory too far. No check ran in that
invocation. The path was corrected locally and this development failure
is preserved in `r93/evidence.json`; it was not a CI or Docker retry.
Later aggregate wrappers explicitly reject any failed child instead of
accepting the last shell command's success status. Child limit is 90s.

Final results:

| Check | Result |
| --- | --- |
| R93 synthetic cases | 47 registered/completed/pass; zero failures |
| Existing wiring checks | 45 pass; 59 unit files and 18 database files |
| Existing image-contract and type-diagnostic core tests | 11 pass, zero fail |
| JavaScript syntax | Seven files pass |
| Workflow YAML parsing and preparation order | PASS |
| R89 protected input hashes | All 117 unchanged |
| R91 supplementary test/runtime hashes | Unchanged |

The offline entry is `test/persistent-authorization/r93/offline.mjs`.
It imports only inert libraries and injects every Docker executor. It
checks successful exact pull/inspect ordering; tag-only availability;
ID/digest misuse; missing/timeout/spawn/daemon failures; malformed or
oversized output; wrong platform/version/ID/RepoDigest/data directory;
first failure and no fallback/retry; and sensitive sentinel filtering.
The historical three-line catch is reproduced as a synthetic model,
not presented as recovered R92 exception data.

Six integration cases evaluate the actual preparation entry body with
imports, process/console and file/process IO injected. They cover blocked
provenance, successful synthetic preparation, remote context, context
timeout, malformed context and pull failure. The imports themselves are
syntax-checked separately. This is not a real CLI/Docker execution.

All assertions and entry projections are checked without storing raw
exception text or test payloads. Actual Docker pull availability, registry
manifest mapping, transport timing and Node24 are NOT_RUN.

## Frozen evidence and stop

`r93/candidate-inputs.json` records original hashes for the four modified
files plus exact hashes for the nine candidate code/config/test files.
It references, and does not rewrite, the R89 117-file and R91 supplementary
manifests. Those four changed files are outside the R89 117-file set; do
not interpret unchanged 117 inputs as an unchanged whole repository.
No ACL edits were requested or made; an independent before/after ACL
comparison is not claimed. Historical evidence and untracked user work
are retained. No new dependency, helper repair or public contract change.

```text
R93_PREPARATION_GAP_CONFIRMED=True
R93_DIAGNOSTIC_COLLAPSE_CONFIRMED=True
R93_POSTGRES_PIN_PROVENANCE_CONFIRMED=False
R93_OFFLINE_PREPARATION_TESTS_PASS=True
R93_SAFE_DIAGNOSTICS_PASS=True
R93_OFFLINE_TOOLING_PASS=True
R93_OFFLINE_CANDIDATE_PASS=False
R93_DOCKER_STARTED=False
R93_IMAGE_PULLED=False
R93_DATABASE_STARTED=False
R93_HOSTED_CI_TRIGGERED=False
R93_COMMITTED=False
R93_PUSHED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop with the local candidate retained. The next necessary evidence is a
verified repository manifest/index and linux/amd64 config/Image-ID mapping
for the intended historical PostgreSQL content, or explicit acceptance of
a separately verified replacement baseline. That may require a separately
scoped public-registry metadata lookup, not a full CI trial or production
operation. No automatic pin replacement, pull, commit, push or rerun follows.
