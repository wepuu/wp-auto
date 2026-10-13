import { createHash } from 'node:crypto';
import { spawn, execFile as execFileCallback } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const SERVER_NAME = 'wepuu_local_issuer_probe';
const CLIENT_ID = 'wepuu-local-probe';
const CODE = 'LOCAL_SECRET_CODE_SENTINEL';
const TOKEN = 'LOCAL_SECRET_TOKEN_SENTINEL';
const CALLBACK_ID = 'LOCAL_CALLBACK_SENTINEL';
const OUTPUT_LIMIT = 512 * 1024;

export function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--codex-exe' || !path.isAbsolute(argv[1] ?? '')) {
    throw new Error('codex_absolute_executable_required');
  }
  return argv[1];
}

export async function inspectExecutable(executable) {
  if (!path.isAbsolute(executable)) throw new Error('codex_absolute_executable_required');
  const stat = await lstat(executable);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('codex_executable_invalid');
  const { stdout } = await execFile(executable, ['--version'], { timeout: 5_000, windowsHide: true });
  const version = stdout.trim();
  if (!/^codex-cli \d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/u.test(version)) {
    throw new Error('codex_version_invalid');
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(executable)) hash.update(chunk);
  return { version, executableSha256: hash.digest('hex') };
}

export function isolatedEnvironment(home, source = process.env) {
  const env = { CODEX_HOME: home, RUST_LOG: 'off' };
  // Forward only OS/runtime paths, never API keys, auth paths or proxy credentials.
  for (const key of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'Path', 'PATH',
    'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (source[key] !== undefined) env[key] = source[key];
  }
  return env;
}

export async function withBoundedProcess(executable, args, { cwd, env, timeoutMs = 20_000 }, action) {
  const child = spawn(executable, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '';
  let stderr = '';
  let outputBytes = 0;
  let finished = false;
  const controller = new AbortController();
  let rejectFailure;
  const failure = new Promise((_, reject) => { rejectFailure = reject; });
  const fail = (code) => { if (!finished) rejectFailure(new Error(code)); };
  child.stdout.on('data', (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > OUTPUT_LIMIT) { fail('codex_probe_output_limit'); return; }
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > OUTPUT_LIMIT) { fail('codex_probe_output_limit'); return; }
    stderr += chunk.toString();
  });
  child.stdin.on('error', () => fail('codex_probe_stdin_failed'));
  child.once('error', () => fail('codex_probe_spawn_failed'));
  const exit = new Promise((resolve) => child.once('close', (code) => resolve(code)));
  const timer = setTimeout(() => fail('codex_probe_timeout'), timeoutMs);
  try {
    return await Promise.race([action({ child, exit, signal: controller.signal,
      output: () => ({ stdout, stderr }) }), failure]);
  } finally {
    finished = true;
    controller.abort();
    clearTimeout(timer);
    child.stdin.destroy();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exit;
  }
}

export async function createMockAuthorizationServer() {
  let base;
  let binding;
  let tokenRequests = 0;
  let tokenAccepted = 0;
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url ?? '/', base).pathname;
      if (pathname === '/mcp') {
        response.writeHead(401, { 'content-type': 'application/json',
          'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` });
        response.end('{"error":"unauthorized"}');
        return;
      }
      let value;
      if (pathname.startsWith('/.well-known/oauth-protected-resource')) {
        value = { resource: `${base}/mcp`, authorization_servers: [base],
          scopes_supported: ['mcp:read'], bearer_methods_supported: ['header'] };
      } else if (pathname.startsWith('/.well-known/oauth-authorization-server')
        || pathname.startsWith('/.well-known/openid-configuration')) {
        value = { issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`,
          response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
          token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'],
          authorization_response_iss_parameter_supported: true };
      } else if (pathname === '/token' && request.method === 'POST') {
        tokenRequests += 1;
        let body = '';
        for await (const chunk of request) {
          body += chunk.toString();
          if (body.length > 16_384) throw new Error('mock_request_too_large');
        }
        const form = new URLSearchParams(body);
        const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
        if (!binding || form.get('grant_type') !== 'authorization_code' || form.get('code') !== CODE
          || form.get('client_id') !== CLIENT_ID || form.get('redirect_uri') !== binding.redirectUri
          || form.get('resource') !== `${base}/mcp`
          || challenge !== binding.challenge) {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end('{"error":"invalid_grant"}');
          return;
        }
        tokenAccepted += 1;
        value = { access_token: TOKEN, token_type: 'Bearer', expires_in: 300, scope: 'mcp:read' };
      }
      if (value) {
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(JSON.stringify(value));
      } else { response.writeHead(404); response.end(); }
    })().catch(() => { if (!response.headersSent) response.writeHead(400); response.end(); });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    get tokenRequests() { return tokenRequests; },
    get tokenAccepted() { return tokenAccepted; },
    callback(authorizationUrl, scenario, expectedPath) {
      const authorization = new URL(authorizationUrl);
      if (authorization.origin !== base || authorization.pathname !== '/authorize'
        || authorization.searchParams.get('client_id') !== CLIENT_ID
        || authorization.searchParams.get('code_challenge_method') !== 'S256'
        || authorization.searchParams.get('resource') !== `${base}/mcp`
        || authorization.searchParams.get('scope') !== 'mcp:read') throw new Error('mock_authorization_invalid');
      const callback = new URL(authorization.searchParams.get('redirect_uri'));
      if (callback.protocol !== 'http:' || callback.hostname !== '127.0.0.1' || !callback.port
        || callback.pathname !== expectedPath || callback.search || callback.hash) {
        throw new Error('mock_callback_invalid');
      }
      binding = { redirectUri: callback.href, challenge: authorization.searchParams.get('code_challenge') };
      callback.searchParams.set('code', CODE);
      callback.searchParams.set('state', scenario === 'wrong_state' ? 'LOCAL_WRONG_STATE_SENTINEL'
        : authorization.searchParams.get('state') ?? '');
      if (scenario !== 'missing') callback.searchParams.set('iss', scenario === 'mismatch'
        ? 'https://LOCAL_WRONG_ISSUER_SENTINEL.invalid' : base);
      return callback;
    },
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function errorClass(output) {
  if (/missing required issuer|issuer.*(?:missing|required)/iu.test(output)) return 'issuer_missing';
  if (/issuer.*mismatch|issuer.*does not match/iu.test(output)) return 'issuer_mismatch';
  if (/csrf|state.*(?:mismatch|different|invalid|does not match|not found)|different.*state/iu.test(output)) return 'state_invalid';
  return 'unclassified';
}

async function runScenario(executable, mode, scenario, callbackPath, home) {
  const mock = await createMockAuthorizationServer();
  const overrides = [
    `mcp_servers.${SERVER_NAME}.url="${mock.base}/mcp"`,
    `mcp_servers.${SERVER_NAME}.oauth_resource="${mock.base}/mcp"`,
    `mcp_servers.${SERVER_NAME}.oauth.client_id="${CLIENT_ID}"`,
    `mcp_servers.${SERVER_NAME}.oauth.callback_url="http://127.0.0.1${callbackPath}"`,
    `mcp_servers.${SERVER_NAME}.scopes=["mcp:read"]`,
    'mcp_oauth_credentials_store_mode="file"', 'analytics.enabled=false',
  ].flatMap((value) => ['-c', value]);
  const args = mode === 'cli' ? [...overrides, 'mcp', 'login', SERVER_NAME, '--no-browser']
    : ['app-server', '--stdio', ...overrides];
  try {
    const result = await withBoundedProcess(executable, args, { cwd: home, env: isolatedEnvironment(home) },
      async ({ child, exit, signal, output }) => {
        if (mode === 'cli') {
          let exited = false;
          void exit.then(() => { exited = true; });
          let authorizationUrl;
          while (!exited) {
            signal.throwIfAborted();
            authorizationUrl = output().stdout.concat(output().stderr)
              .match(/http:\/\/127\.0\.0\.1:\d+\/authorize\?[^\s]+/u)?.[0];
            if (authorizationUrl) break;
            await sleep(25);
          }
          if (!authorizationUrl) throw new Error('codex_cli_authorization_unavailable');
          child.stdin.end(`${mock.callback(authorizationUrl, scenario, callbackPath).href}\n`);
          const code = await exit;
          return { success: code === 0, errorClass: errorClass(output().stdout.concat(output().stderr)) };
        }
        const pending = new Map();
        const notices = [];
        let nextId = 1;
        const reader = readline.createInterface({ input: child.stdout });
        reader.on('line', (line) => {
          try {
            const message = JSON.parse(line);
            if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
            else if (message.method) notices.push(message);
          } catch { /* Ignore non-JSON startup diagnostics without printing them. */ }
        });
        const call = (method, params) => new Promise((resolve, reject) => {
          const id = nextId++;
          const cancelled = () => { pending.delete(id); reject(new Error('codex_probe_cancelled')); };
          signal.addEventListener('abort', cancelled, { once: true });
          pending.set(id, (message) => { signal.removeEventListener('abort', cancelled); resolve(message); });
          child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        });
        try {
          const initialized = await call('initialize', { clientInfo: {
            name: 'wepuu_local_issuer_probe', title: 'Local issuer probe', version: '0.1.0',
          }, capabilities: { experimentalApi: true } });
          if (initialized.error) throw new Error('codex_app_server_initialize_failed');
          child.stdin.write('{"jsonrpc":"2.0","method":"initialized","params":{}}\n');
          const login = await call('mcpServer/oauth/login', { name: SERVER_NAME, scopes: ['mcp:read'], timeoutSecs: 12 });
          const authorizationUrl = login.result?.url ?? login.result?.authorizationUrl;
          if (login.error || typeof authorizationUrl !== 'string') throw new Error('codex_app_server_login_failed');
          const response = await fetch(mock.callback(authorizationUrl, scenario, callbackPath), {
            signal: AbortSignal.timeout(5_000), redirect: 'error',
          });
          await response.text();
          if (response.status !== 200) throw new Error('codex_loopback_callback_failed');
          let completed;
          while (!completed) {
            signal.throwIfAborted();
            completed = notices.find((message) => message.params?.name === SERVER_NAME
              && typeof message.params?.success === 'boolean');
            if (!completed) await sleep(25);
          }
          return { success: completed.params.success,
            errorClass: errorClass(`${completed.params.error ?? ''}\n${output().stderr}`) };
        } finally { reader.close(); }
      });
    const expectedError = { missing: 'issuer_missing', mismatch: 'issuer_mismatch', wrong_state: 'state_invalid' }[scenario];
    const passed = scenario === 'matching'
      ? result.success && mock.tokenRequests === 1 && mock.tokenAccepted === 1
      : !result.success && result.errorClass === expectedError && mock.tokenRequests === 0;
    return { mode, scenario, callbackShape: callbackPath === '/callback' ? 'stable' : 'specific',
      success: result.success, tokenRequests: mock.tokenRequests, passed, errorClass: result.errorClass };
  } finally { await mock.close(); }
}

export function publicEvidence(identity, result) {
  return { version: identity.version, executableSha256: identity.executableSha256,
    mode: result.mode, scenario: result.scenario, callbackShape: result.callbackShape,
    success: result.success, tokenRequests: result.tokenRequests, passed: result.passed,
    failureClass: result.success ? undefined : result.errorClass };
}

export async function runCompatibilityProbe(executable, report = (evidence) => console.log(JSON.stringify(evidence))) {
  const identity = await inspectExecutable(executable);
  const tempBase = path.resolve(tmpdir());
  const root = await mkdtemp(path.join(tempBase, 'wepuu-codex-issuer-'));
  try {
    for (const mode of ['cli', 'app_server']) {
      for (const callbackPath of ['/callback', `/callback/${CALLBACK_ID}`]) {
        for (const scenario of ['matching', 'missing', 'mismatch', 'wrong_state']) {
          const home = path.join(root, `${mode}-${callbackPath === '/callback' ? 'stable' : 'specific'}-${scenario}`);
          await mkdir(home);
          const result = await runScenario(executable, mode, scenario, callbackPath, home);
          report(publicEvidence(identity, result));
          if (!result.passed) throw new Error('codex_issuer_scenario_failed');
        }
      }
    }
    return identity;
  } finally {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== tempBase || !path.basename(resolved).startsWith('wepuu-codex-issuer-')) {
      throw new Error('codex_probe_cleanup_boundary');
    }
    await rm(resolved, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCompatibilityProbe(parseArguments(process.argv.slice(2)));
    console.log('CODEX_LOCAL_ISSUER_COMPAT_PASS=True');
  } catch (error) {
    const code = error instanceof Error && /^(?:codex_|mock_)[a-z_]+$/u.test(error.message)
      ? error.message : 'codex_issuer_probe_failed';
    console.error(`CODEX_LOCAL_ISSUER_COMPAT_FAILED=${code}`);
    process.exitCode = 1;
  }
}
