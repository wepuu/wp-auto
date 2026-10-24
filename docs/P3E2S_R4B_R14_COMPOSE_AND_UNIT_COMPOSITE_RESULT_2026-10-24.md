# WPAuto P3-E2S-R4B-R14: host Compose render and readonly unit composite gate

## Outcome and fixed scope

The approved R14 composite gate passed: one real host-side Compose configuration
render AND one complete readonly-container unit invocation. No automatic retry,
skip relaxation, image build, dependency install, database, Console014, A/B or
production activity occurred. No WordPress, Desktop, OTP, OAuth or MCP access ran.

Frozen implementation: `f5d70ce2c367f778266c54ffdaf763d961bb6b1c` on
`codex/p3e2sr4b-source-integration`, after R13 record `31c6ced`. Source was clean
at invocation and after its postchecks. Application, dependency, migration,
deployment-template and persistent-authorization profile/helper files were not
changed. This is a local test-layout adjustment, not an API, protocol, database,
Connector, permission or production configuration change.

## Coverage mapping: no removed acceptance requirement

| Original Site B case | R14 execution | Result |
|---|---|---|
| Nginx DNS-01/loopback/TLS static constraints | unchanged assertions in container unit | no recorded failure/skip |
| Distinct Compose project/volumes/subnet/images static constraints | unchanged assertions in container unit | no recorded failure/skip |
| Real Compose rendering using dummy credentials | required host gate plus `assertSiteBRender()` | PASS |

The11 rendered-model assertions were moved byte-for-byte into
`scripts/wordpress-site-b-render-contract.mjs`. They still verify the project
name, absent database ports, exact WordPress loopback port, two memory limits,
subnet, two named volumes and three restart policies. Exit success and JSON
parsing remain mandatory. The old ENOENT-to-skip fallback was not moved into the
new real-render gate: unavailable tooling now fails that gate.

The original two static test bodies were also compared against `31c6ced` and
found unchanged. No file was added to `offlineSkipFiles`; that policy and its
hash remain unchanged. The unit file explicitly states that its two static cases
alone do not establish composite acceptance. The new runner cannot pass unless
both real rendering and unit pass on the same frozen inputs.

The sorted unique unit manifest remains56 files. Its unit event count changed
from326 to325 because one case moved to the separate mandatory real-render gate.
That case is neither silently discarded nor replaced by a synthetic JSON fixture.
R13's original gate remains failed; this is a distinct explicitly approved profile.

## Offline validation before any real gate

`scripts/r14-composite.synthetic.mjs` passed9 groups, without invoking Docker:

1. Original11 assertions byte-equivalent; original static test bodies unchanged.
2. Valid synthetic model and safe projection accepted.
3. Each of the11 original rendered-model assertions rejected its own mutation.
4. Unavailable CLI, timeout, output limit, nonzero/signal exit and malformed JSON rejected.
5. Config-only argv and minimal isolated environment verified.
6. Failed rendering prevented unit invocation.
7. Both gates required, one invocation each.
8. Input-drift/pre-unit exception could not use an earlier render PASS.
9. Failed final postcheck prevented composite PASS.

These are synthetic assertions, not the real rendering evidence. The real gate
below used the installed Docker/Compose binaries and the actual frozen template.
Syntax checks and `git diff --check` also passed.

## Real rendering isolation and identity

```text
Docker CLI: C:\Users\liulo\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe
Docker version: 29.8.0
CLI SHA-256: 46d8a5bd7523c575fb276a75296ab19abb9bf277d334169c665e521e46dbc2a4
Compose plugin: C:\Users\liulo\AppData\Local\Programs\DockerDesktop\resources\cli-plugins\docker-compose.exe
Compose version: 5.5.1
plugin SHA-256: 15e40bc3eba1de5b0c823a8d4c0cae3022da5db9ac5e74acbf6f1b63602e1a85
```

The runner created a private Docker configuration with only the installed plugin
directory and empty `auths`, plus a new empty environment file. It did not use
the user's Docker auth/config for rendering. Its renderer environment was built
from necessary Windows runtime paths and two fixed dummy credential values;
business variables, DOCKER_CONTEXT, COMPOSE_FILE, COMPOSE_ENV_FILES and profile
overrides were not inherited. COMPOSE_DISABLE_ENV_FILE was set to1 and the empty
environment file was explicitly supplied.

The version/config renderer had DOCKER_HOST set to a unique nonexistent local
named-pipe endpoint, not the actual Docker Engine endpoint. The real config
render nevertheless succeeded. This supports local parsing/rendering without an
available daemon endpoint; no packet capture or universal no-network proof is
claimed. The separate container-test orchestration intentionally used the
verified local desktop-linux Engine context.

The only actual template command was equivalent to:

```text
docker --config <private> compose --env-file <new-empty-file>
  -f <absolute-frozen-Site-B-template> --profile tools config --format json
```

It ran once, with a30-second timeout and1MiB output budget. No Compose up/run/
create/build/pull, image-resolution or lockfile-generation option ran. Output was
parsed in memory by the preserved assertions, not printed or saved as a full
rendered model. Non-JSON/error output was suppressed. No Site B resource was
started, recreated or restored. Rendering is not service/database/deployment
acceptance.

The use of `config` follows the [Docker CLI reference](https://docs.docker.com/reference/cli/docker/compose/config/).
Explicit environment isolation addresses the documented
[interpolation precedence](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/);
an empty environment file alone would not exclude inherited shell overrides.

## Single composite execution and unit report

```text
run: r14-20261024112003130
UTC start: 2026-10-24T11:20:03.150Z
UTC finish: 2026-10-24T11:20:57.974Z
renderAttempts: 1
unitAttempts: 1
real render category: PASS
container unit category / reportStatus: PASS / VALID
unit child completed / exitCode: true / 0
spawnFailed / timedOut / outputLimitExceeded: false / false / false
unit child outputBytes: 0
report total / fileCount: 325 / 56
failures / missing / unmapped events: 0 / 0 / 0
unexpectedEvent: false
approved skips: 32
unapproved skips: 0
composite and unit postcheck: PASS / inputsUnchanged=true
evidenceSaved: true
```

The32 approved skips are the unchanged R13-approved group:25 closed database
profile cases, five individual service/PostgreSQL/PHP/Windows/R9-database cases,
and two profiled historical R7 cases. These are not database/PHP/Windows/service
passes. The Compose-render case is not skipped in this profile: it actually ran
in the separate required gate. The private result retains the full safe per-file
skip summary.

`topLevelCountsMatch=true` is retained as the report field, not claimed as an
independent full-suite per-case frozen-count proof; the unit driver does not
supply a per-file top-level count map. The explicit56-file manifest, no missing
or unexpected events, no failures, original assertions and unchanged skip policy
are the acceptance conditions used here.

## Fixed container runtime and postchecks

```text
Test image: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
image revision: c404ed52228ce5492a85674547998d2f5d31772e
compiled SHA-256: e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
compiled fileCount: 163
Node: v24.22.1 / Krypton / UID1000
tsx: 4.23.13
loader SHA-256: 7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d
```

An owned read-only probe remeasured these identities before either real gate.
Host Node26 was only the local test/orchestration runtime; application unit
execution used fixed Node24. The coordinator did not invoke pnpm, rebuild/pull
an image or add an installation step. The unit deadline stayed240000ms, with
260000ms outer transport and unchanged report/output budgets.

The existing16-file R13 inventory plus the modified static Site B test were
mounted individually, read-only;9 helper aliases produced26 bind mounts. There
were no whole-repository, user credential/config, Docker socket or SSH mounts.
Both containers used network none, UID1000:1000, read-only root, dropped
capabilities, no-new-privileges, no healthcheck, log driver none and bounded tmpfs.

| Owned container | Final state | OOMKilled | Read-only binds |
|---|---|---|---:|
| `wepuu-r14-20261024112003130-probe` | stopped, exit0 | false | 1 |
| `wepuu-r14-20261024112003130` | stopped, exit0 | false | 26 |

Independent final inspection confirmed those states. The retained image plus
local readonly overlays is not a new baked release-image acceptance. No unrelated
Docker objects, caches or files were removed.

All26 frozen input hashes and both binary hashes were unchanged across rendering,
unit and the composite postcheck. D: free bytes were6322491392 before and after,
above initial5GiB and subsequent2GiB thresholds. The skip policy was unchanged.

## Evidence and immutable inputs

Private result (not committed):
`C:\Users\liulo\AppData\Local\Temp\wepuu-r14-composite-EV1vUd\result.json`

```text
result SHA-256: 5793dab0722e09961928f7b55191428eaca767e4d2a5ae6b5fb87a958eab35a3
run-r14-composite.mjs: 1c3ced23a3cbd70e32b4c9aa9c651806584f324e8147f565d5f2e71c7eabb87f
r14-composite.synthetic.mjs: 0b41fe1128fc1e587e950ed28570318f054e85e84abff14027fcde9e7d0ec304
wordpress-site-b-render-contract.mjs: 3d137ac2a92d615b5da14c1d4bb065063a447f9d0dba370db1888d21235df707
wordpress-site-b-template.test.mjs: 6c42aa2d5c0a06ddd6011c547ddda3911f03545ad4bf70911aad1562c2f654b4
Site B Compose template: bf91b8f23b3736af759bfdd2a315b7f8460ee7117b4c043df3eba01645535595
Site A Compose template: eb270fa7ac4d9f3f49f0a0ecbbcf07144db817654a3338c3ce8c0d3588bf2678
Site B Nginx template: 26660b5a5eb59ef3a89777549ab0daade80c825906efd7c0d662339e95330bc5
```

The safe result contains the complete input/binary hash inventory. The evidence
directory was restricted to the current user, SYSTEM and Administrators and
verified with the existing ACL checker before execution and before exclusive
result creation. Private files include only execution metadata, the empty env
file and empty-auth Docker plugin configuration, not production credentials.

No raw Compose JSON, child stderr/stdout, assertion values, tokens or exceptions
were included in this delivery. No Hosted CI, push, PR, merge or deployment ran.
Data-flow boundaries remain unchanged: no WordPress content or MCP traffic
entered the control plane, and no new authentication/tenant contract was added.

## Final state and stop

```text
P3E2SR4BR14_COMPOSE_RENDER_PASS=True
P3E2SR4BR14_CONTAINER_UNIT_PASS=True
P3E2SR4BR14_COMPOSITE_GATE_PASS=True
P3E2SR4BR13_SINGLE_UNIT_GATE_PASS=False
P3E2SR4BR14_DATABASE_EXECUTED=False
P3E2SR4BR14_AB_EXECUTED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

These candidate flags do not revoke or revalidate the historical bounded internal
trial. R10/R11/R13 failures and R12's narrower pass remain historical evidence.

Stop here. Any isolated database/Console regression, migration execution or A/B
run needs a separately approved plan. This composite pass does not authorize
those stages, image publication, production changes or general readiness.
