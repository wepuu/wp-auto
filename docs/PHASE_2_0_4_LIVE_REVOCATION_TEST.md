# Phase 2.0.4 Live HTTPS Revocation Gate

This gate exercises the real TypeScript outbox worker, AWS KMS event signer,
Caddy TLS boundary, WordPress REST endpoint, PHP JWKS verifier, and local grant
deny state. The fixture is disposable and carries only bounded control
metadata. It never sends an MCP request body or WordPress content through the
platform.

Use an elevated PowerShell because the shared HTTPS fixture temporarily adds
three test hostnames and one CurrentUser test CA. Supply AWS credentials only
in the current process environment. Do not use `.env` or `setx`.

```powershell
Set-Location D:\Codex\wp-platform

$env:AWS_ACCESS_KEY_ID = (Read-Host 'Paste test Access Key ID').Trim()
$secret = Read-Host 'Paste test Secret Access Key' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:AWS_SECRET_ACCESS_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $env:AWS_REGION = 'us-east-1'
  $env:WEPUU_KMS_KEY_ID = 'arn:aws:kms:us-east-1:453168420598:key/40426a27-701e-4fd3-b17b-4345ed26e2c3'
  $env:WEPUU_KMS_KID = 'wepuu-test-2026-01'

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\account-oidc-https.ps1 Install
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-live-revocation.ps1
} finally {
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\account-oidc-https.ps1 Remove
  Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN,
    Env:AWS_REGION, Env:WEPUU_KMS_KEY_ID, Env:WEPUU_KMS_KID -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable secret, pointer -ErrorAction SilentlyContinue
}
```

Success requires `LIVE_HTTPS_REVOCATION_DELIVERY=True`,
`CONNECTOR_GRANT_DENIED=True`, `HOSTS_RESTORED=True`, and
`TRUST_RESTORED=True`. Evidence must not include credentials, compact JWS
values, cookies, WordPress content, or stored option bodies.

The Windows harness invokes Docker cleanup through a native-command wrapper.
Docker writes ordinary lifecycle progress such as `Container ... Stopping` to
stderr, which must not convert an otherwise successful PowerShell run into a
`NativeCommandError`.
