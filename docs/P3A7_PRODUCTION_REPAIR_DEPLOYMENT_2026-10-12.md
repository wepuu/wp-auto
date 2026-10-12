# P3-A7 Production Repair Deployment - 2026-10-12

Status: repair artifacts deployed; re-pairing failed; positive OAuth/MCP
regression not run; G1 and G2 not run.

## Authorized scope

The operator authorized a bounded repair of the dedicated `test.wpauto.cc`
WordPress fixture and the existing WPAuto Authorization Service. The operation
did not deploy Control or P4-A, did not run migration 014, did not operate any
other WordPress site, and did not run Refresh Replay or RFC 7009 revocation.

## Fixed artifacts

- Connector package SHA-256:
  `f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960`.
- Authorization image:
  `ghcr.io/wepuu/wp-auto-authorization@sha256:d63768332319035d363fa337c64e33ba476763bd555886b7dcd180f0691e08d0`.
- Control remained on
  `ghcr.io/wepuu/wp-auto-control@sha256:791159decdc75b85b00a9b0b474c427f652cdfe7d03bd80fb43e5a54138e4ed5`.
- The Authorization image contained migrations 001 through 013 only. The
  production database remained at those same 13 migrations.

## Backup and deployment evidence

Before changing either runtime, the operator environment passed its health
probe with 79 percent root-disk use. A fresh protected backup set was created
at:

`/opt/wpauto/backups/p3a7-repair/20261012T041537Z`

The set contains a PostgreSQL custom-format dump, compressed test-site MariaDB
dump, Connector directory archive, protected project configuration archive and
SHA-256 manifest. The database formats, archives and manifest were checked;
all files were root-owned with mode `0600`.

The Connector package was uploaded under a new artifact name and its SHA-256
was checked before installation. The plugin remained active; all PHP files
passed syntax validation; the three pairing-state repair files matched their
reviewed hashes; the dedicated WordPress container and public test site stayed
healthy.

The fixed Authorization digest was deployed with the existing project deploy
tool. Authorization, Control, discovery, OAuth metadata and public RS256 JWKS
passed after deployment. Both `wepuu-e2e-codex` and
`wepuu-e2e-lifecycle` remained active clients. Control was not recreated.

## Disconnect and re-pair result

The current platform site was disconnected through the authenticated product
flow. Its existing Codex Grant became revoked with `site_disconnected`. The
WordPress administrator then used the Connector's local disconnect control;
the local connection, pending pairing state and site private identity were
removed. No SQL was used to create, restore or alter a site or Grant.

A fresh local enable and Connect action was then attempted through the normal
browser flow. The platform displayed `Pairing failed. Return to WordPress and
start again.` The attempt did not create a third site, a new Grant or a site
identity. The platform recorded `pairing.denied` with the existing bounded
`proof_invalid` reason. The original WordPress pending record remained present
immediately after the failed browser attempt, showing that the platform proof
request had not entered the Connector handler far enough to consume it.

Read-only diagnostics confirmed:

- both Cloudflare IPv4 addresses resolved to public destinations;
- the production resolver selected `104.21.54.105` first;
- pinned DNS/TLS OPTIONS requests to both addresses reached the exact proof
  route and returned its expected `POST` method;
- a normal Control-container GET reached the route;
- no retained log identified whether the original request failed at
  Cloudflare HTTP handling, timeout, or another outbound response boundary.

One bounded diagnostic POST without a verifier was used to distinguish route
reachability. Because the Connector deliberately consumes every terminal
pairing request, including an invalid one, that diagnostic removed the pending
pairing record. It did not create an identity, site or Grant. The operator then
used the normal local disconnect action again, leaving the test site safely
disconnected. No further pairing attempt was made.

## Final observed state

- Control and the fixed Authorization image: healthy, zero restarts.
- Database migrations: 001 through 013; migration 014 absent.
- WordPress connection, pending pairing and private site identity: absent.
- Two historical platform sites: both revoked; no new site.
- Existing Codex Grant for the disconnected site: revoked with
  `site_disconnected`; no replacement Grant.
- Historical failed Outbox rows retained without deletion, modification or
  manual requeue.
- The disconnected site's new sequence 2 event was still in bounded retry at
  the final observation (`attempts=12`, `last_error_code=http.401`); it was
  left untouched because the WordPress fixture was intentionally disconnected.
- OAuth Code, PKCE, RS256 token, MCP initialize, tool catalog, site-health and
  normal refresh regression: not run because re-pairing did not complete.
- G1 Refresh Replay and G2 revocation: not run.

## Follow-up gate

Before another production pairing attempt, add bounded non-sensitive failure
classification around the Control pairing verifier or otherwise obtain the
exact outbound HTTP/network failure evidence. Reproduce the normal pairing
flow in an isolated environment with the same Cloudflare path. Do not weaken
the SSRF-pinned request, TLS, proof, issuer, tenant, site or key checks.

```text
P3A_REPAIR_DEPLOYED=True
P3A_REPAIR_FORWARD_PAIRING_PASS=False
P3A_POSITIVE_REGRESSION_PASS=False
P3_CORE_OAUTH_MCP_PASS=False
READY_FOR_CONTROLLED_USE=False
```
