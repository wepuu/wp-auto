# R101: fixed PostgreSQL16.10 metadata and offline preparation gate accepted

## Single metadata execution

Head1349f468a7d646dae6330569f61365799fa36939. UTC2026-10-29
12:38:26.647–12:38:30.822; Asia/Shanghai20:38:26.647–20:38:30.822.
Monotonic4174ms. One attempt, six requests:401/200/200/200/307/200.
CDN host production.cloudfront.docker.com; config8823bytes.

| Role | Verified digest |
| --- | --- |
| Index | sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297 |
| linux/amd64 manifest | sha256:ab8380566c3ea09690a9ecaa85a59d82bfc6eb86744151a2a54335866c83a3e9 |
| Config / metadata-derived ImageID | sha256:aab18c983342019900e3a4a617c63432fd5e34449323ab04187a8e8c1ee3dbad |

Original hashes,descriptor sizes,unique platform and all metadata checks passed.
PG_MAJOR=16,PG_VERSION=16.10,PGDATA=/var/lib/postgresql/data each occurred once.
Only public PG_VERSION was projected as16.10; no whole Env/config was saved.
No current tag lookup, historical-index request, layer or retry occurred.
Both Agents closed and the exclusive ledger was finalized. TLS and proxy
checks stayed enabled; Registry credentials never reached the CDN. Signed
URL/query and Token were not retained. result.json is the safe live receipt.
Its existingPinChanged=false describes the network phase, before the separately
authorized pin update below; it is not the task's final pin state.

## Approved pin and gate change

Pin now uses the platform manifest as repositoryDigest and config as
expectedImageId, with verified provenance linking this record and the receipt.
Version16.10,major16,platform and data directory requirements remain unchanged.
Historical721873… index and R100 version rejection were not reinterpreted.
Old observedNotAccepted metadata remains historical, superseded for candidate
acceptance by this verified mapping, not rewritten as a prior pass.

postgres-image-gate requires exactly one value per critical Env key, rejecting
duplicates/conflicts. No workflow or historical script changed in R101.
The preparation entry and matrix read the same pin; only explicit preparation
pulls. Matrix inspect and --pull=never behavior remain unchanged.
This is metadata/contract acceptance, not PostgreSQL binary or image-run proof.

## Tests and preserved failure

Pre-network:20 CDN controls,19 inherited metadata scenarios,9 inherited entry
controls and7 safe-version projection controls passed. No synthetic network
service or daemon was used. Fixed Nodev26.11.1/native proxy/source guards passed.

After pin update, direct original R93 execution stopped at its second case:
real_pin_unconfirmed_rejects_before_any_command. That historical assertion
expects the old real pin to be unconfirmed; this failure is retained, not
represented as an original R93 pass.

Independent R101 compatibility replay preserves all47 cases and changes only
that case's input to an explicit synthetic historical unconfirmed pin.
All47 passed. Thirteen new actual-pin and duplicate/conflicting Env controls
passed with injected executors, including exact pull-then-inspect sequencing.
offline-result.json separately records the direct failure and replay results.

candidate-inputs.json references the immutable R93 parent hash and only two
approved overrides (pin and gate), plus the new offline test hashes.
post-guard verifies those overrides,other parent candidates,117 base inputs,
R91 supplemental inputs,Head and R97–R100/tool identities. All passed.
Old manifests,records and ledgers were not reset. Existing unrelated dirty work
remains untouched. The pre-network sources.json freezes network tools; new
post-pin tests are separately frozen in the supplemental manifest.

## Final verdict and stop

```text
R101_OFFLINE_TOOLING_PASS=True
R101_FIXED_CANDIDATE_CHAIN_PASS=True
R101_POSTGRES_16_10_METADATA_PASS=True
R101_PIN_UPDATED=True
R101_PREPARATION_CONTRACT_OFFLINE_PASS=True
R101_PROTECTED_INPUTS_VERIFIED=True
R101_DOCKER_STARTED=False
R101_IMAGE_LAYERS_DOWNLOADED=False
R101_HOSTED_CI_TRIGGERED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

No Docker invocation,dependency install,cleanup,commit/push,CI,production,
OTP,actual OAuth/MCP,deployment or migration occurred. Public API,product types
and security contracts are unchanged. No historical runner-local image state
or binary version was reconstructed from metadata.

Stop here. Next task is explicit fixed-platform pull/inspect and bounded
preparation acceptance, followed only later by a separately authorized Hosted
regression. This record does not authorize either operation or deployment.
