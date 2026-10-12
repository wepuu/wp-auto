import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type ServerOptions } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PairingDiagnosticError, createSiteProofRequest } from '../src/index.js';

function expected(code: string): (error: unknown) => boolean {
  return (error) => error instanceof PairingDiagnosticError && error.code === code
    && !error.message.includes('SECRET_SENTINEL');
}

function pemFromDer(der: Buffer): string {
  return `-----BEGIN CERTIFICATE-----\n${der.toString('base64').match(/.{1,64}/gu)?.join('\n') ?? ''}\n-----END CERTIFICATE-----\n`;
}

function certificateFixture(directory: string): { server: ServerOptions; ca: string } {
  if (process.platform === 'win32') {
    const pfxPath = join(directory, 'server.pfx');
    const derPath = join(directory, 'server.cer');
    const quote = (value: string): string => value.replaceAll("'", "''");
    const script = [
      "$password=ConvertTo-SecureString -String 'test-only-password' -Force -AsPlainText",
      "$certificate=New-SelfSignedCertificate -DnsName 'site.example.test' -CertStoreLocation 'Cert:\\CurrentUser\\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter ([DateTime]::UtcNow.AddDays(1))",
      'try {',
      `Export-PfxCertificate -Cert $certificate -FilePath '${quote(pfxPath)}' -Password $password | Out-Null`,
      `[IO.File]::WriteAllBytes('${quote(derPath)}',$certificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))`,
      '} finally {',
      'Remove-Item -LiteralPath ("Cert:\\CurrentUser\\My\\" + $certificate.Thumbprint) -Force',
      '}'
    ].join(';');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'pipe' });
    const ca = pemFromDer(readFileSync(derPath));
    return { server: { pfx: readFileSync(pfxPath), passphrase: 'test-only-password' }, ca };
  }
  const keyPath = join(directory, 'server.key');
  const certPath = join(directory, 'server.crt');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-sha256',
    '-subj', '/CN=site.example.test', '-addext', 'subjectAltName=DNS:site.example.test',
    '-keyout', keyPath, '-out', certPath
  ], { stdio: 'pipe' });
  const ca = readFileSync(certPath, 'utf8');
  return { server: { key: readFileSync(keyPath), cert: ca }, ca };
}

test('real HTTPS transport pins the address and classifies bounded failures without retries', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'wepuu-pairing-tls-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fixture = certificateFixture(directory);
  let requests = 0;
  let observed: Record<string, unknown> = {};
  const server = createServer(fixture.server, (request, response) => {
    requests += 1;
    observed = {
      method: request.method,
      host: request.headers.host,
      contentType: request.headers['content-type'],
      contentLength: request.headers['content-length'],
      servername: request.socket.servername,
      remoteAddress: request.socket.remoteAddress
    };
    const path = request.url ?? '/';
    if (path === '/reset') { request.socket.destroy(); return; }
    if (path === '/timeout') return;
    if (path === '/invalid-json') { response.setHeader('content-type', 'application/json'); response.end('{'); return; }
    if (path === '/invalid-schema') { response.setHeader('content-type', 'application/json'); response.end('{}'); return; }
    if (path === '/wrong-type') { response.setHeader('content-type', 'text/plain'); response.end('SECRET_SENTINEL'); return; }
    if (path === '/large') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ proof: 'x'.repeat(20_000), publicJwk: {} }));
      return;
    }
    const status = Number(path.slice(1));
    if (Number.isInteger(status) && status >= 300) { response.statusCode = status; response.end('SECRET_SENTINEL'); return; }
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({
      proof: 'header.payload.signature',
      publicJwk: { kty: 'OKP', crv: 'Ed25519', x: 'x'.repeat(43), kid: 'site-key-0001', alg: 'EdDSA', use: 'sig' }
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');
  const base = `https://site.example.test:${address.port}`;
  const request = createSiteProofRequest({ ca: fixture.ca, timeoutMs: 75 });
  const body = Buffer.from('{"sentinel":"SECRET_SENTINEL"}');
  const before = requests;
  await request(new URL(`${base}/ok`), body, '127.0.0.1');
  assert.equal(requests, before + 1);
  assert.deepEqual(observed, {
    method: 'POST', host: `site.example.test:${address.port}`, contentType: 'application/json',
    contentLength: String(body.byteLength), servername: 'site.example.test', remoteAddress: '127.0.0.1'
  });

  for (const [path, code] of [
    ['/401', 'http.401'], ['/403', 'http.403'], ['/429', 'http.429'], ['/418', 'http.4xx'],
    ['/500', 'http.5xx'], ['/302', 'http.other'], ['/wrong-type', 'response.content_type_invalid'],
    ['/invalid-json', 'response.json_invalid'], ['/invalid-schema', 'response.schema_invalid'],
    ['/large', 'response.too_large'], ['/reset', 'network.failed'], ['/timeout', 'network.timeout']
  ] as const) {
    const count = requests;
    await assert.rejects(request(new URL(`${base}${path}`), body, '127.0.0.1'), expected(code));
    assert.equal(requests, count + 1, path);
  }

  await assert.rejects(
    createSiteProofRequest({ timeoutMs: 75 })(new URL(`${base}/ok`), body, '127.0.0.1'), expected('tls.failed')
  );
  await assert.rejects(
    request(new URL(`https://wrong.example.test:${address.port}/ok`), body, '127.0.0.1'), expected('tls.failed')
  );
});
