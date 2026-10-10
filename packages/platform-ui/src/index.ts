import { isIP } from 'node:net';
import { z } from 'zod';

const DeploymentModeSchema = z.enum(['local', 'test', 'staging', 'production']);
const OptionalHttpsUrlSchema = z.url().refine((value) => new URL(value).protocol === 'https:');

export interface ReleaseMetadata {
  readonly version: string;
  readonly revision: string;
  readonly identityProviderLabel: string;
  readonly retentionPolicyVersion: string;
  readonly compatibilityMatrixVersion: string;
}

export interface DeploymentReadinessCheck {
  readonly id: 'release' | 'legal' | 'identity' | 'residency' | 'proxy' | 'signing';
  readonly label: string;
  readonly status: 'ready' | 'pending';
  readonly detail: string;
}

export interface DeploymentReadinessReport {
  readonly ready: boolean;
  readonly checks: readonly DeploymentReadinessCheck[];
}

export interface PublicDeploymentConfig {
  readonly deploymentMode: z.infer<typeof DeploymentModeSchema>;
  readonly productName: string;
  readonly publicOrigin: string;
  readonly legalProviderName: string;
  readonly termsUrl?: string;
  readonly privacyUrl?: string;
  readonly supportUrl?: string;
  readonly statusUrl?: string;
  readonly dataRegionLabel: string;
  readonly trustedProxyCidrs: readonly string[];
  readonly release: ReleaseMetadata;
}

function exactHttpsOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.pathname !== '/'
      || url.search !== '' || url.hash !== '') throw new Error('public_origin_invalid');
  return url.origin;
}

function parseTrustedProxyCidrs(serialized: string | undefined): readonly string[] {
  if (serialized === undefined || serialized === '') return [];
  const values = z.array(z.string().min(1).max(64)).max(32).parse(JSON.parse(serialized) as unknown);
  return values.map((value) => {
    const [address, prefix, extra] = value.split('/');
    const family = address === undefined ? 0 : isIP(address);
    const numericPrefix = prefix === undefined ? undefined : Number(prefix);
    if (extra !== undefined || family === 0 || (prefix !== undefined && (!Number.isInteger(numericPrefix)
      || numericPrefix === undefined || numericPrefix < 0 || numericPrefix > (family === 4 ? 32 : 128)))) {
      throw new Error('trusted_proxy_cidr_invalid');
    }
    return value;
  });
}

function optionalHttps(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = environment[name];
  return value === undefined || value === '' ? undefined : OptionalHttpsUrlSchema.parse(value);
}

export function loadPublicDeploymentConfig(
  environment: NodeJS.ProcessEnv,
  requiredPublicOrigin?: string
): PublicDeploymentConfig {
  const deploymentMode = DeploymentModeSchema.parse(environment['WEPUU_DEPLOYMENT_MODE'] ?? 'local');
  const configuredOrigin = environment['WEPUU_CONTROL_PUBLIC_ORIGIN'];
  const publicOrigin = exactHttpsOrigin(requiredPublicOrigin ?? configuredOrigin ?? 'https://platform.example.test');
  if (requiredPublicOrigin !== undefined && configuredOrigin !== undefined
      && exactHttpsOrigin(requiredPublicOrigin) !== exactHttpsOrigin(configuredOrigin)) {
    throw new Error('public_origin_mismatch');
  }
  const termsUrl = optionalHttps(environment, 'WEPUU_TERMS_URL');
  const privacyUrl = optionalHttps(environment, 'WEPUU_PRIVACY_URL');
  const supportUrl = optionalHttps(environment, 'WEPUU_SUPPORT_URL');
  const statusUrl = optionalHttps(environment, 'WEPUU_STATUS_URL');
  const config: PublicDeploymentConfig = {
    deploymentMode,
    productName: z.string().min(1).max(80).parse(environment['WEPUU_PRODUCT_NAME'] ?? 'WePuu Platform'),
    publicOrigin,
    legalProviderName: z.string().min(1).max(160).parse(environment['WEPUU_LEGAL_PROVIDER_NAME'] ?? 'Provider details pending'),
    ...(termsUrl === undefined ? {} : { termsUrl }),
    ...(privacyUrl === undefined ? {} : { privacyUrl }),
    ...(supportUrl === undefined ? {} : { supportUrl }),
    ...(statusUrl === undefined ? {} : { statusUrl }),
    dataRegionLabel: z.string().min(1).max(120).parse(environment['WEPUU_DATA_REGION_LABEL'] ?? 'Not selected'),
    trustedProxyCidrs: parseTrustedProxyCidrs(environment['WEPUU_TRUSTED_PROXY_CIDRS_JSON']),
    release: {
      version: z.string().min(1).max(64).parse(environment['WEPUU_RELEASE_VERSION'] ?? '0.5.0-preview'),
      revision: z.string().min(1).max(64).parse(environment['WEPUU_RELEASE_REVISION'] ?? 'uncommitted'),
      identityProviderLabel: z.string().min(1).max(120)
        .parse(environment['WEPUU_IDENTITY_PROVIDER_LABEL'] ?? 'Identity provider pending'),
      retentionPolicyVersion: z.string().min(1).max(64)
        .parse(environment['WEPUU_RETENTION_POLICY_VERSION'] ?? 'Policy pending'),
      compatibilityMatrixVersion: z.string().min(1).max(64)
        .parse(environment['WEPUU_COMPATIBILITY_MATRIX_VERSION'] ?? '2026-10-preview')
    }
  };
  if (deploymentMode === 'staging' || deploymentMode === 'production') {
    const placeholderHost = (hostname: string): boolean => hostname === 'localhost' || isIP(hostname) !== 0
      || hostname === 'example.test' || hostname.endsWith('.example.test') || hostname.endsWith('.test')
      || hostname.endsWith('.example') || hostname.endsWith('.invalid');
    const releaseUrls = [publicOrigin, config.termsUrl, config.privacyUrl, config.supportUrl, config.statusUrl];
    if (releaseUrls.some((value) => value === undefined || placeholderHost(new URL(value).hostname))
        || config.legalProviderName === 'Provider details pending' || config.dataRegionLabel === 'Not selected'
        || config.termsUrl === undefined || config.privacyUrl === undefined || config.supportUrl === undefined
        || config.statusUrl === undefined || config.trustedProxyCidrs.length === 0
        || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(config.release.version)
        || !/^[0-9a-f]{7,64}$/u.test(config.release.revision)
        || config.release.identityProviderLabel === 'Identity provider pending'
        || !/^\d{4}-\d{2}-\d{2}$/u.test(config.release.retentionPolicyVersion)
        || !/^\d{4}-\d{2}$/u.test(config.release.compatibilityMatrixVersion)
        || (environment['WEPUU_SIGNING_KEYRING_FILE']?.length ?? 0) === 0
        || (environment['WEPUU_SIGNING_KEY_SLOT']?.length ?? 0) === 0) {
      throw new Error('public_deployment_config_incomplete');
    }
  }
  if (deploymentMode === 'staging' || deploymentMode === 'production') {
    if ((environment['WEPUU_OPERATIONS_METRICS_TOKEN']?.length ?? 0) < 32) {
      throw new Error('public_deployment_operations_token_required');
    }
  }
  return config;
}

export function evaluateDeploymentReadiness(
  config: PublicDeploymentConfig,
  environment: NodeJS.ProcessEnv
): DeploymentReadinessReport {
  const releaseReady = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(config.release.version)
    && /^[0-9a-f]{7,64}$/u.test(config.release.revision);
  const legalReady = config.legalProviderName !== 'Provider details pending'
    && config.termsUrl !== undefined && config.privacyUrl !== undefined
    && config.supportUrl !== undefined && config.statusUrl !== undefined;
  const emailDeliveryReady = environment['WEPUU_EMAIL_DELIVERY'] === 'mock'
    || (environment['WEPUU_EMAIL_DELIVERY'] === 'resend'
      && (environment['WEPUU_RESEND_API_KEY_FILE']?.length ?? 0) > 0
      && (environment['WEPUU_RESEND_FROM']?.length ?? 0) > 0);
  const identityReady = config.release.identityProviderLabel !== 'Identity provider pending'
    && (environment['WEPUU_ACCOUNT_AUTH_SECRETS_FILE']?.length ?? 0) > 0
    && emailDeliveryReady;
  const residencyReady = config.dataRegionLabel !== 'Not selected'
    && /^\d{4}-\d{2}-\d{2}$/u.test(config.release.retentionPolicyVersion);
  const proxyReady = config.trustedProxyCidrs.length > 0;
  const signingReady = (environment['WEPUU_SIGNING_KEYRING_FILE']?.length ?? 0) > 0
    && (environment['WEPUU_SIGNING_KEY_SLOT']?.length ?? 0) > 0;
  const checks: readonly DeploymentReadinessCheck[] = [
    { id: 'release', label: 'Release identity', status: releaseReady ? 'ready' : 'pending', detail: releaseReady ? 'Version and immutable revision are fixed.' : 'Set a semantic version and immutable Git revision.' },
    { id: 'legal', label: 'Public policies', status: legalReady ? 'ready' : 'pending', detail: legalReady ? 'Provider, policy, support and status links are configured.' : 'Final provider and HTTPS policy links are still required.' },
    { id: 'identity', label: 'Account identity', status: identityReady ? 'ready' : 'pending', detail: identityReady ? 'Better Auth Email OTP and protected Session secrets are configured.' : 'Configure Email OTP delivery and protected Better Auth Session secrets.' },
    { id: 'residency', label: 'Residency and retention', status: residencyReady ? 'ready' : 'pending', detail: residencyReady ? 'Region and retention policy version are fixed.' : 'Choose a data region and publish a retention policy version.' },
    { id: 'proxy', label: 'Trusted proxy boundary', status: proxyReady ? 'ready' : 'pending', detail: proxyReady ? 'Explicit proxy CIDRs are configured.' : 'No trusted proxy CIDR has been selected.' },
    { id: 'signing', label: 'Local signing custody', status: signingReady ? 'ready' : 'pending', detail: signingReady ? 'A protected local PKCS#8 key slot is configured.' : 'Configure the protected signing keyring and active key slot.' }
  ];
  return { ready: checks.every((check) => check.status === 'ready'), checks };
}

export const UI_CSP = "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export const UI_STYLES = `
:root{color-scheme:light;--ink:#17242e;--cloud:#f3f6f7;--trust:#157a6e;--signal:#246b8e;--caution:#b26a00;--fault:#b42318;--muted:#667680;--line:#d7dfe2;--paper:#fff;--shadow:0 16px 50px rgba(23,36,46,.08);font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;font-synthesis:none}
*{box-sizing:border-box}html{background:var(--cloud);color:var(--ink)}body{margin:0;min-height:100vh}a{color:var(--signal);text-decoration-thickness:.08em;text-underline-offset:.18em}a:hover{text-decoration-thickness:.14em}button,.button{border:0;border-radius:.35rem;background:var(--ink);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font:700 1rem/1.2 inherit;min-height:2.65rem;padding:.65rem 1rem;text-decoration:none}button:hover,.button:hover{background:var(--signal)}button.danger{background:transparent;border:1px solid #e2aaa5;color:var(--fault)}button.danger:hover{background:#fff3f2}.skip-link{position:fixed;left:1rem;top:-5rem;background:var(--ink);color:#fff;padding:.75rem;z-index:20}.skip-link:focus{top:1rem}.app-shell{display:grid;grid-template-columns:15rem minmax(0,1fr);min-height:100vh}.side{background:var(--ink);color:#fff;padding:1.5rem 1.1rem;position:sticky;top:0;height:100vh}.brand{display:flex;gap:.75rem;align-items:center;font-weight:800;letter-spacing:-.025em}.brand-mark{width:2.1rem;height:2.1rem;border:1px solid #8abbb5;display:grid;place-items:center;transform:rotate(45deg)}.brand-mark>span{transform:rotate(-45deg);font-family:"Cascadia Mono",monospace;font-size:.72rem}.side nav{margin-top:3rem}.side nav a{border-left:2px solid transparent;color:#c9d5d9;display:block;padding:.65rem .8rem;text-decoration:none}.side nav a[aria-current="page"]{border-color:#61b4a9;color:#fff;background:rgba(255,255,255,.06)}.side-meta{bottom:1.5rem;color:#9babb2;font:600 .7rem/1.5 "Cascadia Mono",monospace;letter-spacing:.08em;position:absolute;text-transform:uppercase}.page{min-width:0}.topbar{align-items:center;border-bottom:1px solid var(--line);display:flex;gap:1rem;justify-content:space-between;min-height:4.75rem;padding:1rem clamp(1.25rem,4vw,3.5rem)}.tenant-label{font:700 .72rem/1.3 "Cascadia Mono",monospace;letter-spacing:.08em;text-transform:uppercase}.preview{background:#fff1d8;border:1px solid #e3b872;border-radius:999px;color:#754500;font-size:.75rem;font-weight:800;padding:.3rem .65rem}.content{margin:0 auto;max-width:88rem;padding:clamp(1.5rem,4vw,3.5rem)}.eyebrow{color:var(--trust);font:800 .74rem/1.3 "Cascadia Mono",monospace;letter-spacing:.1em;margin:0 0 .7rem;text-transform:uppercase}h1,h2,h3{letter-spacing:-.035em;margin-top:0}h1{font-size:clamp(2rem,4vw,4.2rem);line-height:.96;max-width:14ch}h2{font-size:1.35rem}p{line-height:1.65}.lede{color:#40515b;font-size:1.05rem;max-width:62ch}.grid{display:grid;gap:1rem;grid-template-columns:repeat(12,minmax(0,1fr));margin-top:2rem}.span-8{grid-column:span 8}.span-4{grid-column:span 4}.panel{background:var(--paper);border:1px solid var(--line);border-radius:.65rem;padding:clamp(1.1rem,2vw,1.6rem);box-shadow:var(--shadow)}.panel.flat{box-shadow:none}.metric{font-size:2.3rem;font-weight:800;letter-spacing:-.06em}.muted{color:var(--muted)}.trust-rail{list-style:none;margin:1.5rem 0 0;padding:0}.trust-rail li{display:grid;grid-template-columns:2rem 1fr;gap:.8rem;position:relative;padding:0 0 1.45rem}.trust-rail li:not(:last-child):before{background:var(--line);content:"";height:100%;left:.68rem;position:absolute;top:1.2rem;width:2px}.trust-dot{background:var(--paper);border:3px solid var(--trust);border-radius:50%;height:1.4rem;position:relative;width:1.4rem;z-index:1}.trust-rail strong{display:block}.trust-rail small{color:var(--muted)}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid var(--line);padding:.85rem .6rem;text-align:left;vertical-align:top}th{color:var(--muted);font:700 .7rem/1.4 "Cascadia Mono",monospace;letter-spacing:.08em;text-transform:uppercase}code,.mono{font-family:"Cascadia Mono","SFMono-Regular",monospace;font-size:.86em;overflow-wrap:anywhere}.status{align-items:center;display:inline-flex;font-size:.78rem;font-weight:800;gap:.4rem;text-transform:capitalize}.status:before{background:currentColor;border-radius:50%;content:"";height:.48rem;width:.48rem}.status.active,.status.success,.status.ready{color:var(--trust)}.status.pending,.status.warning{color:var(--caution)}.status.revoked,.status.deleted,.status.denied,.status.error{color:var(--fault)}.empty{border:1px dashed #aebbc0;padding:2rem;text-align:center}.actions{display:flex;flex-wrap:wrap;gap:.7rem}.footer{border-top:1px solid var(--line);color:var(--muted);display:flex;flex-wrap:wrap;gap:1rem;margin-top:3rem;padding-top:1.25rem;font-size:.82rem}.interaction{display:grid;min-height:100vh;place-items:center;padding:1.25rem}.interaction-card{background:#fff;border:1px solid var(--line);border-top:4px solid var(--trust);max-width:38rem;padding:clamp(1.4rem,5vw,3rem);width:100%;box-shadow:var(--shadow)}.interaction-card h1{font-size:clamp(2rem,8vw,3.5rem)}.scope-list{display:flex;flex-wrap:wrap;gap:.45rem;list-style:none;padding:0}.scope-list li{background:var(--cloud);border:1px solid var(--line);border-radius:999px;padding:.35rem .6rem;font:700 .72rem/1.4 "Cascadia Mono",monospace}.detail-list{display:grid;gap:.8rem;margin:0}.detail-list div{border-bottom:1px solid var(--line);padding-bottom:.8rem}.detail-list dt{color:var(--muted);font:700 .7rem/1.4 "Cascadia Mono",monospace;letter-spacing:.08em;text-transform:uppercase}.detail-list dd{margin:.25rem 0 0}.filter-bar{align-items:end;display:flex;flex-wrap:wrap;gap:.75rem;margin:1rem 0}.filter-bar label{display:grid;font-weight:700;gap:.3rem}.filter-bar select{background:var(--paper);border:1px solid #9fadb3;border-radius:.35rem;font:inherit;min-height:2.65rem;padding:.45rem 2.5rem .45rem .65rem}.pager{align-items:center;display:flex;gap:1rem;justify-content:space-between;margin-top:1rem}.workspace-list{display:grid;gap:.75rem;list-style:none;padding:0}.workspace-list a{background:var(--cloud);border:1px solid var(--line);border-radius:.45rem;display:block;padding:1rem;text-decoration:none}.readiness-grid{display:grid;gap:.75rem}.readiness-item{border-left:3px solid var(--line);padding:.2rem 0 .2rem 1rem}.readiness-item.ready{border-color:var(--trust)}.readiness-item.pending{border-color:var(--caution)}:focus-visible{outline:3px solid #f4a62a;outline-offset:3px}
@media(max-width:800px){.app-shell{display:block}.side{height:auto;position:static}.side nav{display:flex;gap:.2rem;margin-top:1.25rem;overflow:auto}.side nav a{border-bottom:2px solid transparent;border-left:0;white-space:nowrap}.side nav a[aria-current="page"]{border-bottom-color:#61b4a9}.side-meta{display:none}.topbar{align-items:flex-start}.grid{display:block}.panel{margin-top:1rem}.table-wrap{overflow:auto}h1{font-size:2.5rem}}
body{overflow-x:hidden}button,.button{font-family:inherit;font-size:1rem;font-weight:700;line-height:1.2}
@media(max-width:800px){.side{overflow:hidden}.side nav{max-width:100%;padding-bottom:.25rem}.side nav a{flex:0 0 auto}.topbar{display:grid;justify-items:start}.content{min-width:0;overflow:hidden;width:100%}.lede{overflow-wrap:anywhere}.panel{min-width:0}.table-wrap{max-width:100%}}
@media(max-width:800px){.side nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));overflow:visible}.side nav a{min-width:0;text-align:center;white-space:normal}}
@media(prefers-reduced-motion:no-preference){.trust-dot{transition:transform .18s ease}.trust-rail li:hover .trust-dot{transform:scale(1.15)}}
.auth-form{display:grid;gap:.75rem;margin-top:1.5rem}.auth-form label{font-weight:750}.auth-form input{background:#fff;border:1px solid #91a0a7;border-radius:.35rem;color:var(--ink);font:inherit;min-height:3rem;padding:.7rem .8rem;width:100%}.auth-form input:focus{border-color:var(--signal)}.auth-form .otp-input{font-family:"Cascadia Mono",monospace;font-size:1.5rem;font-weight:700;letter-spacing:.35em;text-align:center}.auth-secondary{border-top:1px solid var(--line);display:grid;gap:.5rem;margin-top:1.5rem;padding-top:1rem}.auth-secondary form{margin:0}.secondary{background:transparent;border:1px solid var(--line);color:var(--ink);width:100%}.secondary:disabled{cursor:not-allowed;opacity:.6}.link-button{background:transparent;color:var(--signal);min-height:2rem;padding:.3rem;text-decoration:underline}.form-notice{background:#fff4dc;border-left:3px solid var(--caution);padding:.75rem}
`;

export interface ShellOptions {
  readonly title: string;
  readonly eyebrow: string;
  readonly active: 'overview' | 'sites' | 'grants' | 'activity' | 'compatibility' | 'readiness' | 'account';
  readonly tenantId?: string;
  readonly deployment: PublicDeploymentConfig;
  readonly body: string;
}

function optionalLink(url: string | undefined, label: string): string {
  return url === undefined ? '' : `<a href="${escapeHtml(url)}" rel="noreferrer">${escapeHtml(label)}</a>`;
}

export function renderShell(options: ShellOptions): string {
  const tenantPath = options.tenantId === undefined ? undefined : `/app/tenants/${encodeURIComponent(options.tenantId)}`;
  const nav = tenantPath === undefined
    ? ([
        ['compatibility', '/app/compatibility', 'Compatibility'], ['readiness', '/app/readiness', 'Readiness'],
        ['account', '/app/account', 'Account']
      ] satisfies readonly (readonly [ShellOptions['active'], string, string])[])
      .map(([key, href, label]) => `<a href="${href}"${options.active === key ? ' aria-current="page"' : ''}>${label}</a>`).join('')
    : ([
        ['overview', tenantPath, 'Overview'], ['sites', `${tenantPath}/sites`, 'Sites'],
        ['grants', `${tenantPath}/grants`, 'Grants'], ['activity', `${tenantPath}/activity`, 'Activity'],
        ['compatibility', '/app/compatibility', 'Compatibility'], ['readiness', '/app/readiness', 'Readiness'],
        ['account', '/app/account', 'Account']
      ] satisfies readonly (readonly [ShellOptions['active'], string, string])[])
      .map(([key, href, label]) => `<a href="${href}"${options.active === key ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const preview = options.deployment.deploymentMode === 'local' || options.deployment.deploymentMode === 'test'
    ? '<span class="preview">Preview configuration</span>' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.title)} · ${escapeHtml(options.deployment.productName)}</title><link rel="stylesheet" href="/assets/wepuu-v1.css"></head><body><a class="skip-link" href="#main">Skip to content</a><div class="app-shell"><aside class="side"><div class="brand"><span class="brand-mark" aria-hidden="true"><span>WP</span></span>${escapeHtml(options.deployment.productName)}</div><nav aria-label="Primary">${nav}</nav><div class="side-meta">Control plane only<br>MCP data travels direct</div></aside><div class="page"><header class="topbar"><div class="tenant-label">${options.tenantId === undefined ? 'Platform account' : `Workspace ${escapeHtml(options.tenantId.slice(0, 8))}`}</div>${preview}</header><main class="content" id="main"><p class="eyebrow">${escapeHtml(options.eyebrow)}</p>${options.body}<footer class="footer"><span>${escapeHtml(options.deployment.legalProviderName)}</span><span>Data region: ${escapeHtml(options.deployment.dataRegionLabel)}</span>${optionalLink(options.deployment.termsUrl, 'Terms')}${optionalLink(options.deployment.privacyUrl, 'Privacy')}${optionalLink(options.deployment.supportUrl, 'Support')}${optionalLink(options.deployment.statusUrl, 'Status')}</footer></main></div></div></body></html>`;
}

export function renderInteractionPage(input: Readonly<{
  title: string;
  heading: string;
  message: string;
  content?: string;
}>): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title><link rel="stylesheet" href="/assets/wepuu-v1.css"></head><body class="interaction"><main class="interaction-card"><p class="eyebrow">Secure connection</p><h1>${escapeHtml(input.heading)}</h1><p class="lede">${escapeHtml(input.message)}</p>${input.content ?? ''}</main></body></html>`;
}
