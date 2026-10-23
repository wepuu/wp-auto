# R5 retained-image isolated acceptance

Run only on a clean committed candidate. `test-persistent-images.mjs` requires explicit
`WEPUU_TEST_DOCKER_CONTEXT`, three immutable `sha256:` image IDs and their full build revisions
(`WEPUU_AUTHORIZATION_REVISION`, `WEPUU_CONTROL_REVISION`, `WEPUU_TEST_REVISION`).
`WEPUU_TEST_SOURCE_REVISION` must equal the current clean HEAD. `DOCKER_BIN` selects the
reviewed Docker executable. There are no fallback image tags or PostgreSQL pulls.

The three image roles retain their true build revisions. Application, dependencies,
Containerfiles and integration harness inputs must be unchanged from those revisions.
One isolated Node probe per image compares compiled application output, migration source,
package manifests and frozen dependency input hashes. Later verification-only scripts
are outside that application identity; they are tested separately. Release CMD/user
checks are separate from probes' explicit UID1000. The root-default test image is not
represented as a non-root release image.

The initial disk budget is 5GiB on the repository filesystem, with a 2GiB gate between
stages. Samples and failed stages are preserved. This is a phase gate, not a hard live
disk quota. Scenarios run once in order: offline, database, Authorization startup,
Control startup, A/B matrix, B-stop-before-A transition. Failures stop later stages.

Only `WEPUU_TEST_LEGACY_CONSOLE=allow-isolated` authorizes the complete database suite;
014 remains confined to separate disposable legacy regression databases. Candidate
service databases select 001-013 +015 +016 and deny 014. No real account, WordPress,
MCP, mail or production database is accessed. All protocol artifacts are synthetic.

The network is internal, no host ports are published, and tests execute against
application code in immutable images. Only the harness is mounted read-only. Scenario
containers have healthchecks disabled; real application readiness is checked by the
reviewed driver. Cleanup stops only nonce-owned containers; volumes/network/evidence
are retained, with ownership recorded. No global cleanup, rebuild, retry or CI trigger
is performed by the runner.

Private env/evidence files must remain host-local. Review only safe fixed-field
results before documentation. Candidate PASS requires every mandatory stage and
owned-resource stop confirmation; it does not promote production readiness.
