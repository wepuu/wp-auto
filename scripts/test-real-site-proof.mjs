import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeResource, pairingDiagnostic, verifySiteProof } from '../packages/pairing/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PHP_IMAGE = 'php@sha256:4bbc4316a5b4acd689fe791603d5340bed9184d6cb4303c070cf5630711e609a';
const legacyImage = 'wordpress@sha256:f73396626d2f1b89d4c556917c15f55cfcc6b5f80595205516e490f0f04015e4';
const artifactHash = 'f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960';

// Bounded in-memory capture. Never expose child output in errors (including timeout/spawn failure).
export function safeProcess(command, args, { timeoutMs = 30000, maxBytes = 128 * 1024, allowStderr = false } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', stderrBytes = 0, bytes = 0, failure;
    const timer = setTimeout(() => { failure = 'CHILD_TIMEOUT'; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) { failure = 'CHILD_OUTPUT_LIMIT'; child.kill('SIGKILL'); }
      else output += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxBytes) { failure = 'CHILD_OUTPUT_LIMIT'; child.kill('SIGKILL'); }
    });
    child.once('error', () => { clearTimeout(timer); reject(new Error('CHILD_UNAVAILABLE')); });
    child.once('close', code => {
      clearTimeout(timer);
      if (failure || code !== 0 || (!allowStderr && stderrBytes !== 0)) reject(new Error(failure ?? `CHILD_FAILED_EXIT_${Number.isInteger(code) ? code : 'UNKNOWN'}`));
      else accept(output);
    });
  });
}

function requireResult(condition) { if (!condition) throw new Error('INTEROP_ASSERTION_FAILED'); }

export async function runRealSiteProof({ legacy = false } = {}) {
  const fixtureRoot = resolve(root, 'tests/fixtures/p3e1a');
  const archive = resolve(fixtureRoot, 'wepuu-auto-connector.zip');
  requireResult(createHash('sha256').update(await readFile(archive)).digest('hex') === artifactHash);
  const temporary = await mkdtemp(resolve(tmpdir(), 'wepuu-p3e1a-'));
  const temporaryReal = await realpath(temporary);
  const container = `wepuu-p3e1a-${randomUUID()}`;
  let signerStarted = false;
  try {
    await chmod(temporary, 0o755);
    await safeProcess(process.platform === 'win32' ? 'python' : 'python3', [resolve(fixtureRoot, 'extract.py'), archive, temporary]);
    // Pull separately: a slow pull cannot strand a signer container; no production image is used.
    const image = legacy ? legacyImage : PHP_IMAGE;
    await safeProcess('docker', ['pull', image], { timeoutMs: 120000, maxBytes: 1024 * 1024, allowStderr: true });
    signerStarted = true;
    const captured = await safeProcess('docker', [
      'run', '--rm', '--name', container, '--network=none', '--read-only', '--cap-drop=ALL',
      '--security-opt=no-new-privileges', '--user=65534:65534', '--entrypoint=php',
      '--mount', `type=bind,source=${temporary},target=/fixture,readonly`,
      '--mount', `type=bind,source=${fixtureRoot},target=/runner,readonly`,
      image, '/runner/sign.php', '/fixture'
    ]);
    let decoded;
    try { decoded = JSON.parse(captured); } catch { throw new Error('FIXTURE_JSON_INVALID'); }
    requireResult(decoded.sodium === true && decoded.php === (legacy ? '8.1.34' : '8.2.28'));
    requireResult(decoded.jwt === '4.3.0' && decoded.signer_file_matches === true);
    requireResult(Array.isArray(decoded.fixtures) && decoded.fixtures.length === 9);
    for (const fixture of decoded.fixtures) {
      const expected = {
        kind: 'pairing', platformIssuer: 'https://auth.example.test',
        tenantId: '11111111-1111-4111-8111-111111111111',
        resource: canonicalizeResource('https://site.example.test/wp-json/wp-auto/mcp'),
        challenge: 'c'.repeat(43), pairingAttemptId: 'attempt_00000001', siteId: 'site_00000001',
        platformSigningKid: 'platform-key-0001',
        platformSigningKeySha256: createHash('sha256').update(fixture.pem, 'utf8').digest('base64url'),
        now: new Date('2026-10-15T12:00:00.000Z')
      };
      let verified;
      try { verified = await verifySiteProof(fixture.proof, fixture.publicJwk, expected); }
      catch (error) {
        const diagnostic = pairingDiagnostic(error);
        throw new Error(`REAL_SIGNER_REJECTED_${diagnostic.code}_${diagnostic.detail ?? 'none'}`);
      }
      requireResult(verified.claims.iat === 1792065600 && verified.claims.exp === 1792065660);
      requireResult(['aud', 'nbf', 'grant_id', 'client_id', 'subject_id', 'scope', 'decision'].every(k => !(k in verified.claims)));
      let mismatch;
      const otherPem = decoded.fixtures.find(other => other.pem !== fixture.pem).pem;
      try { await verifySiteProof(fixture.proof, fixture.publicJwk, { ...expected,
        platformSigningKeySha256: createHash('sha256').update(otherPem, 'utf8').digest('base64url') }); }
      catch (error) { mismatch = pairingDiagnostic(error); }
      requireResult(mismatch?.detail === 'claims.platform_key_binding_mismatch');
    }
    process.stdout.write(`REAL_SIGNER_INTEROP_PASS=true PHP=${decoded.php} SCENARIOS=9 PEM_MISMATCH_CHECKS=9\n`);
  } finally {
    // Exact generated name only. On timeout the container is killed even if the Docker client exited.
    try {
      if (signerStarted) {
        const remaining = (await safeProcess('docker', ['ps', '-aq', '--filter', `name=^/${container}$`], { timeoutMs: 10000 })).trim();
        if (remaining !== '') {
          requireResult(/^[a-f0-9]{12,64}$/.test(remaining));
          await safeProcess('docker', ['rm', '-f', container], { timeoutMs: 10000 });
        }
      }
    } finally {
      if (await realpath(temporary) !== temporaryReal || !basename(temporary).startsWith('wepuu-p3e1a-')) throw new Error('CLEANUP_PATH_INVALID');
      await rm(temporaryReal, { recursive: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runRealSiteProof({ legacy: process.argv.includes('--legacy') }); }
  catch (error) {
    // Only our own fixed error tokens; never a raw parser, filesystem, or child exception.
    const safe = /^(?:INTEROP_ASSERTION_FAILED|CHILD_[A-Z_0-9]+|FIXTURE_JSON_INVALID|CLEANUP_PATH_INVALID|REAL_SIGNER_REJECTED_[a-z._]+_[a-z._]+)$/.test(error.message);
    process.stderr.write(`${safe ? error.message : 'REAL_SIGNER_GATE_FAILED'}\n`);
    process.exitCode = 1;
  }
}
