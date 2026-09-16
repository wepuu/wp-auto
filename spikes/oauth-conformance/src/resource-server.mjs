import { createServer } from 'node:http';
import { BoundedJwksCache } from './jwks-cache.mjs';
import { redactTrace, assertTraceIsContentFree } from './adapter.mjs';

export async function listenResourceServer({ issuer, resource, jwksUri, onTrace, requiredScopes = ['mcp:read'], host = '127.0.0.1', port = 0, publicOrigin } = {}) {
  const metadataPath = '/.well-known/oauth-protected-resource/wp-json/wp-auto/mcp';
  const jwks = new BoundedJwksCache(new URL(jwksUri));
  const traces = [];
  const record = (entry) => {
    const trace = redactTrace(entry);
    assertTraceIsContentFree(trace);
    traces.push(trace);
    onTrace?.(trace);
  };
  let server;
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname === metadataPath) {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        resource,
        authorization_servers: [issuer],
        scopes_supported: ['mcp:read', 'mcp:content.write', 'mcp:media.write', 'mcp:taxonomy.write', 'mcp:seo.write'],
        bearer_methods_supported: ['header']
      }));
      record({ method: req.method, path: url.pathname, status: 200, contentType: 'application/json' });
      return;
    }

    if (url.pathname !== '/wp-json/wp-auto/mcp') {
      res.statusCode = 404;
      res.end();
      record({ method: req.method, path: url.pathname, status: 404 });
      return;
    }

    const authorization = req.headers.authorization;
    const challenge = `Bearer resource_metadata="${publicOrigin ?? `http://${req.headers.host}`}${metadataPath}"`;
    if (url.searchParams.has('access_token') || typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization)) {
      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', challenge);
      res.end();
      record({ method: req.method, path: url.pathname, status: 401, wwwAuthenticate: challenge, authorizationPresent: Boolean(authorization) });
      return;
    }

    try {
      if (req.method !== 'POST' || !req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        res.statusCode = req.method === 'POST' ? 415 : 405;
        res.setHeader('allow', 'POST');
        res.end();
        record({ method: req.method, path: url.pathname, status: res.statusCode, authorizationPresent: true });
        return;
      }
      let bodyBytes = 0;
      for await (const chunk of req) {
        bodyBytes += chunk.length;
        if (bodyBytes > 64 * 1024) {
          res.statusCode = 413;
          res.end();
          record({ method: req.method, path: url.pathname, status: 413, authorizationPresent: true });
          return;
        }
      }
      const verified = await jwks.verify(authorization.slice('Bearer '.length), {
        issuer,
        audience: resource,
      });
      const grantedScopes = typeof verified.payload.scope === 'string' ? verified.payload.scope.split(/\s+/u).filter(Boolean) : [];
      const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
      if (missingScopes.length > 0) {
        res.statusCode = 403;
        res.setHeader('WWW-Authenticate', `${challenge}, error="insufficient_scope", scope="${missingScopes.join(' ')}"`);
        res.end();
        record({ method: req.method, path: url.pathname, status: 403, wwwAuthenticate: 'Bearer error="insufficient_scope"', authorizationPresent: true });
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.setHeader('mcp-protocol-version', '2025-11-25');
      // This response is emitted by the simulated WordPress resource itself;
      // the control plane only verifies the bearer and never sees MCP data.
      res.end(JSON.stringify({ jsonrpc: '2.0', result: { ok: true, data_plane: 'direct-wordpress' } }));
      record({ method: req.method, path: url.pathname, status: 200, contentType: 'application/json', mcpProtocolVersion: '2025-11-25', authorizationPresent: true });
    } catch {
      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', challenge);
      res.end();
      record({ method: req.method, path: url.pathname, status: 401, wwwAuthenticate: challenge, authorizationPresent: true });
    }
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const { port: boundPort } = server.address();
  const localOrigin = `http://127.0.0.1:${boundPort}`;
  return {
    server,
    endpoint: `${publicOrigin ?? localOrigin}/wp-json/wp-auto/mcp`,
    metadata: `${publicOrigin ?? localOrigin}${metadataPath}`,
    localOrigin,
    traces,
    jwks,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
