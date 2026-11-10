const HOST = 'chatgpt.com';
const CALLBACK_ID = '[A-Za-z0-9_-]{1,128}';

function httpsPath(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  if (url.hostname !== HOST || (url.port && url.port !== '443')) return null;
  return url.pathname;
}

/** Official ChatGPT client metadata documents. No other host is fetched. */
export function isChatGptMetadataUrl(value) {
  const path = httpsPath(value);
  if (!path) return false;
  if (path === '/oauth/client.json') return true;
  return new RegExp(`^/oauth/${CALLBACK_ID}/client\\.json$`).test(path);
}

/** Redirects published for ChatGPT when issuer identification is enabled, plus callback-specific URIs. */
export function isChatGptRedirectUri(value) {
  const path = httpsPath(value);
  if (!path) return false;
  if (path === '/connector_platform_oauth_redirect') return true;
  return new RegExp(`^/connector/oauth/${CALLBACK_ID}$`).test(path);
}

export function isChatGptJwksUri(value) {
  return httpsPath(value) === '/oauth/jwks.json';
}

export async function allowChatGptMetadataFetch(_ctx, clientId) {
  return isChatGptMetadataUrl(clientId);
}

export async function allowChatGptClient(_ctx, client) {
  const redirects = client.redirectUris;
  if (!Array.isArray(redirects) || redirects.length === 0 || !redirects.every(isChatGptRedirectUri)) {
    return false;
  }
  const method = client.tokenEndpointAuthMethod;
  if (method !== 'none' && method !== 'private_key_jwt') return false;
  const grants = client.grantTypes;
  if (!Array.isArray(grants) || !grants.includes('authorization_code')) return false;
  if (grants.some((grant) => grant !== 'authorization_code' && grant !== 'refresh_token')) return false;
  const responses = client.responseTypes;
  if (!Array.isArray(responses) || responses.length === 0 || responses.some((type) => type !== 'code')) {
    return false;
  }
  if (method === 'private_key_jwt') {
    if (client.tokenEndpointAuthSigningAlg !== 'RS256') return false;
    if (!isChatGptJwksUri(client.jwksUri)) return false;
  }
  return true;
}
