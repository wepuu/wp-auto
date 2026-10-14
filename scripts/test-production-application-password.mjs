import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { probeMcp } from './test-production-wordpress-oauth.mjs';

export const RESOURCE = 'https://test2.wpauto.cc/wp-json/wp-auto/mcp';
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18',
  capabilities: {}, clientInfo: { name: 'wepuu-application-password-probe', version: '0.1.0' } } };

export async function remoteCore(action, run) {
  if (!['preflight', 'create', 'ambient', 'cleanup'].includes(action)
      || !/^[a-f0-9-]{36}$/u.test(run)) throw new Error('application_core_arguments_invalid');
  const source = await readFile(new URL('./p3b3-application-password-core.php', import.meta.url), 'utf8');
  return new Promise((resolve, reject) => {
    const child = execFile('plink', ['-batch', 'root@5.255.99.225',
      `docker exec -i wpauto-wordpress-e2e-b-wordpress-1 php /dev/stdin ${action} ${run}`],
    { timeout: 30_000, maxBuffer: 65536, windowsHide: true }, (error, stdout) => {
      // Never propagate stderr/stdout/execFile error: create output contains a secret.
      if (error) { reject(new Error('application_core_operation_failed')); return; }
      try { const result = JSON.parse(stdout); if (result.error) throw new Error(); resolve(result); }
      catch { reject(new Error('application_core_response_invalid')); }
    });
    child.stdin.on('error', () => reject(new Error('application_core_input_failed')));
    child.stdin.end(source);
  });
}

async function jsonMessage(response) {
  const text = await response.text();
  if (text.length > 1048576) throw new Error('application_response_oversize');
  if ((response.headers.get('content-type') ?? '').includes('application/json')) return JSON.parse(text);
  for (const part of text.split(/\r?\n\r?\n/u)) {
    const data = part.split(/\r?\n/u).filter(x => x.startsWith('data:')).map(x => x.slice(5).trim()).join('\n');
    if (data && data !== '[DONE]') return JSON.parse(data);
  }
  throw new Error('application_response_invalid');
}

export async function runApplicationPasswordAcceptance(options) {
  const admin = options.admin;
  const request = options.request ?? fetch;
  const report = options.report ?? console.log;
  let identity;
  let creationAttempted = false;
  const pass = name => report(`${name}=True`);
  const post = (payload, headers = {}) => request(RESOURCE, { method: 'POST', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json, text/event-stream',
      'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  const denied = async (headers, bearer = false) => {
    const r = await post(INIT, headers);
    const challenge = r.headers.get('www-authenticate') ?? '';
    await r.body?.cancel();
    if (r.status !== 401 || (bearer && !/^Bearer\s+.*\berror="invalid_token"/u.test(challenge))) {
      throw new Error('application_denial_contract_invalid');
    }
  };
  try {
    const pre = await admin('preflight');
    if (!pre.supported || pre.subscribers !== 0) throw new Error('application_identity_review_required');
    creationAttempted = true;
    identity = await admin('create');
    if (!identity.subscriber || !Number.isSafeInteger(identity.userId) || !identity.password || !identity.login) {
      throw new Error('application_identity_invalid');
    }
    pass('APPLICATION_PASSWORD_CREATED');
    report(`TEMPORARY_SUBSCRIBER_ID=${identity.userId}`);
    const basic = `Basic ${Buffer.from(`${identity.login}:${identity.password}`).toString('base64')}`;
    const me = await request('https://test2.wpauto.cc/wp-json/wp/v2/users/me', {
      redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { authorization: basic } });
    if (me.status !== 200 || (await me.json()).id !== identity.userId) throw new Error('application_basic_identity_invalid');
    pass('APPLICATION_PASSWORD_BASIC_IDENTITY');
    let session;
    let protocol;
    await probeMcp(RESOURCE, 'not-an-oauth-credential', { strictTransport: true,
      request: async (url, init) => {
        if (url !== RESOURCE || init.method !== 'POST') throw new Error('application_destination_invalid');
        const response = await request(url, { ...init, headers: { ...init.headers, authorization: basic } });
        session = response.headers.get('mcp-session-id') ?? session;
        protocol = init.headers['mcp-protocol-version'] ?? protocol;
        return response;
      } });
    for (const name of ['APPLICATION_PASSWORD_BASIC_VALID', 'APPLICATION_PASSWORD_MCP_INITIALIZE',
      'APPLICATION_PASSWORD_TOOL_CATALOG_23', 'APPLICATION_PASSWORD_SITE_HEALTH']) pass(name);
    const headers = { authorization: basic, ...(session ? { 'mcp-session-id': session } : {}),
      ...(protocol ? { 'mcp-protocol-version': protocol } : {}) };
    const response = await post({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: {
      name: 'wp-auto-media-search', arguments: { per_page: 1 } } }, headers);
    if (response.status !== 200) { await response.body?.cancel(); throw new Error('application_permission_protocol_invalid'); }
    const body = await jsonMessage(response);
    // The frozen Adapter reports ability permission denial as an error tool result.
    if (body?.result?.isError !== true || body.result.structuredContent != null
        || !body.result.content?.some(x => x.type === 'text' && x.text === 'Permission denied')) {
      throw new Error('application_permission_denial_invalid');
    }
    pass('APPLICATION_PASSWORD_NATIVE_PERMISSION_DENIAL');
    await denied({ authorization: `Basic ${Buffer.from(`${identity.login}:wrong-${randomUUID()}`).toString('base64')}` });
    pass('APPLICATION_PASSWORD_BASIC_WRONG_DENIED');
    await denied({}); pass('APPLICATION_PASSWORD_MISSING_AUTH_DENIED');
    await denied({ authorization: 'Bearer wepuu-invalid-token' }, true);
    pass('APPLICATION_PASSWORD_INVALID_BEARER_DENIED');
    const ambient = await admin('ambient');
    const cookieHeaders = { cookie: ambient.cookie, 'x-wp-nonce': ambient.nonce };
    const who = await request('https://test2.wpauto.cc/wp-json/wp/v2/users/me', {
      redirect: 'error', signal: AbortSignal.timeout(10_000), headers: cookieHeaders });
    if (who.status !== 200 || (await who.json()).id !== identity.userId) throw new Error('application_ambient_identity_invalid');
    pass('APPLICATION_PASSWORD_TEMPORARY_COOKIE_CONTROL');
    await denied({ ...cookieHeaders, authorization: 'Bearer wepuu-invalid-token' }, true);
    pass('APPLICATION_PASSWORD_INVALID_BEARER_NO_COOKIE_FALLBACK');
    // Separate request, never a mixed Basic/Bearer Authorization header.
    const final = await post(INIT, { authorization: basic });
    if (final.status !== 200) { await final.body?.cancel(); throw new Error('application_basic_postcheck_failed'); }
    if (!(await jsonMessage(final))?.result) throw new Error('application_basic_postcheck_failed');
    pass('APPLICATION_PASSWORD_BASIC_POSTCHECK');
  } catch (error) {
    const allowed = new Set(['application_identity_review_required', 'application_identity_invalid',
      'application_destination_invalid', 'application_permission_protocol_invalid',
      'application_permission_denial_invalid', 'application_denial_contract_invalid',
      'application_ambient_identity_invalid', 'application_basic_identity_invalid', 'application_basic_postcheck_failed',
      'application_core_operation_failed', 'application_core_response_invalid', 'application_core_input_failed',
      'application_response_oversize', 'application_response_invalid',
      'mcp_tool_contract_mismatch', 'mcp_site_health_failed', 'mcp_protocol_mismatch']);
    report(`APPLICATION_PASSWORD_FAILURE=${allowed.has(error?.message) ? error.message : 'application_probe_failed'}`);
    throw error;
  } finally {
    if (creationAttempted) {
      const cleaned = await admin('cleanup');
      if (!cleaned.passwordRevoked || !cleaned.userDeleted) throw new Error('application_cleanup_failed');
      pass('APPLICATION_PASSWORD_REVOKED'); pass('APPLICATION_PASSWORD_TEMPORARY_USER_DELETED');
      if (identity) {
        await denied({ authorization: `Basic ${Buffer.from(`${identity.login}:${identity.password}`).toString('base64')}` });
        pass('APPLICATION_PASSWORD_REVOKED_CREDENTIAL_DENIED');
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).join(' ') !== '--execute true') {
    console.error('APPLICATION_PASSWORD_FAILURE=application_explicit_execution_required'); process.exitCode = 1;
  } else {
    const run = randomUUID();
    console.log(`APPLICATION_PASSWORD_RUN_ID=${run}`);
    try {
      await runApplicationPasswordAcceptance({ admin: action => remoteCore(action, run) });
      console.log('APPLICATION_PASSWORD_HTTP_ACCEPTANCE_PASS=True');
    } catch {
      // Raw exceptions may contain response content, Authorization or child-process data.
      console.error('APPLICATION_PASSWORD_HTTP_ACCEPTANCE_PASS=False'); process.exitCode = 1;
    }
  }
}
