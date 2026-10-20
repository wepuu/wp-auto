# P3-E2E rerun: operator Session gate stop

Date: 2026-10-20 (Asia/Shanghai). **Stopped during operator preparation,
before the first production resource sample and before full preflight.**

## New evidence and authority

The operator requested one read-only complete preflight, with no OTP recovery,
Desktop enable, OAuth or MCP. During readiness confirmation they reported:

- auth.wpauto.cc Session had expired;
- WordPress administration and PuTTY were ready.

This is **operator-reported browser login loss**, not an assistant database
Session query, browser Cookie inspection or independent expiry-time measurement.
Database Session existence and the reason for the browser login loss were not
revalidated. The mandatory currently logged-in original-account prerequisite
was not met, so the run stopped without attempting to repair it.

No production SSH, resource sampling, database/metadata probe, WordPress command,
OTP send, enable/reload, OAuth/Consent/token exchange, MCP request/tool call,
pairing, time change, backup, deployment or migration occurred in this run.
GitHub reads and document delivery are distinct from production access.

## Preparation completed locally before the stop

The old local resource observer's two incorrect container names were corrected
to the accepted WordPress/MariaDB deployment names. No protected production
helper was edited or executed.

A local diagnostic module was prepared to retain only the reviewed failed
preflight frame's mem/psi variables, fixed thresholds, failure-capture UTC and
monotonic time. It does not enumerate or export other frame variables, raw
exceptions or stacks. Captured handler time is not labeled exact sample time.
Unrelated frames/missing variables produce an unavailable/invalid diagnostic,
never a successful resource result. No resource threshold was relaxed.

Local synthetic tests: **18 PASS**. Coverage includes memory/PSI boundaries,
invalid/non-finite values, both violations, expected versus unrelated frame,
missing fields, private sentinel filtering, correct container names, nested
failure/exit-status handling and later-success-not-erasing-earlier-failure.

This is diagnostic-unit evidence only: complete transport integration,
real production failure-frame extraction, permission/timeout observation and
full end-to-end aggregate execution were **NOT_RUN**. Preparation was stopped
at the browser prerequisite; these items must not be assumed complete by a
later implementer.

Prepared local diagnostic-module SHA-256:
`d4ffac5acbe98381c29aa5596f40c72c237d6d719c096cf0844747f1a6582a47`.
Corrected local observer SHA-256:
`5db85e9bc568382339bca36bddbb114ddbf5abffce2bd10ff3ff53021387da23`.
Neither helper is application runtime or a production-deployed change.

## Current evidence boundary

Direct local file check confirms the target project config remains unchanged,
349 bytes, enabled=false, SHA-256:

```text
00610c38465e25c1b90adf21108581f95f78fe50174156eecea1e6cf231ed139
```

No GUI runtime, credential store or current backend connection was inspected.
No resource/host OOM, container health, Grant/Site/Outbox, OTP protection, NTP,
clock brackets or backup state is represented as freshly verified here.
Prior WordPress/platform passes and the RESOURCE_PRESSURE stop remain historical
evidence in [Draft PR #89](https://github.com/wepuu/wp-auto/pull/89), Head
07c19538a7de03c19b339406b0a53f357fcabeac and
[CI 39225473245](https://github.com/wepuu/wp-auto/actions/runs/39225473245).
They are not reused as today's PASS or overwritten by this different stop.

## Status and next boundary

```text
P3E2E_PREFLIGHT_RERUN_PASS=False
P3E2A_PREFLIGHT_PASS=False
P3E2E_STOP_REASON=OPERATOR_REPORTED_SESSION_EXPIRED
P3E2E_DATABASE_SESSION_CHECK=NOT_RUN
P3E2E_RESOURCE_INITIAL_GATE=NOT_RUN
P3E2E_COMPLETE_PLATFORM_PREFLIGHT=NOT_RUN
P3E2E_WORDPRESS_CURRENT_CHECK=NOT_RUN
P3E2E_END_CHECK=NOT_RUN
P3E2E_TARGET_DISABLED_FILE_VERIFIED=True
P3E2E_DESKTOP_ENABLE_PERFORMED=False
P3E2E_OAUTH_ATTEMPT_PERFORMED=False
P3E2E_MCP_TOOL_CALL_PERFORMED=False
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

This independent docs-only branch starts from main
e8778da33d850303d1ccbdfbebf088610bf6ac5f; original dirty files, design/ and
the local project config are preserved. Hosted document CI/immutable Head are
linked in the Draft PR and do not validate production state. Do not merge.

Stop here. A usable original-account browser Session must be available before
the next preflight. OTP recovery is separately authorized work, not implied by
this report or the rerun request. Before any future production rerun, complete
and test the diagnostic transport integration, then perform the approved
single-run preparation and fresh checks. No resource tuning, threshold change,
automatic login recovery or authorization attempt is performed as a fallback.
