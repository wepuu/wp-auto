import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..', '..');
const catalog = await readFile(resolve(root, 'docs', 'WORDPRESS_CONNECTOR_CHANGES.md'), 'utf8');
const tools = [...catalog.matchAll(/^\d+\. `([^`]+)`$/gm)].map((match) => match[1]);
const expected = [
  'site-health', 'site-info', 'posts-search', 'post-get', 'pages-search', 'page-get',
  'categories-list', 'tags-list', 'post-create-draft', 'page-create-draft', 'post-update',
  'page-update', 'media-search', 'media-get', 'media-upload', 'media-update',
  'media-set-featured', 'media-import-url', 'category-create', 'tag-create',
  'taxonomy-assign', 'seo-get', 'seo-update'
];

if (tools.length !== expected.length || tools.some((tool, index) => tool !== expected[index])) {
  console.error(JSON.stringify({ expected, actual: tools }, null, 2));
  process.exit(1);
}

const requiredText = [
  'direct WordPress data plane',
  'Application Password',
  'canonical MCP resource',
  'prototype verification required'
];
const allDocs = await Promise.all([
  readFile(resolve(root, 'README.md'), 'utf8'),
  readFile(resolve(root, 'AGENTS.md'), 'utf8'),
  readFile(resolve(root, 'docs', 'PHASE_2_0_AUTH_CONTRACT.md'), 'utf8')
]);
const combined = allDocs.join('\n');
for (const text of requiredText) {
  if (!combined.includes(text)) throw new Error(`missing_contract_text:${text}`);
}

console.log(`contract check passed: ${tools.length} frozen tools, ${requiredText.length} boundary markers`);
