import { env } from '../../config/env.js';

/** Per-domain embedded write gates. All default false. */
export const WRITE_FLAG_KEYS = {
  storeCreate: 'EMBEDDED_COPILOT_WRITE_STORE_CREATE',
  storeUpdate: 'EMBEDDED_COPILOT_WRITE_STORE_UPDATE',
  storePublish: 'EMBEDDED_COPILOT_WRITE_STORE_PUBLISH',
  collections: 'EMBEDDED_COPILOT_WRITE_COLLECTIONS',
  shopCatalog: 'EMBEDDED_COPILOT_WRITE_SHOP_CATALOG',
  shopCategories: 'EMBEDDED_COPILOT_WRITE_SHOP_CATEGORIES',
  budgets: 'EMBEDDED_COPILOT_WRITE_BUDGETS',
  walletTopup: 'EMBEDDED_COPILOT_WRITE_WALLET_TOPUP',
  walletSetup: 'EMBEDDED_COPILOT_WRITE_WALLET_SETUP',
  payments: 'EMBEDDED_COPILOT_WRITE_PAYMENTS',
  sendPoints: 'EMBEDDED_COPILOT_WRITE_SEND_POINTS',
  sendKits: 'EMBEDDED_COPILOT_WRITE_SEND_KITS',
  employees: 'EMBEDDED_COPILOT_WRITE_EMPLOYEES',
  entities: 'EMBEDDED_COPILOT_WRITE_ENTITIES',
};

export function isWriteFlagEnabled(flagKey) {
  if (!flagKey) return false;
  const envKey = WRITE_FLAG_KEYS[flagKey];
  if (!envKey) return false;
  return env[envKey] === 'true';
}

export function writeDomainsStatus() {
  return Object.fromEntries(
    Object.keys(WRITE_FLAG_KEYS).map((key) => [key, isWriteFlagEnabled(key)]),
  );
}

export function anyWriteDomainEnabled() {
  return Object.keys(WRITE_FLAG_KEYS).some((key) => isWriteFlagEnabled(key));
}
