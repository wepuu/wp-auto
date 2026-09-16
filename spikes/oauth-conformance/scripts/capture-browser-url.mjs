import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const value = process.argv[2];
if (!value?.startsWith('https://auth.example.test/auth?')) process.exit(2);
const temp = resolve(import.meta.dirname, '..', '.tmp');
await mkdir(temp, { recursive: true });
await writeFile(resolve(temp, 'codex-auth-url.tmp'), value, { encoding: 'utf8', mode: 0o600 });
