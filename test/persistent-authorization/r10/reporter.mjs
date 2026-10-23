import { basename } from 'node:path';
import { offlineSkipFiles } from './profiles.mjs';
const categories = new Set(['ERR_ASSERTION', '42501', 'P0001', '23503', '23505', '23514', '55P03', '57014']);
export async function collect(source, { files, phase, expectedTopLevel }) {
  const required = new Set(files), found = new Map(), failures = [], skips = [], top = new Map();
  let unknown = false, total = 0;
  const relative = file => {
    const path = String(file ?? '').replaceAll('\\', '/');
    return [...required].find(f => path === f || path.endsWith('/' + f));
  };
  for await (const event of source) {
    if (!['test:pass', 'test:fail'].includes(event.type)) continue;
    const d = event.data ?? {}, file = relative(d.file);
    if (!file) { unknown = true; continue; }
    total++; found.set(file, (found.get(file) ?? 0) + 1);
    if (d.nesting === 0) top.set(file, (top.get(file) ?? 0) + 1);
    if (d.skip || d.todo) {
      const allowed = phase === 'unit' && !d.todo && offlineSkipFiles.some(f => file === f || basename(file) === f);
      skips.push({ file, allowed });
    }
    if (event.type === 'test:fail') {
      const e = d.details?.error;
      failures.push({ file, line: Number.isSafeInteger(d.line) ? d.line : null,
        category: categories.has(e?.code) ? e.code : 'TEST_FAILED',
        ...(categories.has(e?.cause?.code) ? { cause: e.cause.code } : {}) });
    }
  }
  const missing = [...required].filter(f => !found.has(f));
  const countsMatch = !expectedTopLevel || files.every(f => top.get(f) === expectedTopLevel[basename(f)]);
  return { passed: total > 0 && missing.length === 0 && !unknown && countsMatch && failures.length === 0
      && skips.every(s => s.allowed), phase, total, fileCount: found.size, missing, failures,
    skips, unexpectedEvent: unknown, topLevelCountsMatch: countsMatch, rawOutputSuppressed: true };
}
export default async function* reporter(source) {
  const config = JSON.parse(process.env.WEPUU_R10_REPORT_CONFIG);
  const result = await collect(source, config);
  if (!result.passed) process.exitCode = 1;
  yield JSON.stringify(result) + '\n';
}
