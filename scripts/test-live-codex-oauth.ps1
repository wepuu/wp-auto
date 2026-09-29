[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
$ComposePath = Join-Path $Root 'compose.account-oidc-test.yaml'
$Codex = if ($env:CODEX_BIN) { $env:CODEX_BIN } else { 'C:\Users\admin\AppData\Roaming\npm\codex.cmd' }
$SourceCodexHome = Join-Path $env:USERPROFILE '.codex'
$SystemTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$Temp = Join-Path $SystemTempRoot ("wepuu-phase-2-0-5-codex-{0}" -f [guid]::NewGuid().ToString('N'))
$IsolatedHome = Join-Path $Temp 'home'
$Trace = Join-Path $Temp 'codex-events.jsonl'
$Evidence = Join-Path $Root '.tmp\phase-2-0-5-codex-result.txt'
$PendingAuthorizationUrl = Join-Path $Root '.tmp\phase-2-0-5-pending-authorization-url.txt'
$Resource = 'https://site.example.test/wp-json/wp-auto/mcp'
$Certificate = Join-Path $Root '.tmp\account-oidc-https\caddy-root.crt'

if (-not (Test-Path -LiteralPath $Codex)) { throw 'Codex CLI 0.154.0 was not found.' }
if (-not (Test-Path -LiteralPath (Join-Path $SourceCodexHome 'auth.json'))) {
  throw 'The existing Codex login is required; auth.json is absent.'
}
if (-not (Test-Path -LiteralPath $Certificate)) { throw 'The HTTPS fixture is not installed.' }
Remove-Item -LiteralPath $Evidence -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PendingAuthorizationUrl -Force -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Path $IsolatedHome -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $SourceCodexHome 'auth.json') -Destination (Join-Path $IsolatedHome 'auth.json')
$AuthSourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $SourceCodexHome 'auth.json')).Hash

$PriorCodexHome = $env:CODEX_HOME
$PriorSslCert = $env:SSL_CERT_FILE
$PriorNoProxy = $env:NO_PROXY
try {
  $env:CODEX_HOME = $IsolatedHome
  $env:SSL_CERT_FILE = $Certificate
  $env:NO_PROXY = 'platform.example.test,site.example.test,127.0.0.1,localhost'
  foreach ($Name in @('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy')) {
    Remove-Item "Env:$Name" -ErrorAction SilentlyContinue
  }

  $Config = @"
[mcp_servers.wepuu-live]
url = "$Resource"
oauth_resource = "$Resource"

[mcp_servers.wepuu-live.oauth]
client_id = "client_00000001"
callback_url = "http://127.0.0.1/callback"
"@
  [IO.File]::WriteAllText(
    (Join-Path $IsolatedHome 'config.toml'),
    $Config,
    [Text.UTF8Encoding]::new($false)
  )
  Write-Output 'CODEX_MCP_CONFIGURED=True'

  $PriorLoginErrorActionPreference = $ErrorActionPreference
  $LoginExit = 1
  try {
    $ErrorActionPreference = 'Continue'
    & $Codex mcp login wepuu-live --scopes mcp:read --oauth-client-registration auto 2>&1 |
      ForEach-Object {
        $LoginLine = [string]$_
        Write-Output $LoginLine
        if ($LoginLine -match '^https://platform\.example\.test/auth\?') {
          [IO.File]::WriteAllText(
            $PendingAuthorizationUrl,
            $LoginLine,
            [Text.UTF8Encoding]::new($false)
          )
        }
      }
    $LoginExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PriorLoginErrorActionPreference
  }
  if ($LoginExit -ne 0) { throw 'Codex OAuth login failed.' }
  Remove-Item -LiteralPath $PendingAuthorizationUrl -Force -ErrorAction SilentlyContinue

  $Prompt = 'Use only the wepuu-live MCP server. Call wp-auto-site-health exactly once. Do not use shell commands or read files. After the successful tool result, answer exactly CODEX_DIRECT_MCP_OK.'
  $PriorErrorActionPreference = $ErrorActionPreference
  $CodexExit = 1
  try {
    $ErrorActionPreference = 'Continue'
    & $Codex exec --json --ephemeral --sandbox read-only --cd $Root $Prompt 2>&1 |
      Set-Content -LiteralPath $Trace -Encoding utf8
    $CodexExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PriorErrorActionPreference
  }
  if ($CodexExit -ne 0) { throw 'Codex direct MCP execution failed.' }

  $TraceText = Get-Content -Raw -LiteralPath $Trace
  if ($TraceText -notmatch 'wepuu-live' -or $TraceText -notmatch 'wp-auto-site-health' `
      -or $TraceText -notmatch 'CODEX_DIRECT_MCP_OK') {
    throw 'Codex trace did not prove the expected MCP tool call.'
  }

  $ControlPlaneLogs = docker compose -f $ComposePath logs --no-color control authorization 2>&1 | Out-String
  if ($ControlPlaneLogs -match 'wp-auto-site-health|CODEX_DIRECT_MCP_OK') {
    throw 'Control-plane logs unexpectedly contain MCP data-plane evidence.'
  }
  $DatabaseDump = docker compose -f $ComposePath exec -T platform-db `
    pg_dump -U postgres -d wepuu_test --data-only 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw 'Control-plane database review failed.' }
  if ($DatabaseDump -match 'wp-auto-site-health|CODEX_DIRECT_MCP_OK') {
    throw 'Control-plane database unexpectedly contains MCP data-plane evidence.'
  }

  $ResultLines = @(
    'CODEX_OAUTH_LOGIN=True',
    'CODEX_DIRECT_WORDPRESS_MCP=True',
    'CONTROL_PLANE_LOG_CONTENT_FREE=True',
    'CONTROL_PLANE_DATABASE_CONTENT_FREE=True'
  )
  $ResultLines | Set-Content -LiteralPath $Evidence -Encoding ascii
  $ResultLines | ForEach-Object { Write-Output $_ }
} finally {
  Remove-Item Env:CODEX_HOME, Env:SSL_CERT_FILE, Env:NO_PROXY -ErrorAction SilentlyContinue
  if ($null -ne $PriorCodexHome) { $env:CODEX_HOME = $PriorCodexHome }
  if ($null -ne $PriorSslCert) { $env:SSL_CERT_FILE = $PriorSslCert }
  if ($null -ne $PriorNoProxy) { $env:NO_PROXY = $PriorNoProxy }
  Remove-Item -LiteralPath $Trace -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $PendingAuthorizationUrl -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $Temp) {
    $ResolvedTemp = (Resolve-Path -LiteralPath $Temp).Path
    if (-not $ResolvedTemp.StartsWith($SystemTempRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'Refusing to remove Codex state outside the system temporary directory.'
    }
    Remove-Item -LiteralPath $ResolvedTemp -Recurse -Force
  }
  $AuthRestored = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $SourceCodexHome 'auth.json')).Hash -eq $AuthSourceHash
  if (Test-Path -LiteralPath $Evidence) {
    Add-Content -LiteralPath $Evidence -Value "CODEX_USER_AUTH_RESTORED=$AuthRestored" -Encoding ascii
  }
  Write-Output "CODEX_USER_AUTH_RESTORED=$AuthRestored"
}
