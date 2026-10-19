# P3-E2B: Baota protected-resource metadata ingress repair

Date: 2026-10-19, Asia/Shanghai. **Ingress repair PASS; OAuth/MCP acceptance NOT_RUN.**

## Scope and evidence provenance

The operator approved the bounded PuTTY repair of the `www.wepuu.com` Nginx
vhost and confirmed Baota configuration/certificate/Nginx editing was paused.
Only two exact metadata locations were added. No WordPress permalink, saved
rewrite, plugin, identity, database, platform runtime, firewall, TLS or
Cloudflare setting was changed. No database backup or restore was performed.

Production host execution below is **operator-returned evidence** from the
reviewed, hash-checked command. Assistant evidence consists of direct platform
read-only before/after checks, independent public HTTP verification and local
synthetic helper tests. These sources are not interchangeable.

The earlier E2A metadata404 and OAuth preflight stop remain recorded in
[Draft PR85](https://github.com/wepuu/wp-auto/pull/85), Head
`0becbd25d512289319a65ec67a91d7e1bf2d6607`,
[CI39139501807](https://github.com/wepuu/wp-auto/actions/runs/39139501807).
E1K pairing evidence in PR84 and first-stage records in PR83 were not changed.

## Diagnosis and exact change

Fixed target: `https://www.wepuu.com`; canonical MCP resource:
`https://www.wepuu.com/wp-json/wp-auto/mcp`.

WordPress permalink `/post/%post_id%.html` and the Connector's saved metadata
rewrite were already correct. The existing regex location
`location ~ \.well-known { allow all; }` lacked the front-controller fallback
and superseded the normal prefix route. Prior public and direct-origin
checks failed for both metadata path variants. The existing saved rewrite
selected the Connector handler first, not the other plugin's root discovery
rule. No rewrite flush or permalink save was needed.

The only source-file change was the following block, inside the existing
server after its WordPress rewrite include:

```nginx
# BEGIN WPAuto P3-E2B protected-resource metadata
location = /.well-known/oauth-protected-resource/wp-json/wp-auto/mcp {
    try_files $uri /index.php?$args;
}

location = /.well-known/oauth-protected-resource/wp-json/wp-auto/mcp/ {
    try_files $uri /index.php?$args;
}
# END WPAuto P3-E2B protected-resource metadata
```

Exact locations terminate location search; the missing-static-file fallback
internally uses the existing PHP front controller, without copying PHP config
or inventing metadata. See [Nginx location](https://nginx.org/en/docs/http/ngx_http_core_module.html#location)
and [try_files](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files).
The isolated routing change followed by successful checks supports the current
Nginx ingress diagnosis; it says nothing new about historical Proof failures.

Target file: `/www/server/panel/vhost/nginx/www.wepuu.com.conf`.

| Raw-byte file identity | SHA-256 |
| --- | --- |
| Original vhost | `31570c312ff3bfacadb41fe80ce059032fda967b647a4d13f62e38980c70ed4a` |
| Applied vhost | `2fdde6afeeb306febbafc31e11d5c6e055e85f30faddedfe944e73dff11c7fcf` |

Prior diagnostic hashes of parsed `nginx -T` sections are a different hash
domain, not raw-file hashes. Both domains were checked in their own context;
different section/file hashes are not evidence of configuration drift.

## Gate stops, backup and application

The first delivered command stopped at `host_gate/PLATFORM_GATE_EXPIRED`:
zero configuration changes, backups, reloads or rollbacks. It exited before
the one-shot marker. The one-hour gate was not widened. A refreshed direct
platform baseline at **03:28:10.232316Z** allowed the subsequent execution.

The reused platform checker initially required an active browser account
Session, which had expired. The repair-only invocation was corrected to report
the actual `false` validity while not requiring login for public metadata.
The default OAuth checker still requires a Session; image, migration, OTP,
HMAC and business-state checks were retained. No login recovery or OTP occurred.

Reviewed refreshed command SHA-256:
`a866506f11bc1fecbf5fadc0d1b625f352b26c386a556e4a80395188b28052bb`.
Embedded source SHA-256:
`cd025be84d020b023ce2e9709ae2343aac31db0faa16bb56a2262f5337c9161e`.
The emitted encoded command was round-trip verified before delivery.

Operator execution completed at **03:33:13.561335Z** (11:33:13 Asia/Shanghai).
Private backup directory:

```text
/root/wepuu-e2b-ingress-backup-20261019T033306Z-5cfdc43f0fd6
```

Directory root-owned0700; backup copies and manifest0600. Original source
ownership/modes were recorded separately and preserved. Raw-byte backup
readback and SHA-256 verification passed. No configuration contents or secrets
left the host; no whole-database export was needed for this config-only change.

| Backup copy | Source role | SHA-256 |
| --- | --- | --- |
| `00-www.wepuu.com.conf` | Target vhost | `31570c312ff3bfacadb41fe80ce059032fda967b647a4d13f62e38980c70ed4a` |
| `01-www.wepuu.com.conf` | well-known/ACME include | `060d926803d7385bb9a664f83295d1e74b16adfe144a70417f19de0301d7c0b1` |
| `02-site_total.conf` | extension include | `bddecb920bf220c1b49b5f33c72d971b49b90f26e9130f5c75c221975f8ef32a` |
| `03-f6a989359e70d3c3aaaae5af8cefede5_www.wepuu.com.conf` | redirect include | `ae09d3e5f11c96ddd59e5632a1a1c8d9b67bd5ba8af935404316ca9807d5aeba` |
| `04-enable-php-82.conf` | PHP entry | `e8b44ab82d950822ba8df70f2c706ccc49d5f98444c10707b4ed56c7308f2485` |
| `05-www.wepuu.com.conf` | WordPress rewrite include | `df4a8f75069d528667f3df28fa5b29021060abc6ead19a923636eac1fd97cc33` |
| `06-fastcgi.conf` | FastCGI include | `6deeb10b0fc8cfe670b7d4373d5d9319ef5a82d7f77ace047bed0575cd2cf260` |
| `07-pathinfo.conf` | pathinfo include | `49e9a46da3a83cbf73ada0ea9b7e449cb01956f74578eb8f4f8ec95d07f40847` |

Initial, candidate and final `nginx -t` passed. Application used one normal
reload, **zero restarts and zero rollback reloads**. The helper performed
hash-based compare-before-replace and retained the one-shot marker: **do not
rerun**. The exact diff was limited to the approved block; related includes and
all other effective Nginx sections remained unchanged.

## HTTP and website acceptance

Both access channels retained certificate verification, Host and SNI. Direct
origin used the known WordPress origin address without changing DNS. No
authentication headers, alternative query URLs or cache purge were used.

| Channel | Metadata without trailing slash | Metadata with trailing slash | JSON |
| --- | --- | --- | --- |
| Direct origin, operator receipt | 301, exactly one same-origin redirect, then200 | Direct200 | PASS |
| Public Cloudflare, operator receipt | 301, exactly one same-origin redirect, then200 | Direct200 | PASS |
| Public, assistant independent at03:36:59.253Z | Same allowed301→200 | Direct200 | PASS |

Metadata fields exactly matched the frozen public contract:

```text
resource = https://www.wepuu.com/wp-json/wp-auto/mcp
authorization_servers = [https://auth.wpauto.cc]
scopes_supported = [mcp:read, mcp:content.write, mcp:media.write,
                    mcp:taxonomy.write, mcp:seo.write]
bearer_methods_supported = [header]
```

Publishing the frozen scope list does not authorize write access. Any later
E2A request remains limited to `mcp:read`. Public cache status was DYNAMIC;
the first public observation passed. Bodies were parsed only for necessary
public metadata and not saved. Non-metadata website content was discarded.

The independent unauthenticated MCP GET returned401 and a valid Bearer
challenge referencing metadata. This is a no-credential authentication check,
**not MCP initialization, tool discovery or a tool invocation**.

Operator before/after checks: homepage, login and a known published article
remained200; article selection stayed on-host and no article content was
exported. Unknown ACME token404, denied env/git paths404 and well-known PHP
probe403 remained unchanged. Existing ACME configuration was unmodified;
this is routing-preservation evidence, **not certificate-renewal acceptance**.
Nginx/PHP82/database master identities remained unchanged. Nginx worker
replacement during normal reload is expected, not a service restart.

## Platform and pairing protection postcheck

Assistant direct SSH read-only postcheck at **03:34:31.138798Z** passed against
the fresh baseline. Existing observer visibility was confirmed for Site,
Grant and Attempt tables without changing RLS, roles or permissions.

- Five services healthy; their container identities unchanged; no new abnormal
  restart/OOM found. Available memory1137248KiB, full-memory avg10=0.
- Images and direct Control startup unchanged:

  ```text
  Control: ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e
  Authorization: ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742
  ```

- Migration set/hashes001–013+015, no014; HMAC custody/mount unchanged.
- Actual and persisted OTP sending false; public/origin guards pass; budget99.
  No email was sent or pre-existing reservation reset.
- Target Site remains active and bound to the E1K Tenant/key. Site-ID digest
  prefix235dc1100e44, public-key-material digest prefixbc675abdfbd7 and kid
  digest prefixc4da574d9692 remained the same. Target Grant count remains zero.
- Operator host readbacks confirmed WordPress identity/connection/pending,
  revocation and stored rewrite state unchanged; no Proof or pairing action.
- Site A, its current active Codex Grant/Connector, Site B history, historical
  Attempts and original rows unchanged; no new Grant, Outbox or revocation.
- Reused fields `newAttemptCount=1/newSiteCount=1` describe the historical E1K
  additions against its older baseline, **not E2B additions**. E2B created none.
- Target account Session is expired. Session was not required for this public
  ingress task; no claim of current logged-in browser identity is made.

The operator receipt's `platformPostcheckStillRequired=true` was satisfied by
this separate assistant postcheck; it was not silently treated as already done.

## Local validation, CI and maintenance handoff

Local Python3.14 synthetic helper suite: **34 PASS** (27 focused tests and seven
mocked workflows). Coverage includes missing/duplicate anchors, existing exact
locations, CRLF preservation, CAS drift, expiry, backup failure, config-test
failure, origin/website failure rollback, public-only lag, single-reload budget
and restricted output. No production action was repeated to test the helper.
Actual PHP/state checks ran on the host; local Python tests do not substitute
for those results. The temporary helpers are not runtime repository changes.

This independent branch adds this document only. `git diff --check` is required
before submission; hosted CI status/run and immutable Head are reported in the
Draft PR/final handoff. Hosted CI validates the documentation candidate and
repository checks, **not production routing evidence**. No OCI build,
migration, full database export or OAuth regression was initiated locally for
this routing repair. The original dirty worktree and `design/` are untouched.

Baota configuration editing may resume after this completed acceptance. Future
panel saves/certificate configuration can regenerate the vhost: retain the
approved exact block, and recheck both metadata variants after such changes.
No panel template or permanent monitoring task was installed.

E2A remains stopped. A later separately authorized continuation must recheck
remaining Desktop/project/callback/account gates; expired login must not be
silently recovered or OTP reopened. No Desktop config, OAuth Grant, token,
Consent, MCP tool call or pairing was performed in E2B. This repair does not
establish complete self-service onboarding or public-registration readiness.

```text
P3E2B_ORIGIN_METADATA_PASS=True
P3E2B_PUBLIC_METADATA_PASS=True
P3E2B_INGRESS_REPAIR_PASS=True
P3E2B_CONFIGURATION_ROLLBACK_PERFORMED=False

P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3E2_NEW_SITE_GRANT_ACTIVE=False
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=True
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after the Draft PR/CI handoff. Do not merge any PR or enter E2A automatically.
