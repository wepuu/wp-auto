const EXPECTED_TOOLS = [
  'wp-auto-site-health',
  'wp-auto-site-info',
  'wp-auto-posts-search',
  'wp-auto-post-get',
  'wp-auto-pages-search',
  'wp-auto-page-get',
  'wp-auto-categories-list',
  'wp-auto-tags-list',
  'wp-auto-post-create-draft',
  'wp-auto-page-create-draft',
  'wp-auto-post-update',
  'wp-auto-page-update',
  'wp-auto-media-search',
  'wp-auto-media-get',
  'wp-auto-media-upload',
  'wp-auto-media-update',
  'wp-auto-media-set-featured',
  'wp-auto-media-import-url',
  'wp-auto-category-create',
  'wp-auto-tag-create',
  'wp-auto-taxonomy-assign',
  'wp-auto-seo-get',
  'wp-auto-seo-update',
];

const endpoint = new URL(process.argv[2] ?? '');
const authorization = process.env.WP_AUTO_MCP_AUTHORIZATION;

if (!authorization) throw new Error('WP_AUTO_MCP_AUTHORIZATION is required.');
if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
  throw new Error('The MCP endpoint must not contain credentials, query, or fragment.');
}
const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && isLoopback)) {
  throw new Error('The MCP endpoint must use HTTPS unless it is loopback.');
}

let sessionId;
let protocolVersion;

function parseEvent(event) {
  const data = event
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');
  if (!data || data === '[DONE]') return undefined;
  return JSON.parse(data);
}

async function readMessage(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  if (!contentType.includes('text/event-stream') || !response.body) {
    throw new Error('MCP response did not use JSON or SSE.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/u);
      buffer = events.pop() ?? '';
      for (const event of events) {
        const message = parseEvent(event);
        if (message) return message;
      }
      if (done) {
        const message = parseEvent(buffer);
        if (message) return message;
        throw new Error('MCP SSE response ended without a JSON-RPC message.');
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function request(payload, { expectMessage = true } = {}) {
  const headers = {
    accept: 'application/json, text/event-stream',
    authorization,
    'content-type': 'application/json',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  if (protocolVersion) headers['mcp-protocol-version'] = protocolVersion;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`MCP request failed with HTTP ${response.status}.`);
  sessionId = response.headers.get('mcp-session-id') ?? sessionId;
  if (!expectMessage) {
    await response.body?.cancel();
    return undefined;
  }
  return readMessage(response);
}

const initialized = await request({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'wepuu-direct-mcp-probe', version: '0.1.0' },
  },
});
if (!initialized?.result?.protocolVersion) throw new Error('MCP initialize failed.');
protocolVersion = initialized.result.protocolVersion;

await request(
  { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
  { expectMessage: false },
);

const listed = await request({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
const actualTools = listed?.result?.tools?.map((tool) => tool.name);
if (!Array.isArray(actualTools) || actualTools.length !== EXPECTED_TOOLS.length) {
  throw new Error(`Expected exactly ${EXPECTED_TOOLS.length} MCP tools.`);
}
if (actualTools.some((tool, index) => tool !== EXPECTED_TOOLS[index])) {
  throw new Error('MCP tool catalog order does not match the frozen contract.');
}

const siteHealth = await request({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: { name: 'wp-auto-site-health', arguments: {} },
});
if (!siteHealth?.result || siteHealth.result.isError) throw new Error('MCP site-health call failed.');

console.log(`MCP_PROTOCOL_VERSION=${protocolVersion}`);
console.log(`MCP_TOOL_COUNT=${actualTools.length}`);
console.log('MCP_TOOL_ORDER=True');
console.log('MCP_AUTHENTICATION=True');
console.log('MCP_SITE_HEALTH=True');
