import { ApiError } from '../../utils/errors.js';

/**
 * Suggested store builder category chips — keep labels in sync with
 * apps/web/src/features/shops/types.ts BUILDER_CATEGORIES / DEFAULT_BUILDER_CATEGORIES.
 *
 * These are presets for Shop.categories string labels (not catalog taxonomy ids).
 * The dashboard and updateShop() also accept custom non-empty labels.
 */
export const STORE_BUILDER_CATEGORY_LABELS = [
  'Food & Beverages',
  'Work Essentials',
  'Merch',
  'Luxury',
];

/** Matches web DEFAULT_BUILDER_CATEGORIES used when creating a shop in the dashboard. */
export const DEFAULT_STORE_BUILDER_CATEGORIES = ['Food & Beverages', 'Work Essentials', 'Merch'];

export function normalizeCategoryLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function listStoreBuilderCategories() {
  return STORE_BUILDER_CATEGORY_LABELS.map((label) => ({ label, suggested: true }));
}

/**
 * Resolve category input for MCP writes:
 * - exact case-insensitive match to a suggested preset → canonical preset label
 * - otherwise a custom trimmed label (same freedom as updateShop / dashboard)
 * Rejects blanks and duplicates after normalization.
 * MCP also caps each label at 40 characters to match shopsWrite create/update;
 * REST updateShop has no max length on category strings.
 */
export function resolveStoreCategoryLabels(requested) {
  if (!Array.isArray(requested) || !requested.length) {
    throw new ApiError(422, 'Add at least one store category', 'CATEGORY_REQUIRED');
  }
  const resolved = [];
  const seen = new Set();
  for (const raw of requested) {
    const trimmed = String(raw ?? '').trim().replace(/\s+/g, ' ');
    const key = normalizeCategoryLabel(trimmed);
    if (!trimmed || !key) {
      throw new ApiError(400, 'Store category labels cannot be empty', 'VALIDATION');
    }
    if (trimmed.length > 40) {
      throw new ApiError(400, 'Store category labels must be 40 characters or fewer', 'VALIDATION');
    }
    const preset = STORE_BUILDER_CATEGORY_LABELS.find(
      (label) => normalizeCategoryLabel(label) === key,
    );
    const label = preset || trimmed;
    const dedupeKey = normalizeCategoryLabel(label);
    if (seen.has(dedupeKey)) {
      throw new ApiError(422, `Duplicate store category "${label}"`, 'CATEGORY_DUPLICATE');
    }
    seen.add(dedupeKey);
    resolved.push(label);
  }
  return resolved;
}