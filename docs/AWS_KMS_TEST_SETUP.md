# AWS KMS Test Setup

This procedure validates an existing disposable AWS KMS asymmetric RSA key.
It does not create, rotate, disable, schedule deletion of, or deploy the key.
Never paste AWS credentials into chat, `.env`, repository files, CI logs, or
GitHub repository variables.

## Required key profile

- key type: asymmetric;
- key usage: `SIGN_VERIFY`;
- key spec: `RSA_2048`, `RSA_3072`, or `RSA_4096`;
- enabled state;
- signing algorithm includes `RSASSA_PKCS1_V1_5_SHA_256`;
- a non-production key with a narrowly scoped key policy.

The caller needs only these KMS actions on the one test key:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WePuuKmsConformance",
      "Effect": "Allow",
      "Action": [
        "kms:DescribeKey",
        "kms:GetPublicKey",
        "kms:Sign"
      ],
      "Resource": "<TEST_KEY_ARN>"
    }
  ]
}
```

The KMS key policy must also permit the selected IAM principal or delegate to
IAM policies in the account. Do not grant `kms:*`, key administration,
encryption/decryption, grant management, rotation, or deletion permissions.

## Local test

For a personal account without IAM Identity Center, use AWS CLI 2.32.0 or later
to authenticate with console credentials and receive temporary local
development credentials. Do not use the root account. Give the test IAM
user/role both AWS managed `SignInLocalDevelopmentAccess` and the single-key
KMS policy above, then sign in to the console as that identity:

```powershell
aws login --profile wepuu-kms-test --region <key-region>
aws sts get-caller-identity --profile wepuu-kms-test

$env:AWS_PROFILE = 'wepuu-kms-test'
$env:AWS_SDK_LOAD_CONFIG = '1'
$env:AWS_REGION = '<key-region>'
$env:WEPUU_KMS_KEY_ID = '<full-key-arn-or-key-id>'
$env:WEPUU_KMS_KID = 'wepuu-test-2026-01'

powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-live-kms.ps1
```

End the temporary browser-backed session after testing:

```powershell
aws logout --profile wepuu-kms-test
```

If IAM Identity Center is already configured and an administrator has supplied
an AWS access portal URL, `aws configure sso` and `aws sso login` remain valid.
Do not invent an SSO Start URL or enable Identity Center solely for this test.

`WEPUU_KMS_KID` is a public JOSE identifier, not a secret. It must be stable
for the key, unique within the issuer JWKS, and match
`^[A-Za-z0-9_-]{8,128}$`.

If SSO is unavailable, temporary STS credentials may be set only in the current
PowerShell process:

```powershell
$env:AWS_ACCESS_KEY_ID = '<temporary-access-key-id>'
$env:AWS_SECRET_ACCESS_KEY = '<temporary-secret-access-key>'
$env:AWS_SESSION_TOKEN = '<temporary-session-token>'
```

Run the same script, then remove the temporary credentials immediately:

```powershell
Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
```

Successful output contains one passing live KMS test and never prints the key
contents or credentials. `KeyCustodyUnavailableError` means the key profile,
region, key/key-IAM policy, credential source, or network path failed closed.

## Hosted GitHub Actions test

Use GitHub OIDC; do not create GitHub secrets containing AWS access keys.

The exact role policy, immutable GitHub subject, environment automation, and
current Phase 2.0.3 branch restriction are maintained in
[`AWS_KMS_GITHUB_OIDC_SETUP.md`](AWS_KMS_GITHUB_OIDC_SETUP.md).

1. Create or reuse the AWS IAM OIDC provider for
   `https://token.actions.githubusercontent.com` with audience
   `sts.amazonaws.com`.
2. Create a dedicated role with the three-action KMS policy above.
3. Restrict its trust policy to the `wepuu/wp-auto` repository and the
   `kms-conformance` GitHub environment.
4. In GitHub, create the protected environment `kms-conformance`, restrict its
   deployment branches, and require approval where available.
5. Add these non-secret environment variables:
   - `AWS_KMS_TEST_ACCOUNT_ID`
   - `AWS_KMS_TEST_ROLE_ARN`
   - `AWS_KMS_TEST_REGION`
   - `AWS_KMS_TEST_KEY_ID`
   - `AWS_KMS_TEST_KID`
6. Manually run the `Phase 2 Platform Foundation` workflow with
   `live_kms=true`.

This repository was created on 2026-09-15 and GitHub reports immutable OIDC
subjects enabled. Its exact current environment subject is:

```text
repo:wepuu@254826526/wp-auto@1370748793:environment:kms-conformance
```

Use the following trust condition and additionally restrict the GitHub
environment to `codex/phase-2-0-3`:

```json
{
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
    "token.actions.githubusercontent.com:sub": "repo:wepuu@254826526/wp-auto@1370748793:environment:kms-conformance"
  }
}
```

The environment's deployment branch policy enforces the branch restriction.
If the branch is merged later, intentionally change that policy to `main`. Do
not replace either repository or branch with a wildcard.

The workflow pins all external Actions to immutable commit SHAs and requests
`id-token: write` only in the live KMS job.
