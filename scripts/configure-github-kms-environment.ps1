[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^arn:aws:iam::453168420598:role/[A-Za-z0-9+=,.@_/-]{1,128}$')]
  [string]$RoleArn
)

$ErrorActionPreference = 'Stop'
$Repository = 'wepuu/wp-auto'
$Environment = 'kms-conformance'
$Branch = 'codex/phase-2-0-3'

gh api --method PUT "repos/$Repository/environments/$Environment" `
  -F 'deployment_branch_policy[protected_branches]=false' `
  -F 'deployment_branch_policy[custom_branch_policies]=true' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to create the GitHub environment.' }

$Policies = gh api "repos/$Repository/environments/$Environment/deployment-branch-policies" | ConvertFrom-Json
if (-not @($Policies.branch_policies | Where-Object { $_.name -eq $Branch }).Count) {
  gh api --method POST "repos/$Repository/environments/$Environment/deployment-branch-policies" `
    -f "name=$Branch" -f 'type=branch' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict the GitHub environment branch.' }
}

$Variables = [ordered]@{
  AWS_KMS_TEST_REGION = 'us-east-1'
  AWS_KMS_TEST_KEY_ID = 'arn:aws:kms:us-east-1:453168420598:key/40426a27-701e-4fd3-b17b-4345ed26e2c3'
  AWS_KMS_TEST_KID = 'wepuu-test-2026-01'
  AWS_KMS_TEST_ROLE_ARN = $RoleArn
  AWS_KMS_TEST_ACCOUNT_ID = '453168420598'
}

foreach ($Entry in $Variables.GetEnumerator()) {
  gh variable set $Entry.Key --repo $Repository --env $Environment --body $Entry.Value
  if ($LASTEXITCODE -ne 0) { throw "Unable to set GitHub variable $($Entry.Key)." }
}

Write-Output 'GITHUB_KMS_ENVIRONMENT_CONFIGURED=True'
Write-Output "GITHUB_KMS_ALLOWED_BRANCH=$Branch"
