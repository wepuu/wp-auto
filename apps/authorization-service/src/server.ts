import { createServer, type Server } from 'node:http';
import { z } from 'zod';
import { Database, createOidcAdapterFactory } from '@wepuu/database';
import { AwsKmsKeyCustody, keyCustodyConfigFromEnvironment } from '@wepuu/key-custody';
import {
  DenyAllGrantClaimsResolver,
  DenyAllResourceRegistry,
  createAuthorizationProvider
} from '@wepuu/oauth-provider';

const ServiceConfigSchema = z.object({
  issuer: z.url().refine((value) => value.startsWith('https://')),
  databaseUrl: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65_535),
  cookieKeys: z.array(z.string().min(32)).min(2)
}).strict();

export type AuthorizationServiceConfig = z.infer<typeof ServiceConfigSchema>;

export function authorizationServiceConfigFromEnvironment(environment: NodeJS.ProcessEnv): AuthorizationServiceConfig {
  return ServiceConfigSchema.parse({
    issuer: environment['WEPUU_ISSUER'],
    databaseUrl: environment['WEPUU_DATABASE_URL'],
    host: environment['WEPUU_AUTH_HOST'] ?? '127.0.0.1',
    port: Number(environment['WEPUU_AUTH_PORT'] ?? '3001'),
    cookieKeys: JSON.parse(environment['WEPUU_COOKIE_KEYS_JSON'] ?? '[]') as unknown
  });
}

export interface RunningAuthorizationService {
  readonly server: Server;
  close(): Promise<void>;
}

export async function startAuthorizationService(
  configInput: AuthorizationServiceConfig,
  environment: NodeJS.ProcessEnv = process.env
): Promise<RunningAuthorizationService> {
  const config = ServiceConfigSchema.parse(configInput);
  const database = new Database({ connectionString: config.databaseUrl, applicationName: 'wepuu-authorization-service' });
  const custody = new AwsKmsKeyCustody(keyCustodyConfigFromEnvironment(environment));
  try {
    await custody.describeSigningKey();
    const provider = await createAuthorizationProvider({
      issuer: config.issuer,
      cookieKeys: config.cookieKeys,
      keyCustody: custody,
      adapter: createOidcAdapterFactory(database),
      resourceRegistry: new DenyAllResourceRegistry(),
      grantClaimsResolver: new DenyAllGrantClaimsResolver()
    });
    provider.proxy = true;
    const callback = provider.callback();
    const server = createServer((request, response) => {
      void (async () => {
      const path = new URL(request.url ?? '/', config.issuer).pathname;
      if (request.method === 'GET' && path === '/health/live') {
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end('{"status":"live"}');
        return;
      }
      if (request.method === 'GET' && path === '/health/ready') {
        try {
          await database.withAuthorizationService((client) => client.query('SELECT 1').then(() => undefined));
          await custody.describeSigningKey();
          response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          response.end('{"status":"ready"}');
        } catch {
          response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          response.end('{"error":"temporarily_unavailable"}');
        }
        return;
      }
      if (path.startsWith('/interaction/')) {
        response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end('{"error":"temporarily_unavailable"}');
        return;
      }
      try {
        await callback(request, response);
      } catch {
        if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        if (!response.writableEnded) response.end('{"error":"temporarily_unavailable"}');
      }
      })();
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, resolve);
    });
    return {
      server,
      async close() {
        await new Promise<void>((resolve, reject) => server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        }));
        await database.close();
      }
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}
