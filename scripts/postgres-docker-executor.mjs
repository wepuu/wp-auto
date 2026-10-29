import { execFile } from 'node:child_process';

// A separate deadline flag, not error.killed, establishes timeout provenance.
// The factory is inert; R93 tests inject execFile and never start a subprocess here.
export function postgresDockerExecutor(executable, prefix, env, execFileImpl = execFile) {
  return (args, { timeoutMs }) => new Promise(resolve => {
    const started = performance.now();
    let child, deadline, hardStop, timedOut = false, settled = false;
    const finish = (error, stdout, stderr) => {
      settled = true; clearTimeout(deadline); clearTimeout(hardStop);
      resolve({ ok: !error, stdout: typeof stdout === 'string' ? stdout : '',
        stderr: typeof stderr === 'string' ? stderr : '',
        exitCode: !error ? 0 : Number.isSafeInteger(error.code) ? error.code : null,
        spawnCode: ['ENOENT', 'EACCES', 'EPERM'].includes(error?.code) ? error.code : null,
        signal: error?.signal ?? null, timedOut,
        outputLimitExceeded: error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
        elapsedMs: Math.round(performance.now() - started) });
    };
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
      finish({ code: 'INVALID_DEADLINE' }, '', ''); return;
    }
    try {
      child = execFileImpl(executable, [...prefix, ...args],
        { env, windowsHide: true, maxBuffer: 1000000, encoding: 'utf8' }, finish);
      if (!settled) {
        deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
        hardStop = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs + 1000);
      }
    } catch (error) { finish(error, '', ''); }
  });
}
