import { authorizationServiceConfigFromEnvironment, startAuthorizationService } from './server.js';

const service = await startAuthorizationService(authorizationServiceConfigFromEnvironment(process.env));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void service.close().finally(() => process.exit(0));
  });
}
