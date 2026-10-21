# Existing-account continuous OTP login — validated, not deployed

## Operator decision and current result

On 2026-10-21 the operator requested continuously usable OTP login for internal
testing, eliminating per-message approval/open/close cycles. After the automatic
signup risk was explained, the operator confirmed existing-account login only,
new registration disabled and existing protection/quotas retained. ADR-023 records
that decision. This does not authorize OAuth/MCP, new accounts, Session extension,
public registration or unrelated production changes.

The code candidate and unpublished OCI archive passed hosted validation. **No
production configuration was modified, no container was recreated, no Nginx
reload occurred and no email was sent in this phase.** Continuous production OTP
availability is not yet established; the last directly observed send flag was
false with the existing ingress deny guard.

## Provenance and worktree isolation

The dirty primary workspace was not used for a release. A separate worktree and
branch `codex/otp-existing-account-always-on` were created from the running
Control image's source-label revision:

```text
b1ebf130458a17d71527e365e617451ba8c6c484
```

Read-only SSH observations found all five services healthy, zero container
restarts/OOM flags, Control using its direct `node apps/control-api/dist/main.js`
command and the existing fixed image:

```text
ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e
```

Authorization remained the fixed `e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`
image. Its observed command still contains the historical migration wrapper;
this phase neither ran that command nor restarted it. Do not represent this as
an independent new direct-startup acceptance for Authorization.

The Control image's embedded source SHA-256 values matched the isolated base
exactly for account-auth `index.ts`, `schema.ts`, `otp-send-quota.ts`, Control
`server.ts`/`main.ts` and the lockfile. Release-display metadata still reported
the older `00f506961d5699e1c4766e9a46101fa441701251`; it was not used as source
identity proof and was not changed.

Snapshot resource readings were MemAvailable 1,247,564 KiB and memory full avg10
0.0. They are a point-in-time read, not a claim of future stability. The original
guard SHA-256 was
`6485a5f0df233ed8ce8c48bf03cdcc6f6aea1be8684711abd44e3b3b48a87f9c`.
No current browser/DB Session, target zero-Grant or WordPress clock gate was
re-run; those are not prerequisites to offline policy implementation and no new
E2K OAuth preflight PASS is claimed.

## Implementation

- Runtime and schema plugin options use fixed registration-disabled policy,
  `disableSignUp: true`, through `ACCOUNT_AUTH_REGISTRATION_ENABLED=false`.
  There is no runtime environment escape switch to reopen signup.
- The reviewed Better Auth adapter checks recipient existence before reserving
  a send budget. Unknown recipients bypass the sender and quota reservation,
  not CSRF, Origin, login binding, Better Auth's handler or its IP limiter.
- An explicit internal `suppressed` result distinguishes a neutral unknown-user
  response from actual accepted/rejected/unknown Provider outcomes. Arbitrary
  missing callbacks still fail closed. Suppression emits no fake Provider event
  and leaves no `reserved` row.
- Successful existing-account sends and suppressed unknown addresses get the
  same neutral public message/status. This is not a constant-time enumeration
  resistance claim. Actual Provider rejection/uncertainty keeps its established
  presentation and retry behavior.
- Tests formerly onboarding via OTP now explicitly seed synthetic existing
  users. No production user was seeded or created.
- The quota algorithm, HMAC custody, OTP security, absolute Session TTL,
  dependencies, migrations, signing/Proof/OAuth and direct data boundary remain
  unchanged. Existing Site A and other MCP configs in the main workspace were
  not edited.

Source change compared with the actual production base is exactly seven files
under `apps/` and `packages/`: Control server and its test; account-auth runtime,
schema, baseline security test and new existing-account integration test; quota
regression test fixtures. The dedicated boundary test enforces this exact list
and preserves closed E1B byte-identity checks against their immutable historical
commit. This intentionally does not rewrite the old E1B result.

## Validation and retained first failure

First run [39537579553](https://github.com/wepuu/wp-auto/actions/runs/39537579553),
candidate `63d53b38be6803758a734ad583dbac67c11a1b76`, failed the two inherited
E1B file-lock tests because those tests prohibit all OTP code changes. The new
real-database existing-account test already passed in that run. No production
action followed the failed CI.

The historical checks were preserved as historical checks; a separate exact
ADR-023 current-source boundary and image verifier were added. No security
regression, migration or runtime test was skipped to get the next result.

Validated code/image source:

```text
Commit: 69e94218c946fc620af71bfca750657465a9f26c
Tree:   080b541c9a202dcc1193746e7f845ef6f3af2574
```

[Hosted CI 39538026057](https://github.com/wepuu/wp-auto/actions/runs/39538026057):
**Success**. The source commit above, not a subsequent documentation-only commit,
is the immutable artifact's identity.

- Strict type/lint/test: 158 tests, 157 passed, zero failed, one pre-existing
  host-PHP test skipped; the separately required frozen signer PHP checks and
  PHP interoperability steps passed.
- PostgreSQL migration/isolation suite: 22 passed, zero skipped/failed.
- Retained OAuth conformance: 38 tests, 37 passed, zero failed, one skipped.
- Actual isolated Nginx rollback guard, fixed production source identity, only
  Control build with fixed Authorization reuse, production-mode OCI signing,
  database backup/restore/replay, audit, SBOM and evidence checks passed.
- Candidate source/compiled file allowlist and migration hashes passed. Only
  the explicitly permitted new regression test may enlarge the image inventory.
- Docker-save archive reload preserved the same image ID and file inventory.

The new real Better Auth/PostgreSQL test proves: unknown recipient send returns
a neutral response without sender events/reservations/final verification rows;
IP rate limiting still applies; a valid test-only old OTP for an unregistered
address cannot create a user/Session; an existing user can receive a mock code
and authenticate with the unchanged absolute 43,200-second Session; raw auth and
wrong-Origin public requests remain denied. Local six no-mail unit tests,
targeted lint/typecheck and five exact boundary tests also passed.

Local Docker Engine was not available. A normal startup was attempted; only the
owned waiting CLI invocation was interrupted. No user Docker process was forcibly
terminated and no Docker state was reset. The database/OCI evidence above is
hosted CI evidence, not a claimed local Docker pass.

## Unpublished artifact identity

```text
Docker image ID:
sha256:8ea1dc31e9d2e7019a4fb0a1ade409c1a5fa4e40d9844e2d573ae3c7159c693d

Docker-save gzip archive SHA-256:
92eea1aafb5c84565e049d52d201eea924913e5a8c6934ce0628e8abeff6035f
```

Artifacts are `otp-existing-control-<commit>` and
`otp-existing-control-manifest-<commit>` on the successful run, retained for
14 days under the existing workflow policy. Only the small public manifest was
downloaded locally in this phase; no image was transferred to production.
`registryDigest` is null: the image ID is **not** a published registry digest.

## Permission-review stop and production handoff

A proposed additional CI capability (`packages: write` plus a new automatic
GHCR publication path) was rejected by permission review as an unauthorized
persistent supply-chain/publication expansion. That entire patch was not applied.
It was not retried through CLI credentials or any indirect publisher.

The accepted workflow changes retain `contents: read` and `packages: read`;
they only invoke the separate exact OTP image verifier and retain its unpublished
archive/manifest. No registry push, image publication, auto-merge or new persistent
publishing permission occurred.

Stop before production mutation. The requested next one-time scope is explicit
deployment of the already-validated archive: protected configuration/database
backup and integrity checks, fresh health/protection/custody and no-orphan-user
checks, archive transfer/load/identity verification, update/recreate only Control
with the existing direct command, preserve quota/HMAC limits, then remove only
send/resend denial and normally reload Nginx while keeping raw auth denied. On
failure, close ingress/sending before restoring the old signup-enabled image.
Do not restore a database, run migrations or touch Authorization/WordPress.

Prefer a separately approved verified-archive delivery if no registry publication
is wanted; do not invent a registry digest or add CI write permission. The
one-time deployment approval must state which delivery mechanism is allowed.
Once deployed and accepted, ordinary existing-account OTP requests need no
per-message agent approval or automatic-close window.

Future E2K gates must explicitly use the newly accepted image and continuous
existing-account policy; do not pass old `SEND_ENABLED=false` checks by disabling
them or falsely claiming the old byte baseline is unchanged.

```text
EXISTING_ACCOUNT_ONLY_OTP_CODE_PASS=True
EXISTING_ACCOUNT_ONLY_OTP_HOSTED_CI_PASS=True
EXISTING_ACCOUNT_ONLY_OTP_ARCHIVE_VERIFIED=True
EXISTING_ACCOUNT_ONLY_OTP_DEPLOYED=False
EXISTING_ACCOUNT_ONLY_OTP_CONTINUOUS_LOGIN_AVAILABLE=False
PRODUCTION_CONFIGURATION_CHANGED=False
PRODUCTION_EMAIL_SENT=False
REGISTRY_IMAGE_PUBLISHED=False
CI_PACKAGES_WRITE_PERMISSION_ADDED=False

P3D_EMAIL_SEND_PAUSED=LAST_DIRECTLY_OBSERVED_TRUE
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

No credentials, OTPs, user email addresses, business rows, WordPress content or
full environment/user configuration are in this record. No PHP/WordPress/NTP,
Connector, OAuth Client, data-plane or `design/` change was made.
