import { randomUUID } from 'node:crypto';
import type { GrantView, SiteView, TenantMembershipView } from '@wepuu/contracts';
import type { SecurityEventView } from '@wepuu/database';
import {
  escapeHtml,
  renderShell,
  type DeploymentReadinessReport,
  type PublicDeploymentConfig,
  type ShellOptions
} from '@wepuu/platform-ui';

type Section = ShellOptions['active'];

export interface TenantPageModel {
  readonly deployment: PublicDeploymentConfig;
  readonly membership: TenantMembershipView;
  readonly sites: readonly SiteView[];
  readonly grants: readonly GrantView[];
  readonly events: readonly SecurityEventView[];
  readonly csrfToken: string;
  readonly activity?: {
    readonly page: number;
    readonly outcome?: 'success' | 'denied' | 'error';
    readonly hasNext: boolean;
  };
}

function status(value: string): string {
  return `<span class="status ${escapeHtml(value)}">${escapeHtml(value)}</span>`;
}

function page(model: TenantPageModel, active: Section, title: string, eyebrow: string, body: string): string {
  return renderShell({ title, eyebrow, active, tenantId: model.membership.tenantId, deployment: model.deployment, body });
}

function actionForm(action: string, label: string, csrfToken: string, dangerous = true): string {
  return `<form method="post" action="${escapeHtml(action)}"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><input type="hidden" name="idempotency_key" value="${randomUUID().replaceAll('-', '')}"><button type="submit"${dangerous ? ' class="danger"' : ''}>${escapeHtml(label)}</button></form>`;
}

function trustRail(model: TenantPageModel): string {
  const activeSites = model.sites.filter((site) => site.status === 'active').length;
  const activeGrants = model.grants.filter((grant) => grant.status === 'active').length;
  const clientCount = new Set(model.grants.filter((grant) => grant.status === 'active').map((grant) => grant.clientId)).size;
  return `<ol class="trust-rail"><li><span class="trust-dot"></span><div><strong>Platform account</strong><small>Authenticated through external OIDC</small></div></li><li><span class="trust-dot"></span><div><strong>${String(activeSites)} connected site${activeSites === 1 ? '' : 's'}</strong><small>Each site keeps its own WordPress permissions</small></div></li><li><span class="trust-dot"></span><div><strong>${String(activeGrants)} active grant${activeGrants === 1 ? '' : 's'}</strong><small>Scopes limit what a client may request</small></div></li><li><span class="trust-dot"></span><div><strong>${String(clientCount)} authorized client${clientCount === 1 ? '' : 's'}</strong><small>MCP calls travel directly to WordPress</small></div></li></ol>`;
}

export function renderOverview(model: TenantPageModel): string {
  const recent = model.events.slice(0, 5).map((event) => `<tr><td>${escapeHtml(event.eventName)}</td><td>${status(event.outcome)}</td><td>${escapeHtml(new Date(event.occurredAt).toLocaleString('en-US', { timeZone: 'UTC' }))} UTC</td></tr>`).join('');
  return page(model, 'overview', 'Trust overview', 'Workspace security', `<h1>Know every link in the chain.</h1><p class="lede">WePuu coordinates identity and authorization. Tool inputs, results and WordPress content never pass through this control plane.</p><div class="grid"><section class="panel span-8"><h2>Trust rail</h2>${trustRail(model)}</section><aside class="panel span-4"><h2>Workspace role</h2><div class="metric">${escapeHtml(model.membership.role)}</div><p class="muted">Home workspace: ${model.membership.isHome ? 'yes' : 'no'}</p></aside><section class="panel span-8"><h2>Recent security activity</h2>${recent === '' ? '<div class="empty">No security events have been recorded.</div>' : `<div class="table-wrap"><table><thead><tr><th>Event</th><th>Outcome</th><th>Time</th></tr></thead><tbody>${recent}</tbody></table></div>`}</section><aside class="panel span-4"><h2>Direct data path</h2><p>OAuth tokens come from the platform. MCP requests go from the client to the exact WordPress resource.</p><p class="mono">Client &rarr; WordPress</p></aside></div>`);
}

export function renderSites(model: TenantPageModel): string {
  const tenantPath = `/app/tenants/${encodeURIComponent(model.membership.tenantId)}`;
  const rows = model.sites.map((site) => `<tr><td><strong><a href="${tenantPath}/sites/${encodeURIComponent(site.id)}">${escapeHtml(site.displayHostname)}</a></strong><br><code>${escapeHtml(site.resource)}</code></td><td>${status(site.status)}</td><td>${escapeHtml(site.protocolVersion)}</td><td>${site.status === 'active' ? actionForm(`${tenantPath}/sites/${encodeURIComponent(site.id)}/disconnect`, 'Disconnect site', model.csrfToken) : ''}</td></tr>`).join('');
  return page(model, 'sites', 'Connected sites', 'Resource inventory', `<h1>WordPress stays in control.</h1><p class="lede">A site appears here only after its administrator starts and completes pairing. Disconnecting revokes its platform relationship.</p><section class="panel flat"><div class="table-wrap">${rows === '' ? '<div class="empty"><strong>No sites connected.</strong><p>Start pairing from the WePuu connector in WordPress.</p></div>' : `<table><thead><tr><th>Site and exact MCP resource</th><th>Status</th><th>Protocol</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`}</div></section>`);
}

export function renderGrants(model: TenantPageModel): string {
  const tenantPath = `/app/tenants/${encodeURIComponent(model.membership.tenantId)}`;
  const rows = model.grants.map((grant) => `<tr><td><a href="${tenantPath}/grants/${encodeURIComponent(grant.id)}"><code>${escapeHtml(grant.clientId)}</code></a></td><td>${grant.scopes.map((scope) => `<span class="mono">${escapeHtml(scope)}</span>`).join('<br>')}</td><td>${status(grant.status)}</td><td>${grant.status === 'active' ? actionForm(`${tenantPath}/grants/${encodeURIComponent(grant.id)}/revoke`, 'Revoke grant', model.csrfToken) : ''}</td></tr>`).join('');
  return page(model, 'grants', 'Client grants', 'Authorization ceiling', `<h1>Grant only what the client needs.</h1><p class="lede">A scope is a ceiling, not a replacement for WordPress capability and object checks.</p><section class="panel flat"><div class="table-wrap">${rows === '' ? '<div class="empty"><strong>No client grants.</strong><p>Consent begins from a compatible MCP client.</p></div>' : `<table><thead><tr><th>Client</th><th>Approved scopes</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`}</div></section>`);
}

export function renderActivity(model: TenantPageModel): string {
  const rows = model.events.map((event) => `<tr><td>${escapeHtml(event.eventName)}</td><td>${status(event.outcome)}</td><td>${escapeHtml(event.reason)}</td><td><code>${escapeHtml(event.correlationId)}</code></td><td>${escapeHtml(new Date(event.occurredAt).toLocaleString('en-US', { timeZone: 'UTC' }))} UTC</td></tr>`).join('');
  const activity = model.activity ?? { page: 1, hasNext: false };
  const tenantPath = `/app/tenants/${encodeURIComponent(model.membership.tenantId)}/activity`;
  const query = (pageNumber: number): string => {
    const parameters = new URLSearchParams({ page: String(pageNumber) });
    if (activity.outcome !== undefined) parameters.set('outcome', activity.outcome);
    return `${tenantPath}?${parameters.toString()}`;
  };
  const options = ['', 'success', 'denied', 'error'].map((value) => `<option value="${value}"${activity.outcome === value ? ' selected' : ''}>${value === '' ? 'All outcomes' : value}</option>`).join('');
  const previous = activity.page > 1 ? `<a class="button" href="${query(activity.page - 1)}">Previous</a>` : '<span></span>';
  const next = activity.hasNext ? `<a class="button" href="${query(activity.page + 1)}">Next</a>` : '<span></span>';
  return page(model, 'activity', 'Security activity', 'Content-free audit', `<h1>See decisions, never content.</h1><p class="lede">This record contains security outcomes and opaque identifiers. It does not contain MCP arguments, results, tokens or WordPress content.</p><form class="filter-bar" method="get" action="${tenantPath}"><label>Outcome<select name="outcome">${options}</select></label><button type="submit">Apply filter</button></form><section class="panel flat"><div class="table-wrap">${rows === '' ? '<div class="empty">No security activity matches this view.</div>' : `<table><thead><tr><th>Event</th><th>Outcome</th><th>Reason</th><th>Correlation</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>`}</div><nav class="pager" aria-label="Activity pages">${previous}<span>Page ${String(activity.page)}</span>${next}</nav></section>`);
}

export function renderSiteDetail(model: TenantPageModel, siteId: string): string {
  const site = model.sites.find((candidate) => candidate.id === siteId);
  if (site === undefined) throw new Error('site_not_found');
  const grants = model.grants.filter((grant) => grant.siteId === site.id);
  const tenantPath = `/app/tenants/${encodeURIComponent(model.membership.tenantId)}`;
  return page(model, 'sites', site.displayHostname, 'Site trust record', `<p><a href="${tenantPath}/sites">&larr; All sites</a></p><h1>${escapeHtml(site.displayHostname)}</h1><p class="lede">This record binds one exact WordPress MCP resource to this workspace. Changing the origin requires a new pairing.</p><div class="grid"><section class="panel span-8"><h2>Exact resource</h2><dl class="detail-list"><div><dt>Resource</dt><dd><code>${escapeHtml(site.resource)}</code></dd></div><div><dt>Status</dt><dd>${status(site.status)}</dd></div><div><dt>Protocol</dt><dd>${escapeHtml(site.protocolVersion)}</dd></div><div><dt>Paired</dt><dd>${escapeHtml(new Date(site.createdAt).toLocaleString('en-US', { timeZone: 'UTC' }))} UTC</dd></div></dl></section><aside class="panel span-4"><h2>Authorized clients</h2><div class="metric">${String(grants.filter((grant) => grant.status === 'active').length)}</div><p class="muted">Active grants for this exact resource.</p></aside><section class="panel span-8"><h2>Connection controls</h2><p>Disconnecting revokes the site relationship and its grants. It does not remove WordPress content.</p>${site.status === 'active' ? actionForm(`${tenantPath}/sites/${encodeURIComponent(site.id)}/disconnect`, 'Disconnect site', model.csrfToken) : '<p class="muted">This site is not active.</p>'}</section></div>`);
}

export function renderGrantDetail(model: TenantPageModel, grantId: string): string {
  const grant = model.grants.find((candidate) => candidate.id === grantId);
  if (grant === undefined) throw new Error('grant_not_found');
  const site = model.sites.find((candidate) => candidate.id === grant.siteId);
  const tenantPath = `/app/tenants/${encodeURIComponent(model.membership.tenantId)}`;
  return page(model, 'grants', 'Grant detail', 'Authorization record', `<p><a href="${tenantPath}/grants">&larr; All grants</a></p><h1>Client authorization.</h1><p class="lede">This grant sets a maximum scope. WordPress still evaluates its local user, capability and object permissions for every tool call.</p><div class="grid"><section class="panel span-8"><h2>Binding</h2><dl class="detail-list"><div><dt>Client</dt><dd><code>${escapeHtml(grant.clientId)}</code></dd></div><div><dt>Site</dt><dd>${site === undefined ? '<span class="muted">Unavailable</span>' : `<a href="${tenantPath}/sites/${encodeURIComponent(site.id)}">${escapeHtml(site.displayHostname)}</a>`}</dd></div><div><dt>Status</dt><dd>${status(grant.status)}</dd></div><div><dt>Consent version</dt><dd>${escapeHtml(grant.consentVersion)}</dd></div><div><dt>Created</dt><dd>${escapeHtml(new Date(grant.createdAt).toLocaleString('en-US', { timeZone: 'UTC' }))} UTC</dd></div></dl></section><aside class="panel span-4"><h2>Approved scopes</h2><ul class="scope-list">${grant.scopes.map((scope) => `<li>${escapeHtml(scope)}</li>`).join('')}</ul></aside><section class="panel span-8"><h2>Authorization control</h2><p>Revoking this grant invalidates its refresh family and schedules a content-free revocation event for the paired site.</p>${grant.status === 'active' ? actionForm(`${tenantPath}/grants/${encodeURIComponent(grant.id)}/revoke`, 'Revoke grant', model.csrfToken) : '<p class="muted">This grant is not active.</p>'}</section></div>`);
}

export function renderCompatibility(input: Readonly<{ deployment: PublicDeploymentConfig }>): string {
  return renderShell({
    title: 'Compatibility', eyebrow: 'Verified client paths', active: 'compatibility', deployment: input.deployment,
    body: `<h1>Support means tested.</h1><p class="lede">A client appears as supported only after its real OAuth and direct MCP path passes. Documentation claims alone do not establish compatibility.</p><section class="panel flat"><div class="table-wrap"><table><thead><tr><th>Client</th><th>Version</th><th>Registration path</th><th>Result</th></tr></thead><tbody><tr><td>Codex</td><td><code>0.154.0</code></td><td>Pre-registered Authorization Code + PKCE S256</td><td>${status('success')}</td></tr><tr><td>WorkBuddy / codebuddy</td><td><code>5.5.2 / 2.137.1</code></td><td>No standards-compliant path verified</td><td>${status('denied')}</td></tr></tbody></table></div><p class="muted">Matrix version: ${escapeHtml(input.deployment.release.compatibilityMatrixVersion)}. Newer client versions remain unverified until the same acceptance suite passes.</p></section>`
  });
}

export function renderReadiness(input: Readonly<{ deployment: PublicDeploymentConfig; report: DeploymentReadinessReport }>): string {
  const checks = input.report.checks.map((check) => `<div class="readiness-item ${check.status}"><strong>${escapeHtml(check.label)}</strong> ${status(check.status)}<p class="muted">${escapeHtml(check.detail)}</p></div>`).join('');
  return renderShell({
    title: 'Release readiness', eyebrow: 'Fail-closed release gate', active: 'readiness', deployment: input.deployment,
    body: `<h1>${input.report.ready ? 'Configuration is release-ready.' : 'Public release stays locked.'}</h1><p class="lede">This view reports whether required categories are configured. It never returns secrets, credential paths, client secrets or key material.</p><div class="grid"><section class="panel span-8"><h2>Readiness checks</h2><div class="readiness-grid">${checks}</div></section><aside class="panel span-4"><h2>Candidate</h2><dl class="detail-list"><div><dt>Version</dt><dd>${escapeHtml(input.deployment.release.version)}</dd></div><div><dt>Revision</dt><dd><code>${escapeHtml(input.deployment.release.revision)}</code></dd></div><div><dt>Credential path</dt><dd>${escapeHtml(input.deployment.release.credentialMode)}</dd></div></dl></aside></div>`
  });
}

export function renderAccount(input: Readonly<{
  deployment: PublicDeploymentConfig;
  memberships: readonly TenantMembershipView[];
  csrfToken: string;
}>): string {
  const workspaces = input.memberships.map((membership) => `<li><a href="/app/tenants/${encodeURIComponent(membership.tenantId)}"><strong>Workspace ${escapeHtml(membership.tenantId.slice(0, 8))}</strong><br><span class="muted">${escapeHtml(membership.role)}${membership.isHome ? ' &middot; home' : ''}</span></a></li>`).join('');
  return renderShell({
    title: 'Account', eyebrow: 'Account and data', active: 'account', deployment: input.deployment,
    body: `<h1>Your account is a control identity.</h1><p class="lede">It stores an opaque identity binding and authorization state. It does not store your WordPress password, Application Password, content or MCP payloads.</p><div class="grid"><section class="panel span-8"><h2>Workspaces</h2><ul class="workspace-list">${workspaces}</ul></section><aside class="panel span-4"><h2>Session</h2><p>Signing out revokes this browser session.</p>${actionForm('/app/logout', 'Sign out', input.csrfToken, false)}</aside><section class="panel span-8"><h2>Data controls</h2><p>Verified deletion is implemented internally, but public deletion requests remain disabled while retention, residency and legal policies are being finalized.</p><p class="muted">No request has been created from this page.</p></section></div>`
  });
}
