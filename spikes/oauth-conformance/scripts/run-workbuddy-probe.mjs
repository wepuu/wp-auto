import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const tempRoot = resolve(root, '.tmp');
const project = resolve(tempRoot, 'workbuddy-client');
const statePath = resolve(tempRoot, 'workbuddy-baseline.json');
const resource = process.env.CONFORMANCE_RESOURCE || 'https://site-a.example.test/wp-json/wp-auto/mcp';
const codebuddy = process.env.CODEBUDDY_BIN || 'C:\\Users\\admin\\AppData\\Local\\WePuu\\bin\\codebuddy.cmd';
const watched = [
  resolve(homedir(), '.mcp.json'),
  resolve(homedir(), '.codebuddy', '.credentials.json')
];

async function snapshot(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return { path, exists: true, kind: 'non-file' };
    const digest = createHash('sha256').update(await readFile(path)).digest('hex');
    return { path, exists: true, sha256: digest, bytes: info.size };
  } catch (error) {
    if (error.code === 'ENOENT') return { path, exists: false };
    throw error;
  }
}

async function snapshots() {
  return Promise.all(watched.map(snapshot));
}

async function version() {
  const env = { ...process.env };
  const result = process.platform === 'win32'
    ? await execFileAsync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', codebuddy, '--version'], { env, windowsHide: true, timeout: 15000 })
    : await execFileAsync(codebuddy, ['--version'], { env, windowsHide: true, timeout: 15000 });
  return result.stdout.trim();
}

const action = process.argv[2] || 'status';

if (action === 'prepare') {
  await mkdir(tempRoot, { recursive: true });
  try {
    await access(statePath);
    throw new Error('workbuddy baseline already exists; run cleanup first');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const baseline = await snapshots();
  await mkdir(project, { recursive: true });
  await writeFile(resolve(project, '.mcp.json'), `${JSON.stringify({ mcpServers: { 'wepuu-conformance': { type: 'http', url: resource } } }, null, 2)}\n`, 'utf8');
  await writeFile(statePath, `${JSON.stringify({ baseline, resource, preparedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ action, version: await version(), project, config: '.mcp.json', baseline }));
  process.exit(0);
}

if (action === 'verify' || action === 'cleanup') {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const current = await snapshots();
  const changes = current.map((entry, index) => ({ path: entry.path, unchanged: JSON.stringify(entry) === JSON.stringify(state.baseline[index]), before: state.baseline[index], after: entry }));
  if (action === 'cleanup') {
    for (let index = 0; index < watched.length; index += 1) {
      if (!state.baseline[index].exists && current[index].exists && watched[index].endsWith('.credentials.json')) {
        await rm(watched[index], { force: true });
      }
    }
    let directoryRemovalDeferred = false;
    try {
      await rm(project, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'EBUSY') throw error;
      directoryRemovalDeferred = true;
    }
    await rm(statePath, { force: true });
    console.log(JSON.stringify({ action, changes, temporaryProjectContentRemoved: true, directoryRemovalDeferred }));
    process.exit(changes.every((entry) => entry.unchanged) ? 0 : 2);
  }
  console.log(JSON.stringify({ action, changes }));
  process.exit(changes.every((entry) => entry.unchanged) ? 0 : 2);
}

console.log(JSON.stringify({ action, version: await version(), project, snapshots: await snapshots() }));
