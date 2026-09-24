[CmdletBinding()]
param(
  [string]$TenantId = '11111111-2222-4333-8444-555555555555'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ComposePath = Join-Path $Root 'compose.account-oidc-test.yaml'

$Sql = @"
DO `$fixture`$
DECLARE fixture_account text;
BEGIN
  SELECT id INTO fixture_account
  FROM platform.accounts
  WHERE status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;
  IF fixture_account IS NULL THEN
    RAISE EXCEPTION 'No authenticated fixture account exists';
  END IF;
  INSERT INTO platform.tenants (id, status)
  VALUES ('$TenantId', 'active')
  ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now();
  INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
  VALUES ('$TenantId', fixture_account, 'owner', 'active')
  ON CONFLICT (tenant_id, account_id)
  DO UPDATE SET role = 'owner', status = 'active', revoked_at = NULL;
END
`$fixture`$;
"@

$Sql | docker compose -f $ComposePath exec -T platform-db `
  psql -v ON_ERROR_STOP=1 -U postgres -d wepuu_test
if ($LASTEXITCODE -ne 0) { throw 'Unable to seed the disposable tenant membership.' }
Write-Output "TENANT_ID=$TenantId"
