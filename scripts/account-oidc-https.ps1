[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Install', 'MoveSite', 'Remove', 'Status')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ComposePath = Join-Path $Root 'compose.account-oidc-test.yaml'
$Temp = Join-Path $Root '.tmp\account-oidc-https'
$StatePath = Join-Path $Temp 'state.json'
$CertificatePath = Join-Path $Temp 'caddy-root.crt'
$HostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$MarkerStart = '# WePuu account OIDC fixture - begin'
$MarkerEnd = '# WePuu account OIDC fixture - end'
$Domains = @('platform.example.test', 'site.example.test', 'site-moved.example.test')

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

function Assert-Administrator {
  $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $Principal = [Security.Principal.WindowsPrincipal]::new($Identity)
  if (-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Administrator PowerShell is required for the temporary hosts entry.'
  }
}

function Invoke-DockerCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [switch]$Quiet
  )

  # Docker emits ordinary progress messages on stderr. Windows PowerShell 5.1
  # turns those messages into NativeCommandError records under Stop even when
  # Docker exits successfully, so the native exit code must be authoritative.
  $PreviousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    if ($Quiet) {
      & docker @Arguments 2>&1 | Out-Null
    }
    else {
      & docker @Arguments 2>&1 | ForEach-Object { Write-Host $_ }
    }
    $ExitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }

  return $ExitCode
}

function Remove-HostsBlock {
  $Text = [IO.File]::ReadAllText($HostsPath)
  $Pattern = "(?ms)^$([regex]::Escape($MarkerStart))\r?\n.*?^$([regex]::Escape($MarkerEnd))\r?\n?"
  $Restored = [regex]::Replace($Text, $Pattern, '')
  if ($Restored -ne $Text) {
    [IO.File]::WriteAllText($HostsPath, $Restored, [Text.UTF8Encoding]::new($false))
  }
}

if ($Action -eq 'Install') {
  Assert-Administrator
  New-Item -ItemType Directory -Path $Temp -Force | Out-Null
  if (Test-Path $StatePath) { throw 'Fixture state already exists; run Remove first.' }
  if (Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue) {
    throw 'TCP port 443 is already in use.'
  }
  $HostsText = [IO.File]::ReadAllText($HostsPath)
  foreach ($Domain in $Domains) {
    if ($HostsText -match "(?im)^\s*\S+\s+.*\b$([regex]::Escape($Domain))\b") {
      throw "hosts already contains $Domain"
    }
  }
  $Sha256 = $null
  try {
    $ExitCode = Invoke-DockerCommand -Arguments @(
      'compose', '-f', $ComposePath,
      'up', '-d', '--wait',
      'platform-db', 'wordpress-db', 'wordpress', 'caddy'
    )
    if ($ExitCode -ne 0) { throw 'Caddy fixture failed to start.' }
    $Copied = $false
    for ($Attempt = 0; $Attempt -lt 15 -and -not $Copied; $Attempt++) {
      $ExitCode = Invoke-DockerCommand -Arguments @(
        'compose', '-f', $ComposePath,
        'cp',
        'caddy:/data/caddy/pki/authorities/local/root.crt',
        $CertificatePath
      ) -Quiet
      $Copied = $ExitCode -eq 0
      if (-not $Copied) { Start-Sleep -Seconds 1 }
    }
    if (-not $Copied) { throw 'Unable to copy the Caddy root CA.' }
    $Certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($CertificatePath)
    $Sha256 = Get-CertificateSha256 $Certificate
    Import-Certificate -FilePath $CertificatePath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
    $HostLines = ($Domains | ForEach-Object { "127.0.0.1 $_" }) -join "`r`n"
    Add-Content -LiteralPath $HostsPath -Value "`r`n$MarkerStart`r`n$HostLines`r`n$MarkerEnd" -Encoding utf8
    $ExitCode = Invoke-DockerCommand -Arguments @(
      'compose', '-f', $ComposePath,
      '--profile', 'tools',
      'run', '--rm', 'wpcli',
      'core', 'install',
      '--url=https://site.example.test',
      '--title=WePuu Conformance',
      '--admin_user=wepuu-admin',
      '--admin_password=WePuu-Conformance-Only-2026!',
      '--admin_email=conformance@example.test',
      '--skip-email'
    )
    if ($ExitCode -ne 0) { throw 'Unable to install the disposable WordPress site.' }
    $ExitCode = Invoke-DockerCommand -Arguments @(
      'compose', '-f', $ComposePath,
      '--profile', 'tools',
      'run', '--rm', 'wpcli',
      'rewrite', 'structure', '/%postname%/', '--hard'
    )
    if ($ExitCode -ne 0) { throw 'Unable to enable canonical WordPress REST paths.' }
    $ExitCode = Invoke-DockerCommand -Arguments @(
      'compose', '-f', $ComposePath,
      '--profile', 'tools',
      'run', '--rm', 'wpcli',
      'plugin', 'activate', 'wepuu-auto-connector'
    )
    if ($ExitCode -ne 0) { throw 'Unable to activate the connector.' }
    [ordered]@{ caSha256 = $Sha256; domains = $Domains } |
      ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8
    Write-Output 'ACCOUNT_OIDC_HTTPS_INSTALLED=True'
    Write-Output "CA_SHA256=$Sha256"
    Write-Output 'PLATFORM_ORIGIN=https://platform.example.test'
    Write-Output 'WORDPRESS_ORIGIN=https://site.example.test'
    Write-Output 'WORDPRESS_MOVED_ORIGIN=https://site-moved.example.test'
    Write-Output 'WORDPRESS_ADMIN_USER=wepuu-admin'
    Write-Output 'WORDPRESS_ADMIN_PASSWORD=WePuu-Conformance-Only-2026!'
  } catch {
    Remove-HostsBlock
    if ($Sha256) { Find-TestCertificate $Sha256 | Remove-Item -Force }
    Invoke-DockerCommand -Arguments @(
      'compose', '-f', $ComposePath,
      '--profile', 'control',
      'down', '--volumes', '--remove-orphans'
    ) -Quiet | Out-Null
    Remove-Item -LiteralPath $CertificatePath, $StatePath -Force -ErrorAction SilentlyContinue
    throw
  }
  exit 0
}

if ($Action -eq 'MoveSite') {
  if (-not (Test-Path $StatePath)) { throw 'Fixture state is absent; run Install first.' }
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath,
    '--profile', 'tools',
    'run', '--rm', 'wpcli',
    'option', 'update', 'home', 'https://site-moved.example.test'
  )
  if ($ExitCode -ne 0) { throw 'Unable to update the disposable WordPress home URL.' }
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath,
    '--profile', 'tools',
    'run', '--rm', 'wpcli',
    'option', 'update', 'siteurl', 'https://site-moved.example.test'
  )
  if ($ExitCode -ne 0) { throw 'Unable to update the disposable WordPress site URL.' }
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath,
    '--profile', 'tools',
    'run', '--rm', 'wpcli',
    'rewrite', 'flush', '--hard'
  )
  if ($ExitCode -ne 0) { throw 'Unable to flush the disposable WordPress rewrite rules.' }
  Write-Output 'WORDPRESS_SITE_MOVED=True'
  Write-Output 'WORDPRESS_ORIGIN=https://site-moved.example.test'
  exit 0
}

if ($Action -eq 'Remove') {
  Assert-Administrator
  $State = if (Test-Path $StatePath) { Get-Content -Raw $StatePath | ConvertFrom-Json } else { $null }
  Remove-HostsBlock
  if ($State -and $State.caSha256) { Find-TestCertificate $State.caSha256 | Remove-Item -Force }
  Invoke-DockerCommand -Arguments @(
    'compose', '-f', $ComposePath,
    '--profile', 'control',
    'down', '--volumes', '--remove-orphans'
  ) -Quiet | Out-Null
  Remove-Item -LiteralPath $CertificatePath, $StatePath -Force -ErrorAction SilentlyContinue
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
