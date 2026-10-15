# P3-E1C/E1D: deployment and split-state recovery handoff

Date: 2026-10-16 (Asia/Shanghai). Analysis only; nothing below is executed by E1B.

## E1C — separately authorize original-artifact publication and Control-only deployment

1. Recheck the E1B PR Head, successful CI, unexpired original image/manifest,
   SHA-256, source Commit/Tree and config/Image ID. No rebuild/substitution.
2. Reconfirm actual Control is `7c7308a6064740f9f732d2fb12a8f4c4c9dd3fd284edd26cea09df79b976c8fe`,
   Authorization is `e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`,
   five services are healthy, no new OOM/restart/severe pressure. Stop on drift.
3. Under the new authorization, read-only snapshot current replacement Site A
   Codex Grant, Site/Connector v2 sequence 0 and historical Outbox. Do not use
   the revoked original Codex Grant or historical Site A sequence 2 as baseline.
   Confirm ledger exactly 001–013 +015 with unchanged hashes, no014.
4. Back up actual protected Compose/override/runtime, image/rollback references,
   deploy script, ingress guard and DB custom-format dump in root0700/0600
   storage. Verify SHA-256 and pg_restore -l. No production restore authority.
   Backups remain protected; never publish secrets or HMAC key/hash.
5. Publish only the approved original Control archive with a unique tag, capture
   Registry Digest, pull and verify config, files and source identities. If
   publication/identity fails, do not change production.
6. Keep SEND_ENABLED=false, existing HMAC/key mount and full Nginx guard, issuer,
   Session/signing keys and Compose override unchanged. Recheck actual script
   `/opt/wpauto/bin/deploy-service` and ensure both deploy and rollback include
   the direct-node override. Do not invoke migration or one-shot migration CLI.
7. Capture the running `7c7308...` reference as this release's rollback target;
   the existing rollback file may still point to older `3a4eed...` and is NOT
   the target. Deploy only Control by the new immutable Registry Digest.
8. Verify Control live/ready, fixed Authorization Discovery/JWKS, Site A health,
   five services, peer identities/start times, exact ledger, OTP send/resend503,
   raw auth404, false send switch, custody and budget records. Recheck business
   baseline; no OAuth, mail, pairing or WordPress content/tool request.
9. Diagnostics acceptance is provenance + executed isolated sink tests. With no
   authorized pairing, production claims-detail event is NOT_OBSERVED. Do not
   forge a log, inject a diagnostic event or issue any Proof to manufacture PASS.
10. If health fails, stop and roll back only Control to captured `7c7308...`,
    retain direct CMD/override, guard, key, quota/reservations and DB. Verify all
    peers and business baseline. No DB restore, downgrade, key rotation, retries
    of OAuth/pairing, or rollback to pre-OTP unlimited sender.

## E1D — assess then separately authorize normal local recovery and one new pairing

The failed site's local active state is not proof of a platform Site. Read-only
checks at execution time must establish the precise canonical resource,
current P3-D5 account/owner Tenant, no existing platform Site/Grant for it,
consumed pending state and unchanged failure/audit history. Unexpected binding
means stop; do not revoke/disconnect some other Site based on a hostname alone.

Preserve the failed attempt, diagnostics, platform history and protected on-site
DB/files backup. Do not export sensitive Options, private site identity or
verifier/proof into the platform, scripts, logs or PR. Record only metadata and
safe state summaries. No manual SQL/Options edits or restoring stale identity.

The frozen Connector AdminPairingController disconnect performs, in order:
pending cancellation, connection deletion and SiteIdentity deletion. It is NOT
lossless. A later successful new pairing creates a new local identity/Site
binding and initialize_for_pairing overwrites local revocation state for that
new Site at v2 sequence 0. Disconnect itself does not promise removal of the old
revocation option. Existing trust in the old identity/binding is invalidated;
any unexpected real grant/dependency must be investigated before these actions.

If absence of business bindings is confirmed, separately approve one normal
local Disconnect, one Enable with confirmed settings, and one Connect under the
same intended account/Tenant. Do not assume earlier pairing authority remains
unused. Do not operate on Site A or automatically create an OAuth Grant.

For the single new attempt, correlate UTC and the existing opaque correlation
ID with fixed stage/code/detail. No original Proof retention and no clock
adjustment. Stop at the first error, preserve partial state and identify whether
the failure is the same category or a new one. If pairing succeeds, compare
platform/Connector Site binding and v2 sequence/deny-state and stop before OAuth.
This may yield diagnostic evidence; it cannot reconstruct the historical proof.

No E1D action is performed by E1B or implicitly authorized by deploying E1C.
