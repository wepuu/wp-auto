const steps = new Set(['offline', 'database', 'startup', 'control', 'matrix', 'transition']);
const categories = new Set(['TIMEOUT', 'ASSERTION_FAILED', 'LOCAL_FAILURE', 'SQL_FAILURE',
  'DATABASE_REGRESSION_FAILED', 'OFFLINE_CHECK_FAILED']);
const stages = new Set(['setup', 'identity', 'syntax', 'wiring-tests.mjs', 'fixture-tests.mjs',
  'offline-tests.mjs', 'transition_order', 'missing_schema_default_main', 'explicit_migration',
  'runtime_privileges', 'missing_ledger_permission', 'compiled_service_matrix']);

// Child stdout/stderr and exception text are never copied into the public result.
export async function collectScenarioResult(step, operation) {
  if (!steps.has(step)) throw new Error('INVALID_SCENARIO_STEP');
  const startedUtc = new Date().toISOString(), started = performance.now();
  let output, failure;
  try { output = await operation(); } catch (error) { failure = error; output = error?.stdout; }
  let item;
  try { item = JSON.parse(String(output ?? '').trim().split(/\r?\n/u).at(-1)); } catch { /* fixed failure below */ }
  const valid = item !== null && typeof item === 'object' && typeof item.passed === 'boolean';
  const passed = !failure && valid && item.passed === true;
  const diagnostic = {};
  if (!passed && valid) {
    diagnostic.category = categories.has(item.category) ? item.category : 'NOT_CONFIRMED';
    diagnostic.stage = stages.has(item.stage) ? item.stage : 'NOT_CONFIRMED';
    if (typeof item.sqlstate === 'string' && /^[0-9A-Z]{5}$/u.test(item.sqlstate)) diagnostic.sqlstate = item.sqlstate;
  }
  return { step, passed, startedUtc, finishedUtc: new Date().toISOString(),
    elapsedMs: Math.round(performance.now() - started),
    category: passed ? 'PASS' : failure?.killed ? 'TIMEOUT' : failure ? 'COMMAND_FAILED' : valid ? 'SCENARIO_FAILED' : 'INVALID_RESULT',
    ...(passed ? {} : { diagnostic }), rawOutputSuppressed: true };
}
