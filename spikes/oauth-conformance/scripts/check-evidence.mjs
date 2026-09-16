import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) throw new Error('usage: node scripts/check-evidence.mjs <json-file>');
const value = JSON.parse(await readFile(path, 'utf8'));
const serialized = JSON.stringify(value);
for (const forbidden of ['access_token', 'refresh_token', 'authorization_code', 'code_verifier', 'cookie', 'post_content', 'tool_arguments', 'tool_results', 'media_url', 'email', 'password']) {
  if (serialized.includes(forbidden)) throw new Error(`forbidden_evidence_field:${forbidden}`);
}
const cases = Array.isArray(value) ? value : value.cases;
if (!Array.isArray(cases)) throw new Error('evidence_cases_required');
for (const item of cases) {
  if (!item?.id || !['pass', 'fail', 'blocked'].includes(item.status)) throw new Error('invalid_evidence_case');
}
console.log(`evidence check passed: ${cases.length} content-free cases`);
