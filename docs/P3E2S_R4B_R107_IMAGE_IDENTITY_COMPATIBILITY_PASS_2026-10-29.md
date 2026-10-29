# R107: local identity compatibility passed with explicit config provenance

## Candidate contract

Head1349f468a7d646dae6330569f61365799fa36939.
Before modification R101 guard passed. Only existing pin and postgres-image-gate
changed; tests and this independent record added. Old pin/source hashes and
R105/R106 histories remain in immutable parent manifests.

Pin schema2 distinguishes repositoryDigest (platform manifest) from
expectedConfigDigest, records exact manifest mediaType and hashes of the
R101 validation document and result. Fixed16.10,linux/amd64 andPGDATA unchanged.
Schema1 continues only config-ID acceptance; it never gains manifest-ID mode.
Plan internally retains expectedImageId as a config alias for old tool
compatibility, but schema2 pin no longer uses that ambiguous field.

Both modes enforce RepoDigest,platform and exactly one value per critical Env.
CONFIG_ID requires actual Id=config digest and, if Descriptor is present,
an exact manifest descriptor. MANIFEST_DESCRIPTOR_ID requires schema2,
Id=repositoryDigest, exact Descriptor digest/mediaType and verified evidence.
Evidence checks read only pin-listed local files,verify original hashes and
the R101 success/platform/configuration/mapping. Evidence failure closes
before inspect, and explicit preparation verifies it before pull.
No Registry request occurs. No arbitrary index/unknown ID fallback is accepted.

Result.imageId remains the real daemon value; configDigest,identityMode and
configBindingEvidenceVerified are separate. The matrix continues to run
the pinned repository reference,not result.imageId,with --pull=never.
Preparation and matrix consume the same pin. Workflow and other image checks
are unchanged. This is a local test-artifact contract,not product API/DB/OAuth.

## Offline tests

Sixteen new cases passed: manifest/config/classic modes, missing/wrong/index
Descriptor,wrong ID/repository/platform/version/duplicate Env, missing evidence,
wrong hash,nonmatching historical receipt,unknown schema,and pull-then-inspect
sequencing with mocks. The historical receipt negative is rejected by the
unchanged expected hash before it can authorize a mapping.
Forty-seven R101/R93 compatibility replay cases passed. These are not a
claim that original R93 assumptions about the current real pin still apply.
No Docker calls used by offline tests.

## One actual read-only acceptance

UTC2026-10-29T14:28:16.192Z–14:28:17.754Z;
Asia/Shanghai22:28:16.192–22:28:17.754. Monotonic1562ms.
Fixed CLI29.8.0/hash,default named pipe andLinux daemon gates passed.
Exactly one image inspect,149ms,exit0; no platform option or alternate reference.
Same response replayed in memory into old-shape config-ID and new checks.

| Property | Actual |
| --- | --- |
| RepoDigest / actual Id / Descriptor digest | sha256:ab8380566c3ea09690a9ecaa85a59d82bfc6eb86744151a2a54335866c83a3e9 |
| Verified config digest | sha256:aab18c983342019900e3a4a617c63432fd5e34449323ab04187a8e8c1ee3dbad |
| Descriptor mediaType | application/vnd.oci.image.manifest.v1+json |
| Selected mode | MANIFEST_DESCRIPTOR_ID |
| Configuration | linux/amd64;PG_MAJOR16;PG_VERSION16.10;expectedPGDATA,each unique |
| Config binding evidence | verified |

Legacy config-ID predicate rejects; new mode passes. The original unfiltered
response drives acceptance; only safe projection retained. No full Env,Config,
labels,stderr or raw response saved. Four CLI commands total:version,context,
info,and one image inspect. Ledger claimed/finalized once; all processes ended.

result.json pinChanged=false/gateChanged=false are inherited per-live-phase
flags: live execution itself performed no writes to those files. They do NOT
describe the whole task, which intentionally changed pin and gate beforehand.
This record and the supplemental candidate manifest are authoritative for
the task change scope; do not report those inherited flags as final task state.

## Evidence limits and protections

Daemon is a trusted local runtime. Exact fixed manifest/descriptor plus the
hash-verified R101 manifest-to-config mapping establishes provenance association.
Local config raw bytes were not independently read. Moby upstream implements
Id from target descriptor while reading config separately:
https://raw.githubusercontent.com/moby/moby/master/daemon/containerd/image_inspect.go
This supports the design but is not this daemon's fixed source/build identity.
R105's historical response was not retained; no retrospective cause confirmed.

R107 manifest explicitly overrides only gate and pin against R93 parent;
the prior R101 gate/pin identities remain in R101 manifest. Other parent
candidates,117 inputs,R91 supplemental and history sources matched.
No source/identity evidence weakened to accept arbitrary content.

```text
R107_OFFLINE_IDENTITY_CONTRACT_PASS=True
R107_MANIFEST_CONFIG_EVIDENCE_PASS=True
R107_SINGLE_LOCAL_INSPECT_PASS=True
R107_LOCAL_IMAGE_IDENTITY_PASS=True
R107_IDENTITY_MODE=MANIFEST_DESCRIPTOR_ID
R107_PROTECTED_INPUTS_VERIFIED=True
R107_PULL_ATTEMPTS=0
R107_CONTAINER_CREATED=False
R107_DATABASE_STARTED=False
R107_HOSTED_CI_TRIGGERED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

No pull,Registry query,cleanup,container,DB,build,commit/push,merge,CI,
production,OAuth/MCP,deployment or migration. Stop after this acceptance.
Next task is candidate submission-scope review and one Hosted full regression;
local identity acceptance is not complete candidate or release acceptance.
