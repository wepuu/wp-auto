[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$RunBearer
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
$ComposePath = Join-Path $Root 'compose.account-oidc-test.yaml'
$FixtureState = Join-Path $Root '.tmp\account-oidc-https\state.json'
$PublicFixtureDirectory = Join-Path $Root '.tmp\phase-2-0-5-oauth'
$PublicFixturePath = Join-Path $PublicFixtureDirectory 'public-fixture.json'

if (-not (Test-Path -LiteralPath $FixtureState)) {
  throw 'Install scripts/account-oidc-https.ps1 Install from an elevated PowerShell first.'
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
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  $Previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & docker @Arguments 2>&1 | ForEach-Object { Write-Host $_ }
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $Previous
  }
}

function Invoke-AwsJson {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  $Output = @(& aws @Arguments)
  if ($LASTEXITCODE -ne 0) {
    throw "AWS CLI command failed: aws $($Arguments[0..1] -join ' ')"
  }
  return (($Output -join "`n") | ConvertFrom-Json)
}

$Auth0Secret = Read-Host 'Paste Auth0 Client Secret' -AsSecureString
$AccessKeyId = (Read-Host 'Paste AWS test Access Key ID').Trim()
$AwsSecret = Read-Host 'Paste AWS test Secret Access Key' -AsSecureString

New-Item -ItemType Directory -Path $PublicFixtureDirectory -Force | Out-Null
try {
  if ($AccessKeyId -notmatch '^AKIA[A-Z0-9]{16}$') {
    throw 'The bootstrap Access Key ID does not match the IAM user key format.'
  }
  $env:WEPUU_ACCOUNT_OIDC_CLIENT_SECRET = ConvertFrom-SecureValue $Auth0Secret
  Remove-Item Env:AWS_PROFILE, Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
  $env:AWS_ACCESS_KEY_ID = $AccessKeyId
  $env:AWS_SECRET_ACCESS_KEY = ConvertFrom-SecureValue $AwsSecret
  $env:AWS_REGION = 'us-east-1'
  $env:WEPUU_KMS_KEY_ID = 'arn:aws:kms:us-east-1:453168420598:key/40426a27-701e-4fd3-b17b-4345ed26e2c3'
  $env:WEPUU_KMS_KID = 'wepuu-test-2026-01'
  $env:WEPUU_KMS_SECOND_KEY_ID = 'arn:aws:kms:us-east-1:453168420598:key/3762ff1b-3974-4b37-8569-a68b906dee2a'
  $env:WEPUU_KMS_SECOND_KID = 'wepuu-test-2026-02'
  $env:WEPUU_OIDC_TRANSACTION_KEYS_JSON = (@(New-WePuuKey; New-WePuuKey) | ConvertTo-Json -Compress)
  $env:WEPUU_IDENTITY_SUBJECT_HMAC_KEY = New-WePuuKey
  $env:WEPUU_GRANT_IDEMPOTENCY_HMAC_KEY = New-WePuuKey
  $env:WEPUU_COOKIE_KEYS_JSON = (@(New-WePuuKey; New-WePuuKey) | ConvertTo-Json -Compress)
  $env:WEPUU_OAUTH_ARTIFACT_KEYS_JSON = (@(New-WePuuKey; New-WePuuKey) | ConvertTo-Json -Compress)
  $env:WEPUU_RATE_LIMIT_HMAC_KEY = New-WePuuKey

  $Session = Invoke-AwsJson @(
    'sts', 'get-session-token',
    '--duration-seconds', '3600',
    '--output', 'json',
    '--no-cli-pager'
  )
  $Credentials = $Session.Credentials
  if ([string]::IsNullOrWhiteSpace([string]$Credentials.AccessKeyId) -or
      [string]::IsNullOrWhiteSpace([string]$Credentials.SecretAccessKey) -or
      [string]::IsNullOrWhiteSpace([string]$Credentials.SessionToken)) {
    throw 'AWS returned an incomplete STS session.'
  }
  $env:AWS_ACCESS_KEY_ID = [string]$Credentials.AccessKeyId
  $env:AWS_SECRET_ACCESS_KEY = [string]$Credentials.SecretAccessKey
  $env:AWS_SESSION_TOKEN = [string]$Credentials.SessionToken
  Remove-Variable AccessKeyId, Session, Credentials -ErrorAction SilentlyContinue

  $Caller = Invoke-AwsJson @('sts', 'get-caller-identity', '--output', 'json', '--no-cli-pager')
  if ([string]$Caller.Account -ne '453168420598') {
    throw 'The temporary session belongs to an unexpected AWS account.'
  }
  Write-Output 'AWS_STS_SESSION_ACTIVE=True'

  Set-Location $Root
  if (-not $SkipBuild) {
    $ExitCode = Invoke-DockerCommand -Arguments @(
      'compose', '-f', $ComposePath, '--profile', 'control', '--profile', 'revocation',
      'build', 'control', 'authorization'
    )
    if ($ExitCode -ne 0) { throw 'Pinned Node 26.7 service image build failed.' }
  } else {
    Write-Output 'PINNED_NODE_BUILD_REUSED=True'
  }

  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath, '--profile', 'control',
    'up', '-d', '--wait', 'control'
  )
  if ($ExitCode -ne 0) { throw 'Control API failed to start.' }

  Write-Output 'Open this URL in Chrome and complete Auth0 login:'
  Write-Output 'https://platform.example.test/v1/account/oidc/login?return_to=/v1/account/session'
  Read-Host 'After the page returns {"authenticated":true}, press Enter here' | Out-Null

  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath, '--profile', 'control', 'run', '--rm',
    '--volume', "${PublicFixtureDirectory}:/evidence",
    '-e', 'WEPUU_KMS_SECOND_KEY_ID', '-e', 'WEPUU_KMS_SECOND_KID',
    '-e', 'WEPUU_BEARER_PUBLIC_FIXTURE_PATH=/evidence/public-fixture.json',
    'control',
    'node', 'packages/key-custody/node_modules/@keyobject/aws-kms/bin/awskms.js',
    'exec', '--', 'node', 'scripts/seed-live-oauth.mjs'
  )
  if ($ExitCode -ne 0 -or -not (Test-Path -LiteralPath $PublicFixturePath)) {
    throw 'Live OAuth fixture seed failed.'
  }

  $PublicFixture = Get-Content -Raw -LiteralPath $PublicFixturePath
  $PublicFixtureB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($PublicFixture))
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath, '--profile', 'tools', 'run', '--rm',
    '-e', "WEPUU_BEARER_PUBLIC_FIXTURE_B64=$PublicFixtureB64",
    'wpcli', 'eval-file', '/fixture/configure-bearer.php'
  )
  if ($ExitCode -ne 0) { throw 'Connector OAuth fixture configuration failed.' }

  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath, '--profile', 'revocation',
    'up', '-d', '--wait', 'authorization'
  )
  if ($ExitCode -ne 0) { throw 'Authorization service failed to start.' }
  $ExitCode = Invoke-DockerCommand -Arguments @('compose', '-f', $ComposePath, 'restart', 'caddy')
  if ($ExitCode -ne 0) { throw 'Caddy route reload failed.' }

  Write-Output 'LIVE_OAUTH_SERVICES_STARTED=True'
  Write-Output 'AUTHORIZATION_ISSUER=https://platform.example.test'
  Write-Output 'MCP_RESOURCE=https://site.example.test/wp-json/wp-auto/mcp'
  if ($RunBearer) {
    & (Join-Path $PSScriptRoot 'test-live-bearer.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Retained live Bearer regression failed.' }
  }
} finally {
  Remove-Item -LiteralPath $PublicFixturePath -Force -ErrorAction SilentlyContinue
  Remove-Item Env:WEPUU_ACCOUNT_OIDC_CLIENT_SECRET, Env:AWS_ACCESS_KEY_ID, `
    Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN, Env:AWS_REGION, `
    Env:WEPUU_KMS_KEY_ID, Env:WEPUU_KMS_KID, Env:WEPUU_KMS_SECOND_KEY_ID, `
    Env:WEPUU_KMS_SECOND_KID, Env:WEPUU_OIDC_TRANSACTION_KEYS_JSON, `
    Env:WEPUU_IDENTITY_SUBJECT_HMAC_KEY, Env:WEPUU_GRANT_IDEMPOTENCY_HMAC_KEY, `
    Env:WEPUU_COOKIE_KEYS_JSON, Env:WEPUU_OAUTH_ARTIFACT_KEYS_JSON, `
    Env:WEPUU_RATE_LIMIT_HMAC_KEY -ErrorAction SilentlyContinue
  Remove-Variable AccessKeyId, Session, Credentials, Caller, PublicFixture, PublicFixtureB64 -ErrorAction SilentlyContinue
  $Auth0Secret.Dispose()
  $AwsSecret.Dispose()
}
