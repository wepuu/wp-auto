import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safeFailure, collectEvents, targetName } from './multisite-safe-reporter.mjs';
test('failure projection keeps only approved assertion, source location and SQLSTATE', () => {
  const error = { code: 'ERR_TEST_FAILURE', message: 'SECRET_SENTINEL', actual: 'SECRET_SENTINEL', cause: {
    code: 'ERR_ASSERTION', message: 'consent_page\nSECRET_SENTINEL', stack: 'SECRET_SENTINEL at /workspace/packages/database/test/multi-site-provider.test.ts:215:12',
    errors: [{ code: '42501', message: 'SECRET_SENTINEL' }] } };
  const result = safeFailure(error); assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
  assert(result.some(v => v.assertion === 'consent_page' && v.line === 215)); assert(result.some(v => v.sqlstate === '42501'));
});
test('unknown errors, timeout and hook failures remain separately classified', () => {
  assert.deepEqual(safeFailure({ message: 'SECRET_SENTINEL' }), [{ category: 'NOT_CONFIRMED' }]);
  assert.equal(safeFailure({ failureType: 'testTimeoutFailure' })[0].category, 'TIMEOUT');
  const both = safeFailure({ errors: [{ code: 'ERR_ASSERTION', message: 'grant_binding' }, { failureType: 'hookFailed' }] });
  assert(both.some(v => v.category === 'HOOK_FAILED')); assert(both.some(v => v.assertion === 'grant_binding'));
});
test('missing, skipped, duplicate and additional failed tests cannot pass', async () => {
  const pass = { type: 'test:pass', data: { name: targetName, details: { duration_ms: 1 } } };
  assert((await collectEvents([pass])).passed);
  for (const events of [[], [pass,pass], [{ ...pass, data: { ...pass.data, skip: true } }],
    [pass, { type: 'test:fail', data: { name: 'SECRET_SENTINEL' } }]]) assert(!(await collectEvents(events)).passed);
});
test('actual Node reporter transport suppresses stdout, tokens and assertion values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wepuu-safe-reporter-')), fixture = join(directory, 'fixture.mjs');
  try {
    await writeFile(fixture, `import test from 'node:test';import assert from 'node:assert/strict';test(${JSON.stringify(targetName)},()=>{console.log('SECRET_SENTINEL');assert.equal('SECRET_SENTINEL','OTHER_SECRET','consent_page');});`);
    let output, exitCode = 0;
    const childEnvironment = { ...process.env }; delete childEnvironment.NODE_TEST_CONTEXT;
    try { output = (await promisify(execFile)(process.execPath, ['--test', '--test-reporter', new URL('./multisite-safe-reporter.mjs', import.meta.url).href, fixture], { env: childEnvironment })).stdout; }
    catch (e) { exitCode = e.code; output = e.stdout; }
    const value = JSON.parse(output); assert(value.targetExecuted); assert(!value.passed);
    assert(value.outcomes[0].failures.some(v => v.assertion === 'consent_page'));
    assert(!output.includes('SECRET_SENTINEL') && !output.includes('OTHER_SECRET'));
    assert.equal(exitCode, 1);
  } finally { await unlink(fixture); await rmdir(directory); }
});
