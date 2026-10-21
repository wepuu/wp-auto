# P3-E2L: bounded single-site read-only trial readiness closeout

## Decision and authority

**Candidate: BLOCKED — required recovery-coverage evidence is missing.**
Evidence reconciliation is complete within the reviewed record set; current
recovery coverage is **NOT_CONFIRMED**, not a finding that no newer backup exists.
The evidence condition for a verified recovery point is unmet. This preserves
E2K's successful technical acceptance without promoting formal readiness.

The operator selected only the existing operator, P3-D5 account/Home Tenant,
current Desktop connection, current `mcp:read` Grant and
`https://www.wepuu.com/wp-json/wp-auto/mcp`. Site A/current Codex Grant are
protection objects, not additional trial targets. There is no new account,
invitation, Tenant, write permission or public-registration scope.

E2L performs document/receipt reconciliation and GitHub metadata reads only.
No production SSH/HTTP, sign-in, OTP, pairing, OAuth, MCP call, backup creation,
secret transfer, isolated restore or production restore was performed. Public
APIs/interfaces/types, schema, health semantics, plugins and runtime configuration
are unchanged. New backups and all restore work require a separately approved
task. This is a candidate report, not authorization to begin a trial.

## Fixed evidence and provenance ledger

GitHub Head/status metadata was reread in E2L. Production statements below are
explicitly historical observations, not fresh production checks.

| Record | Immutable identity | What it proves / does not prove |
| --- | --- | --- |
| [E2K, Draft PR #99](https://github.com/wepuu/wp-auto/pull/99) | Head `b7b09b88c5872f49d0e694eadd70b5f7f6fa0313`; [CI 39587106727](https://github.com/wepuu/wp-auto/actions/runs/39587106727) Success on that same Head | Accepted Desktop/catalog/call/binding/protection record; CI validates the document candidate and its base, not production execution |
| [Continuous existing-account OTP, Draft PR #98](https://github.com/wepuu/wp-auto/pull/98) | Document Head `e5d1da900814f6ba8e7bf0a4522b4665063316c7` | Policy/deployment record; no status checks were returned for this later documentation Head in the E2L query; do not assign the code CI to it |
| Original accepted OTP code | Source `69e94218c946fc620af71bfca750657465a9f26c`; [CI 39538026057](https://github.com/wepuu/wp-auto/actions/runs/39538026057) Success on that source | Isolated code/security/mock tests and original immutable artifact; not a new production inbox test |
| Accepted OTP deployment | `2026-10-21T07:02:43.117771Z` (15:02 Asia/Shanghai), from PR #98's deployment record | Bounded Control/ingress deployment and direct postchecks, not deployment of its later document Head |
| E1K pairing, [PR #84](https://github.com/wepuu/wp-auto/pull/84) | Historical acceptance record, reused by E2K | Successful replacement identity/site binding; not permission to reset or pair again |
| E1K phase-one backup, [PR #83](https://github.com/wepuu/wp-auto/pull/83) | Historical backup receipt before the replacement identity | Protected integrity/readability evidence for that older snapshot, not a current identity/Grant recovery point |
| ADR-015 / ADR-017 operations records | Existing accepted configuration/readiness and recovery boundaries | Liveness, dependency readiness, configuration completeness and product/trial acceptance remain distinct |

PRs #98 and #99 were still Draft/open at reconciliation. Neither is merged or
deployed by this report. The clean E2L branch starts at main
`e8778da33d850303d1ccbdfbebf088610bf6ac5f`; main is not asserted to be the running
production source. No merge, deployment, image publication or migration follows
from this provenance audit.

Accepted production Control provenance in the deployment/E2K records:

```text
Code source: 69e94218c946fc620af71bfca750657465a9f26c
Source tree: 080b541c9a202dcc1193746e7f845ef6f3af2574
Original CI archive SHA-256:
92eea1aafb5c84565e049d52d201eea924913e5a8c6934ce0628e8abeff6035f
CI OCI config digest / older-store image ID:
sha256:8ea1dc31e9d2e7019a4fb0a1ade409c1a5fa4e40d9844e2d573ae3c7159c693d
Loaded manifest ID / accepted Docker containerd runtime reference:
sha256:3e60de660d8e2c344a0464cf6b8b65d008834d5517c55c57877bd7b15e080338
```

The archive links the manifest and config identities; these different digests
are not contradictory. There was no new registry publication. Authorization
remained the accepted `e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`
image with its actual historical launch command unchanged. This document does
not substitute obsolete `8fcc...` Control or paused-send assumptions.

## Single gate matrix

PASS means sufficient evidence for the stated historical check and exact bounded
claim. It never means continuously healthy, currently signed in, or newly
revalidated by E2L. NOT_CONFIRMED required recovery evidence blocks this candidate.

| ID / required condition | Evidence / observation time | Limits | Result | Blocks this candidate? |
| --- | --- | --- | --- | --- |
| H1 Account/owner and exact Site/resource binding | E2K/PR #99; binding queries about 18:37 and final checks 18:41, 2026-10-21 Asia/Shanghai | Browser confirmation and database Session evidence are separate; Session may later expire | PASS (historical) | No |
| H2 Only-read business/Provider/local Grant binding | E2K; exactly one new active Grant, Scope only `mcp:read`, correct account/Home Tenant/Site/Client/resource and one local mapping | Actual JWT was not extracted; claims are contract/configuration/persistence/success correlation, not independent JWT inspection | PASS (historical) | No |
| H3 Actual Desktop and direct read-only data path | E2K; exact 23 names at 18:37:32; one site-health call at 18:38:37–18:38:41; matching origin POST 200 at 10:38:44Z | Exposed runtime catalog, not raw initialize/tools-list capture; bounded origin metadata is correlated, not cryptographic request-ID proof or proof of zero retransmissions | PASS (historical) | No |
| H4 Protected production state | E2K final checks about 18:41: Site A/Grant, identities, revocation state, original Outbox/Attempts/Grants, five services and migrations preserved | Snapshot only; no E2L host access and no future-health assertion | PASS (historical) | No |
| H5 Existing-account OTP / registration policy | PR #98 deployment at 15:02; retained policy in E2K final checks | Sending true and signup disabled, accepted code/CI and guard evidence; actual inbox retest under that deployed image is NOT_RUN, not inferred from an empty-request smoke or existing Session | PASS for the policy/compatibility claim | No; record inbox limitation, do not send test mail |
| H6 Verified recovery coverage for current WordPress identity/local Grant | E1K older snapshot; E2K explicitly records its pre-identity limit | No reviewed later WordPress backup receipt proves current identity and the new local mapping are covered | NOT_CONFIRMED | **Yes: required coverage evidence missing** |
| H7 Verified platform recovery coverage for the new Grant/Provider binding | PR #98's known PostgreSQL dump at 07:01Z precedes E2K's new authorization; reviewed later records provide no replacement receipt | A documented daily schedule is not evidence of a successful current artifact; no current-host inventory was read | NOT_CONFIRMED | **Yes: required coverage evidence missing** |
| H8 Reproducible accepted runtime/source identity | PR #98 archive/config/manifest/source mapping and E2K protection checks | Draft/main/runtime are different identities; this is accepted historical provenance, not a new rollout/reproducible-build test | PASS for accepted provenance | No |

E2K scope, pair/OAuth/MCP acceptance and production protection PASS are not
retracted because recovery proof is missing. The aggregate trial candidate is
BLOCKED specifically at H6/H7. A later verified existing artifact may satisfy
these gates; creating another backup is not assumed to be the only solution.

## Recovery coverage inventory and search limits

The record search covered the retained E1K phase-one/pairing records, PR #98's
candidate/deployment records, PR #99's acceptance record and existing safe E2K
receipts, plus a bounded local receipt index. No complete backup or configuration
was opened. It did not inspect hosts, backup dashboards, scheduled-job results,
unindexed off-host storage or unknown operator records. Thus it cannot establish
that no newer usable backup exists.

| Known artifact | Verified historical scope | Coverage limitation |
| --- | --- | --- |
| WordPress E1K snapshot `20261018T135222Z-a931ba4ba8a7` | Operator-executed/returned root-private database + Connector/config backup; single-transaction InnoDB export, gzip/archive/hash checks; later custody rechecks | Created before the identity replaced in E1K and before the E2K local Grant mapping. Rechecking its hash does not add those later records. Not a current whole-site recovery point |
| Platform OTP snapshot `20261021T070104Z-dawlbb5h` | Assistant-collected PostgreSQL custom dump and config/artifact inventory; root-private, header/catalogue/hash checks | Predates E2K's new business/Provider Grant. Readable dump catalogue is not successful restore of the current binding |
| E2K Desktop config snapshot `20261021T085852Z-0afccfcf8ed3` | Local private raw user/project configuration and permission metadata; bytes/ACLs checked | Not WordPress/PostgreSQL backup, not Credential Store backup, not a current coordinated recovery point; no OAuth credentials were extracted |
| Existing daily/weekly platform backup policy and older isolated restores | ADR-017 documents schedules/retention and isolation procedures | Policy and old exercises cannot identify the latest successful artifact or prove recovery of the current identity/Grant |

Backup contents/checksums of secret files are not copied into this report.
Existing public artifact identities are provenance, not secret custody output.

## Non-blocking qualifications and expansion gates

- **Local config caveat:** E2K's exact target enable preserved all other bytes at
  patch time. Its later final user-file hash differed only semantically in the
  existing `node_repl.env` field; source NOT_CONFIRMED. Target definition and
  ACLs still matched. E2L neither reads those values nor investigates/overwrites
  the change, and does not claim whole-user-file integrity. This alone does not
  demonstrate WePuu authorization or production Site A failure.
- **Resource risk:** E2K's earlier failed sample (memory full avg10 1.23) and
  bounded successes remain separate. They prove neither a permanent fault nor
  long-term stability. Retain the unchanged >=524288 KiB / avg10<1 gate in
  future authorized operations; no tuning/RCA or new sampling occurs here.
- **Document ambiguity:** both `ADR-023-SITE-PROOF-CLAIMS-DIAGNOSTICS.md` and
  `ADR-023-EXISTING-ACCOUNT-OTP-TEST-OPERATIONS.md` exist in retained histories.
  Use full title, PR/Head and timestamp, not the number alone. No accepted ADR
  is renamed or silently reinterpreted. Legacy paused-send/old-image/old-client
  assertions stay historical, not current execution gates.
- **Expansion, not this trial:** historical same-Tenant two-Site isolation does
  not prove independent cross-Tenant production isolation. Historical lifecycle
  and Application Password tests do not become new-site tests. Cross-Tenant
  production negatives, new users, self-service onboarding, write operations,
  additional clients and public release require their own acceptance scope.
  Confirmed security defects would still block any scope; missing expansion
  evidence is not mislabeled as a confirmed security defect.
- **No health-semantic shortcut:** `/ready` dependency success, the authenticated
  configuration-readiness page and CI success are distinct from product or trial
  acceptance. No endpoint/type/status meaning is changed to obtain a PASS.

## Minimum follow-up operation sheet — NOT EXECUTED

The next separately approved task should first identify already-existing protected
artifacts, without exporting secrets. If they demonstrably cover H6/H7, document
that evidence rather than mechanically creating duplicates. Otherwise plan one
new protected backup per affected host under a dedicated authorization.

1. **Define a coordinated generation.** Record current canonical resource,
   public-key/Site/Grant binding summaries, revocation sequences/deny markers,
   accepted source/image/migration identities, and backup start/end times.
   Temporarily avoid manual pairing, consent, revocation, plugin/theme/schema
   changes during the future backup window; do not disable jobs automatically.
   Background client activity may continue, so absence of manual changes is not
   an atomicity guarantee. Compare critical binding state before/after and stop
   on unexplained drift; do not reset sequences or repeat backup automatically.
2. **WordPress coverage.** A host-local consistent database snapshot must include
   the current identity/connection, revocation and local Grant mapping, with
   matching Connector files and necessary configuration. Reconfirm engine
   consistency assumptions and file manifests; unknown nontransactional tables
   require stopping, not unreviewed locks. Database and files are not inherently
   the same snapshot. Store secrets outside the web root under root-private
   directory/file permissions; temporary DB credentials must not enter argv or
   output and must be precisely cleaned.
3. **Platform coverage.** A protected consistent snapshot must cover the Site,
   business Grant, Provider binding and associated control metadata under the
   actual deployed schema, preserving Site A and existing history. Include
   necessary recovery configuration and immutable artifact references. Audit
   existing signing-key/keyring/passphrase custody and public-key linkage using
   metadata/public identifiers only, not raw secret values or published secret
   hashes. Any missing secret-custody/off-host-transfer work is a distinct task;
   this sheet does not authorize moving secrets.
4. **Verify coverage, not just chronology.** Check exact artifact ownership,
   regular-file/no-link properties, manifest hashes, successful export exit,
   nonempty dump, compression/archive readability and the associated generation's
   binding evidence. A timestamp after OAuth by itself is insufficient. Keep
   backups and secret manifests host-private; return only safe evidence.
   Separate-host snapshots are not a distributed transaction, so document their
   interval and critical-state comparison limits.
5. **Separate restoration levels.** Integrity/readability verification is not an
   isolated restore test. A future isolated restore must be expressly approved,
   network-isolated, and unable to send email, Outbox events or production MCP;
   no automatic migrations/upgrades. A production restore requires its own
   incident/maintenance approval and is not an automatic backup-verification
   step. Do not infer new-snapshot recoverability solely from old CI/restore tests.
6. **Recovery reconciliation.** Before any recovered system resumes service,
   check account/owner/Tenant/resource, Site/public key/kid, business/Provider/local
   Grant/User/Client/Scope bindings, and compatible signing custody. Reconcile
   revocations, Outbox and sequences without erasing deny markers or reviving a
   later-revoked Grant. Mismatch fails closed; no automatic re-pair/re-consent,
   database reset, security bypass or whole-site rollback. Desktop credentials
   are not extracted; any required normal reauthentication is separately scoped.

After follow-up evidence is supplied, reassess only affected gaps and relevant
drift, not another automatic OAuth/MCP regression. The independent decision to
start a bounded trial still remains with the operator.

## Validation, status and stop

Local closeout validation checks Head/CI/source mapping, gate aggregation,
missing recovery evidence, preserved historical status, OTP enabled versus
registration closed, readiness remaining false and output redaction. A local
synthetic policy PASS is not production verification. Hosted CI on this new
document candidate must be attributed to its own Head and likewise is not a
production acceptance run.

Decision rule: verified recovery evidence is a mandatory gate. Its absence is
an explicit **evidence blocker**, yielding BLOCKED without asserting backup
absence. A conflict preventing trustworthy evidence reconciliation yields
NOT_CONFIRMED. Only all hard gates supported could yield candidate PASS; even
then formal readiness stays false under this task's authorization.

```text
P3E2L_EVIDENCE_RECONCILIATION_COMPLETE=True
P3E2L_CURRENT_RECOVERY_COVERAGE_CONFIRMED=False
P3E2L_CURRENT_RECOVERY_COVERAGE_STATUS=NOT_CONFIRMED
P3E2L_CONTROLLED_TRIAL_CANDIDATE=BLOCKED
P3E2L_BLOCKERS=H6,H7

P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=True
P3E2_NEW_SITE_READONLY_MCP_PASS=True
P3E2_NEW_SITE_GRANT_ACTIVE=True
P3D_EMAIL_SEND_PAUSED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

E2K True values and OTP policy above are preserved historical acceptance states,
not new observations of a currently active Grant, healthy host or valid Session.
E2L does not flip any production flag or readiness view. Stop after submitting
this independent document-only Draft PR; do not merge, start a trial, fix a gap,
create a backup, restore, login, call MCP, or modify unrelated user/design files.
