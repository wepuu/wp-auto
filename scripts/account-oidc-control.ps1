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
$SigningDirectory = Join-Path $Root ('.tmp\account-oidc-signing-' + [Guid]::NewGuid().ToString('N'))
$PrivateKeyPath = Join-Path $SigningDirectory 'private.pem'
$PassphrasePath = Join-Path $SigningDirectory 'passphrase'
$HostKeyringPath = Join-Path $SigningDirectory 'keyring-host.json'
$ContainerKeyringPath = Join-Path $SigningDirectory 'keyring-container.json'
$env:WEPUU_SIGNING_KEYRING_HOST_FILE = $ContainerKeyringPath
$env:WEPUU_SIGNING_PRIVATE_KEY_HOST_FILE = $PrivateKeyPath
$env:WEPUU_SIGNING_PASSPHRASE_HOST_FILE = $PassphrasePath

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

  Set-Location $Root
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', 'compose.account-oidc-test.yaml',
    'up', '-d', '--wait', 'platform-db', 'caddy'
  )
  if ($ExitCode -ne 0) { throw 'Disposable PostgreSQL and HTTPS fixtures failed to start.' }

  & pnpm build
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed.' }
  New-Item -ItemType Directory -Path $SigningDirectory -ErrorAction Stop | Out-Null
  $Generated = & node packages/key-custody/dist/cli.js generate `
    --private-key-file $PrivateKeyPath --passphrase-file $PassphrasePath
  if ($LASTEXITCODE -ne 0) { throw 'Local signing-key generation failed.' }
  $Kid = ($Generated | Select-Object -Last 1 | ConvertFrom-Json).kid
  if ($Kid -notmatch '^[A-Za-z0-9_-]{8,128}$') { throw 'Generated signing kid is invalid.' }

  $HostKeyring = @{ keys = @(@{
    slot = 'account-oidc-test'; privateKeyFile = $PrivateKeyPath; passphraseFile = $PassphrasePath
  }) } | ConvertTo-Json -Depth 5 -Compress
  $ContainerKeyring = @{ keys = @(@{
    slot = 'account-oidc-test'; privateKeyFile = '/run/secrets/wepuu-signing-private.pem';
    passphraseFile = '/run/secrets/wepuu-signing-passphrase'
  }) } | ConvertTo-Json -Depth 5 -Compress
  [IO.File]::WriteAllText($HostKeyringPath, $HostKeyring, [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($ContainerKeyringPath, $ContainerKeyring, [Text.UTF8Encoding]::new($false))

  $env:WEPUU_SIGNING_KEYRING_FILE = $HostKeyringPath
  $env:WEPUU_SIGNING_KEY_SLOT = 'account-oidc-test'
  $env:WEPUU_SIGNING_KEYRING_HOST_FILE = $ContainerKeyringPath
  $env:WEPUU_SIGNING_PRIVATE_KEY_HOST_FILE = $PrivateKeyPath
  $env:WEPUU_SIGNING_PASSPHRASE_HOST_FILE = $PassphrasePath
  & node packages/database/dist/cli.js migrate
  if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
  & node packages/database/dist/signing-keys-cli.js publish --slot account-oidc-test
  if ($LASTEXITCODE -ne 0) { throw 'Local signing-key publication failed.' }
  $BackdateSql = "UPDATE oauth.signing_key_metadata SET publish_at = now() - interval '21 minutes' WHERE kid = '$Kid';"
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', 'compose.account-oidc-test.yaml', 'exec', '-T', 'platform-db',
    'psql', '-U', 'postgres', '-d', 'wepuu_test', '-v', 'ON_ERROR_STOP=1', '-c', $BackdateSql
  )
  if ($ExitCode -ne 0) { throw 'Local test-key prepublication setup failed.' }
  & node packages/database/dist/signing-keys-cli.js activate --kid $Kid
  if ($LASTEXITCODE -ne 0) { throw 'Local signing-key activation failed.' }

  $ExitCode = Invoke-DockerCommand -Arguments @(
    'compose', '-f', 'compose.account-oidc-test.yaml',
    '--profile', 'control',
    'up', '-d', '--build', '--wait', 'control'
  )
  if ($ExitCode -ne 0) { throw 'Linux Node 26.7 control API failed to start.' }

  Write-Output 'CONTROL_API_RUNTIME=linux-node-26.7.0'
  Write-Output 'CONTROL_API_ORIGIN=https://platform.example.test'
  Write-Output "CONTROL_API_SIGNING_KID=$Kid"
  Write-Output "CONTROL_API_TEST_KEY_DIRECTORY=$SigningDirectory"
  Write-Output 'CONTROL_API_STARTED=True'
} finally {
  Remove-Item Env:WEPUU_DATABASE_URL, Env:WEPUU_ACCOUNT_OIDC_ISSUER, `
    Env:WEPUU_ACCOUNT_OIDC_CLIENT_ID, Env:WEPUU_ACCOUNT_OIDC_REDIRECT_URI, `
    Env:WEPUU_ACCOUNT_OIDC_SCOPES, Env:WEPUU_ACCOUNT_OIDC_CLIENT_AUTH_METHOD, `
    Env:WEPUU_CONTROL_PUBLIC_ORIGIN, Env:WEPUU_ACCOUNT_OIDC_CLIENT_SECRET, `
    Env:WEPUU_OIDC_TRANSACTION_KEYS_JSON, Env:WEPUU_IDENTITY_SUBJECT_HMAC_KEY, `
    Env:WEPUU_GRANT_IDEMPOTENCY_HMAC_KEY, Env:WEPUU_ISSUER, `
    Env:WEPUU_CONTROL_HOST, Env:WEPUU_CONTROL_PORT, Env:NODE_EXTRA_CA_CERTS, `
    Env:WEPUU_SIGNING_KEYRING_FILE, Env:WEPUU_SIGNING_KEY_SLOT, `
    Env:WEPUU_SIGNING_KEYRING_HOST_FILE, Env:WEPUU_SIGNING_PRIVATE_KEY_HOST_FILE, `
    Env:WEPUU_SIGNING_PASSPHRASE_HOST_FILE `
    -ErrorAction SilentlyContinue
  $Auth0Secret.Dispose()
}
