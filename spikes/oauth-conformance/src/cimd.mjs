const MAX_METADATA_BYTES = 16 * 1024;

export function validateClientIdMetadataUrl(clientId) {
  if (typeof clientId !== 'string' || !/^https:\/\//u.test(clientId)) throw new Error('invalid_cimd_client_id');
  const url = new URL(clientId);
  if (url.username || url.password || url.hash) throw new Error('invalid_cimd_client_id');
  if (url.hostname.length === 0) throw new Error('invalid_cimd_client_id');
  return url.toString();
}

export async function fetchClientIdMetadata(clientId, { fetcher = fetch, maxBytes = MAX_METADATA_BYTES } = {}) {
  const expectedClientId = validateClientIdMetadataUrl(clientId);
  const response = await fetcher(expectedClientId, {
    method: 'GET',
    headers: { accept: 'application/json' },
    redirect: 'error'
  });
  if (response.status !== 200) throw new Error('cimd_fetch_failed');
  const body = await response.arrayBuffer();
  if (body.byteLength > maxBytes) throw new Error('cimd_document_too_large');
  let document;
  try {
    document = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new Error('cimd_invalid_json');
  }
  if (!document || Array.isArray(document) || typeof document !== 'object') throw new Error('cimd_invalid_document');
  if (document.client_id !== expectedClientId) throw new Error('cimd_client_id_mismatch');
  if (document.token_endpoint_auth_method !== 'none') throw new Error('cimd_shared_secret_forbidden');
  for (const field of ['client_uri', 'logo_uri', 'policy_uri', 'tos_uri']) {
    if (document[field] !== undefined && new URL(document[field]).protocol !== 'https:') throw new Error('cimd_https_uri_required');
  }
  if ('client_secret' in document || 'client_secret_expires_at' in document) throw new Error('cimd_secret_forbidden');
  return document;
}
