/**
 * Shape assistant text when structured product/kit cards will be shown in the UI.
 * Prefer cards over duplicated markdown tables / image URL dumps.
 */

const IMAGE_URL_RE =
  /https?:\/\/[^\s)\]>"']+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)\]>"']*)?/gi;
const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\([^)]+\)/g;
const MARKDOWN_LINK_RE = /\[[^\]]+\]\((https?:\/\/[^)]+|\/[^)]+)\)/g;
const MARKDOWN_TABLE_LINE_RE = /^\s*\|.*\|\s*$/;
const MARKDOWN_TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const BARE_URL_RE = /https?:\/\/[^\s)\]>"']+/gi;

export function artifactsIncludeCards(artifacts = []) {
  return artifacts.some((row) => row?.kind === 'product' || row?.kind === 'kit');
}

function cardTitles(artifacts = []) {
  const names = [];
  for (const row of artifacts || []) {
    if (row?.kind === 'product' && row.product?.name) names.push(String(row.product.name).trim());
    if (row?.kind === 'kit' && row.kit?.name) names.push(String(row.kit.name).trim());
  }
  return names.filter(Boolean);
}

function lineDuplicatesCard(line, titles) {
  const trimmed = String(line || '').trim().replace(/^[-*•]\s+/, '').replace(/\*\*/g, '').trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  return titles.some((title) => {
    const t = title.toLowerCase();
    if (lower === t) return true;
    if (lower.startsWith(`${t} —`) || lower.startsWith(`${t} -`) || lower.startsWith(`${t}:`)) return true;
    if (lower === `view ${t}` || lower === 'view details' || lower.startsWith('view details')) return true;
    return false;
  });
}

export function formatAssistantTextForCards(content, artifacts = []) {
  if (!content) return '';
  let text = String(content).replace(/\r\n/g, '\n');
  if (!artifactsIncludeCards(artifacts)) {
    return text.replace(MARKDOWN_IMAGE_RE, '').replace(IMAGE_URL_RE, '').trim();
  }

  const titles = cardTitles(artifacts);
  const kept = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push('');
      continue;
    }
    if (MARKDOWN_TABLE_LINE_RE.test(trimmed) || MARKDOWN_TABLE_SEP_RE.test(trimmed)) continue;
    if (IMAGE_URL_RE.test(trimmed) && trimmed.length > 80) {
      IMAGE_URL_RE.lastIndex = 0;
      continue;
    }
    IMAGE_URL_RE.lastIndex = 0;
    if (lineDuplicatesCard(trimmed, titles)) continue;
    const withoutLinks = trimmed
      .replace(MARKDOWN_LINK_RE, '')
      .replace(BARE_URL_RE, '')
      .replace(/[*_`]/g, '')
      .trim();
    if (!withoutLinks && (MARKDOWN_LINK_RE.test(trimmed) || BARE_URL_RE.test(trimmed))) {
      MARKDOWN_LINK_RE.lastIndex = 0;
      BARE_URL_RE.lastIndex = 0;
      continue;
    }
    MARKDOWN_LINK_RE.lastIndex = 0;
    BARE_URL_RE.lastIndex = 0;
    kept.push(line);
  }
  text = kept.join('\n');
  text = text.replace(MARKDOWN_IMAGE_RE, '');
  text = text.replace(IMAGE_URL_RE, '');
  text = text.replace(MARKDOWN_LINK_RE, '');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}


import { catalogSearchSummary } from '../mcp/catalogSearch.js';
import { catalogProductSummary } from '../mcp/catalogRead.js';
import { kitsText } from '../mcp/kitsRead.js';

const PRODUCT_CARD_TOOLS = new Set([
  'catalog_search',
  'catalog_get_product',
]);
const KIT_CARD_TOOLS = new Set([
  'kits_list',
  'kits_get',
  'kits_list_curated',
  'kits_get_curated',
]);

/**
 * Content fed back to the model after a tool call.
 * When the UI already renders product/kit cards, send the short cardVisible
 * summary instead of full inventory JSON (avoids duplicate prose/URLs).
 */
export function toolContentForModel(toolName, payload, artifacts = []) {
  if (payload?.error) return JSON.stringify(payload).slice(0, 24_000);
  const hasCards = artifactsIncludeCards(artifacts);
  if (hasCards && PRODUCT_CARD_TOOLS.has(toolName)) {
    if (toolName === 'catalog_search' && payload?.pagination) {
      return catalogSearchSummary(payload);
    }
    if (toolName === 'catalog_get_product') {
      return catalogProductSummary();
    }
  }
  if (hasCards && KIT_CARD_TOOLS.has(toolName)) {
    const heading = toolName.includes('curated') ? 'Curated kits' : 'Workspace kits';
    return kitsText(payload, heading, { cardVisible: true });
  }
  return JSON.stringify(payload ?? null).slice(0, 24_000);
}