import { spawn } from 'node:child_process';
const signalNames = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV']);
export const startupErrors = Object.freeze(['production_email_delivery_required', 'otp_send_key_file_required', 'otp_send_key_invalid', 'resend_environment_incomplete', 'resend_api_key_invalid', 'account_auth_environment_incomplete', 'otp_send_storage_unavailable']);
export function stderrClassifier() {
 let tail = '', category = 'NOT_OBSERVED';
 return { add(chunk) { tail = (tail + String(chunk)).slice(-2048); for (const e of startupErrors) if (new RegExp('(?:^|\\n)(?:Error: )?' + e + '(?:\\r?\\n|$)').test(tail)) category = e; }, value() { return category; } };
}
export function controlEnvironment(common, { port, quotaFile, apiKeyFile, grantKey }) {
 return { ...common, NODE_ENV: 'production', WEPUU_EMAIL_DELIVERY: 'resend', WEPUU_EMAIL_OTP_SEND_ENABLED: 'false',
  WEPUU_EMAIL_OTP_LIMIT_HMAC_KEY_FILE: quotaFile, WEPUU_RESEND_API_KEY_FILE: apiKeyFile, WEPUU_RESEND_FROM: 'WePuu Local <login@example.test>',
  WEPUU_SIGNING_KEY_SLOT: 'local-r3r1', WEPUU_CONTROL_HOST: '127.0.0.1', WEPUU_CONTROL_PORT: String(port), WEPUU_GRANT_IDEMPOTENCY_HMAC_KEY: grantKey };
}
// Injected IO is used only by pure EventEmitter simulations. Formal execution uses spawn/fetch.
export async function controlRun({ executable, args, cwd, env, base, attempt, io = {} }) {
 const now = io.now ?? (() => performance.now()), wait = io.wait ?? (ms => new Promise(r => setTimeout(r, ms)));
 const launch = io.spawn ?? spawn, request = io.fetch ?? fetch, started = now(), classify = stderrClassifier();
 const row = { attempt, ready: false, readinessStatus: null, stopRequested: false, stopSignalDelivered: false, exitCode: null, signal: null,
  exitObserved: false, closeObserved: false, spawnErrorCategory: 'NONE', startupFailureCategory: 'NONE', cleanupFailureCategory: 'NONE', outputLimitExceeded: false };
 let child, bytes = 0;
 try {
  child = launch(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
  child.once('error', error => { row.spawnErrorCategory = ['ENOENT', 'EACCES', 'EPERM'].includes(error?.code) ? error.code : 'SPAWN_ERROR'; });
  child.once('exit', (code, signal) => { row.exitObserved = true; row.exitCode = Number.isSafeInteger(code) ? code : null; row.signal = signalNames.has(signal) ? signal : signal == null ? null : 'OTHER'; });
  child.once('close', (code, signal) => { row.closeObserved = true; row.exitCode = Number.isSafeInteger(code) ? code : null; row.signal = signalNames.has(signal) ? signal : signal == null ? null : 'OTHER'; });
  const discard = (chunk, stderr) => { bytes += chunk.length; if (stderr && bytes <= 65536) classify.add(chunk); if (bytes > 65536) row.outputLimitExceeded = true; };
  child.stdout.on('data', b => discard(b, false)); child.stderr.on('data', b => discard(b, true));
  const until = now() + 10000;
  while (!row.closeObserved && row.spawnErrorCategory === 'NONE' && !row.outputLimitExceeded && now() < until) {
   try { const r = await request(base + '/health/ready', { signal: AbortSignal.timeout(500), redirect: 'error' }); row.readinessStatus = r.status; await r.body?.cancel(); if (r.status === 200) { row.ready = true; break; } } catch { /* bounded readiness polling */ }
   await wait(100);
  }
  if (!row.ready) row.startupFailureCategory = row.spawnErrorCategory !== 'NONE' ? 'SPAWN_FAILED' : row.outputLimitExceeded ? 'OUTPUT_LIMIT' : classify.value() !== 'NOT_OBSERVED' ? classify.value() : row.closeObserved ? 'EXIT_BEFORE_READY' : 'READINESS_TIMEOUT';
 } catch { row.startupFailureCategory = 'LOCAL_OBSERVATION_FAILED'; }
 finally {
  if (child && !row.closeObserved && row.spawnErrorCategory === 'NONE') { row.stopRequested = true; try { row.stopSignalDelivered = child.kill('SIGTERM') === true; } catch { row.cleanupFailureCategory = 'SIGNAL_SEND_FAILED'; } }
  const until = now() + 6000;
  while (child && !row.closeObserved && now() < until) await wait(25);
  if (child && !row.closeObserved) { row.cleanupFailureCategory = 'STOP_TIMEOUT'; try { child.kill('SIGKILL'); } catch {} const end = now() + 1000; while (!row.closeObserved && now() < end) await wait(25); }
  else if (child && row.spawnErrorCategory === 'NONE' && (row.exitCode !== 0 || row.signal !== null)) row.cleanupFailureCategory = 'UNCLEAN_EXIT';
  row.observedStartupError = classify.value(); row.outputBytes = bytes; row.elapsedMonotonicMs = Math.max(0, Math.round(now() - started));
 }
 row.passed = row.ready && row.exitObserved && row.closeObserved && row.exitCode === 0 && row.signal === null && row.stopRequested && row.stopSignalDelivered
  && row.startupFailureCategory === 'NONE' && row.cleanupFailureCategory === 'NONE' && row.spawnErrorCategory === 'NONE' && !row.outputLimitExceeded;
 return row;
}
export function controlRunPass(r) { return r?.passed === true && r.ready === true && r.readinessStatus === 200 && r.exitObserved === true && r.closeObserved === true
 && r.exitCode === 0 && r.signal === null && r.stopRequested === true && r.stopSignalDelivered === true && r.spawnErrorCategory === 'NONE'
 && r.startupFailureCategory === 'NONE' && r.cleanupFailureCategory === 'NONE' && r.outputLimitExceeded === false; }
