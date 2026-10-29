import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, chmod, lstat, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateReportConfig, validateReportEnvelope } from './report-schema.mjs';
export const reportStatuses = new Set(['VALID', 'MISSING', 'INVALID_JSON', 'INVALID_SCHEMA', 'UNSAFE_FILE', 'TOO_LARGE', 'ACCESS_DENIED', 'READ_FAILED', 'REPORTER_EXCEPTION', 'NOT_CONFIRMED']);
export const processCategories = new Set(['PASS', 'TEST_FAILURE', 'PROCESS_EXIT_NONZERO', 'PROCESS_SIGNAL', 'PROCESS_TIMEOUT',
  'PROCESS_SPAWN_FAILED', 'PROCESS_OUTPUT_LIMIT', 'REPORT_MISSING', 'REPORT_INVALID_JSON', 'REPORT_INVALID_SCHEMA',
  'REPORT_UNSAFE_FILE', 'REPORT_TOO_LARGE', 'REPORT_ACCESS_DENIED', 'REPORT_READ_FAILED', 'REPORTER_EXCEPTION', 'REPORT_SETUP_FAILED', 'RESULT_SAVE_FAILED']);
export async function readReport(path, config, runId) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return { reportStatus: 'UNSAFE_FILE' };
    if (stat.size > 1024 * 1024) return { reportStatus: 'TOO_LARGE' };
    const bytes = await readFile(path);
    let value; try { value = JSON.parse(bytes.toString('utf8')); } catch { return { reportStatus: 'INVALID_JSON' }; }
    try {
      const parsed = validateReportEnvelope(value, config, runId);
      return parsed.reporterStatus === 'COMPLETE' ? { reportStatus: 'VALID', report: parsed.report }
        : { reportStatus: 'REPORTER_EXCEPTION' };
    } catch { return { reportStatus: 'INVALID_SCHEMA' }; }
  } catch (error) { return { reportStatus: error.code === 'ENOENT' ? 'MISSING'
    : ['EACCES', 'EPERM'].includes(error.code) ? 'ACCESS_DENIED' : 'READ_FAILED' }; }
}
export function decideReportedProcess(processResult, reportResult) {
  let category;
  if (processResult.spawnFailed) category = 'PROCESS_SPAWN_FAILED';
  else if (processResult.timedOut) category = 'PROCESS_TIMEOUT';
  else if (processResult.outputLimitExceeded) category = 'PROCESS_OUTPUT_LIMIT';
  else if (processResult.signal !== null) category = 'PROCESS_SIGNAL';
  else if (reportResult.reportStatus !== 'VALID') category = reportResult.reportStatus === 'REPORTER_EXCEPTION'
    ? 'REPORTER_EXCEPTION' : 'REPORT_' + reportResult.reportStatus;
  else if (!reportResult.report.passed) category = 'TEST_FAILURE';
  else category = processResult.exitCode === 0 ? 'PASS' : 'PROCESS_EXIT_NONZERO';
  return { passed: category === 'PASS', category, process: processResult, ...reportResult, rawOutputSuppressed: true };
}
// One invocation, no shell, no stdout parsing or raw log retention. Only test
// reporter JSON goes to its own freshly-owned private directory.
export async function runReportedProcess({ executable, args, config, reporter, cwd, env, timeoutMs, root = tmpdir(), outputBudget = 1024 * 1024 }) {
  validateReportConfig(config);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000
    || !Number.isSafeInteger(outputBudget) || outputBudget < 1 || outputBudget > 4 * 1024 * 1024) throw Error('PROCESS_BUDGET_INVALID');
  const directory = await mkdtemp(join(root, 'wepuu-report-')); await chmod(directory, 0o700);
  const stat = await lstat(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('REPORT_DIRECTORY_UNSAFE');
  if (process.platform === 'win32') {
    const run = promisify(execFile);
    const user = (await run('whoami', [], { windowsHide: true, timeout: 5000 })).stdout.trim();
    if (!/^[A-Za-z0-9_. -]+\\[A-Za-z0-9_. -]+$/u.test(user)) throw Error('REPORT_DIRECTORY_UNSAFE');
    await run('icacls', [directory, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`,
      '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { windowsHide: true, timeout: 10000 });
    const { checkWindowsEvidenceAcl } = await import('../../../scripts/local-evidence-acl.mjs');
    if (!(await checkWindowsEvidenceAcl(directory, [])).verified) throw Error('REPORT_DIRECTORY_UNSAFE');
  }
  const path = join(directory, 'result.json'), runId = randomBytes(12).toString('hex');
  const childEnv = { ...env, WEPUU_R10_REPORT_RUN_ID: runId, WEPUU_R10_REPORT_CONFIG: JSON.stringify(config) };
  delete childEnv.NODE_TEST_CONTEXT;
  const processResult = await new Promise(resolveProcess => {
    let spawnFailed = false, spawnCategory, timedOut = false, outputLimitExceeded = false, outputBytes = 0, hardStop;
    const child = spawn(executable, [...args, '--test-reporter=' + pathToFileURL(resolve(reporter)).href, '--test-reporter-destination=' + path,
      ...config.files], { cwd, env: childEnv, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const stop = () => { child.kill('SIGTERM'); hardStop ??= setTimeout(() => child.kill('SIGKILL'), 1000); };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const discard = chunk => { outputBytes += chunk.length; if (outputBytes > outputBudget && !outputLimitExceeded) { outputLimitExceeded = true; stop(); } };
    child.stdout.on('data', discard); child.stderr.on('data', discard);
    child.once('error', error => { spawnFailed = true; spawnCategory = ['ENOENT', 'EACCES', 'EPERM'].includes(error.code) ? error.code : 'SPAWN_ERROR'; });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer); clearTimeout(hardStop);
      resolveProcess({ completed: true, exitCode, signal: signal ?? null, spawnFailed,
        ...(spawnCategory ? { spawnCategory } : {}), timedOut, outputLimitExceeded, outputBytes });
    });
  });
  const result = decideReportedProcess(processResult, await readReport(path, config, runId));
  return { ...result, reportDirectory: directory };
}
