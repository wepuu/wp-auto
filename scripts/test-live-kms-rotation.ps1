$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$required = @(
  'AWS_REGION',
  'WEPUU_KMS_KEY_ID',
  'WEPUU_KMS_KID',
  'WEPUU_KMS_SECOND_KEY_ID',
  'WEPUU_KMS_SECOND_KID'
)
foreach ($name in $required) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    throw "$name is required."
  }
}

function Invoke-DockerCommand {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  $PreviousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & docker @Arguments 2>&1 | ForEach-Object { Write-Host $_ }
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
}
if ($env:WEPUU_KMS_KEY_ID -eq $env:WEPUU_KMS_SECOND_KEY_ID -or
    $env:WEPUU_KMS_KID -eq $env:WEPUU_KMS_SECOND_KID) {
  throw 'The rotation test requires two distinct KMS keys and two distinct kid values.'
}

$env:WEPUU_LIVE_KMS_ROTATION = '1'
$ContainerName = "wepuu-kms-rotation-postgres-$PID"
$NetworkName = "wepuu-kms-rotation-network-$PID"
$ImageName = "wepuu-kms-rotation-node-$PID"
try {
  & docker network create $NetworkName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create the disposable Docker network.' }
  & docker run --detach --rm --name $ContainerName `
    --network $NetworkName `
    -e POSTGRES_DB=wepuu_test `
    -e POSTGRES_USER=postgres `
    -e POSTGRES_PASSWORD=conformance `
    postgres:16.10-alpine | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to start the disposable PostgreSQL container.' }
  for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
    & docker exec $ContainerName pg_isready -U postgres -d wepuu_test 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL did not become ready.' }
  $workspaceRoot = Split-Path -Parent $PSScriptRoot
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'build', '-f', (Join-Path $workspaceRoot 'test\account-oidc\Control.Dockerfile'),
    '-t', $ImageName, $workspaceRoot
  )
  if ($ExitCode -ne 0) { throw 'Unable to build the pinned Node 26.7 test image.' }
  $ExitCode = Invoke-DockerCommand -Arguments @(
    'run', '--rm', '--network', $NetworkName,
    '-e', 'AWS_ACCESS_KEY_ID', '-e', 'AWS_SECRET_ACCESS_KEY', '-e', 'AWS_SESSION_TOKEN',
    '-e', 'AWS_REGION', '-e', 'WEPUU_KMS_KEY_ID', '-e', 'WEPUU_KMS_KID',
    '-e', 'WEPUU_KMS_SECOND_KEY_ID', '-e', 'WEPUU_KMS_SECOND_KID',
    '-e', 'WEPUU_LIVE_KMS_ROTATION=1',
    '-e', "WEPUU_KMS_ROTATION_DATABASE_URL=postgresql://postgres:conformance@${ContainerName}:5432/wepuu_test",
    $ImageName, 'node', 'node_modules/tsx/dist/cli.mjs', '--test',
    '--test-name-pattern=live two-key AWS KMS lifecycle',
    'apps/authorization-service/src/live-kms-rotation.test.ts'
  )
  if ($ExitCode -ne 0) { throw "Two-key KMS rotation test failed with exit code $ExitCode." }
} finally {
  $PreviousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & docker rm --force $ContainerName 2>&1 | Out-Null
    & docker network rm $NetworkName 2>&1 | Out-Null
    & docker image rm $ImageName 2>&1 | Out-Null
  } finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
  Remove-Item Env:WEPUU_LIVE_KMS_ROTATION, Env:WEPUU_KMS_ROTATION_DATABASE_URL -ErrorAction SilentlyContinue
}
