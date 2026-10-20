# P3-E2E formal execution: stopped before enable

## Scope and result

The operator separately authorized the formal Desktop connection phase after
the complete E2I read-only PASS recorded in Draft PR #94. That prior observation
window remains historical PASS; it was not treated as a fresh execution gate.

This attempt stopped at its new immediate platform check. The target definition
was **not enabled**, and no GUI Authenticate, Consent, token exchange or MCP
call was performed. The original project configuration remains 349 bytes,
SHA-256 `00610c38465e25c1b90adf21108581f95f78fe50174156eecea1e6cf231ed139`.
No failure-disable write was needed because enable was never performed.

## Authority and local preparation

The approved target was `wepuu-p3e2a-wepuu`, resource
`https://www.wepuu.com/wp-json/wp-auto/mcp`, issuer `https://auth.wpauto.cc`,
client `wepuu-e2e-codex`, and scope only `mcp:read`. The operator confirmed
that the original platform account/Home Tenant and WordPress local login were
still available. This is operator evidence, not a browser Cookie/Session-ID match.

Preparation added uncommitted local read-only before/after projection tools.
The after-check is designed to permit one correctly bound new business Grant
while preserving existing Grant, Site, Pairing Attempt, migration and Outbox
records. It does not read Token or secret-artifact payloads. The frozen Connector
LocalGrantRepository and locally locked oidc-provider Grant serialization were
reviewed to avoid guessing field names. These tools are not deployed application
code; preparing them is not acceptance evidence for an unexecuted OAuth flow.

Before any production check, local configuration/catalog/binding predicate tests
passed 30/30. The initial Python unittest invocation used an invalid dotted
module form for the `.tmp` path and did not run; the corrected file invocation
then passed 3/3. Python source compilation passed. None of these local tests
establishes successful remote postcheck integration.

The fixed installed backend's read-only `config/read`, while the target remained
disabled, confirmed the trusted project layer, exactly one target definition,
the approved disabled fields, and unchanged protected user configuration.
Desktop package was `26.1013.4894.0`; backend was
`codex-cli 0.163.0-alpha.10.2`, executable SHA-256
`f6dbf48cb70f62649c645f26c87dc9bf84cc36986202dfad8e12fb5b8ca70312`.
This did not perform alternate CLI/app-server OAuth or MCP acceptance.

## Single immediate production gate

The SSH check used the existing platform host and protected, hash-verified
read-only helper chain. It had no recovery, deployment, account write, OTP,
OAuth or MCP dispatch. Exactly one new platform-before invocation was made.

Safe returned result:

```text
receipt UTC: 2026-10-20T11:24:33.372Z
status: FORMAL_PLATFORM_NOT_CONFIRMED
stage: state
category: NOT_CONFIRMED
exitCode: 1
passed: false
rawErrorSuppressed: true
```

The invoked tool SHA-256 was
`9c22d5c28b300be8ad4d0c5cb9eccef26a68924c80fd600064761694021a438b`.
The private JSON receipt SHA-256 is
`ac39d11eed9ec2eae2e15a05d761a38ba95bdb6f87d725eb0ed96f72886098a0`.
The receipt does not contain a completed target Grant projection, a fresh
WordPress check or a complete runtime acceptance. Those items are
`NOT_CONFIRMED` / `NOT_RUN`, not current PASS. No second production check was
made and no later green sample was substituted for this failure.

## Local defect and evidence limits

After stopping, local source inspection found a definite auxiliary adapter
interface error: `closed_probes` belongs to the reused E1K module nested under
the E2C recovery namespace's `m`, not the E2C namespace's top level. The adapter
incorrectly addressed the latter. The already exercised E2F close-check calls
the nested function correctly.

Only the uncommitted local adapter was corrected to use that nested interface,
with a separate fixed diagnostic stage. Two synthetic tests were added for the
correct namespace and fail-closed propagation, bringing its Python tests to
5/5 PASS. The corrected local tool SHA-256 is
`2db99423a32febd15da44f3421dfbaa18b778f819dc5ca1c97b2b0d199f57ebb`.
It was **not rerun against production**. The remote receipt suppressed its
exception and reports only the broad `state` stage, so the locally reproduced
interface defect must not be presented as independently traced remote failure
location or as a production/OAuth root cause.

The WordPress adapter and Grant/Provider SQL after-check remain unexecuted
integration candidates. Local predicates and source compilation cannot be
represented as complete integration validation. A later continuation should
first complete offline mocked integration, obtain a fresh scoped gate, and
not replay this consumed invocation or silently resume formal OAuth.

## Boundaries and state

No project enable/disable write, credential inspection, token extraction, OTP,
pairing, Proof, database mutation, time adjustment, service restart, deployment,
migration, Grant cleanup/revocation or public registration occurred. No current
claim is made that this incomplete gate independently revalidated every platform
protection or current target Grant count. Historical pairing and mail-pause
results are retained as history, not newly observed PASS.

```text
P3E2A_PREFLIGHT_PASS=False
P3E2E_DESKTOP_ENABLE_PERFORMED=False
P3E2E_OAUTH_ATTEMPT_PERFORMED=False
P3E2E_MCP_TOOL_CALL_PERFORMED=False
P3E2E_FAILURE_DISABLED_RESTORED=NOT_APPLICABLE
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3E2_NEW_SITE_GRANT_ACTIVE=NOT_CONFIRMED
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

This independent Draft PR records new stopped-attempt evidence only. It does
not alter PR #94's prior-window PASS, authorize another attempt, or merge any
PR. Only this sanitized document is committed; local helpers, receipts, actual
configuration, `design/` and the user's existing changes are not committed.
Hosted document CI, when reported, is separate from production acceptance.
