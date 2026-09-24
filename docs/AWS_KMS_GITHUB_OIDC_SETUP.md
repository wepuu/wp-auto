# AWS KMS hosted-CI acceptance

This test-only setup lets GitHub Actions use the existing RSA KMS key through
short-lived OIDC credentials. It does not store an AWS access key in GitHub.

## AWS trust boundary

Create the IAM OIDC provider once for
`https://token.actions.githubusercontent.com` with audience
`sts.amazonaws.com`. AWS CLI/API callers may omit the certificate thumbprint;
AWS retrieves it when the provider is created.

Create a role named `wepuu-github-kms-conformance` with this trust policy. The
repository uses GitHub's immutable subject format, so the numeric owner and
repository IDs are intentional:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::453168420598:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:wepuu@254826526/wp-auto@1370748793:environment:kms-conformance"
        }
      }
    }
  ]
}
```

Attach only this inline permission policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowWePuuKmsSigningContract",
      "Effect": "Allow",
      "Action": ["kms:DescribeKey", "kms:GetPublicKey", "kms:Sign"],
      "Resource": "arn:aws:kms:us-east-1:453168420598:key/40426a27-701e-4fd3-b17b-4345ed26e2c3"
    }
  ]
}
```

Do not add `kms:Decrypt`, wildcard resources, IAM mutation permissions, or a
GitHub AWS access-key secret.

With a temporary AWS session that can manage IAM providers, roles, and inline
role policies in this account, the repository script applies exactly the two
policies above and removes its temporary JSON files:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\configure-aws-github-oidc.ps1 `
  -Profile '<temporary-admin-profile>'
```

The existing `wp-mcp-test` user intentionally has only KMS signing access and
cannot create this role. Do not expand that user's long-lived permissions;
use a separate short-lived administrator session for this one-time IAM setup.

## GitHub environment

After the AWS role exists, configure the public repository environment and its
branch restriction:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\configure-github-kms-environment.ps1 `
  -RoleArn 'arn:aws:iam::453168420598:role/wepuu-github-kms-conformance'
```

The script permits only `codex/phase-2-0-3` to use `kms-conformance` and sets
the five non-secret environment variables consumed by the pinned workflow.
The workflow receives a short-lived role session only after GitHub issues the
environment-bound OIDC token.

Pushing Phase 2.0.3 and dispatching `live_kms=true` remain separately gated.
