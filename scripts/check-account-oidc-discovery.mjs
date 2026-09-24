import {
  OpenIdClientRelyingParty,
  loadAccountOidcConfig
} from '../packages/account-identity/dist/index.js';

const config = loadAccountOidcConfig(process.env);
const relyingParty = await OpenIdClientRelyingParty.create(config);
const started = await relyingParty.start('/v1/account/session');
const authorizationUrl = started.authorizationUrl;

console.log(JSON.stringify({
  discovery: 'pass',
  issuer: config.issuer.origin,
  authorizationPath: authorizationUrl.pathname,
  responseType: authorizationUrl.searchParams.get('response_type'),
  scope: authorizationUrl.searchParams.get('scope'),
  codeChallengeMethod: authorizationUrl.searchParams.get('code_challenge_method'),
  statePresent: authorizationUrl.searchParams.has('state'),
  noncePresent: authorizationUrl.searchParams.has('nonce')
}));
