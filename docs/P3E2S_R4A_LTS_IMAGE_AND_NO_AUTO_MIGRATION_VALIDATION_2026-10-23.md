# P3-E2S-R4A: Node 24 LTS image and explicit migration validation

## Result and scope

The bounded local Authorization candidate passes Node 24.22.1 LTS build, focused lint/tests, 45 offline harness checks, no-auto-migration checks, runtime privilege separation, a 37-check image A/B matrix, and a separate 17-check B-to-A transition scenario. The two protocol scenarios each ran once and exited normally. Tests use synthetic accounts, keys and local Mock OTP delivery.

This document-only PR records local evidence. The implementation remains in an independent local candidate; it does not modify main's runtime, Containerfiles or dependencies. No production access, real email, Desktop login/configuration, Credential Store access, WordPress/Connector change, MCP call, image publication, deployment, production migration or PR merge occurred.

Date: 2026-10-23, Asia/Shanghai. Machine timestamps use UTC. R8 and earlier failure evidence remain unchanged. This result does not change existing internal-trial authorization or product readiness.

## Candidate and image identity

Source base: `4fbe9ca3d221f430ee039111ec513ef5f65c63cf`, plus the existing approved local E2S candidate changes. R4A copied 117 frozen files into `.tmp/p3e2sr4a-candidate`, without copying node_modules, Git metadata, environment files or credentials. Application and migration bytes remain identical to the prior candidate. The R4 source snapshot and R8 evidence hashes were checked before copying.

R4A changes are the Node engine constraint (`>=24.22.1 <25`), `.node-version` (`24.22.1`), the Authorization Containerfile and a proposed ADR supplement. The lockfile, pnpm 11.19.0, oidc-provider 9.12.2 and business dependencies are unchanged. The Containerfile has a focused validation stage and a separate production-dependency stage; only the final stage is the release candidate.

| Artifact | Immutable local identity |
|---|---|
| Official Node multi-platform index | `sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53` |
| Node 24.22.1 Alpine linux/amd64 manifest | `sha256:1200d815de24f8dcca745fbf7651d166034a35adbcad8860a8538ffff44f1420` |
| Authorization validation image | `sha256:7a7bf5094287a0021b4c31fb2f6dd98c16d6537282f42d8f7a929a143b374c64` |
| Authorization release image | `sha256:347e68b6fe35627a66f071e7fcce43c9b9dedddef0353145b8d1817e9d9fa1e4` |
| Existing local PostgreSQL image | `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea` |

The Authorization identities are local image IDs, not published registry manifest digests. The official Node reference was resolved before pull and pinned to the amd64 manifest. pnpm 11.19.0 registry metadata reports Node `>=22.13`; its package integrity was `sha512-eIHz7VkNRyxKlV4riLISF5ERYGbcyIy8o4SeybYPG7qm0syyIfqR2k4cZb7yvL43k2Wup6xTnHv4be3DobItzg==`.

Sources: [Node 24.22.1 LTS release](https://nodejs.org/en/blog/release/v24.22.1), [official Node image project](https://github.com/nodejs/docker-node), and the locked oidc-provider source runtime check. Only the approved official Node image and fixed npm packages were downloaded; no latest-version upgrade or production registry login/publication was used.

## Startup and migration contract

The release image runs as `node`; runtime verification observed UID 1000, `v24.22.1`, and `process.release.lts === 'Krypton'`. Its default command is:

```json
["node", "apps/authorization-service/dist/main.js"]
```

The migration CLI is separately invoked as a one-shot process with a migration identity. Startup retains read-only packaged migration/hash, storage and permission validation and fails closed when prerequisites are absent. No migration SQL bytes changed; the tested set was 001–013, 015 and 016, with no 014.

Each isolated database had a distinct runtime login with NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT and NOBYPASSRLS. Its memberships were limited to the existing Authorization, account-auth reader, workspace and audit roles, plus direct ledger SELECT. The runtime process received only its own DSN. Tests confirmed denial of public-schema DDL, migration-ledger INSERT, and SET ROLE to the migrator.

The synthetic migration owner was deliberately privileged and separate from the runtime login; this is not a claim that production migration privileges have been minimized. Fixture administration retains a privileged local connection outside the service processes.

Missing-schema and missing-ledger-permission process starts exited 1, leaving schema/ledger unchanged. After explicit migration and fixture preparation, the same packaged main argv started successfully twice in guard-only mode and exited 0 after normal SIGTERM, without changing schema or the migration ledger. These main processes run inside the release image; the harness itself is the container's process, so this is not a Docker PID-1/healthcheck lifecycle acceptance.

Final review identified that the first negative helper retained exit code but not the precise rejection category. Two supplemental direct calls to the packaged startup function closed that diagnostic gap: missing ledger returned SQLSTATE `42P01`; missing ledger SELECT returned `42501`; neither opened a listener or changed schema. These were bounded startup checks with zero authorization/token requests, not repeated full protocol matrices.

## Verification

| Check | Result and scope |
|---|---|
| Frozen-lockfile install and TypeScript build | PASS in Node 24 image |
| Focused ESLint and existing server/Provider/resource tests | PASS in validation build stage; individual TAP counts were not retained |
| Actual release runtime/non-root identity | PASS: Node 24.22.1, Krypton, UID 1000 |
| Linux harness IPC/Grant/response tests | PASS: three suites of 15 checks |
| Missing schema / ledger permission | PASS; exact supplemental SQLSTATE evidence retained |
| Runtime privilege separation | PASS in each synthetic context |
| Full image A/B matrix | PASS: 37 checks, 20 authorization requests, 24 token requests, 6,870.523 ms monotonic |
| Independent B-stop-then-A scenario | PASS: 17 checks, 4 authorization requests, 5 token requests, 3,918.139 ms monotonic |
| Child shutdown and owned-container cleanup | PASS; normal service exit 0, no forced service termination |

The full matrix preserves R8 assertions for seven invalid signed-Proof bindings, default/ordinary authorization, four Consent negatives including wrong-Origin 403, receipt/Provider/Code fault injection, duplicate form denial, explicit receipt Code exchange, A/B Refresh after Provider Session expiry, invalid original Session, PKCE/redirect/resource guards, membership and cross-account isolation, missing links, unknown receipt version, withdrawal, Refresh Replay revocation and one Outbox, expired Better Auth Session, protected Grant stability and secret-free receipt/link projection. Temporary fault triggers are removed in finally blocks.

The separate transition issued a Code and Refresh Token in B, stopped B normally, then started A using the same packaged image and database. A redeemed the valid preissued Code and rotated the valid Refresh Token without extending the receipt deadline, rejected new persistent consent, retained replay revocation of the Grant/successor and preserved the protected Grant.

A/B are modes of one immutable image. This is not compatibility proof between independently released versions and does not certify rollback to a historical unguarded binary. A may issue successors for legitimate existing artifacts; it is not a no-token mode.

## Isolation, evidence and cleanup

The protocol containers shared the namespace of a newly owned PostgreSQL container on a Docker network with `Internal=true`; no host ports were published. Runtime root filesystems were read-only, capabilities dropped and no-new-privileges enabled. The harness mounted read-only test scripts, never application source; application code and dependencies came from the release image.

Runtime synthetic key/credential files lived in a Linux tmpfs owned by UID 1000 with directory mode 0700 and file mode 0600. This avoids weakening key-custody checks to accommodate Windows bind-mount permissions. Only safe JSON evidence was exported; synthetic file secrets vanished when containers stopped. Synthetic database state remains in the retained local volume, with its administrative credential in the protected host evidence directory. None is included in this PR.

The reviewed test-process API guard remains active for the protocol child processes and passed its Node 24 offline tests. Docker internal-network configuration provides an additional boundary; the API guard alone is not described as an OS sandbox. Parent intentional external TCP/TLS/DNS probes were denied; service child denial counters were zero. No real WordPress content, tool input/output or credential traversed the platform.

Private local evidence root: `.tmp/p3e2sr4a-evidence-20261023`. Important safe records are `source-copy.json`, `build-validation.json`, `build-release.json`, `offline.json`, `startup.json`, `negative-contract.json`, `matrix.json`, `transition.json`, `cleanup.json` and final `validation.json`. Per-scenario directories preserve their attempt records and sanitized results. Sensitive env/connection files and raw output are excluded from Git.

After both matrices, the test containers and owned PostgreSQL container were stopped. The supplemental startup diagnostic briefly restarted only that owned PostgreSQL container and stopped it again. Named data volume, stopped containers, internal network, local images and safe evidence are retained; no existing user container or historical database was deleted.

## Remaining gates

- Candidate source/test integration into a reviewable release branch and full workspace/hosted validation remain separate. This PR adds only evidence, not application changes.
- Control's Containerfile and historical CI/runtime definitions still need coordinated treatment before any whole-stack release. No production launch configuration is inferred from checked-in examples.
- Full 90-day boundary/retention policy, broader timeout/deadlock/outage coverage and production migration/operational recovery review remain open where previous records leave them open.
- Real Desktop account switching, credential coordination, Host Catalog, Connector Outbox delivery and production behavior were not tested. Refresh replay protection does not establish safe Refresh Token sharing across clients/accounts.
- R8's Node 26 result and this Node 24 result remain separate evidence. Historical failures are not rewritten.

```text
P3E2SR4A_LTS_RUNTIME_PASS=True
P3E2SR4A_NO_AUTO_MIGRATION_PASS=True
P3E2SR4A_RUNTIME_PRIVILEGE_SEPARATION_PASS=True
P3E2SR4_RELEASE_IMAGE_BUILD_PASS=True
P3E2SR4_IMAGE_AB_INTEGRATION_PASS=True
P3E2SR4_B_TO_A_ROLLBACK_PASS=True
P3E2SR4_CLEANUP_PASS=True
P3E2S_LOCAL_CANDIDATE_PASS=False
P3E2S_PRODUCTION_DEPLOYED=False
P3E2S_PRODUCTION_OAUTH_STARTED=False
P3E2S_PRODUCTION_MCP_CALLED=False
```

Stop after recording evidence. No production readiness promotion, deployment, migration, real authorization, MCP call or historical PR merge follows from these local passes.
