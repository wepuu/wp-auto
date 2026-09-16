[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Install', 'Remove', 'Status')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Temp = Join-Path $Root '.tmp'
$StatePath = Join-Path $Temp 'https-fixture-state.json'
$CertificatePath = Join-Path $Temp 'caddy-root.crt'
$HostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$MarkerStart = '# WePuu OAuth conformance fixture - begin'
$MarkerEnd = '# WePuu OAuth conformance fixture - end'
$Domains = @('auth.example.test', 'site-a.example.test')

function Get-CertificateSha256([System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate) {
  $Hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($Hasher.ComputeHash($Certificate.RawData))).Replace('-', '')
  } finally {
    $Hasher.Dispose()
  }
}

function Find-TestCertificate([string]$Sha256) {
  Get-ChildItem Cert:\CurrentUser\Root | Where-Object { (Get-CertificateSha256 $_) -eq $Sha256 }
}

function Assert-HostsWritable {
  $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $Principal = [Security.Principal.WindowsPrincipal]::new($Identity)
  if (-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Administrator PowerShell is required only for the temporary hosts entries.'
  }
}

function Remove-HostsBlock {
  $Text = [IO.File]::ReadAllText($HostsPath)
  $Pattern = "(?ms)^$([regex]::Escape($MarkerStart))\r?\n.*?^$([regex]::Escape($MarkerEnd))\r?\n?"
  $Restored = [regex]::Replace($Text, $Pattern, '')
  if ($Restored -ne $Text) { [IO.File]::WriteAllText($HostsPath, $Restored, [Text.UTF8Encoding]::new($false)) }
}

if ($Action -eq 'Install') {
  Assert-HostsWritable
  New-Item -ItemType Directory -Path $Temp -Force | Out-Null
  if (Test-Path $StatePath) { throw 'Fixture state already exists; run Remove first.' }
  $PreparedByCurrentUser = Test-Path $CertificatePath
  $Port443InUse = [bool](Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue)
  if ($PreparedByCurrentUser -and -not $Port443InUse) { throw 'Prepared CA exists but the HTTPS fixture is not listening on port 443.' }
  if (-not $PreparedByCurrentUser -and $Port443InUse) { throw 'TCP port 443 is already in use.' }
  $HostsText = [IO.File]::ReadAllText($HostsPath)
  foreach ($Domain in $Domains) {
    if ($HostsText -match "(?im)^\s*\S+\s+.*\b$([regex]::Escape($Domain))\b") { throw "hosts already contains $Domain" }
  }
  try {
    if (-not $PreparedByCurrentUser) {
      docker compose --profile https-fixture up -d --wait postgres fixture caddy
      if ($LASTEXITCODE -ne 0) { throw 'Docker fixture failed to start.' }
      docker compose --profile https-fixture cp caddy:/data/caddy/pki/authorities/local/root.crt $CertificatePath
      if ($LASTEXITCODE -ne 0) { throw 'Unable to copy Caddy root CA.' }
    }
    $Certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($CertificatePath)
    $Sha256 = Get-CertificateSha256 $Certificate
    Import-Certificate -FilePath $CertificatePath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
    Add-Content -LiteralPath $HostsPath -Value "`r`n$MarkerStart`r`n127.0.0.1 auth.example.test`r`n127.0.0.1 site-a.example.test`r`n$MarkerEnd" -Encoding utf8
    [ordered]@{
      caSha256 = $Sha256
      hostsPath = $HostsPath
      issuer = 'https://auth.example.test'
      resource = 'https://site-a.example.test/wp-json/wp-auto/mcp'
    } | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8
    Write-Output "HTTPS_FIXTURE_INSTALLED=true"
    Write-Output "CA_SHA256=$Sha256"
  } catch {
    [IO.File]::WriteAllText((Join-Path $Temp 'https-fixture-error.txt'), $_.Exception.Message, [Text.UTF8Encoding]::new($false))
    Remove-HostsBlock
    if ($Sha256) { Find-TestCertificate $Sha256 | Remove-Item -Force }
    if (-not $PreparedByCurrentUser) { docker compose --profile https-fixture down --volumes --remove-orphans | Out-Null }
    throw
  }
  exit 0
}

if ($Action -eq 'Remove') {
  Assert-HostsWritable
  $State = if (Test-Path $StatePath) { Get-Content -Raw $StatePath | ConvertFrom-Json } else { $null }
  Remove-HostsBlock
  if ($State.caSha256) { Find-TestCertificate $State.caSha256 | Remove-Item -Force }
  # Docker Desktop is connected to the interactive user's named pipe. An
  # elevated PowerShell process can edit hosts but commonly cannot reach that
  # pipe, so container teardown is intentionally performed by the caller after
  # this system-only cleanup succeeds.
  Remove-Item -LiteralPath $CertificatePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
  $HostsRestored = -not ([IO.File]::ReadAllText($HostsPath).Contains($MarkerStart))
  $TrustRestored = -not $State -or -not @(Find-TestCertificate $State.caSha256).Count
  Write-Output "HOSTS_RESTORED=$HostsRestored"
  Write-Output "TRUST_RESTORED=$TrustRestored"
  exit $(if ($HostsRestored -and $TrustRestored) { 0 } else { 1 })
}

$State = if (Test-Path $StatePath) { Get-Content -Raw $StatePath | ConvertFrom-Json } else { $null }
$HostsInstalled = [IO.File]::ReadAllText($HostsPath).Contains($MarkerStart)
$TrustInstalled = $State -and @(Find-TestCertificate $State.caSha256).Count -eq 1
Write-Output "STATE_PRESENT=$([bool]$State)"
Write-Output "HOSTS_INSTALLED=$HostsInstalled"
Write-Output "TRUST_INSTALLED=$TrustInstalled"
if ($State) { Write-Output "CA_SHA256=$($State.caSha256)" }
