# WPAuto P3-E2S-R4B-R25 expired Session offline diagnosis

## Result and boundary

R25 completed the authorized offline review and test-only diagnostic changes.
The exact R24 runtime failure remains NOT_CONFIRMED. No container, database,
Authorization/Control service, OAuth flow, real Desktop or production host was
started or accessed. No application, migration, dependency, image or production
configuration changed. R24's failure and the unexecuted transition remain intact.

The strongest static hypothesis is an error-mapping gap at classified Code
consumption, not proof that an expired Code was accepted. No application repair
or acceptance relaxation is included in this change.

## Earliest retained failure and information loss

R24 run `r24-20261024144904933` completed24 of37 matrix checks and stopped at
`expired_code`, category `ASSERTION_FAILED`. The retained host safe
`integration.json` has no `assertion` or response diagnostics. The safe driver
retains `SERVICE_MATRIX_FAILED`, with its nested result projected in the same
way. Host `scenarioOnce` projects again and cannot recover removed fields.

The integration catch could retain an uppercase assertion name and its last
five fixed-category Token diagnostics. However, the historical R22 projector
allowed driver/startup assertion names, not `DENIED_STATUS`, `DENIED_ERROR`,
`NO_DENIED_AT` or `NO_DENIED_RT`; it discarded the diagnostics array entirely.
The exporter applies this projection before writing host files. Thus the
confirmed information loss is at safe projection/export, while the earliest
retained protocol failure is only the broad `expired_code` stage. This does not
establish which inner operation or mode failed.

Only existing host report fields and file names were inspected. Private
`postgres.private.*` files were not read. The original private integration and
driver reports may remain in the retained evidence volume
`wepuu-r24-20261024144904933-evidence`, but no container was started to extract
them. R24 evidence was not overwritten.

## Contract and implementation comparison

| Boundary | Source behavior and implication |
|---|---|
| Code's own expiry | Fixed `oidc-provider@9.12.2` checks `code.isExpired`. This is distinct from expiring its original Provider Session. |
| Original Provider Session | ADR-024 and the PersistentReceiptStore contract require Code consumption to check the original Session, account and Client Grant. |
| Application check | `PersistentReadOnlyRuntime.verifySource` calls `#session` for AuthorizationCode, not RefreshToken. It resolves `Session.findByUid`, then checks account and Client Grant. |
| Adapter read | `PostgresProviderAdapter.#findSecondary` filters persisted Session rows by `expires_at > now()` (or null), within its authorization transaction. The persistent SQL consumption guard independently rejects null expiry. |
| Atomic consumption | Migration016 `consume_persistent_code` locks receipt and original Session, rejects missing/expired/mismatched Session, then checks the unconsumed Code and marks it consumed. Migration017 routes PERSISTENT_READONLY Code consumption through that function. |
| Refresh contract | Approved persistent Refresh may continue after the original Provider Session expires, but retains receipt/binding/deadline/replay checks; rotation cannot extend the original deadline. This is not permission for Code exchange to skip its Session check. |
| Fixture mutation | The stage updates Session `expires_at`, not Code expiry. Historical code did not assert update row count or report per-mode results. |

Source references: `docs/ADR-024-PERSISTENT-AUTHORIZATION-CANDIDATE.md`,
`packages/oauth-provider/src/persistent-readonly.ts`,
`packages/oauth-provider/src/index.ts`, `packages/database/src/index.ts`,
migrations016/017, and `test/persistent-authorization/r8/integration.mjs`.
No static observation proves which rows were affected in R24, whether a cached
Session participated, or what HTTP response occurred.

### Static error-mapping hypothesis

The fixed upstream [authorization-code handler](https://raw.githubusercontent.com/panva/node-oidc-provider/v9.12.2/lib/actions/grants/authorization_code.js)
calls consumption before token issuance. Its
[consume helper](https://raw.githubusercontent.com/panva/node-oidc-provider/v9.12.2/lib/helpers/grant_source.js)
awaits `source.consume()` without converting arbitrary adapter exceptions.
[Token issuance](https://raw.githubusercontent.com/panva/node-oidc-provider/v9.12.2/lib/helpers/grant_common.js)
subsequently validates the account, reaching this project's `findAccount` and
`verifySource`. Therefore the application-layer InvalidGrant conversion may be
too late to handle an earlier SQL consumption rejection.

The SQL function raises `persistent_grant_denied` for an expired original Session.
The local adapter's `consume` awaits that query without an explicit conversion
of this SQL exception into its OAuthInvalidGrantError. Its replay return path
does perform such a conversion. The enclosing database transaction rolls back
and rethrows; rollback itself does not classify an OAuth error.

This provides a concrete hypothesis for a denied request whose status/error
does not match the fixture's required400/`invalid_grant`. It is not confirmation
that R24 returned500 or that this was its failing assertion. A targeted observation
or safe projection of the original private report is required before selecting
an application fix. Broad conversion of all database failures to invalid_grant
would also conceal infrastructure failures and is not authorized here.

### Independent A and B coverage

The historical stage sends the same Code first to A and then to B. If the first
exchange consumes it, a later rejection can be replay-related rather than an
independent original-Session rejection. The same limitation exists in the later
deleted/account/client_grant variants. The
[OAuth authorization-code contract](https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2)
requires single-use Codes; repeated exchange is not an independent first-use
test. R25 preserves historical sequencing rather than silently redesigning the
matrix. A separately approved targeted fixture should use independent fresh
Code/Session bindings for A and B, verifying each mutation affects exactly one
intended row before its first exchange.

## Test-only diagnostic changes

New `r8/expiry-evidence.mjs` supplies a small dependency-injected wrapper around
the existing expiry stage. It distinguishes authorization, link lookup, Session
update, A exchange, B exchange and completion. It adds explicit Code/link
presence and exactly-one-updated-row assertions; it does not lower any denial
requirement. The existing400, invalid_grant and absent AT/RT assertions and the
37/17 check manifests remain unchanged.

The wrapper records only presence booleans, update count, fixed mode, bounded
HTTP status, allowlisted OAuth error and Token-field presence. It records a
pending exchange before the callback and its safe response before assertions,
so a thrown exchange differs from an unexpected completed response. It never
exports Code, Session UID, Token, payload or exception text. It stops immediately
on failure and does not advance B after A fails.

`r22/report.mjs` preserves these fixed sub-stages and fixed assertion names only
for the new expiry stages. It reprojects the structured `expiryEvidence` at
every layer; unknown keys and arbitrary strings are omitted. Partial failure
cannot become success merely because child cleanup passed. No driver, exporter,
resource gate or startup budget was changed.

## Offline verification and historical guard result

Host Node was v26.11.1; this was a pure host/helper test, not a claim of running
the fixed v24.22.1 service artifact.

`scripts/r25-expiry.synthetic.mjs` passed150 checks in one invocation. It covers
absent Code/link, zero/multiple/invalid update counts, callback failures at every
sub-stage, A/B status/error/AT/RT failures, early stop, pending versus completed
exchange, projection idempotence, nested driver/host failure propagation,
sensitive sentinel filtering, status/error bounds and unchanged check counts.
The minimal case injects a synthetic A response with unexpected status, records
`expired_code_exchange_A` and `DENIED_STATUS`, preserves only safe response
fields through nested projection and verifies B was not called. No network or
database operation is involved; it does not reproduce the actual service fault.

The existing `scripts/r24-ab.synthetic.mjs` was additionally invoked once as a
pure regression check. It stopped at line67's historical source-freeze assertion:
R8 must match `1105aa0`, but R25 changes `r8/integration.mjs`. No complete R24
regression PASS is claimed. This guard was not relaxed, the command was not
retried, and no formal R24 invocation occurred. The R24 runner would likewise
reject these new test inputs. Future execution requires a new reviewed entry
and frozen input baseline, not bypassing the existing R24 guard.

Integration syntax and `git diff --check` passed before the historical guard
test. No full application lint/typecheck, database replay, Hosted CI or image
validation is claimed. No prior passing production or R21–R23 gate was rerun.

## Next evidence and stop

Prefer one bounded read-only extraction of the original retained integration
report, applying a new strict projector inside the owned evidence volume, if a
separate authorization permits an extraction container. Do not export its raw
diagnostics or overwrite R24's historical host files. If the original report
does not resolve the fault, propose one isolated targeted expiry reproduction
with separate A/B first-use artifacts, row-count/readback evidence and the new
safe sub-stages. Keep the fixed application artifacts and existing security
expectations; do not run the complete matrix or transition for diagnosis.

Any application change follows a confirmed diagnosis, focused regression scope
and explicit approval. Full A/B, B-stop-then-A and real Desktop account switching
remain later gates. This offline task ends here.

```text
P3E2SR4BR25_OFFLINE_REVIEW_COMPLETE=True
P3E2SR4BR25_DIAGNOSTIC_SYNTHETIC_PASS=True
P3E2SR4BR25_EXACT_R24_RUNTIME_CAUSE_CONFIRMED=False
P3E2SR4BR25_SERVICE_REPRODUCTION_PERFORMED=False
P3E2SR4BR24_AB_MATRIX_PASS=False
P3E2SR4BR24_B_STOP_A_TRANSITION_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
