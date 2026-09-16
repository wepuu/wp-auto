$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Temp = Join-Path $Root '.tmp'
$CodexHome = Join-Path $Temp 'codex-client'
$PidPath = Join-Path $Temp 'codex-login.pid'

if (Test-Path $PidPath) {
  $CodexProcessId = [int](Get-Content -Raw $PidPath)
  $Process = Get-Process -Id $CodexProcessId -ErrorAction SilentlyContinue
  if ($Process) { $Process | Stop-Process }
}
Remove-Item -LiteralPath $CodexHome -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $Temp 'codex-login.stdout.tmp'), (Join-Path $Temp 'codex-login.stderr.tmp'), $PidPath -Force -ErrorAction SilentlyContinue
Write-Output "CODEX_TEMP_REMOVED=$(-not (Test-Path $CodexHome))"
