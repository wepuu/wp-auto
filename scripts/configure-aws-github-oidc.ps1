[CmdletBinding()]
param(
  [string]$Profile = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$AccountId = '453168420598'
$RoleName = 'wepuu-github-kms-conformance'
$ProviderUrl = 'https://token.actions.githubusercontent.com'
$ProviderArn = "arn:aws:iam::$AccountId`:oidc-provider/token.actions.githubusercontent.com"
$KeyArn = 'arn:aws:kms:us-east-1:453168420598:key/40426a27-701e-4fd3-b17b-4345ed26e2c3'
$Subject = 'repo:wepuu@254826526/wp-auto@1370748793:environment:kms-conformance'
$TemporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ( 'wepuu-aws-oidc-' + [Guid]::NewGuid().ToString('N') )
$TrustPath = Join-Path $TemporaryDirectory 'trust.json'
$PermissionPath = Join-Path $TemporaryDirectory 'permission.json'
$ProfileArgs = if ([string]::IsNullOrWhiteSpace($Profile)) { @() } else { @('--profile', $Profile) }

function Invoke-AwsCli([string[]]$Arguments) {
  & aws @ProfileArgs @Arguments
  if ($LASTEXITCODE -ne 0) { throw "AWS CLI failed: aws $($Arguments[0]) $($Arguments[1])" }
}

New-Item -ItemType Directory -Path $TemporaryDirectory | Out-Null
try {
  $CallerAccount = (& aws @ProfileArgs sts get-caller-identity --query Account --output text).Trim()
  if ($LASTEXITCODE -ne 0 -or $CallerAccount -ne $AccountId) {
    throw "The active AWS session must belong to account $AccountId."
  }

  $Providers = & aws @ProfileArgs iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[].Arn' --output text
  if ($LASTEXITCODE -ne 0) { throw 'Unable to list IAM OIDC providers.' }
  if (($Providers -split '\s+') -notcontains $ProviderArn) {
    Invoke-AwsCli @('iam', 'create-open-id-connect-provider', '--url', $ProviderUrl, '--client-id-list', 'sts.amazonaws.com')
  }

  @{
    Version = '2012-10-17'
    Statement = @(@{
      Effect = 'Allow'
      Principal = @{ Federated = $ProviderArn }
      Action = 'sts:AssumeRoleWithWebIdentity'
      Condition = @{ StringEquals = @{
        'token.actions.githubusercontent.com:aud' = 'sts.amazonaws.com'
        'token.actions.githubusercontent.com:sub' = $Subject
      } }
    })
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $TrustPath -Encoding ascii

  $ExistingRole = & aws @ProfileArgs iam get-role --role-name $RoleName --query Role.Arn --output text 2>$null
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($ExistingRole)) {
    Invoke-AwsCli @('iam', 'update-assume-role-policy', '--role-name', $RoleName, '--policy-document', "file://$TrustPath")
  } else {
    Invoke-AwsCli @('iam', 'create-role', '--role-name', $RoleName, '--description', 'WePuu test-only GitHub OIDC KMS conformance role', '--max-session-duration', '3600', '--assume-role-policy-document', "file://$TrustPath")
  }

  @{
    Version = '2012-10-17'
    Statement = @(@{
      Sid = 'AllowWePuuKmsSigningContract'
      Effect = 'Allow'
      Action = @('kms:DescribeKey', 'kms:GetPublicKey', 'kms:Sign')
      Resource = $KeyArn
    })
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $PermissionPath -Encoding ascii

  Invoke-AwsCli @('iam', 'put-role-policy', '--role-name', $RoleName, '--policy-name', 'WePuuKmsSigningContract', '--policy-document', "file://$PermissionPath")
  Invoke-AwsCli @('iam', 'get-role', '--role-name', $RoleName, '--query', 'Role.{Arn:Arn,MaxSessionDuration:MaxSessionDuration}', '--output', 'json')
  Write-Output 'AWS_GITHUB_OIDC_CONFIGURED=True'
} finally {
  Remove-Item -LiteralPath $TemporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
