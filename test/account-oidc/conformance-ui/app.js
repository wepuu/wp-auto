'use strict';

const tenantId = '11111111-2222-4333-8444-555555555555';
const status = document.getElementById('status');
const buttons = [...document.querySelectorAll('button')];

function idempotencyKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function activeSite() {
  const response = await fetch(`/v1/tenants/${encodeURIComponent(tenantId)}/sites`, {
    credentials: 'same-origin', headers: { accept: 'application/json' }
  });
  if (response.status === 401) {
    location.assign('/v1/account/oidc/login?return_to=%2Fconformance%2F');
    return undefined;
  }
  if (!response.ok) throw new Error('site_lookup_failed');
  const payload = await response.json();
  const site = Array.isArray(payload.sites)
    ? payload.sites.find((candidate) => candidate.status === 'active')
    : undefined;
  if (!site || typeof site.id !== 'string') throw new Error('active_site_missing');
  return site;
}

async function start(kind) {
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = 'Finding the active paired site...';
  try {
    const site = await activeSite();
    if (!site) return;
    status.textContent = 'Creating a one-time local consent request...';
    const requestKey = idempotencyKey();
    const grantResponse = await fetch(
      `/v1/tenants/${encodeURIComponent(tenantId)}/sites/${encodeURIComponent(site.id)}/grants`,
      {
        method: 'POST', credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': requestKey
        },
        body: JSON.stringify({
          client_id: `conformance.${kind}.${requestKey.slice(0, 8)}`,
          scopes: ['mcp:read', 'mcp:content.write']
        })
      }
    );
    if (!grantResponse.ok) throw new Error('grant_start_failed');
    const grant = await grantResponse.json();
    if (typeof grant.consent_url !== 'string') throw new Error('consent_url_missing');
    location.assign(grant.consent_url);
  } catch {
    status.textContent = 'Unable to start consent. Return the displayed status to Codex.';
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function disconnect() {
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = 'Finding the active paired site...';
  try {
    const site = await activeSite();
    if (!site) return;
    const response = await fetch(
      `/v1/tenants/${encodeURIComponent(tenantId)}/sites/${encodeURIComponent(site.id)}/disconnect`,
      {
        method: 'POST', credentials: 'same-origin',
        headers: { 'idempotency-key': idempotencyKey() }
      }
    );
    if (response.status !== 204) throw new Error('site_disconnect_failed');
    status.textContent = 'Active site disconnected; its platform grants are revoked.';
  } catch {
    status.textContent = 'Site disconnect failed. Return this status to Codex.';
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function logout() {
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = 'Revoking the platform session...';
  try {
    const response = await fetch('/v1/account/logout', {
      method: 'POST', credentials: 'same-origin'
    });
    if (response.status !== 204) throw new Error('logout_failed');
    const session = await fetch('/v1/account/session', {
      credentials: 'same-origin', headers: { accept: 'application/json' }
    });
    if (session.status !== 401) throw new Error('session_still_active');
    status.textContent = 'Session revoked; subsequent session resolution returned 401.';
  } catch {
    status.textContent = 'Session revocation check failed. Return this status to Codex.';
    buttons.forEach((button) => { button.disabled = false; });
  }
}

document.getElementById('approve').addEventListener('click', () => { void start('approve'); });
document.getElementById('deny').addEventListener('click', () => { void start('deny'); });
document.getElementById('disconnect').addEventListener('click', () => { void disconnect(); });
document.getElementById('logout').addEventListener('click', () => { void logout(); });
