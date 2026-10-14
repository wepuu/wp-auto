# P3-C1: Integration provenance and deferred cleanup handoff

## Scope

GitHub/source integration only. No production SSH/HTTP operation, deployment,
registry publication, database mutation or real authentication test is part of
this round. CI uses isolated fixtures, databases and unpublished test images;
its migration checks do not apply migration 014 to production.

Integration sequence: #57, #58, #60, #61, #62, then the separately reviewed
provenance/current-state extraction. Use ordinary merge commits and require each
corresponding main CI to succeed before the next merge. Branch updates use
normal merges, not force-pushes. GitHub's merge commit and per-commit Actions run
are the authoritative integration status; this provenance record is not a
substitute for checking them.

## Formal code and source consistency

PR #58 preserves the official `loadExistingGrant` hook, exact active
account/Client/canonical-resource/scope resolution, Provider/business Grant
binding checks and mismatch guard. ADR-021 and real HTTP/PostgreSQL tests cover
A→B→A, missing Provider artifacts, independent Sessions, interleaved requests,
cross-resource denials, refresh rotation, replay and RFC 7009 semantics.
No migration is added or changed by these P3 integration PRs.

The added/removed lines in the three runtime files below were compared between
the #58 formal fix and `5fab3ead...`→`4fbe9ca...` production-baseline hotfix;
they match exactly. The complete files need not match: main separately contains
the undeployed P4-A boundary.

- `apps/authorization-service/src/server.ts`
- `packages/oauth-provider/src/index.ts`
- `packages/database/src/index.ts`

PR #61 removes the built-in VPS/root/container execution target. Explicit
`WEPUU_P3B3_SSH_HOST`, `WEPUU_P3B3_SSH_USER`,
`WEPUU_P3B3_WORDPRESS_CONTAINER` and `--execute true` are now required. The original
ten tests remain, with six additional offline configuration/no-I/O tests.
See `P3C1_APPLICATION_PASSWORD_RUNNER_CONFIGURATION_2026-10-14.md`.
The historical successful production run used the original reviewed #61 Head;
its evidence is preserved verbatim, not rewritten to imply the new configuration
options were production-tested.

## PR #59: retain provenance, do not merge old baseline

Keep #59 unmerged. It targets the old production baseline, not main. Runtime
changes are already represented by the formal #58 fix; do not merge its old
baseline, CI archive gate or publication flow into main and do not republish.

Preserved selected files, copied without altering their historical claims:

| File | Source |
|---|---|
| `P3B2D_AUTHORIZATION_HOTFIX_PREPARATION_2026-10-14.md` | #59 Head `4fbe9ca3d221f430ee039111ec513ef5f65c63cf` |
| `../scripts/verify-authorization-hotfix-image.mjs` | same #59 Head; frozen 001–013 manual image-boundary verifier |
| `P3B2D_AUTHORIZATION_HOTFIX_PRODUCTION_DEPLOYMENT_2026-10-14.md` | operation branch record commit `937d86b` |

All three extracted Git blob IDs match their source. No workflow or image was
copied/published by this extraction. The verifier remains a manual historical
baseline check, not a main-image deployment builder; it uses an explicit Node
entrypoint and no network, never a default migration entrypoint.

The deployed registry manifest digest is
`sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`;
the config/Image ID is
`sha256:f429f59839cd07a5f350805a119b2a93b48e7f7e1e44da678cffb04004bbe0f1`.
They are not interchangeable with the archive SHA. The preparation and operation
records preserve original artifact IDs, source tree, backup checks and rollback
reference. Action artifacts have finite retention; their continued availability
is not presumed by integration. Preserve the fixed published image/reference.

After verifying main retains these records, recommend closing #59 without merge
as a retained production-baseline candidate, with a link to formal #58 and the
deployment record. Do not delete its branch or historical failed evidence as
part of this round. Closure is a recommendation here, not an executed action.

## Evidence retained

- Pairing: `P3B2C_SECOND_SITE_PAIRING_ACCEPTANCE_2026-10-13.md`.
- First isolation failure: `P3B2D_SITE_ISOLATION_VALIDATION_2026-10-13.md`.
- Local mechanism: `P3B2D_RESOURCE_GRANT_DIAGNOSTICS_VALIDATION_2026-10-14.md`
  and ADR-021.
- Hotfix preparation/deployment: the two records listed above.
- Actual six-step success: `P3B2D_SECOND_SITE_ISOLATION_ACCEPTANCE_2026-10-14.md`.
- Application Password preflight failure:
  `P3B3_APPLICATION_PASSWORD_ACCEPTANCE_2026-10-14.md`.
- Actual Application Password success and precise temporary-identity cleanup:
  `P3B3_APPLICATION_PASSWORD_PRODUCTION_ACCEPTANCE_2026-10-14.md`.

Existing Auth0, P3-A, Desktop and earlier failed-attempt evidence is not removed.
Current AGENTS/README/ROADMAP summaries point to later results without rewriting
the original records or treating isolated CI tests as production acceptance.

## Future cleanup — requires separate explicit production authorization

Nothing below is executed by P3-C1. Re-read exact Site/Grant IDs and resource
ownership, service health, current sequence/Outbox state and backup conditions
before authorizing the cleanup. Never identify a destructive target solely by a
short digest prefix.

1. Protect the original `wepuu-e2e-codex` Grant and Site A. Revoke only the
   lifecycle Grant on A (`623c362c435d...`) through the normal platform operation.
   This legitimately creates a new A Grant event: with the last accepted
   baseline, sequence advances from 2 to 3 and the Grant deny-marker set grows.
   Verify delivery and the Codex Grant remains unchanged; do not require A's
   sequence to remain 2 after an explicitly authorized cleanup revocation.
2. For B, prefer one normal platform Site disconnect rather than redundant
   separate revocations: the existing `disconnect_site_with_event` contract
   revokes the Site and its live Grants (including `f1f54908e651...`) and creates
   one Site event. This is a planned state change, not the earlier no-change
   acceptance baseline. Verify the exact B Site/Grant status and event delivery
   while B's Connector is still connected and reachable. Only then perform its
   normal local disconnect, avoiding an undeliverable event caused by premature
   shutdown. If delivery fails, stop and diagnose; do not edit/requeue history.
3. After authorization/status evidence is saved, verify the exact B Compose
   project `wpauto-wordpress-e2e-b`, labels, containers, volumes, network and
   `/opt/wpauto-wordpress-e2e-b` ownership against the retained resource ledger.
   Stop/remove only owned B resources; delete its database/files/volumes only
   with explicit irreversible-deletion approval and backup/retention decisions.
4. Remove only B-owned ingress/DNS/certificate configuration. Preserve any
   pre-existing wildcard/shared DNS, shared certificates and global ACME rules.
   Validate Nginx before normal reload. Do not prune shared WordPress/MariaDB
   images, Site A resources, platform images or the Authorization rollback image.
5. Postcheck Site A, original Codex Grant and core services. Retain platform
   revoked Site/Grant records, historical Outbox/audit evidence and acceptance
   documentation; no manual PostgreSQL deletion/restore or global Docker prune.

No Refresh Replay, RFC 7009 test or new authentication flow is implicit in this
cleanup plan. The P3-B3 temporary credential/user are already removed; do not
recreate them or remove unrelated credentials. Do not deploy P4-A/014.

## Bounded status

```text
P3B2_SITE_ISOLATION_PASS=True
P3B3_APPLICATION_PASSWORD_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Same-Tenant Site/resource/Grant isolation does not independently prove Tenant or
revocation propagation isolation. Aggregate readiness is not promoted by merging
code/evidence. `design/` remains untracked, unmodified and unstaged.
