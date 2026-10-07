import { randomUUID } from 'node:crypto';
import type { GrantView, SiteView, TenantMembershipView } from '@wepuu/contracts';
import type { SecurityEventView } from '@wepuu/database';
import {
  escapeHtml,
  renderShell,
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
}

function status(value: string): string {
  return `<span class="status ${escapeHtml(value)}">${escapeHtml(value)}</span>`;
}

function page(model: TenantPageModel, active: Section, title: string, eyebrow: string, body: string): string {
  return renderShell({
    title,
    eyebrow,
    active,
    tenantId: model.membership.tenantId,
    deployment: model.deployment,
    body
  });
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
  return page(model, 'overview', 'Trust overview', 'Workspace security', `<h1>Know every link in the chain.</h1><p class="lede">WePuu coordinates identity and authorization. Tool inputs, results and WordPress content never pass through this control plane.</p><div class="grid"><section class="panel span-8"><h2>Trust rail</h2>${trustRail(model)}</section><aside class="panel span-4"><h2>Workspace role</h2><div class="metric">${escapeHtml(model.membership.role)}</div><p class="muted">Home workspace: ${model.membership.isHome ? 'yes' : 'no'}</p></aside><section class="panel span-8"><h2>Recent security activity</h2>${recent === '' ? '<div class="empty">No security events have been recorded.</div>' : `<div class="table-wrap"><table><thead><tr><th>Event</th><th>Outcome</th><th>Time</th></tr></thead><tbody>${recent}</tbody></table></div>`}</section><aside class="panel span-4"><h2>Direct data path</h2><p>OAuth tokens come from the platform. MCP requests go from the client to the exact WordPress resource.</p><p class="mono">Client → WordPress</p></aside></div>`);
}

export function renderSites(model: TenantPageModel): string {
  const rows = model.sites.map((site) => `<tr><td><strong>${escapeHtml(site.displayHostname)}</strong><br><code>${escapeHtml(site.resource)}</code></td><td>${status(site.status)}</td><td>${escapeHtml(site.protocolVersion)}</td><td>${site.status === 'active' ? actionForm(`/app/tenants/${encodeURIComponent(model.membership.tenantId)}/sites/${encodeURIComponent(site.id)}/disconnect`, 'Disconnect site', model.csrfToken) : ''}</td></tr>`).join('');
  return page(model, 'sites', 'Connected sites', 'Resource inventory', `<h1>WordPress stays in control.</h1><p class="lede">A site appears here only after its administrator starts and completes pairing. Disconnecting revokes its platform relationship.</p><section class="panel flat"><div class="table-wrap">${rows === '' ? '<div class="empty"><strong>No sites connected.</strong><p>Start pairing from the WePuu connector in WordPress.</p></div>' : `<table><thead><tr><th>Site and exact MCP resource</th><th>Status</th><th>Protocol</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`}</div></section>`);
}

export function renderGrants(model: TenantPageModel): string {
  const rows = model.grants.map((grant) => `<tr><td><code>${escapeHtml(grant.clientId)}</code></td><td>${grant.scopes.map((scope) => `<span class="mono">${escapeHtml(scope)}</span>`).join('<br>')}</td><td>${status(grant.status)}</td><td>${grant.status === 'active' ? actionForm(`/app/tenants/${encodeURIComponent(model.membership.tenantId)}/grants/${encodeURIComponent(grant.id)}/revoke`, 'Revoke grant', model.csrfToken) : ''}</td></tr>`).join('');
  return page(model, 'grants', 'Client grants', 'Authorization ceiling', `<h1>Grant only what the client needs.</h1><p class="lede">A scope is a ceiling, not a replacement for WordPress capability and object checks.</p><section class="panel flat"><div class="table-wrap">${rows === '' ? '<div class="empty"><strong>No client grants.</strong><p>Consent begins from a compatible MCP client.</p></div>' : `<table><thead><tr><th>Client</th><th>Approved scopes</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`}</div></section>`);
}

export function renderActivity(model: TenantPageModel): string {
  const rows = model.events.map((event) => `<tr><td>${escapeHtml(event.eventName)}</td><td>${status(event.outcome)}</td><td>${escapeHtml(event.reason)}</td><td><code>${escapeHtml(event.correlationId)}</code></td><td>${escapeHtml(new Date(event.occurredAt).toLocaleString('en-US', { timeZone: 'UTC' }))} UTC</td></tr>`).join('');
  return page(model, 'activity', 'Security activity', 'Content-free audit', `<h1>See decisions, never content.</h1><p class="lede">This record contains security outcomes and opaque identifiers. It does not contain MCP arguments, results, tokens or WordPress content.</p><section class="panel flat"><div class="table-wrap">${rows === '' ? '<div class="empty">No security activity has been recorded.</div>' : `<table><thead><tr><th>Event</th><th>Outcome</th><th>Reason</th><th>Correlation</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>`}</div></section>`);
}

export function renderAccount(input: Readonly<{
  deployment: PublicDeploymentConfig;
  memberships: readonly TenantMembershipView[];
  csrfToken: string;
}>): string {
  const workspaces = input.memberships.map((membership) => `<li><a href="/app/tenants/${encodeURIComponent(membership.tenantId)}">Workspace ${escapeHtml(membership.tenantId.slice(0, 8))}</a> · ${escapeHtml(membership.role)}${membership.isHome ? ' · home' : ''}</li>`).join('');
  return renderShell({
    title: 'Account', eyebrow: 'Account and data', active: 'account', deployment: input.deployment,
    body: `<h1>Your account is a control identity.</h1><p class="lede">It stores an opaque identity binding and authorization state. It does not store your WordPress password, Application Password, content or MCP payloads.</p><div class="grid"><section class="panel span-8"><h2>Workspaces</h2><ul>${workspaces}</ul></section><aside class="panel span-4"><h2>Session</h2><p>Signing out revokes this browser session.</p>${actionForm('/app/logout', 'Sign out', input.csrfToken, false)}</aside><section class="panel span-8"><h2>Data controls</h2><p>Verified deletion is implemented internally, but public deletion requests remain disabled while retention, residency and legal policies are being finalized.</p><p class="muted">No request has been created from this page.</p></section></div>`
  });
}
