[CmdletBinding()]
param(
  [string]$ConnectorPath,
  [string]$WpEnvVersion = '11.11.0',
  [string]$ToolNodePath = $env:WEPUU_WP_ENV_NODE_BIN
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([string]::IsNullOrWhiteSpace($ConnectorPath)) {
  $ConnectorPath = Join-Path $Root '..\wp-auto-connector'
}
$ConnectorPath = [IO.Path]::GetFullPath($ConnectorPath)
$TemporaryRoot = Join-Path $Root '.tmp\wp-env-local-signing'
$ConnectorCopy = Join-Path $TemporaryRoot 'wp-env-connector'
$ConfigPath = Join-Path $TemporaryRoot 'wp-env.local-signing.json'
$WpEnvHome = Join-Path $TemporaryRoot 'home'
$ToolRoot = Join-Path $TemporaryRoot 'tool'
$NpmCache = Join-Path $TemporaryRoot 'npm-cache'
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$NpmCli = Join-Path (Split-Path -Parent $NpmCommand) 'node_modules\npm\bin\npm-cli.js'
$WpEnv = Join-Path $ToolRoot 'node_modules\.bin\wp-env.cmd'
$Curl = (Get-Command curl.exe -ErrorAction Stop).Source
$ApplicationPasswordCreated = $false
$WpCliContainer = $null

if ([string]::IsNullOrWhiteSpace($ToolNodePath)) {
  $ToolNodePath = (Get-Command node.exe -ErrorAction Stop).Source
}
$ToolNodePath = [IO.Path]::GetFullPath($ToolNodePath)
if (-not (Test-Path -LiteralPath $ToolNodePath -PathType Leaf)) { throw "Tool Node executable not found: $ToolNodePath" }
if (-not (Test-Path -LiteralPath $NpmCli -PathType Leaf)) { throw "npm CLI not found: $NpmCli" }
$ToolNodeMajor = [int](& $ToolNodePath -p 'Number.parseInt(process.versions.node,10)')
if ($LASTEXITCODE -ne 0 -or $ToolNodeMajor -ne 24) {
  throw 'wp-env 11.11.0 validation requires an isolated Node 24 tool runtime; set WEPUU_WP_ENV_NODE_BIN to node.exe. The platform remains on Node 26.'
}

function Assert-TemporaryPath([string]$Path) {
  $Full = [IO.Path]::GetFullPath($Path)
  $ExpectedPrefix = (Join-Path $Root '.tmp') + [IO.Path]::DirectorySeparatorChar
  if (-not $Full.StartsWith($ExpectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing non-temporary path: $Full"
  }
}

function Invoke-WpEnv([string[]]$Arguments, [switch]$AllowFailure) {
  & $WpEnv @Arguments
  $ExitCode = $LASTEXITCODE
  if (-not $AllowFailure -and $ExitCode -ne 0) {
    throw "wp-env command failed with exit code ${ExitCode}: $($Arguments -join ' ')"
  }
  return $ExitCode
}

function Write-WpEnvDiagnostics {
  Write-Warning 'wp-env validation failed; collecting content-free diagnostics before cleanup.'
  Invoke-WpEnv @("--config=$ConfigPath", 'run', 'cli', 'wp', 'core', 'is-installed') -AllowFailure | Out-Null
  Invoke-WpEnv @("--config=$ConfigPath", 'run', 'cli', 'wp', 'plugin', 'list', '--fields=name,status,version') -AllowFailure | Out-Null
  & $DockerCommand ps -a --format '{{.Names}} {{.Status}} {{.Ports}}' |
    Where-Object { $_ -match 'wordpress|wp-env|mysql' } |
    ForEach-Object { Write-Warning $_ }
}

if (-not (Test-Path -LiteralPath (Join-Path $ConnectorPath 'wepuu-auto-connector.php') -PathType Leaf)) {
  throw "Connector repository not found: $ConnectorPath"
}
$SafeConnectorPath = $ConnectorPath.Replace('\', '/')
$ConnectorCommit = (& git -c "safe.directory=$SafeConnectorPath" -C $ConnectorPath rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to read connector Git state.' }
$InitialStatus = @(& git -c "safe.directory=$SafeConnectorPath" -C $ConnectorPath status --short)
if ($LASTEXITCODE -ne 0 -or $InitialStatus.Count -ne 0) { throw 'Connector working tree must be clean.' }

$Docker = Get-Command docker.exe -ErrorAction SilentlyContinue
if ($null -eq $Docker) {
  $DockerDirectory = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'
  $DockerCommand = Join-Path $DockerDirectory 'docker.exe'
  if (-not (Test-Path -LiteralPath $DockerCommand -PathType Leaf)) {
    throw 'Docker CLI was not found.'
  }
  $env:PATH = "$DockerDirectory$([IO.Path]::PathSeparator)$env:PATH"
} else {
  $DockerCommand = $Docker.Source
}

Assert-TemporaryPath $TemporaryRoot
foreach ($Path in @($ConnectorCopy, $ConfigPath)) {
  if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Recurse -Force }
}
New-Item -ItemType Directory -Path $ConnectorCopy, $WpEnvHome, $ToolRoot, $NpmCache -Force | Out-Null
Get-ChildItem -LiteralPath $ConnectorPath -Force | Where-Object { $_.Name -ne '.git' } |
  Copy-Item -Destination $ConnectorCopy -Recurse -Force

$Config = @{
  '$schema' = 'https://schemas.wp.org/trunk/wp-env.json'
  core = 'WordPress/WordPress#6.9'
  phpVersion = '8.1'
  testsEnvironment = $false
  plugins = @($ConnectorCopy)
} | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($ConfigPath, $Config, [Text.UTF8Encoding]::new($false))
$Md5 = [Security.Cryptography.MD5]::Create()
try {
  $ConfigHash = ([BitConverter]::ToString($Md5.ComputeHash([Text.Encoding]::UTF8.GetBytes($ConfigPath)))).Replace('-', '').ToLowerInvariant()
} finally {
  $Md5.Dispose()
}
$WpEnvCacheDirectory = Join-Path $WpEnvHome $ConfigHash
New-Item -ItemType Directory -Path $WpEnvCacheDirectory -Force | Out-Null
[IO.File]::WriteAllText(
  (Join-Path $WpEnvCacheDirectory 'wp-env-cache.json'),
  '{"latestWordPressVersion":"6.9"}',
  [Text.UTF8Encoding]::new($false)
)

$PreviousWpEnvHome = $env:WP_ENV_HOME
$PreviousNpmCache = $env:npm_config_cache
$PreviousCi = $env:CI
$PreviousPath = $env:PATH
$PreviousMcpAuthorization = $env:WP_AUTO_MCP_AUTHORIZATION
$env:WP_ENV_HOME = $WpEnvHome
$env:npm_config_cache = $NpmCache
$env:CI = 'true'
$env:PATH = "$(Split-Path -Parent $ToolNodePath)$([IO.Path]::PathSeparator)$env:PATH"

try {
  # npm 11.20 can omit this declared wcwidth runtime dependency from an
  # isolated --no-save prefix install. Pin it explicitly so the fixed wp-env
  # CLI remains reproducible without changing the platform dependency graph.
  & $ToolNodePath $NpmCli install --prefix $ToolRoot --no-save --no-package-lock --audit=false --fund=false `
    "@wordpress/env@$WpEnvVersion" 'defaults@1.0.4'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $WpEnv -PathType Leaf)) {
    throw "Unable to install the fixed wp-env CLI version $WpEnvVersion."
  }
  Invoke-WpEnv @("--config=$ConfigPath", 'start') | Out-Null
  $RestIndex = $null
  for ($Attempt = 0; $Attempt -lt 120; $Attempt++) {
    $PreviousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $Candidate = & $Curl --fail --silent --show-error --location --noproxy '*' 'http://localhost:8888/wp-json/' 2>$null
    } finally {
      $ErrorActionPreference = $PreviousErrorActionPreference
    }
    if ($LASTEXITCODE -eq 0 -and $null -ne $Candidate) {
      try {
        $Parsed = (($Candidate -join "`n") | ConvertFrom-Json)
        if ($null -ne $Parsed.routes) { $RestIndex = $Parsed; break }
      } catch {}
    }
    Start-Sleep -Milliseconds 500
  }
  if ($null -eq $RestIndex) { throw 'The wp-env WordPress REST index did not become ready.' }
  $Routes = @($RestIndex.routes.PSObject.Properties.Name)
  if ($Routes -notcontains '/wp-auto/v1/revocations' -or $Routes -notcontains '/wp-auto/v1/pairing/proof') {
    throw 'The wp-env WordPress site did not activate the connector REST routes.'
  }
  $WordPressContainer = @(
    & $DockerCommand ps --filter 'publish=8888' --format '{{.ID}}'
  ) | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($WordPressContainer)) {
    throw 'Unable to find the disposable wp-env WordPress container.'
  }
  $ContainerLabels = (& $DockerCommand inspect --format '{{json .Config.Labels}}' $WordPressContainer | ConvertFrom-Json)
  $ComposeProject = [string]$ContainerLabels.'com.docker.compose.project'
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ComposeProject)) {
    throw 'Unable to identify the disposable wp-env Compose project.'
  }
  $WpCliContainer = @(
    & $DockerCommand ps `
      --filter "label=com.docker.compose.project=$ComposeProject" `
      --filter 'label=com.docker.compose.service=cli' `
      --format '{{.ID}}'
  ) | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($WpCliContainer)) {
    throw 'Unable to find the disposable wp-env CLI container.'
  }
  $ApplicationPasswordOutput = @(
    & $DockerCommand exec $WpCliContainer wp user application-password create admin wepuu-local-e2e --porcelain
  )
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create the disposable WordPress Application Password.' }
  $ApplicationPassword = @(
    $ApplicationPasswordOutput |
      ForEach-Object { ([string]$_).Trim() } |
      Where-Object { $_ -match '^(?:[A-Za-z0-9]{4}[ ]?){6}$' }
  ) | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace($ApplicationPassword)) {
    throw 'The disposable WordPress Application Password output was not recognized.'
  }
  $ApplicationPasswordCreated = $true
  $BasicCredential = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("admin:$ApplicationPassword"))
  $env:WP_AUTO_MCP_AUTHORIZATION = "Basic $BasicCredential"
  $ProbeScript = Join-Path $Root 'scripts\probe-direct-mcp.mjs'
  & $ToolNodePath $ProbeScript 'http://127.0.0.1:8888/wp-json/wp-auto/mcp'
  if ($LASTEXITCODE -ne 0) { throw 'Application Password direct-MCP probe failed.' }
  Remove-Item Env:WP_AUTO_MCP_AUTHORIZATION -ErrorAction SilentlyContinue
  $ApplicationPassword = $null
  $BasicCredential = $null
  & $DockerCommand run --rm --entrypoint php `
    --mount "type=bind,source=$ConnectorCopy,target=/plugin,readonly" `
    --workdir /plugin `
    'php:8.2-cli@sha256:185eb902246c5757dbbb7e439bf92dfea32f627a401b1e2785bee0770fe0c41b' `
    vendor/bin/phpunit --do-not-cache-result
  if ($LASTEXITCODE -ne 0) { throw 'Connector PHPUnit suite failed in the pinned WordPress PHP runtime.' }
  Write-Output 'WP_ENV_CONNECTOR_ACTIVE=True'
  Write-Output 'WP_ENV_APPLICATION_PASSWORD_MCP=True'
  Write-Output 'WP_ENV_CONNECTOR_TESTS=True'
  Write-Output "WP_ENV_CONNECTOR_COMMIT=$ConnectorCommit"
} catch {
  if (Test-Path -LiteralPath $WpEnv -PathType Leaf) { Write-WpEnvDiagnostics }
  throw
} finally {
  Remove-Item Env:WP_AUTO_MCP_AUTHORIZATION -ErrorAction SilentlyContinue
  if ($ApplicationPasswordCreated -and -not [string]::IsNullOrWhiteSpace($WpCliContainer)) {
    & $DockerCommand exec $WpCliContainer wp user application-password delete admin --all | Out-Null
  }
  if (Test-Path -LiteralPath $WpEnv -PathType Leaf) {
    Invoke-WpEnv @("--config=$ConfigPath", 'destroy', '--force') -AllowFailure | Out-Null
  }
  $FinalCommit = (& git -c "safe.directory=$SafeConnectorPath" -C $ConnectorPath rev-parse HEAD).Trim()
  $FinalStatus = @(& git -c "safe.directory=$SafeConnectorPath" -C $ConnectorPath status --short)
  if ($FinalCommit -ne $ConnectorCommit -or $FinalStatus.Count -ne 0) {
    throw 'Connector repository changed during wp-env validation.'
  }
  if ($null -eq $PreviousWpEnvHome) { Remove-Item Env:WP_ENV_HOME -ErrorAction SilentlyContinue } else { $env:WP_ENV_HOME = $PreviousWpEnvHome }
  if ($null -eq $PreviousNpmCache) { Remove-Item Env:npm_config_cache -ErrorAction SilentlyContinue } else { $env:npm_config_cache = $PreviousNpmCache }
  if ($null -eq $PreviousCi) { Remove-Item Env:CI -ErrorAction SilentlyContinue } else { $env:CI = $PreviousCi }
  if ($null -ne $PreviousMcpAuthorization) { $env:WP_AUTO_MCP_AUTHORIZATION = $PreviousMcpAuthorization }
  $env:PATH = $PreviousPath
  if (Test-Path -LiteralPath $TemporaryRoot) {
    try { Remove-Item -LiteralPath $TemporaryRoot -Recurse -Force }
    catch { Write-Warning "Unable to remove temporary wp-env directory: $($_.Exception.Message)" }
  }
}
