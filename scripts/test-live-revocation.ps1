[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
$ComposePath = Join-Path $Root 'compose.account-oidc-test.yaml'
$Temp = Join-Path $Root '.tmp\phase-2-0-4-revocation'
$PublicPem = Join-Path $Temp 'kms-public.pem'
$TenantId = '11111111-2222-4333-8444-555555555555'
$SiteId = 'site_00000001'
$GrantId = 'grant_00000001'
$Resource = 'https://site.example.test/wp-json/wp-auto/mcp'

function New-WePuuKey {
  $Bytes = [byte[]]::new(32)
  $Rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $Rng.GetBytes($Bytes) } finally { $Rng.Dispose() }
  return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
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

foreach ($Name in @('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'WEPUU_KMS_KEY_ID', 'WEPUU_KMS_KID')) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name))) { throw "$Name is required." }
}
if (-not (Test-Path (Join-Path $Root '.tmp\account-oidc-https\state.json'))) {
  throw 'Install scripts/account-oidc-https.ps1 Install from an elevated PowerShell first.'
}

New-Item -ItemType Directory -Path $Temp -Force | Out-Null
$env:WEPUU_DATABASE_URL = 'postgresql://postgres:conformance@127.0.0.1:55433/wepuu_test'
$env:WEPUU_FIXTURE_TENANT_ID = $TenantId
$env:WEPUU_FIXTURE_SITE_ID = $SiteId
$env:WEPUU_FIXTURE_GRANT_ID = $GrantId
$env:WEPUU_FIXTURE_RESOURCE = $Resource
$env:WEPUU_FIXTURE_PUBLIC_PEM_PATH = $PublicPem
$env:WEPUU_COOKIE_KEYS_JSON = (@(New-WePuuKey; New-WePuuKey) | ConvertTo-Json -Compress)
$env:WEPUU_OAUTH_ARTIFACT_KEYS_JSON = (@(New-WePuuKey; New-WePuuKey) | ConvertTo-Json -Compress)
$env:WEPUU_RATE_LIMIT_HMAC_KEY = New-WePuuKey
try {
  Set-Location $Root
  $Node = (Get-Command node.exe -ErrorAction Stop).Source
  $TypeScript = Join-Path $Root 'node_modules\typescript\bin\tsc'
  if (-not (Test-Path -LiteralPath $TypeScript)) {
    throw 'Repository dependencies are absent; run pnpm install from a non-elevated development shell first.'
  }
  & $Node $TypeScript -b
  if ($LASTEXITCODE -ne 0) { throw 'Platform build failed.' }
  & $Node node_modules\tsx\dist\cli.mjs packages\database\src\cli.ts migrate
  if ($LASTEXITCODE -ne 0) { throw 'Fixture database migration failed.' }
  $TenantSql = "INSERT INTO platform.tenants (id, status) VALUES ('$TenantId', 'active') ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now();"
  $TenantSql | docker compose -f $ComposePath exec -T platform-db psql -v ON_ERROR_STOP=1 -U postgres -d wepuu_test
  if ($LASTEXITCODE -ne 0) { throw 'Fixture tenant seed failed.' }
  & $Node scripts\seed-live-revocation.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Revocation seed failed.' }

  $PublicPemB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($PublicPem))
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath, '--profile', 'tools', 'run', '--rm',
    '-e', "WEPUU_FIXTURE_TENANT_ID=$TenantId",
    '-e', "WEPUU_FIXTURE_SITE_ID=$SiteId",
    '-e', "WEPUU_FIXTURE_KMS_KID=$($env:WEPUU_KMS_KID)",
    '-e', "WEPUU_FIXTURE_PUBLIC_PEM_B64=$PublicPemB64",
    'wpcli', 'eval-file', '/fixture/configure-revocation.php'
  )
  if ($ExitCode -ne 0) { throw 'Connector revocation fixture configuration failed.' }

  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath, '--profile', 'revocation',
    'up', '-d', '--build', '--wait', 'authorization'
  )
  if ($ExitCode -ne 0) { throw 'Authorization service failed to start.' }
  $Delivered = $false
  for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
    $Value = docker compose -f $ComposePath exec -T platform-db `
      psql -At -U postgres -d wepuu_test -c "SELECT delivered_at IS NOT NULL FROM oauth.revocation_outbox WHERE tenant_id='$TenantId' AND event_sequence=1"
    if ($LASTEXITCODE -eq 0 -and $Value.Trim() -eq 't') { $Delivered = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $Delivered) { throw 'Signed revocation was not delivered.' }
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath, '--profile', 'tools', 'run', '--rm',
    '-e', "WEPUU_FIXTURE_GRANT_ID=$GrantId",
    'wpcli', 'eval-file', '/fixture/verify-revocation.php'
  )
  if ($ExitCode -ne 0) { throw 'Connector did not persist the deny marker.' }
  Write-Output 'LIVE_HTTPS_REVOCATION_DELIVERY=True'
  Write-Output 'CONTROL_PLANE_CONTENT_FREE=True'
} finally {
  # Docker emits normal progress (for example, "Container ... Stopping") on
  # stderr. Under ErrorActionPreference=Stop, invoking it directly turns a
  # successful cleanup into a PowerShell NativeCommandError. Use the wrapper
  # that temporarily relaxes native stderr handling and preserve the primary
  # test result; account-oidc-https.ps1 Remove performs the final teardown.
  $StopExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath, '--profile', 'revocation',
    'stop', 'authorization'
  )
  if ($StopExitCode -ne 0) {
    Write-Warning "Authorization container stop returned exit code $StopExitCode; outer fixture teardown remains required."
  }
  Remove-Item -LiteralPath $PublicPem -Force -ErrorAction SilentlyContinue
  Remove-Item Env:WEPUU_DATABASE_URL, Env:WEPUU_FIXTURE_TENANT_ID, Env:WEPUU_FIXTURE_SITE_ID, `
    Env:WEPUU_FIXTURE_GRANT_ID, Env:WEPUU_FIXTURE_RESOURCE, Env:WEPUU_FIXTURE_PUBLIC_PEM_PATH, `
    Env:WEPUU_COOKIE_KEYS_JSON, Env:WEPUU_OAUTH_ARTIFACT_KEYS_JSON, Env:WEPUU_RATE_LIMIT_HMAC_KEY `
    -ErrorAction SilentlyContinue
}
