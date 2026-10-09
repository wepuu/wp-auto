# Phase 2.0.4 Real AWS KMS Rotation Gate

> Historical Phase 2.0.4 evidence only. ADR-016 replaced this harness with the
> local PKCS#8 lifecycle tests; its KMS script is intentionally absent.

This external exit gate requires two distinct enabled asymmetric RSA
`SIGN_VERIFY` keys in the same test region. Both keys permit only
`kms:DescribeKey`, `kms:GetPublicKey`, and `kms:Sign` to the test principal or
GitHub OIDC role. No private key is exported.

In one temporary PowerShell session, set the existing and replacement public
identifiers and key ARNs. Supply AWS credentials through the already-approved
temporary environment or GitHub OIDC session; never write them to this file,
`.env`, logs, or Git.

```powershell
Set-Location D:\Codex\wp-platform
$env:AWS_REGION = 'us-east-1'
$env:WEPUU_KMS_KEY_ID = '<existing-key-arn>'
$env:WEPUU_KMS_KID = 'wepuu-test-current'
$env:WEPUU_KMS_SECOND_KEY_ID = '<replacement-key-arn>'
$env:WEPUU_KMS_SECOND_KID = 'wepuu-test-next'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-live-kms-rotation.ps1
```

The script creates a disposable PostgreSQL database and combines the two real
KMS public descriptors with the production lifecycle repository. It proves
`active + published`, activation after the minimum twenty-minute publication
window, `active + retiring` JWKS overlap, signer selection changing to the new
key, and authoritative removal of the old key. Both real keys also sign fixed,
content-free test inputs without private-key export.

Final acceptance records only key ARNs/kids, method names, status, and public
JWK thumbprints. Remove broadened IAM permission and schedule deletion of the
temporary second key only after local evidence and any separately authorized
hosted `live-kms-rotation` job have completed.

## Local result

The credentialed gate passed on 2026-09-28 in the pinned Node 26.7 container
with one test, zero failures and zero skips. The existing key
`wepuu-test-2026-01` and temporary key `wepuu-test-2026-02` proved the complete
repository lifecycle and JWKS transition. The disposable PostgreSQL container,
Docker network and Node test image were absent after cleanup. The temporary AWS
key remains enabled only because hosted CI is still separately gated and has
not been authorized.
