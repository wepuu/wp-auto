import { readdir, readFile, lstat } from 'node:fs/promises';
import { project } from './report.mjs';
const out = {};
async function read(p) { const s = await lstat(p); if (!s.isFile() || s.isSymbolicLink() || s.size > 1024 * 1024) throw Error('UNSAFE_REPORT'); return JSON.parse(await readFile(p, 'utf8')); }
for (const name of await readdir('/evidence')) {
 if (/^r22-boundary-[a-f0-9]{12}\.json$/u.test(name)) out[name] = project(await read('/evidence/' + name));
 if (!/^(startup|control|matrix|transition)-[a-f0-9]{12}$/u.test(name)) continue;
 const files = await readdir('/evidence/' + name);
 for (const file of ['driver-result.json', 'integration.json', 'transition.json', 'startup-service.json'])
  if (files.includes(file)) out[name + '/' + file] = project(await read('/evidence/' + name + '/' + file));
}
console.log(JSON.stringify(out));
