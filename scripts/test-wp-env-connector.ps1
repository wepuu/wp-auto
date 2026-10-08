[CmdletBinding()]
param(
  [string]$ConnectorPath = (Join-Path (Split-Path -Parent $PSScriptRoot) '..\wp-auto-connector'),
  [string]$WpEnvVersion = '11.11.0'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$ConnectorPath = [IO.Path]::GetFullPath($ConnectorPath)
$TemporaryRoot = Join-Path $Root '.tmp\wp-env-local-signing'
$ConnectorCopy = Join-Path $TemporaryRoot 'wp-env-connector'
$ConfigPath = Join-Path $TemporaryRoot 'wp-env.local-signing.json'
$WpEnvHome = Join-Path $TemporaryRoot 'home'
$NpmCache = Join-Path $TemporaryRoot 'npm-cache'
$Npx = (Get-Command npx.cmd -ErrorAction Stop).Source
$Curl = (Get-Command curl.exe -ErrorAction Stop).Source

function Assert-TemporaryPath([string]$Path) {
  $Full = [IO.Path]::GetFullPath($Path)
  $ExpectedPrefix = (Join-Path $Root '.tmp') + [IO.Path]::DirectorySeparatorChar
  if (-not $Full.StartsWith($ExpectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing non-temporary path: $Full"
  }
}

function Invoke-WpEnv([string[]]$Arguments, [switch]$AllowFailure) {
  & $Npx --yes "@wordpress/env@$WpEnvVersion" @Arguments
  $ExitCode = $LASTEXITCODE
  if (-not $AllowFailure -and $ExitCode -ne 0) {
    throw "wp-env command failed with exit code ${ExitCode}: $($Arguments -join ' ')"
  }
  return $ExitCode
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
New-Item -ItemType Directory -Path $ConnectorCopy, $WpEnvHome, $NpmCache -Force | Out-Null
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
$env:WP_ENV_HOME = $WpEnvHome
$env:npm_config_cache = $NpmCache
$env:CI = 'true'

try {
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
  & $DockerCommand run --rm --entrypoint php `
    --mount "type=bind,source=$ConnectorCopy,target=/plugin,readonly" `
    --workdir /plugin `
    'php:8.2-cli@sha256:185eb902246c5757dbbb7e439bf92dfea32f627a401b1e2785bee0770fe0c41b' `
    vendor/bin/phpunit --do-not-cache-result
  if ($LASTEXITCODE -ne 0) { throw 'Connector PHPUnit suite failed in the pinned WordPress PHP runtime.' }
  Write-Output 'WP_ENV_CONNECTOR_ACTIVE=True'
  Write-Output 'WP_ENV_CONNECTOR_TESTS=True'
  Write-Output "WP_ENV_CONNECTOR_COMMIT=$ConnectorCommit"
} finally {
  Invoke-WpEnv @("--config=$ConfigPath", 'destroy', '--force') -AllowFailure | Out-Null
  $FinalCommit = (& git -c "safe.directory=$SafeConnectorPath" -C $ConnectorPath rev-parse HEAD).Trim()
  $FinalStatus = @(& git -c "safe.directory=$SafeConnectorPath" -C $ConnectorPath status --short)
  if ($FinalCommit -ne $ConnectorCommit -or $FinalStatus.Count -ne 0) {
    throw 'Connector repository changed during wp-env validation.'
  }
  if ($null -eq $PreviousWpEnvHome) { Remove-Item Env:WP_ENV_HOME -ErrorAction SilentlyContinue } else { $env:WP_ENV_HOME = $PreviousWpEnvHome }
  if ($null -eq $PreviousNpmCache) { Remove-Item Env:npm_config_cache -ErrorAction SilentlyContinue } else { $env:npm_config_cache = $PreviousNpmCache }
  if ($null -eq $PreviousCi) { Remove-Item Env:CI -ErrorAction SilentlyContinue } else { $env:CI = $PreviousCi }
  if (Test-Path -LiteralPath $TemporaryRoot) { Remove-Item -LiteralPath $TemporaryRoot -Recurse -Force }
}
