[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$accountId = '453168420598'
$region = 'us-east-1'
$primaryKeyId = 'arn:aws:kms:us-east-1:453168420598:key/40426a27-701e-4fd3-b17b-4345ed26e2c3'
$secondaryKeyId = 'arn:aws:kms:us-east-1:453168420598:key/3762ff1b-3974-4b37-8569-a68b906dee2a'
$secretPointer = [IntPtr]::Zero

function Invoke-AwsJson {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $output = @(& aws @Arguments)
  if ($LASTEXITCODE -ne 0) {
    throw "AWS CLI command failed: aws $($Arguments[0..1] -join ' ')"
  }
  return (($output -join "`n") | ConvertFrom-Json)
}

try {
  Get-Command aws -ErrorAction Stop | Out-Null

  Remove-Item Env:AWS_PROFILE, Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
  $bootstrapAccessKeyId = (Read-Host 'Paste disposable IAM test Access Key ID').Trim()
  if ($bootstrapAccessKeyId -notmatch '^AKIA[A-Z0-9]{16}$') {
    throw 'The bootstrap Access Key ID does not match the IAM user key format.'
  }

  $secureSecret = Read-Host 'Paste disposable IAM test Secret Access Key' -AsSecureString
  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
  $bootstrapSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  if ([string]::IsNullOrWhiteSpace($bootstrapSecret)) {
    throw 'The bootstrap Secret Access Key is empty.'
  }

  $env:AWS_ACCESS_KEY_ID = $bootstrapAccessKeyId
  $env:AWS_SECRET_ACCESS_KEY = $bootstrapSecret
  $env:AWS_REGION = $region

  $session = Invoke-AwsJson @(
    'sts', 'get-session-token',
    '--duration-seconds', '3600',
    '--output', 'json',
    '--no-cli-pager'
  )
  $credentials = $session.Credentials
  if ([string]::IsNullOrWhiteSpace([string]$credentials.AccessKeyId) -or
      [string]::IsNullOrWhiteSpace([string]$credentials.SecretAccessKey) -or
      [string]::IsNullOrWhiteSpace([string]$credentials.SessionToken)) {
    throw 'AWS returned an incomplete STS session.'
  }

  $env:AWS_ACCESS_KEY_ID = [string]$credentials.AccessKeyId
  $env:AWS_SECRET_ACCESS_KEY = [string]$credentials.SecretAccessKey
  $env:AWS_SESSION_TOKEN = [string]$credentials.SessionToken

  Remove-Variable bootstrapSecret, bootstrapAccessKeyId, secureSecret, session, credentials `
    -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
  $secretPointer = [IntPtr]::Zero

  $caller = Invoke-AwsJson @('sts', 'get-caller-identity', '--output', 'json', '--no-cli-pager')
  if ([string]$caller.Account -ne $accountId) {
    throw 'The temporary session belongs to an unexpected AWS account.'
  }
  Write-Output 'AWS_CALLER_ACCOUNT_VERIFIED=True'
  Write-Output 'AWS_STS_SESSION_ACTIVE=True'

  $env:WEPUU_KMS_KEY_ID = $primaryKeyId
  $env:WEPUU_KMS_KID = 'wepuu-test-2026-01'
  $env:WEPUU_KMS_SECOND_KEY_ID = $secondaryKeyId
  $env:WEPUU_KMS_SECOND_KID = 'wepuu-test-2026-02'

  & (Join-Path $PSScriptRoot 'test-live-kms.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Single-key KMS contract failed.' }
  Write-Output 'LIVE_KMS_SINGLE_PASS=True'

  & (Join-Path $PSScriptRoot 'test-live-kms-rotation.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Two-key KMS lifecycle failed.' }
  Write-Output 'LIVE_KMS_ROTATION_PASS=True'
} finally {
  if ($secretPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
  }
  Remove-Variable bootstrapSecret, bootstrapAccessKeyId, secureSecret, session, credentials, caller `
    -ErrorAction SilentlyContinue
  Remove-Item Env:AWS_PROFILE, Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, `
    Env:AWS_SESSION_TOKEN, Env:AWS_REGION, Env:AWS_SDK_LOAD_CONFIG, `
    Env:WEPUU_KMS_KEY_ID, Env:WEPUU_KMS_KID, `
    Env:WEPUU_KMS_SECOND_KEY_ID, Env:WEPUU_KMS_SECOND_KID, `
    Env:WEPUU_LIVE_KMS, Env:WEPUU_LIVE_KMS_ROTATION, `
    Env:WEPUU_KMS_ROTATION_DATABASE_URL -ErrorAction SilentlyContinue
  $credentialsCleared =
    [string]::IsNullOrWhiteSpace($env:AWS_ACCESS_KEY_ID) -and
    [string]::IsNullOrWhiteSpace($env:AWS_SECRET_ACCESS_KEY) -and
    [string]::IsNullOrWhiteSpace($env:AWS_SESSION_TOKEN)
  Write-Output "AWS_CREDENTIALS_CLEARED=$credentialsCleared"
}
