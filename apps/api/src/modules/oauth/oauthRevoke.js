import { getOidcProvider } from './createOidcProvider.js';
import { OauthGrantBinding } from './oauthGrantBinding.model.js';

/**
 * Destroy the provider grant and every token family tied to it.
 * JWT access tokens are not stored, so later /mcp calls fail the live grant check.
 */
export async function revokeOauthGrantsForUser(userId, { tenantId, clientId } = {}) {
  if (!userId) return;
  const query = { userId };
  if (tenantId) query.tenantId = tenantId;
  if (clientId) query.clientId = clientId;
  const bindings = await OauthGrantBinding.find(query).select('grantId').lean();
  const provider = getOidcProvider();
  await Promise.all(bindings.map(async (binding) => {
    const grant = await provider.Grant.find(binding.grantId).catch(() => null);
    if (grant) await grant.destroy();
    await provider.AccessToken.revokeByGrantId(binding.grantId);
    await provider.RefreshToken.revokeByGrantId(binding.grantId);
  }));
  await OauthGrantBinding.deleteMany(query);
}
