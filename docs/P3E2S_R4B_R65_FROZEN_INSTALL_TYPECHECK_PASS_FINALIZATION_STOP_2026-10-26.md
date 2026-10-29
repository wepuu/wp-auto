# P3-E2S-R4B R65 — Frozen installs and strict compilation passed; finalization not confirmed

Date: 2026-10-26  
Scope: isolated local candidate validation only  
Source HEAD: 24fba1c4dc8c30eb1c66a329a59d5b402651f67a  
Branch: codex/p3e2sr4b-source-integration

## Outcome and stop

The one authorized container run completed both frozen installs, standard
patch application, network-isolated current-source build, and the complete
18-test-file strict typecheck successfully. The actual Docker export smoke and
formal 11-file-plus-manifest custody checks also passed.

The outer launcher nevertheless exited 1. Its final container-filesystem
postcheck did not return a confirmed result. Overall R65 is **not a pass**.
The 11 formal candidates were **not materialized** into the source worktree.
There was no automatic retry, second container run or follow-up Docker call
after the failure. The retained stopped container and private artifacts remain
available; this record does not authorize using them to bypass the missing gate.

## New wiring and offline checks

New files only:

- scripts/run-r65-types-once.mjs
- test/persistent-authorization/r65/protocol.mjs
- test/persistent-authorization/r65/worker.mjs
- test/persistent-authorization/r65/entry-fault-tests.mjs
- test/persistent-authorization/r65/contracts.synthetic.mjs
- This record

The R62 worker was copied into a new R65 path with scoped paths/run identity,
the pre-install export handshake and the matching fault-test root. Existing
R61–R64 tools, shared ACL checker, templates and historical records were not
edited. The R62 scalar lock comparator and R64 custody functions were reused.

Before Docker, four syntax checks passed. Pure checks passed:

| Suite | Checks | Evidence scope |
| --- | ---: | --- |
| R62 | 31 | Scalar lock schema, exact patch bytes, graph and count guards |
| R64 | 67 | Fixed paths/manifests, preprotection order, stop behavior, safe error projection |
| R65 | 44 | Fixed export fixture, exact acknowledgement, run/hash mismatch rejection, artifact metadata, acceptance counters and static wiring guards |

These are not production or full repository regression results. R65 static
wiring assertions are not represented as actual Windows/Docker behavior.

The launcher protects the private evidence root and retained inputs. For each
Docker export, R64 prepares the exact nested directory tree and verifies its
ACL before receiving. Docker copies contents using the source '/.' form into
a separate owned buffer. A second, exclusive manifest copy populates the
accepted tree; its bytes, complete inventory and ACL are rechecked. Docker
copy itself is not claimed to provide exclusive-write semantics.

The container's fixed synthetic 12-file export must pass host custody before
a run-ID/manifest-bound acknowledgement releases installation. There is no
host read-write source mount or application service startup.

References: [Docker copy semantics](https://docs.docker.com/reference/cli/docker/container/cp/)
and [pnpm frozen-install semantics](https://pnpm.io/cli/install).
The actual pnpm version/capabilities were checked inside the fixed image;
current online documentation is not a substitute for that version check.

## Execution identity and budget

Run: r65-formal-20261026151245462  
Container: wepuu-r65-formal-20261026151245462  
UTC start: 2026-10-26T15:12:45.463Z  
Main checks finished: 2026-10-26T15:16:43.830Z  
Monotonic main elapsed: 238.3687975 seconds; receipt validation followed.

Fixed tool image:
sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c

Image revision: c404ed52228ce5492a85674547998d2f5d31772e  
Container tools: Node v24.22.1, pnpm 11.19.0, TypeScript 5.9.3  
Host utility: Node v26.11.1, executable SHA-256
a619e2e09eb0d50ef4c733d678b4d22689d2afef138cd67fd3fa107b535f8819.

One local desktop-linux container, no pull or image build, 2 GiB memory,
2 CPUs, dropped capabilities, no-new-privileges, no application healthcheck
and no Docker log payload. All host input mounts were read-only.
Initial D: available bytes were 5775663104, above the existing 5 GiB gate.
This was not a free-space cleanup operation.

## Actual stage results

| Stage | Result |
| --- | --- |
| Current input snapshot: 110 files / 18 directories / 10 projects | PASS |
| Six original R61 artifacts and seven pinned templates | PASS |
| Original-to-candidate graphs: root 285 packages / support 6 | PASS |
| Retained six-file input custody | PASS |
| Actual synthetic Docker export: 12 files / 10 directories | PASS |
| Synthetic exclusive acceptance copy and acknowledgement | PASS |
| Root frozen install: one invocation, 180-second maximum | PASS, exit 0 |
| Type-support frozen install: one invocation, 180-second maximum | PASS, exit 0 |
| Standard pnpm application of both declaration patches | PASS |
| Unchanged runtime package files and lock bytes | PASS |
| Docker bridge disconnection before compilation | PASS |
| Container interfaces internal-only before compilation | PASS |
| Typecheck entry tests | PASS, 3 cases |
| Entry safe-failure controls | PASS, 3 checks / 2 deliberate injections / 0 real compiler programs |
| Current-source build: one invocation, 120-second maximum | PASS, exit 0, no diagnostics |
| Full strict typecheck: one invocation, 60-second maximum | PASS |
| Candidate/reference preservation inside container | PASS |
| Formal Docker export buffer: 12 files / 10 directories | PASS |
| Formal exclusive accepted tree, inventory/hash/ACL rechecks | PASS |
| Container stopped naturally, exit 0, no OOM | PASS |
| Final original /workspace filesystem-diff postcheck | NOT_CONFIRMED |
| Host source, snapshot, execution-tool preservation | PASS |
| Receipt hash, ACL and complete readback | PASS |
| Formal 11-file source materialization | NOT_RUN |

The full typecheck observed 18 test files, 25 root files and 1014 program
files, with zero errors and no diagnostic truncation. Node, Bun and React
ambient types were present. Actual declarations used matched:

- Better Auth crud-members.d.mts:
  7d630c56ab1dcd4e575772d12e50345ed0b69b3684da5fbc66628a67f2242343
- Bun globals.d.ts:
  c0c045ca0430b373e889575b5990aab3eddc23f5a8f8766cafbb6c8cec567b67
- Bun overrides.d.ts:
  6da206fe98e896b8dbe664a39005d54af7bc468ecf7f4d7ed70008e887b7e5fb

No strict option was relaxed; skipLibCheck remained false. Both successful
installs used clean candidate dependency directories, not the earlier manual
declaration overlays. There were zero lock-generation attempts.

## Earliest unconfirmed finalization call

Recorded failure:

- stage: owned_container_finalization
- category: CUSTODY_INPUT_OR_INTERNAL_FAILURE
- operation: NOT_OBSERVED
- code: NOT_OBSERVED

The successful stopped/exit/OOM fields were recorded before this call:

    docker --context desktop-linux diff wepuu-r65-formal-20261026151245462

The originalWorkspaceDiffCount field was never set. Reading the executed
launcher therefore narrows the unconfirmed operation to the diff acquisition/
processing point, before the count and its assertion. The invocation captures
the complete Docker diff before filtering for /workspace and has a 2 MiB
maxBuffer. That is a bounded-output design risk, **not proof** that this run
failed because the buffer was exceeded.

The underlying child-process code, output-limit status, timeout and raw error
were not retained by the reused projection. They remain NOT_OBSERVED. No
post-failure retry was used to fill in the historical failure.

A later separately approved continuation can focus on safely recovering this
postcheck from the existing stopped container after identity/preservation
checks. It need not automatically repeat successful installs or compilation.
It must keep this failed outer result immutable and must not infer a clean
/workspace from an unavailable diff.

## Custody, hashes and preservation

Private evidence root:

C:\Users\liulo\AppData\Local\Temp\wepuu-r65-custody-pfk9VK

| Evidence | SHA-256 |
| --- | --- |
| receipts/result.json | e13475d996507d48e03a01e6bdee4a1f10c82ea3a10a5a5b26316538851904b3 |
| completion.json | 1d96c936b91d503b95de1ebc80c98959d9a65501456bf6e664275fbff12a672e |
| worker-result.json | 779582c8ff7526fb0ada7223b1c2f630a380eb53d6ba1ffa40c5d55bd768edb3 |
| validated-artifacts/manifest.json | ac035cdb25d67d5c853e6e135003fe006e4a5203b091b62c17796c33bf6f2ea8 |
| Executed R65 launcher | 471ae60e914a15f3fa975df794c6712139268c33efe0ebb044fe8fb9321d5997 |
| Executed R65 worker | d95d7920deeda12256c33f077abbace77900c7ae996e7d3a80f5045958c36127 |
| R65 protocol | 3eebe90e76b42a1306901273e5f60b121d94a8946ed2d16f9ed47429946ccdac |
| R65 pure checks | 41d4f430ad5034a53563a79aa4f9a063ab32ff091020fe74234623253ee3c37b |
| R65 entry fault checks | 00957c3a0f365bbb2926fa81ee5443f037071291ed90a8d7a4ddc849c985e5d9 |

The receipt describes MAIN_CHECKS_BEFORE_RECEIPT_VALIDATION. The final
completion projection separately confirms receipt validation. Both report
overall failure; receipt success does not erase that failure.

The original source manifest stayed:
3196dce82111458874be7b1f1eb9346b5e8ed727a5617289e72a257f2558af11.

The real source root lock stayed:
cea3bc64773f878a668cabeb9d366086f69ad2c6921e5095ed6d49292bddad87.

The private artifacts retain candidate locks:
root 24d62efb3d26ff866f7c295198c28c73c85a8e05363b0148a666c2aee0596ff0;
support 0998fa8988c40cf13f25116f517edd56c54ce5cca8694c7902c5272cd1ae1482.
These were not applied to the actual worktree. The tracked source diff remains
empty. Existing untracked task tools and historical records were preserved.

No production, WordPress, business database/service, OAuth/MCP, migration,
deployment, OTP, credential-store, real node_modules, design/, commit,
push, PR or merge operation occurred. No WordPress content or tool payload
entered the control plane. No container/image/volume/cache/evidence was
deleted. Historical limited internal read-only trial authorization is not
reinterpreted by this candidate's status.

## Status

    P3E2SR4BR65_DOCKER_EXPORT_INTEGRATION_PASS=True
    P3E2SR4BR65_ROOT_FROZEN_INSTALL_PASS=True
    P3E2SR4BR65_SUPPORT_FROZEN_INSTALL_PASS=True
    P3E2SR4BR65_NETWORK_ISOLATED_BUILD_PASS=True
    P3E2SR4BR65_FULL_18_FILE_TYPECHECK_PASS=True
    P3E2SR4BR65_VALIDATED_ARTIFACT_CUSTODY_PASS=True
    P3E2SR4BR65_CONTAINER_WORKSPACE_POSTCHECK_PASS=False
    P3E2SR4BR65_EXACT_11_FILES_MATERIALIZED=False
    P3E2SR4BR65_FINAL_RECEIPT_VERIFIED=True
    P3E2SR4BR65_CONTAINER_ATTEMPTS=1
    P3E2SR4BR65_FROZEN_INSTALL_ATTEMPTS=2
    P3E2SR4BR65_LOCK_GENERATION_ATTEMPTS=0
    P3E2SR4BR65_OVERALL_PASS=False
    P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
    NOT_READY_FOR_PUBLIC_REGISTRATION=True

Stop. Full repository regressions and Hosted CI remain NOT_RUN.
