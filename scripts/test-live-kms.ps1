[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$required = @('AWS_REGION', 'WEPUU_KMS_KEY_ID', 'WEPUU_KMS_KID')
$missing = @($required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) })
if ($missing.Count -gt 0) {
  throw "Missing required variables: $($missing -join ', ')"
}

$kid = [Environment]::GetEnvironmentVariable('WEPUU_KMS_KID')
if ($kid -notmatch '^[A-Za-z0-9_-]{8,128}$') {
  throw 'WEPUU_KMS_KID must match ^[A-Za-z0-9_-]{8,128}$.'
}

$hasProfile = -not [string]::IsNullOrWhiteSpace($env:AWS_PROFILE)
$hasEnvironmentCredentials =
  -not [string]::IsNullOrWhiteSpace($env:AWS_ACCESS_KEY_ID) -and
  -not [string]::IsNullOrWhiteSpace($env:AWS_SECRET_ACCESS_KEY)

if (-not $hasProfile -and -not $hasEnvironmentCredentials) {
  throw 'Set AWS_PROFILE or temporary AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY credentials before testing.'
}

$env:AWS_SDK_LOAD_CONFIG = '1'
$env:WEPUU_LIVE_KMS = '1'

Write-Output "AWS_REGION_SET=$(-not [string]::IsNullOrWhiteSpace($env:AWS_REGION))"
Write-Output "WEPUU_KMS_KEY_ID_SET=$(-not [string]::IsNullOrWhiteSpace($env:WEPUU_KMS_KEY_ID))"
Write-Output "WEPUU_KMS_KID_SET=$(-not [string]::IsNullOrWhiteSpace($env:WEPUU_KMS_KID))"
Write-Output "AWS_CREDENTIAL_SOURCE=$($(if ($hasProfile) { 'profile' } else { 'temporary-environment' }))"

try {
  $node = Get-Command node.exe -ErrorAction Stop
  $workspaceRoot = Split-Path -Parent $PSScriptRoot
  $tsxCli = Join-Path $workspaceRoot 'node_modules\tsx\dist\cli.mjs'
  $testFile = Join-Path $workspaceRoot 'packages\key-custody\test\aws-kms.test.ts'
  if (-not (Test-Path -LiteralPath $tsxCli)) {
    throw 'Workspace dependencies are missing. Run the repository dependency install before the KMS test.'
  }

  & $node.Source $tsxCli --test '--test-name-pattern=live AWS KMS contract' $testFile
  if ($LASTEXITCODE -ne 0) {
    throw "Live AWS KMS contract failed with exit code $LASTEXITCODE."
  }
} finally {
  Remove-Item Env:WEPUU_LIVE_KMS -ErrorAction SilentlyContinue
}
