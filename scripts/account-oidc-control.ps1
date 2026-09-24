[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$CertificatePath = Join-Path $Root '.tmp\account-oidc-https\caddy-root.crt'
if (-not (Test-Path -LiteralPath $CertificatePath)) {
  throw 'Install the HTTPS fixture before starting the control API.'
}

function New-WePuuKey {
  $Bytes = [byte[]]::new(32)
  $Rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $Rng.GetBytes($Bytes) } finally { $Rng.Dispose() }
  return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function ConvertFrom-SecureValue([Security.SecureString]$Value) {
  $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer) }
}

function Invoke-DockerCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  # Docker progress is written to stderr. Under Windows PowerShell 5.1 and
  # ErrorActionPreference=Stop that can become a terminating NativeCommandError
  # despite a successful native exit code.
  $PreviousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & docker @Arguments 2>&1 | ForEach-Object { Write-Host $_ }
    $ExitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }

  return $ExitCode
}

$Auth0Secret = Read-Host 'Paste Auth0 Client Secret' -AsSecureString
$AccessKeyId = (Read-Host 'Paste AWS test Access Key ID').Trim()
$AwsSecret = Read-Host 'Paste AWS test Secret Access Key' -AsSecureString

try {
  $env:WEPUU_DATABASE_URL = 'postgresql://postgres:conformance@127.0.0.1:55433/wepuu_test'
  $env:WEPUU_ACCOUNT_OIDC_ISSUER = 'https://dev-o173hfg1cbmd0crj.us.auth0.com/'
  $env:WEPUU_ACCOUNT_OIDC_CLIENT_ID = 'AY4V93U0IUs6aWPKgLqClwodKWOneQa9'
  $env:WEPUU_ACCOUNT_OIDC_REDIRECT_URI = 'https://platform.example.test/v1/account/oidc/callback'
  $env:WEPUU_ACCOUNT_OIDC_SCOPES = 'openid'
  $env:WEPUU_ACCOUNT_OIDC_CLIENT_AUTH_METHOD = 'client_secret_basic'
  $env:WEPUU_CONTROL_PUBLIC_ORIGIN = 'https://platform.example.test'
  $env:WEPUU_ACCOUNT_OIDC_CLIENT_SECRET = ConvertFrom-SecureValue $Auth0Secret
  $env:WEPUU_OIDC_TRANSACTION_KEYS_JSON = (@(New-WePuuKey; New-WePuuKey) | ConvertTo-Json -Compress)
  $env:WEPUU_IDENTITY_SUBJECT_HMAC_KEY = New-WePuuKey
  $env:WEPUU_GRANT_IDEMPOTENCY_HMAC_KEY = New-WePuuKey
  $env:WEPUU_ISSUER = 'https://platform.example.test'
  $env:WEPUU_CONTROL_HOST = '127.0.0.1'
  $env:WEPUU_CONTROL_PORT = '3000'
  $env:NODE_EXTRA_CA_CERTS = $CertificatePath

  $env:AWS_ACCESS_KEY_ID = $AccessKeyId
  $env:AWS_SECRET_ACCESS_KEY = ConvertFrom-SecureValue $AwsSecret
  $env:AWS_REGION = 'us-east-1'
  $env:WEPUU_KMS_KEY_ID = 'arn:aws:kms:us-east-1:453168420598:key/40426a27-701e-4fd3-b17b-4345ed26e2c3'
  $env:WEPUU_KMS_KID = 'wepuu-test-2026-01'

  Set-Location $Root
  aws sts get-caller-identity --query '{Account:Account,Arn:Arn}'
  if ($LASTEXITCODE -ne 0) { throw 'AWS credentials could not be validated.' }
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', 'compose.account-oidc-test.yaml',
    '--profile', 'control',
    'up', '-d', '--build', '--wait', 'control'
  )
  if ($ExitCode -ne 0) { throw 'Linux Node 26.7 control API failed to start.' }

  Write-Output 'CONTROL_API_RUNTIME=linux-node-26.7.0'
  Write-Output 'CONTROL_API_ORIGIN=https://platform.example.test'
  Write-Output 'CONTROL_API_STARTED=True'
} finally {
  Remove-Item Env:WEPUU_DATABASE_URL, Env:WEPUU_ACCOUNT_OIDC_ISSUER, `
    Env:WEPUU_ACCOUNT_OIDC_CLIENT_ID, Env:WEPUU_ACCOUNT_OIDC_REDIRECT_URI, `
    Env:WEPUU_ACCOUNT_OIDC_SCOPES, Env:WEPUU_ACCOUNT_OIDC_CLIENT_AUTH_METHOD, `
    Env:WEPUU_CONTROL_PUBLIC_ORIGIN, Env:WEPUU_ACCOUNT_OIDC_CLIENT_SECRET, `
    Env:WEPUU_OIDC_TRANSACTION_KEYS_JSON, Env:WEPUU_IDENTITY_SUBJECT_HMAC_KEY, `
    Env:WEPUU_GRANT_IDEMPOTENCY_HMAC_KEY, Env:WEPUU_ISSUER, `
    Env:WEPUU_CONTROL_HOST, Env:WEPUU_CONTROL_PORT, Env:NODE_EXTRA_CA_CERTS, `
    Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN, `
    Env:AWS_REGION, Env:WEPUU_KMS_KEY_ID, Env:WEPUU_KMS_KID `
    -ErrorAction SilentlyContinue
  Remove-Variable AccessKeyId -ErrorAction SilentlyContinue
  $Auth0Secret.Dispose()
  $AwsSecret.Dispose()
}
