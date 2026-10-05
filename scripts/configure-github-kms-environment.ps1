[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^arn:aws:iam::453168420598:role/[A-Za-z0-9+=,.@_/-]{1,128}$')]
  [string]$RoleArn,

  [ValidatePattern('^(main|codex/[A-Za-z0-9._/-]+)$')]
  [string]$AllowedBranch = 'codex/phase-2-0-6-security-resilience'
)

$ErrorActionPreference = 'Stop'
$Repository = 'wepuu/wp-auto'
$Environment = 'kms-conformance'
$Branch = $AllowedBranch

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

foreach ($Policy in @($Policies.branch_policies | Where-Object { $_.name -ne $Branch })) {
  gh api --method DELETE `
    "repos/$Repository/environments/$Environment/deployment-branch-policies/$($Policy.id)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to remove obsolete GitHub environment branch $($Policy.name)." }
}

$Variables = [ordered]@{
  AWS_KMS_TEST_REGION = 'us-east-1'
  AWS_KMS_TEST_KEY_ID = 'arn:aws:kms:us-east-1:453168420598:key/40426a27-701e-4fd3-b17b-4345ed26e2c3'
  AWS_KMS_TEST_KID = 'wepuu-test-2026-01'
  AWS_KMS_SECOND_TEST_KEY_ID = 'arn:aws:kms:us-east-1:453168420598:key/3762ff1b-3974-4b37-8569-a68b906dee2a'
  AWS_KMS_SECOND_TEST_KID = 'wepuu-test-2026-02'
  AWS_KMS_TEST_ROLE_ARN = $RoleArn
  AWS_KMS_TEST_ACCOUNT_ID = '453168420598'
}

foreach ($Entry in $Variables.GetEnumerator()) {
  gh variable set $Entry.Key --repo $Repository --env $Environment --body $Entry.Value
  if ($LASTEXITCODE -ne 0) { throw "Unable to set GitHub variable $($Entry.Key)." }
}

Write-Output 'GITHUB_KMS_ENVIRONMENT_CONFIGURED=True'
Write-Output "GITHUB_KMS_ALLOWED_BRANCH=$Branch"
