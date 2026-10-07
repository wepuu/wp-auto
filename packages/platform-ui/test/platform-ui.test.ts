import assert from 'node:assert/strict';
import test from 'node:test';
import {
  escapeHtml,
  evaluateDeploymentReadiness,
  loadPublicDeploymentConfig,
  renderInteractionPage,
  renderShell,
  UI_STYLES
} from '../src/index.js';

test('local deployment accepts placeholders while public modes require final release data', () => {
  const local = loadPublicDeploymentConfig({
    WEPUU_DEPLOYMENT_MODE: 'local', WEPUU_CONTROL_PUBLIC_ORIGIN: 'https://platform.example.test'
  });
  assert.equal(local.deploymentMode, 'local');
  assert.equal(local.legalProviderName, 'Provider details pending');
  assert.throws(() => loadPublicDeploymentConfig({
    WEPUU_DEPLOYMENT_MODE: 'production', WEPUU_CONTROL_PUBLIC_ORIGIN: 'https://platform.example.test'
  }), /public_deployment_config_incomplete/u);
});

test('production rejects static AWS credentials and accepts temporary-credential configuration', () => {
  const release = {
    WEPUU_DEPLOYMENT_MODE: 'production',
    WEPUU_CONTROL_PUBLIC_ORIGIN: 'https://platform.wepuu.dev',
    WEPUU_LEGAL_PROVIDER_NAME: 'WePuu Operator',
    WEPUU_TERMS_URL: 'https://legal.wepuu.dev/terms',
    WEPUU_PRIVACY_URL: 'https://legal.wepuu.dev/privacy',
    WEPUU_SUPPORT_URL: 'https://support.wepuu.dev/',
    WEPUU_STATUS_URL: 'https://status.wepuu.dev/',
    WEPUU_DATA_REGION_LABEL: 'Provider region pending final selection',
    WEPUU_TRUSTED_PROXY_CIDRS_JSON: '["10.0.0.0/24"]',
    WEPUU_RELEASE_VERSION: '0.5.0',
    WEPUU_RELEASE_REVISION: 'a'.repeat(40),
    WEPUU_IDENTITY_PROVIDER_LABEL: 'Production OIDC',
    WEPUU_RETENTION_POLICY_VERSION: '2026-10-07',
    WEPUU_COMPATIBILITY_MATRIX_VERSION: '2026-10',
    WEPUU_AWS_CREDENTIAL_MODE: 'web_identity',
    AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/wepuu-production-kms',
    AWS_WEB_IDENTITY_TOKEN_FILE: '/run/secrets/aws-token',
    WEPUU_OPERATIONS_METRICS_TOKEN: 'm'.repeat(32)
  };
  assert.equal(loadPublicDeploymentConfig(release).deploymentMode, 'production');
  assert.throws(() => loadPublicDeploymentConfig({
    ...release, AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE00000000', AWS_SECRET_ACCESS_KEY: 'not-a-real-secret'
  }), /production_static_aws_credentials_forbidden/u);
  assert.throws(() => loadPublicDeploymentConfig({
    WEPUU_CONTROL_PUBLIC_ORIGIN: 'https://other.wepuu.dev'
  }, 'https://platform.wepuu.dev'), /public_origin_mismatch/u);
});

test('readiness reports categories without exposing secret values or paths', () => {
  const environment = {
    WEPUU_DEPLOYMENT_MODE: 'test',
    WEPUU_CONTROL_PUBLIC_ORIGIN: 'https://platform.example.test',
    WEPUU_RELEASE_VERSION: '0.5.0',
    WEPUU_RELEASE_REVISION: 'b'.repeat(40),
    WEPUU_IDENTITY_PROVIDER_LABEL: 'Test OIDC',
    WEPUU_RETENTION_POLICY_VERSION: '2026-10-07',
    WEPUU_COMPATIBILITY_MATRIX_VERSION: '2026-10',
    WEPUU_AWS_CREDENTIAL_MODE: 'web_identity',
    WEPUU_ACCOUNT_OIDC_ISSUER: 'https://identity.example.test/',
    WEPUU_ACCOUNT_OIDC_CLIENT_ID: 'client',
    AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/wepuu',
    AWS_WEB_IDENTITY_TOKEN_FILE: '/secret/token'
  };
  const report = evaluateDeploymentReadiness(loadPublicDeploymentConfig(environment), environment);
  assert.equal(report.ready, false);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('/secret/token'), false);
  assert.equal(serialized.includes('arn:aws'), false);
  assert.deepEqual(report.checks.map((check) => check.id), ['release', 'legal', 'identity', 'residency', 'proxy', 'kms']);
});

test('rendering escapes untrusted values and uses only self-hosted assets', () => {
  assert.equal(escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  const page = renderInteractionPage({ title: '<title>', heading: '<heading>', message: '<message>' });
  assert.equal(page.includes('<heading>'), false);
  assert.match(page, /\/assets\/wepuu-v1\.css/u);
  assert.doesNotMatch(page, /https:\/\//u);
});

test('product shell carries keyboard, landmark, mobile and reduced-motion affordances', () => {
  const deployment = loadPublicDeploymentConfig({
    WEPUU_DEPLOYMENT_MODE: 'test', WEPUU_CONTROL_PUBLIC_ORIGIN: 'https://platform.example.test'
  });
  const page = renderShell({ title: 'Overview', eyebrow: 'Security', active: 'overview', deployment, body: '<h1>Trust</h1>' });
  assert.match(page, /<html lang="en">/u);
  assert.match(page, /name="viewport"/u);
  assert.match(page, /class="skip-link"/u);
  assert.match(page, /<main class="content" id="main">/u);
  assert.match(page, /aria-label="Primary"/u);
  assert.match(UI_STYLES, /:focus-visible/u);
  assert.match(UI_STYLES, /prefers-reduced-motion:no-preference/u);
  assert.match(UI_STYLES, /@media\(max-width:800px\)/u);
});
