# P3-E1D: new WordPress identity recovery and single pairing attempt

Date: 2026-10-16, Asia/Shanghai. **Pairing FAIL; stop and retain the scene.**
Execution timestamps below are explicitly UTC unless otherwise marked.

## Authorization and scope

The operator authorized read-only reconciliation and protected on-site backup,
then explicitly confirmed deletion of the old local identity and one recovery
and pairing attempt for `https://www.wepuu.com` only. The operator performed the
WordPress admin actions; the assistant performed platform read-only comparisons
and filtered diagnostic collection. No direct Options writes, synthetic Proof,
SQL repair, second Connect, or post-failure Disconnect occurred.

The separately authorized login recovery described below was necessary because
the P3-D5 account had no unexpired Session. It is not an implicit reopening of
email or public registration. No Codex OAuth, Consent/Token exchange, MCP call,
new Grant, plugin deployment, clock adjustment, or migration was performed.

Related evidence: [PR #73](https://github.com/wepuu/wp-auto/pull/73) (P3-D5),
[PR #75](https://github.com/wepuu/wp-auto/pull/75) (production-baseline diagnostic
candidate), and [PR #76](https://github.com/wepuu/wp-auto/pull/76) (E1C deployment).
These Draft PRs were not merged by this operation.

## Fixed platform and account baseline

Control remained:

```text
ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e
```

Authorization remained:

```text
ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742
```

Five scoped services were healthy. Migration hashes matched 001–013 plus 015,
with no 014. Existing replacement Site A, its active replacement Codex Grant
(hash prefix `a290a8dc95c3`), Site A Connector active/v2/sequence 0, revoked
historical Grants and Site B, and historical Outbox matched protected baselines.
Historical undelivered events were not edited or resent.

The intended P3-D5 account hash prefix was `3f70db80a710`, and its independent
Home Tenant hash prefix was `7a930b60a6be`. Its account and owner membership were
active. Exact identifiers were checked inside protected operations; no email,
raw account ID, Cookie, or Session value is included here.

All-status queries found zero platform Sites for the exact resource, zero Sites
or Grants matching the full old local Site ID hash, zero Sites matching the
recorded old public-key kid hash, and zero Grants in the target Tenant. The
existing failed attempt remained preserved. The recorded-kid lookup is not
represented as an independent comparison of every possible public-key encoding.

## Separate one-email login recovery

Initial SSH attempts using the operator's saved PuTTY session could not proceed
without interaction; saving a session did not share an authenticated connection.
WordPress checks and backup therefore used operator-executed commands. Platform
SSH remained available. No password or private key was requested or exported.

The operator separately authorized one real OTP send to restore the **existing**
P3-D5 account, confirmed readiness, then confirmed receipt and login. No new
account or Home Tenant was created. A platform read-only check confirmed the
same account had an unexpired Session and active owner membership afterward.

The existing bounded-send helper was adapted to the deployed Control digest and
the nonzero reservation baseline; its syntax check passed. Before opening, a
server-side five-minute recovery timer and first-reservation watcher were armed.
The same fixed Control image was recreated only to apply the true/false send
switch; no release image or rollback reference changed. The full Nginx guard was
restored immediately after the single new reservation. Application sending was
false again by `2026-10-16T07:26:33.995739Z`.

| Login recovery check | Result |
| --- | --- |
| New reservations / Provider calls | 1 / 1 |
| Provider accepted / rejected / unknown / storage_failed | 1 / 0 / 0 / 0 |
| Budget at sampled times | 99 before, 98 after |
| Existing reservation full-row hash preserved | PASS |
| Operator receipt and successful login | CONFIRMED |
| Resend Dashboard Delivered observation | NOT_RUN for this recovery |
| Public send/resend 503, raw Better Auth send endpoint 404 | PASS |
| Actual send switch false and runtime bytes restored | PASS |
| Five healthy services; other four container identities unchanged | PASS |
| HMAC, protected Site/Grant/Outbox state, OOM and rollback references unchanged | PASS |
| Own temporary recovery tasks removed after protection verification | PASS |

Protected configuration and recovery evidence remain in:
`/opt/wpauto/backups/p3e1d-login/20261016T072419Z-8mCFyY`.
No OTP, inbox contents, complete email address or authentication artifact was
read by the assistant. Accepted is not asserted to equal Dashboard Delivered.

## WordPress read-only observations and backup

The operator executed SHORTINIT, DISABLE_WP_CRON, read-only transaction checks,
without calling ConnectionSettings.load or loading plugin business operations.
Reported PHP was 8.2.28. Home/SiteURL, Control origin, issuer, Tenant and exact
resource all matched. Old local connection was active, identity matched it,
revocation v2/sequence 0/deny_all false, with zero grant/token/key deny markers.
The pairing-prefix option count was zero; the reviewed exact pending Option name
falls within that prefix. These are operator-returned safe summaries, not direct
assistant SSH observations of the WordPress host.

Old local Site ID hash prefix: `aabc1a0ffa82`.
Old identity kid hash prefix: `f7f5f6dcf816`.

On-site backup completed at `2026-10-16T07:33:08Z`, in:

```text
/root/wepuu-e1d-backup-20261016T073303Z-d0afb459
```

The root-only backup script used umask 0077 and a 0700 directory, and created a
single-transaction dump of the database whose 32 base tables were all InnoDB,
plus the current Connector files and wp-config archive. Temporary client
credentials were held in a 0600 file and removed. Credentials were not passed in
command arguments or printed. SQL and archives remained on the WordPress host;
none were uploaded to the platform, chat, or GitHub.

| File | Operator-returned SHA-256 |
| --- | --- |
| database.sql | `d52f58be1d66f42d520401abee25fe85e35a2901a08841a3539dde97ec025df0` |
| database.sql.gz | `eaecf278ac8e111aafde767c360ead8f3a7389cd1cf49b30517ff0a2c8f94274` |
| connector-config.tar.gz | `c52d5904bf98465c067e97f9ddc069001cf2c20c8d1e05ea0630046a0256d6f0` |

Dump exit status, gzip integrity and archive readability passed. No production
restore or isolated full restore drill was performed; no broader server-object
or ownership restoration guarantee is implied.

## Explicitly confirmed actions and single-attempt evidence

After backup, the operator explicitly confirmed local identity deletion and one
recovery/pairing. They were informed that Disconnect deletes pending, connection
and identity, but not the revocation Option, and that a failed new Proof can
already leave local active state with a new identity. No automatic backup restore
or retry was authorized.

| Action / gate | Actual observation |
| --- | --- |
| Local Disconnect once | Connection, identity and pending absent; old revocation Option retained |
| Enable once | unpaired; enabled and all exact binding comparisons true; identity, Site ID and pending absent |
| Pre-Connect platform gate, 07:41:51.632062Z | Session valid, owner, five healthy services, zero target Sites/Grants |
| Connect once and normal platform page | Operator reported “Pairing failed. Return to WordPress and start again.” |
| Attempt ID-set difference | Exactly 1 new failed Attempt, correct Tenant/resource; all 7 historical Attempt hashes unchanged |
| New platform Site / Grant | 0 / 0 |
| Second Connect / post-failure Disconnect / time adjustment | NOT_RUN |

Protected platform comparison evidence is in:
`/opt/wpauto/backups/p3e1d-pairing/20261016T074151Z-703j0ztx`.
Full internal identifiers remained protected; the new Attempt SHA-256 prefix is
`6bbb667c210e`.

## Actual diagnostic and its limits

The server parsed only structured diagnostic entries matching the new Attempt's
correlationId in the bounded time window. Raw logs, Proofs and request bodies
were not exported or committed.

```text
occurredAt: 2026-10-16T07:42:15.699Z (15:42:15.699 Asia/Shanghai)
correlationId: qTyhCX5wvispm7nEqcM0_82-
stage: proof
code: proof.claims_invalid
detail: claims.time_future
```

The deployed verifier emits this detail after header, signature, JSON and schema
checks when `iat > floor(platformNow / 1000) + 5`. This confirms the rejection
branch for **this attempt**, not the raw iat value, offset magnitude, clock
source responsible, or the cause of the historical failure. No original/new
Proof was retained. No clock correction or validation relaxation was attempted.

## Failed-scene readback and final protection checks

Operator-returned WordPress summary at `2026-10-16T07:44:59Z`:

- Local active; new local Site ID hash prefix `5c6db167294a`.
- New identity exists, differs from old identity and matches the local connection.
- Pending absent; revocation v2, sequence 0, deny_all false, Site binding consistent.
- Final individual deny-marker counts were not included in this readback; do not
  infer or promote them to a separately verified final check.

This matches the implementation's pre-platform-acceptance local activation
behavior. It is **not** a successful platform pairing. The scene remains split:
new local active identity/binding, no platform Site/Grant.

The final platform comparison at `2026-10-16T07:45:28.923889Z` confirmed one new
failed Attempt, all historical Attempt hashes unchanged, and unchanged full-row
Site/Grant/Outbox and migration hash collections. Site A Connector hash was
unchanged. All five container identities/images/start times remained unchanged
from the pre-Connect baseline and healthy. OTP switch remained false, guard
unchanged and reservation aggregates unchanged. No unexpected business Grant or
revocation event was created.

## Handoff and state

No runtime code changed. This is an independent evidence-only Draft PR based on
main `e8778da33d850303d1ccbdfbebf088610bf6ac5f`; it does not merge any hotfix or
historical Draft. Main-worktree dirty files and design/ were untouched.

Do not begin Codex OAuth/MCP. A subsequent, separately scoped task should first
compare WordPress host/PHP and platform UTC clocks, time synchronization status,
and verifier clock sources using content-free read-only evidence with bounded
measurement uncertainty. Do not assume an earlier NTP observation is current,
change clocks, reset the identity, or issue another Proof as part of this handoff.
Any corrective change and new pairing attempt require separate authorization.

```text
P3E1D_SINGLE_NEW_PAIRING_ATTEMPT_VERIFIED=True
P3E1D_CURRENT_FAILURE_DETAIL_OBSERVED=True
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=False
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3E1C_CONTROL_DIAGNOSTICS_DEPLOYED=True
P3D_REAL_EMAIL_ACCEPTANCE_PASS=True
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
