# WPAuto P3-E2S-R4B-R34 expired Session protocol validation

## Result

R34 passed one offline candidate build and one four-case isolated protocol
regression. Both normal first-use controls returned 200. Both independent
expired-original-Provider-Session cases returned `400 invalid_grant`, with no
returned or newly stored AccessToken/RefreshToken and with Code consumption
rolled back/unmodified. This closes the narrowly observed R27 candidate error
mapping defect for the new local artifacts.

The result is not full candidate acceptance, a real Desktop/ChatGPT account
switch test, a production deployment or a whole-project typecheck pass.
R24/R27 failures, R30's broad typecheck failure and R31/R32 helper failures
remain historical evidence. R33's focused validation remains separate.

## Implementation and frozen inputs

```text
implementation: 1df4c857e667398ac71487f352fc3daa7ddbac8a
run: r34-20261025093632168
UTC start: 2026-10-25T09:36:32.169Z
UTC finish: 2026-10-25T09:37:53.701Z
Asia/Shanghai: 2026-10-25 17:36:32 to 17:37:53
host monotonic duration: 81528 ms
inner protocol duration: 5313.526 ms
build attempts per role: 1
protocol attempts: 1
```

Eight new test/build files provide a local-only Containerfile, bounded builder,
derived R27 runner/scenario, strict protocol response checks, safe result
projection/export and synthetic verification. R27's historical generator,
service helper and observations were not rewritten. The old fifth direct
adapter probe was removed from the generated R34 scenario; 500/server_error
is a protocol failure here, not a permitted diagnostic outcome.

Before Docker, 96 synthetic checks passed once, including scenario and helper
syntax. They covered strict responses, no-Token denials, one-row expiry,
Code/Session independence, partial results, ledgers/permissions, child exits,
identity mismatch, resource gates, source-marker drift and sentinel filtering.
Host Node v26.11.1 performed only helper/syntax work. Application services used
the separately verified Node v24.22.1/Krypton runtime.

No application, existing test assertion, dependency, lockfile, migration,
production configuration or original TypeScript configuration changed. The
R28 source and test still hash to:

```text
packages/database/src/index.ts
f27582998d85485c51124b0c5e501fe30fde2e664399b2f68a1ef5ca7a5f7708
packages/database/test/authorization-consume-mapping.test.ts
3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16
```

## Offline candidates

The builder used the three immutable R27 parent IDs, verified local Docker
context/builder and exact root dependency/configuration input hashes. Unique
new local parent aliases were checked against those IDs before and after use;
old image references were not overwritten. A private build context contained
only verified tracked app/package/config inputs and the approved Containerfile,
not the entire working directory or host credentials.

BuildKit used linux/amd64, `--network none`, `--pull=false`, local loading and
no registry push. Existing dependencies were reused without installation.
`pnpm clean && pnpm build --pretty false` ran in the disposable build stage,
not on the host. All three roles used the same compilation stage.

| Role | New local image ID |
|---|---|
| Test | `sha256:0fea6c08b7130b17e50adc8f96602b48ae0ee58afbd2039465953eb36eb99ca9` |
| Authorization | `sha256:e4212dd53144d8006a431b027da85266e9f7d0bd7a7431a68701b73367fd14bb` |
| Control | `sha256:8c5c30e26f4b005d29a2e23819613ea9ccfeca96c09ad48840d312e61aacb22d` |

Build metadata and loaded descriptors linked these IDs as OCI indexes; they
are not mislabeled as image-config digests. Each role built once, exit 0,
without timeout, output cap or low-disk termination. Build output was counted
and discarded in memory, not saved as raw logs.

All three identity probes agreed on 163 application/config/migration files:

```text
compiled SHA-256: 260d561e07cc1bf4a970f9a05de8759b344e0fbea53d27aa73ab88f3c9d77691
Node: v24.22.1 / Krypton / linux-amd64 / UID1000
```

The fingerprint differs from the old R27 candidate. Authorization and Control
retain direct `node .../dist/main.js` default entries with user `node`, not
migration commands. Only Authorization service processes started; the Control
artifact was inspected/probed without starting its service main.

The 101-file source/config baseline, 18 full source/test directories and 10
projects remained unchanged:

```text
manifest SHA-256: 823b47911c9bff241bce98582d04147c163b82c642131e86630623f4d5547233
generated scenario SHA-256: 756504343a5593c336be6215dbf385671f64988381d8419d248d938ce1234b48
```

## Four-case protocol evidence

All four Codes were issued through the reviewed local B explicit-consent flow.
They had distinct original Provider Sessions; no consumed Code or Session was
reused across cases. The actual compiled Provider, PKCE, signing libraries,
adapter and PostgreSQL functions handled the requests. Better Auth login used
the existing local mock delivery; Site Consent used the existing signed
synthetic fixture, not real WordPress or a real email provider.

| Case | Session before exchange | HTTP result | State evidence |
|---|---|---|---|
| valid_A | Valid | 200 | AT/RT present; Code consumed; AT binding verified |
| valid_B | Valid | 200 | AT/RT present; Code consumed; AT binding verified |
| expired_A | Expired | 400 invalid_grant | No AT/RT returned/stored; Code unconsumed |
| expired_B | Expired | 400 invalid_grant | No AT/RT returned/stored; Code unconsumed |

For each expired case, the fixture's privileged test connection changed exactly
one original Session expiry row. Immediate readback verified that Session expiry
changed while Code TTL/unconsumed state, account, Client Grant and linkage
remained valid. After exchange, Token artifact counts were unchanged and the
Code was still within TTL and unconsumed. Error-body assertions rejected
internal SQL denial details and unexpected response fields; no raw body was
exported. No 500 response was accepted.

Normal controls verified RS256, issuer, exact audience/resource, `mcp:read`,
Site, Tenant and Grant through the existing jose validation. Their synthetic
AT/RT values were not exported or used for Refresh/MCP. Exactly four
authorization requests and four Token requests occurred, within the fixed
budgets; there were four distinct Codes and four distinct Sessions.

The A/B services each had one readiness-200 check, a complete accepted child
snapshot and an observed normal exit 0. No deadline, forced termination or safe
log cap was exceeded. Their safe diagnostic event lists were empty; absence of
an event is not asserted to trace every internal exception. No extra direct
SQL-error probe was executed, and R24's exact historical exception chain remains
unconfirmed.

## Database protection and data flow

The driver explicitly migrated a fresh disposable database once with its
separate privileged migration identity. Services used only the restricted
runtime identity; migration credentials were not passed to service mains.
The 16 ledger entries were 001-013 plus 015-017, with no 014. Before/after
names and hashes matched. Runtime DDL, ledger-write, migrator/owner-role and
direct artifact/classification DML denial checks passed.

Schema, function definition/ACL and relation ACL/RLS fingerprints matched:

```text
b64492d49e208c5ad85e1bb0dd275fa62de123e7387b900567aa84b5e219086e
```

The target and independent protected synthetic Grant full-row snapshots were
unchanged. These are local protection objects, not production Site A. The
expired-session cases are scoped adversarial tests, not full cross-Tenant,
Refresh/Replay/revocation, Console or all-matrix acceptance.

The Docker network was internal with no host ports. Service/driver roots were
read-only, UID1000, capabilities dropped, no-new-privileges and private tmpfs;
only the narrow evidence seeder used root plus CHOWN. The existing loopback
process-API guard remained active; it is not claimed to be an OS-wide sandbox.
Only control-plane synthetic identity/authorization metadata entered the local
services. No WordPress content, tool input/output or real credential entered
the platform; the direct client-to-WordPress data-plane contract was unchanged.

## Cleanup and protected evidence

All seven retained owned containers stopped exit 0, no OOM: three identity
probes, seeder, protocol driver, PostgreSQL and safe exporter. Normal service
child shutdown was independently confirmed. Short-lived build input/identity
probes used `--rm` and completed successfully; retained-container OOM metadata
is not claimed for those removed probes. No unrelated containers, images or
volumes were pruned.

Retained synthetic resources:

```text
wepuu-r34-20261025093632168-net
wepuu-r34-20261025093632168-data
wepuu-r34-20261025093632168-evidence
```

All recorded disk observations were 5808123904 free bytes, above the 5 GiB
initial and 2 GiB ongoing gates. Source/helper/generated inputs were unchanged.
Private evidence ACL checks passed for the current user, SYSTEM and admins.
Secrets stayed in protected local files/tmpfs/volumes; safe export used a
read-only evidence mount. Receipt locations and hashes are:

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-r34-build-u8veF0\result.json
a0ede45324d71e26713ce055cade360ab14242e62886833940f17aa40cccfbfd

C:\Users\liulo\AppData\Local\Temp\wepuu-r34-targeted-IuUKE7\result.json
32e4900f7db88926f68f465dad7030e6a5e484ea44c89d9c4ece07e3742ca500
```

## Status and stop

```text
P3E2SR4BR34_CANDIDATE_BUILD_PASS=True
P3E2SR4BR34_COMPILED_IDENTITY_PASS=True
P3E2SR4BR34_VALID_CONTROLS_PASS=True
P3E2SR4BR34_EXPIRED_SESSION_PROTOCOL_PASS=True
P3E2SR4BR34_DENIAL_STATE_INTEGRITY_PASS=True
P3E2SR4BR34_CLEANUP_PASS=True

P3E2SR4BR30_TYPECHECK_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after this bounded protocol acceptance. No full37 matrix, B-stop/A
transition, real Desktop, Refresh/Replay, production access, image publication,
push, PR, merge or deployment occurred. Those next gates require separate scope
and authorization; this local result does not automatically enable them.
