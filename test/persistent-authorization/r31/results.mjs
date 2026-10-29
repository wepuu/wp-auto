// Project only fixed metadata. Never retain assertion bodies, messages or source.
export function lintProjection(rows, targets) {
 if (!Array.isArray(rows) || rows.length !== targets.length) throw Error('LINT_RESULT_INVALID');
 const files = rows.map(row => {
  const file = typeof row.filePath === 'string' ? row.filePath.replace('/workspace/', '') : '';
  if (!targets.includes(file) || !Array.isArray(row.messages)) throw Error('LINT_RESULT_INVALID');
  const messages = row.messages.map(m => {
   if (![1, 2].includes(m.severity)) throw Error('LINT_RESULT_INVALID');
   return { severity: m.severity, ruleId: typeof m.ruleId === 'string' && /^[@a-z0-9_/-]+$/u.test(m.ruleId) ? m.ruleId : null,
    line: Number.isSafeInteger(m.line) ? m.line : null, column: Number.isSafeInteger(m.column) ? m.column : null };
  });
  return {file, messages, errorCount: row.errorCount, warningCount: row.warningCount, fatalErrorCount: row.fatalErrorCount};
 });
 if (new Set(files.map(f => f.file)).size !== targets.length) throw Error('LINT_RESULT_INVALID');
 return {files, passed: files.every(f => f.messages.length === 0 && f.errorCount === 0 && f.warningCount === 0 && f.fatalErrorCount === 0)};
}
export function testProjection(events) {
 let passed = 0, failed = 0, skipped = 0, todo = 0, summary = null;
 for (const e of events) {
  if (e.type === 'test:pass') { if (e.data.skip) skipped++; else if (e.data.todo) todo++; else passed++; }
  if (e.type === 'test:fail') failed++;
  if (e.type === 'test:summary') summary = e.data;
 }
 const counts = summary?.counts;
 return {passed, failed, skipped, todo, summaryObserved: summary !== null,
  summaryCounts: counts ? Object.fromEntries(['tests','passed','failed','cancelled','skipped','todo'].map(k => [k, Number.isSafeInteger(counts[k]) ? counts[k] : null])) : null};
}
export function testsPass(r) {
 return r.summaryObserved === true && r.passed === 19 && r.failed === 0 && r.skipped === 0 && r.todo === 0 &&
  r.summaryCounts?.tests === 19 && r.summaryCounts.passed === 19 && ['failed','cancelled','skipped','todo'].every(k => r.summaryCounts[k] === 0);
}
export function allPass(stages) {
 return ['runtime','input_baseline','config_parse','prerequisite_build','focused_typecheck','targeted_lint','mapping_tests','input_postcheck']
  .every(name => stages.some(s => s.stage === name && s.passed === true));
}
