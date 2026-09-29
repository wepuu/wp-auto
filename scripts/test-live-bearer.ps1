[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
$ConnectorRoot = 'D:\Codex\wp-auto-connector'
$ComposePath = Join-Path $Root 'compose.account-oidc-test.yaml'
$Temp = Join-Path $Root '.tmp\phase-2-0-5-bearer'
$FixturePath = Join-Path $Temp 'bearer-fixture.json'
$ImageName = "wepuu-phase-2-0-5-bearer-$PID"
$Endpoint = 'https://site.example.test/wp-json/wp-auto/mcp'
$Metadata = 'https://site.example.test/.well-known/oauth-protected-resource/wp-json/wp-auto/mcp'

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

foreach ($Name in @(
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION',
  'WEPUU_KMS_KEY_ID', 'WEPUU_KMS_KID',
  'WEPUU_KMS_SECOND_KEY_ID', 'WEPUU_KMS_SECOND_KID'
)) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name))) {
    throw "$Name is required."
  }
}
if (-not (Test-Path (Join-Path $Root '.tmp\account-oidc-https\state.json'))) {
  throw 'Install scripts/account-oidc-https.ps1 Install from an elevated PowerShell first.'
}
if (-not (Test-Path (Join-Path $ConnectorRoot 'tools\phase-1-7-client-probe.ps1'))) {
  throw 'Connector client probe is missing.'
}

New-Item -ItemType Directory -Path $Temp -Force | Out-Null
try {
  Set-Location $Root
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'build', '-f', (Join-Path $Root 'test\account-oidc\Control.Dockerfile'),
    '-t', $ImageName, $Root
  )
  if ($ExitCode -ne 0) { throw 'Pinned Node 26.7 image build failed.' }

  $ExitCode = Invoke-DockerCommand -Arguments @(
    'run', '--rm',
    '--mount', "type=bind,source=$Temp,target=/evidence",
    '-e', 'AWS_ACCESS_KEY_ID', '-e', 'AWS_SECRET_ACCESS_KEY', '-e', 'AWS_SESSION_TOKEN',
    '-e', 'AWS_REGION', '-e', 'WEPUU_KMS_KEY_ID', '-e', 'WEPUU_KMS_KID',
    '-e', 'WEPUU_KMS_SECOND_KEY_ID', '-e', 'WEPUU_KMS_SECOND_KID',
    '-e', 'WEPUU_BEARER_FIXTURE_PATH=/evidence/bearer-fixture.json',
    $ImageName,
    'node', 'packages/key-custody/node_modules/@keyobject/aws-kms/bin/awskms.js',
    'exec', '--', 'node', 'scripts/create-live-bearer-fixture.mjs'
  )
  if ($ExitCode -ne 0 -or -not (Test-Path -LiteralPath $FixturePath)) {
    throw 'Real KMS Bearer fixture generation failed.'
  }

  $Fixture = Get-Content -LiteralPath $FixturePath -Raw | ConvertFrom-Json
  $Tokens = @($Fixture.tokens)
  if ($Tokens.Count -ne 2 -or @($Fixture.jwks).Count -ne 2) {
    throw 'Bearer fixture does not contain two keys and two tokens.'
  }
  $PublicFixture = [ordered]@{
    jwks = @($Fixture.jwks)
    publicPem = [string]$Fixture.publicPem
  } | ConvertTo-Json -Depth 10 -Compress
  $PublicFixtureB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($PublicFixture))
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath, '--profile', 'tools', 'run', '--rm',
    '-e', "WEPUU_BEARER_PUBLIC_FIXTURE_B64=$PublicFixtureB64",
    'wpcli', 'eval-file', '/fixture/configure-bearer.php'
  )
  if ($ExitCode -ne 0) { throw 'Connector Bearer fixture configuration failed.' }

  $Prm = Invoke-WebRequest -Uri $Metadata -Method Get -UseBasicParsing
  if ($Prm.StatusCode -ne 200) { throw 'Protected Resource Metadata did not return 200.' }
  $PrmDocument = $Prm.Content | ConvertFrom-Json
  if ([string]$PrmDocument.resource -ne $Endpoint) { throw 'Protected Resource Metadata resource mismatch.' }

  $MissingHeaders = @{
    Accept = 'application/json, text/event-stream'
    'Content-Type' = 'application/json'
  }
  $MissingBody = @{ jsonrpc = '2.0'; id = 1; method = 'initialize'; params = @{} } |
    ConvertTo-Json -Depth 5 -Compress
  try {
    Invoke-WebRequest -Uri $Endpoint -Method Post -Headers $MissingHeaders -Body $MissingBody -UseBasicParsing | Out-Null
    throw 'Missing Bearer request unexpectedly succeeded.'
  } catch {
    $Response = $_.Exception.Response
    if ($null -eq $Response -or [int]$Response.StatusCode -ne 401) {
      throw 'Missing Bearer request did not return 401.'
    }
    $Challenge = [string]$Response.Headers['WWW-Authenticate']
    if ($Challenge -notlike '*resource_metadata=*') {
      throw 'Missing Bearer response omitted resource metadata challenge.'
    }
  }

  foreach ($Token in $Tokens) {
    if ($Token -isnot [string] -or $Token -notmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') {
      throw 'Generated access token is malformed.'
    }
    $env:WP_AUTO_MCP_AUTHORIZATION = "Bearer $Token"
    & powershell -NoProfile -ExecutionPolicy Bypass `
      -File (Join-Path $ConnectorRoot 'tools\phase-1-7-client-probe.ps1') `
      -Endpoint $Endpoint -Probe -ProbeSiteHealth -ExpectDeniedTool 'wp-auto-seo-update'
    if ($LASTEXITCODE -ne 0) { throw 'Direct MCP Bearer probe failed.' }
    Remove-Item Env:WP_AUTO_MCP_AUTHORIZATION -ErrorAction SilentlyContinue
  }

  Write-Output 'LIVE_HTTPS_PRM=True'
  Write-Output 'LIVE_MISSING_TOKEN_CHALLENGE=True'
  Write-Output 'LIVE_TWO_KMS_BEARER_READ=True'
  Write-Output 'LIVE_BEARER_SCOPE_DENIAL=True'
  Write-Output 'CONTROL_PLANE_CONTENT_FREE=True'
} finally {
  Remove-Item Env:WP_AUTO_MCP_AUTHORIZATION -ErrorAction SilentlyContinue
  Remove-Variable Fixture, Tokens, Token, PublicFixture -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $FixturePath -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $Temp) {
    $ResolvedTemp = (Resolve-Path -LiteralPath $Temp).Path
    $ResolvedRoot = (Resolve-Path -LiteralPath $Root).Path
    if (-not $ResolvedTemp.StartsWith($ResolvedRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'Refusing to remove a temporary directory outside the workspace.'
    }
    Remove-Item -LiteralPath $ResolvedTemp -Force -Recurse -ErrorAction SilentlyContinue
  }
  $RemoveCode = Invoke-DockerCommand -Arguments @('image', 'rm', $ImageName)
  if ($RemoveCode -ne 0) {
    Write-Warning 'Disposable Node 26.7 image cleanup returned a non-zero code.'
  }
}
