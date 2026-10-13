# P3-B2D: dual-Site OAuth isolation preparation and failed production authorization

## Current result

The separately authorized production run on 2026-10-13 did not pass. Site A
authorization and Token verification succeeded; Site B's interaction returned
`temporarily_unavailable`. The runner received no B callback and ended with
`authorization_timeout`. All six matrix steps were NOT_RUN. See the production
evidence below; the preparation-only statements describe the earlier round.

Local script preparation is complete. No production OAuth authorization,
backup, Grant creation, Token issuance, matrix request, or cleanup was executed
in this preparation round. Production execution requires its separate explicit
authorization after the candidate Head's CI passes.

The acceptance branch starts from main
`dbf19ea10c3cbd91dc773d92116f0210c8a59822`. The existing formal Site B pairing
record was independently committed as `a76781b` and is retained in
`P3B2C_SECOND_SITE_PAIRING_ACCEPTANCE_2026-10-13.md`. That record confirms two
active Sites belonging to the existing test account and Tenant, Site B v2
sequence 0 with no denies, unchanged Site A sequence 2 and G1/G2 markers, and
unchanged original Codex Grant and historical Outbox. These are recorded
pairing-time observations, not a substitute for fresh execution prechecks.

## Minimal script changes

`scripts/test-production-wordpress-site-isolation.mjs` retains the fixed issuer,
`wepuu-e2e-lifecycle` public client, exact two resources, `mcp:read`, PKCE S256,
issuer/state/callback validation, strict JOSE bindings, and Access-Token-only
flow. It does not request openid/offline_access or perform refresh/revocation.

Each verified Token's Grant digest is reported immediately as
`SITE_A_GRANT_DIGEST` or `SITE_B_GRANT_DIGEST`, using the existing 12-hex-character
SHA-256 projection. The projection is evidence for operators, not a security
identifier. Full identifiers are compared during read-only database postchecks;
Tokens are never emitted or serialized.

The second authorization callback wait is bounded by
`min(300000, Token A exp * 1000 - current time - 90000)` milliseconds. A
nonpositive or invalid budget stops before the second browser handoff. The
reserve allows 30 seconds for exchange/verification and preserves the matrix's
minimum 60 seconds of remaining Token lifetime. The matrix independently checks
both Tokens again before any MCP request.

`runIsolationMatrix()` keeps its aggregate return contract and accepts an
optional result callback with only fixed step, status and error-code fields.
The executable reports:

| Output prefix | Operation |
| --- | --- |
| `MATRIX_A_TO_A_PRE` | A Token, A resource, complete positive probe |
| `MATRIX_B_TO_B_PRE` | B Token, B resource, complete positive probe |
| `MATRIX_A_TO_B` | A Token, B resource, exact 401 Bearer invalid_token |
| `MATRIX_B_TO_A` | B Token, A resource, exact 401 Bearer invalid_token |
| `MATRIX_A_TO_A_POST` | A Token remains usable on A after cross checks |
| `MATRIX_B_TO_B_POST` | B Token remains usable on B after cross checks |

Each step emits PASS, FAIL or NOT_RUN. A failed step ends execution; its fixed
error code and remaining NOT_RUN steps preserve partial evidence. Authorization
or binding failure before the matrix marks all six NOT_RUN. Unexpected exception
text is reduced to `isolation_probe_failed`, never copied to diagnostics.

The complete matrix remains bounded to 45 seconds with a maximum 10-second
budget for each probe. Each positive probe independently initializes MCP,
checks the exact 23-tool catalog and order, and calls only wp-auto-site-health.
There are four positive probes and four read-only health calls. Cross probes
send no MCP Session ID and do not follow redirects. Stateless MCP operation
remains supported; Session IDs, when issued, stay inside their own probe.

## Local validation

On Node `26.11.1`:

- Script syntax check passed.
- OAuth plus Site-isolation targeted regressions: 38 passed, 0 failed, 0 skipped.
- Eight added cases cover budget boundaries; six ordered PASS events; failure
  at every matrix position without retries; NOT_RUN before insufficient-lifetime
  execution; secret exception filtering; late completion/expiry; the first
  Grant digest surviving second authorization failure; refusal to launch B
  with no budget; and both digests preceding matrix output.
- Existing tests retain real Node Response/callback and local HTTP/JOSE coverage
  for exact scope/bindings, independent MCP sessions, wrong Bearer challenges,
  redirects, network failure and timeout, absence of refresh/revocation, and
  no Token or WordPress response serialization.
- Full `pnpm check` passed typecheck and lint but did not pass its local test
  stage: 171 passed, 1 failed, 18 environment-gated skips (190 total).

The failing existing case is the real HTTPS transport fixture in
`packages/pairing/test/https-transport.test.ts`. Its Windows PowerShell child
could not load Microsoft.PowerShell.Security and had no Cert: drive, so test
certificate generation failed before HTTPS transport execution. The pairing
package has no differences from origin/main. Its fixture's baseline and local
Git blob IDs both equal `64149b4f5e4c342ef39411036751d614ad6a2070`; the unchanged
fixture reproduced the same environment failure in the full test rerun.
This local failure is not recorded as a pass or attributed to this script change.
No TLS check was disabled and no test was skipped to suppress it. Hosted CI
must independently pass the candidate Head's full validation.

## Separately authorized production procedure

1. Read fresh exact account/Tenant/Site IDs from the original Codex Grant and
   the two active canonical resource rows. Verify Client registration, same
   account/Tenant binding, distinct Sites, Connector status/IDs, and zero live
   lifecycle Grants for each exact test combination. Preserve the original
   Codex Grant ID, scope, Site and timestamp baseline.
2. Compare Site A v2 sequence 2 and its exact G1/G2 marker set; Site B v2 sequence
   0 with no markers. Snapshot historical Outbox IDs and per-row metadata
   digests using a fixed UTC representation. Require migrations 001-013 and
   fresh resource/health evidence for all seven services.
3. Create the authorized PostgreSQL custom-format backup under
   `/opt/wpauto/backups/pre-site-isolation/<UTC time>/`, with root:root ownership,
   0600 mode, SHA-256 and pg_restore -l verification. No restore is implied.
4. Have the operator ready in both WordPress administration sessions and the
   existing platform account. Reuse a valid Better Auth Session; perform Email
   OTP if needed. Run the script once with read-only-derived account-id,
   tenant-id, site-a-id, site-b-id and explicit `--execute true`.
5. Complete A then B formal WordPress Local Consent and WePuu Consent; perform
   one Code/PKCE exchange per Site and the one six-step matrix. Correlate only
   origin access time/path/status metadata to verify the cross 401s reached
   the respective WordPress origins, rather than an edge rejection.
6. Read-only verify two distinct active test Grants, exact subject/Tenant/client/
   scope and Site-to-resource joins, unchanged original Codex Grant, unchanged
   Connector states/deny markers and all baseline Outbox rows. New revocation
   events are not expected; if any appear, stop and diagnose them. Repeat
   service/resource and migration checks.

On any failure, retain partial Grant/artifact/Consent/audit evidence and perform
only read-only diagnosis. Do not automatically reauthorize, repeat exchange,
revoke Grants, alter/requeue Outbox or restore the database. Retain test Grants
until a later separately authorized cleanup. Actual outcomes will be appended
to this record and the candidate PR; local simulation cannot establish a
production PASS.

## Authorized production attempt: failed before the matrix

Candidate Head `cf6748090bacb9bce3fbd2b70576ff710fbca01c` passed hosted CI
run `38415970866`. The operator separately authorized the production run and
confirmed both WordPress administration sessions and the same platform account
were ready. The run started at `2026-10-13T15:00:21Z` (UTC).

### Fresh prechecks and backup

- All seven containers were healthy, without OOM flags or restarts. Migrations
  remained 001-013. Both active Sites matched their respective Connectors and
  belonged to the original account/Tenant.
- The lifecycle Client was active with its exact stable loopback registration;
  neither exact test combination had a live lifecycle Grant.
- Site A was v2, sequence 2, with the two existing G1/G2 Grant markers. Site B
  was v2, sequence 0, without markers. The original Codex Grant was active with
  its unchanged `2026-10-12T12:03:49.698212+00:00` timestamp and no revocation
  reason. Historical Outbox rows were snapshotted by ID and metadata digest.
- The six-sample temporary-resource gate allowed the test. Minimum available
  memory was 842.137 MiB and latest available memory 906.727 MiB; historical
  OOM counts and occupied swap were warnings, not new failures.
- Backup: `/opt/wpauto/backups/pre-site-isolation/20261013T145916Z/wpauto.dump`,
  custom format, 153366 bytes, root:root, 0600. SHA-256:
  `32ac951354ef2ce256644274533553c40704c133ef530094fc7f86b67d9d93f4`.
  Checksum and `pg_restore -l` passed. No restore was performed.

### Actual partial results

| Item | Result |
| --- | --- |
| Site A Code/PKCE exchange and Token signature/binding checks | PASS |
| Site A verified Grant digest | `623c362c435d` |
| Site B interaction | Operator observed `temporarily_unavailable` |
| Site B callback, exchange and verified Token | NOT_COMPLETED |
| Runner final result | Exit 1, `authorization_timeout` |
| A_TO_A_PRE / B_TO_B_PRE | NOT_RUN / NOT_RUN |
| A_TO_B / B_TO_A | NOT_RUN / NOT_RUN |
| A_TO_A_POST / B_TO_B_POST | NOT_RUN / NOT_RUN |

No MCP initialize, catalog, health-tool or cross-resource probe ran in this
attempt. No refresh, replay or revocation request was made. The runner had
already finished when the stop check ran; no automatic retry was performed.

Read-only database inspection confirmed two distinct new lifecycle Grants:

| Site | Grant SHA-256 prefix | Status | Scope | Revocation reason |
| --- | --- | --- | --- | --- |
| A | `623c362c435d` | active | mcp:read | null |
| B | `f1f54908e651` | active | mcp:read | null |

The B Grant being active proves business Consent progressed; it does not prove
that B received an Authorization Code or that the runner acquired a B Token.
Both Grants and all artifacts are preserved, not revoked or cleaned up.

### Diagnostics and protected baselines

At `2026-10-13T15:01:11.463175499Z`, Authorization emitted
`oauth.request_failed` with `name=Error` and no fixed code or reason. Only the
allowlisted structured projection was inspected; raw request/log contents were
not copied. This evidence cannot identify the exact throwing branch.

At the `2026-10-13T15:06:54Z` postcheck, the original Codex Grant's complete
control-metadata baseline was unchanged. Both Connector state summaries and
marker-set digests were unchanged. All historical Outbox row digests were
identical, with no new event. Seven containers remained healthy, OOM=false,
restart count 0, and migrations remained 001-013.
The subsequent fresh six-sample resource gate also allowed the test-stage
postcheck: minimum available memory 908.465 MiB, latest 1042 MiB, with only
historical-OOM and occupied-swap warnings. This is health evidence, not a
successful OAuth or isolation result.

The next minimal diagnostic task is a local real-Provider/PostgreSQL test for
two sequential resources under the same browser Session and Client. Inspect
the Provider's selected Grant versus `resolveExact()` and
`consentGrantUpdatePlan()`; the existing mismatch guard is an investigation
lead, not a confirmed root cause. If necessary, add only allowlisted internal
reason codes. Do not relax Grant binding or infer the cause from a generic
503. Production fixes or another authorization run require a new decision;
existing active test Grants mean the original zero-live-Grant prerequisite
no longer holds. Do not silently reuse, replace or revoke them.

```text
P3_CORE_OAUTH_MCP_PASS=True
P3B2_SITE_B_PAIRED=True
P3B2_PRODUCTION_ISOLATION_TESTED=False
P3B2_SITE_ISOLATION_PASS=False
REVOCATION_PROPAGATION_ISOLATION_TESTED=False
TENANT_ISOLATION_INDEPENDENTLY_TESTED=False
P3B3_APPLICATION_PASSWORD_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

This candidate changes only acceptance scripts/tests and records. There are no
public API, production runtime, OAuth Client, Connector, migration, DNS, Nginx
or P4-A changes. `design/` remains user-owned, untracked and untouched.
