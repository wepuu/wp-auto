# Isolated persistent authorization acceptance

Build the committed candidate before running the harness:

```sh
docker build -f deploy/Authorization.Containerfile -t wepuu-authorization:candidate .
docker build -f deploy/Authorization.Containerfile --target test -t wepuu-test:candidate .
docker build -f deploy/Control.Containerfile -t wepuu-control:candidate .
WEPUU_TEST_IMAGE=wepuu-test:candidate WEPUU_TEST_LEGACY_CONSOLE=allow-isolated pnpm test:persistent:images
```

`DOCKER_BIN`, `WEPUU_TEST_DOCKER_CONTEXT`, `WEPUU_AUTHORIZATION_IMAGE`, `WEPUU_CONTROL_IMAGE` and `WEPUU_TEST_IMAGE` select local executables/context/images. No user credential, external service URL or production database override is accepted. Docker contexts must be local Unix sockets or named pipes. Run from the repository root. Node images and the synthetic PostgreSQL image are digest pinned. The test stage alone contains OpenSSL 3.5.9-r0 and Bash 5.3.9-r1 for existing certificate and shell-syntax fixtures; the release stages do not install these tools.

The runner creates its own internal network, PostgreSQL container, data volume and private evidence volume, publishes no host ports, and mounts only this harness read-only. Application code comes from the image. Services run as non-root users with restricted database identities. Synthetic keys and temporary protocol files live in UID-1000 tmpfs. No real OTP, WordPress content, Desktop login or MCP request is performed.

The offline phase validates the Linux harness before database work. The database phase normally runs only the explicit Authorization-profile regressions and records legacy Console coverage as NOT_RUN. Only `WEPUU_TEST_LEGACY_CONSOLE=allow-isolated` permits the existing full database suite, including 014 in its separate legacy regression databases. The Authorization/startup/control/matrix/transition databases always use `migrate-authorization` and reject 014 in their ledger.

Scenarios run once: database regressions, Authorization startup, Control startup, complete A/B authorization matrix, B-stop-then-A transition. Failures stop later scenarios and preserve safe results. Completed and owned in-flight containers are stopped in finally; named volumes and evidence are retained. The private administrative env file and evidence volume must not be uploaded. The emitted host directory contains a `safe` subdirectory and a result summary; publish only the safe evidence after review. No automatic retry or production recovery occurs.

R8/R4A algorithms and assertions were parameterized for Linux image paths and explicit profiles; original Windows launch paths and private `.tmp` dependencies are absent. The latest main wraps invalid signatures and invalid claims in the reviewed `PairingDiagnosticError` contract. The fixture asserts those exact public proof codes, one injected fault at a time, rather than expecting an exposed JOSE exception. Pending binding preservation and successful activation assertions remain required. `r3`, `r5` and `r8` directory names retain the reviewed helper lineage. A/B are modes of one candidate image, not independent release versions. No safe sharing of rotating Refresh Tokens across clients/accounts is claimed.
