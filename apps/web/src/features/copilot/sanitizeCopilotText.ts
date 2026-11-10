import type { CopilotArtifact } from "./api";

const IMAGE_URL_RE =
  /https?:\/\/[^\s)\]>"']+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)\]>"']*)?/gi;
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\([^)]+\)/g;
const MARKDOWN_LINK_RE = /\[[^\]]+\]\((https?:\/\/[^)]+|\/[^)]+)\)/g;
const MARKDOWN_TABLE_LINE_RE = /^\s*\|.*\|\s*$/;
const MARKDOWN_TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const BARE_URL_RE = /https?:\/\/[^\s)\]>"']+/gi;

function hasCardArtifacts(artifacts?: CopilotArtifact[] | null) {
  return Boolean(
    artifacts?.some((row) => row.kind === "product" || row.kind === "kit"),
  );
}

function cardTitles(artifacts?: CopilotArtifact[] | null): string[] {
  if (!artifacts?.length) return [];
  const names: string[] = [];
  for (const row of artifacts) {
    if (row.kind === "product") {
      const name = String(row.product?.name || "").trim();
      if (name) names.push(name);
    }
    if (row.kind === "kit") {
      const name = String(row.kit?.name || "").trim();
      if (name) names.push(name);
    }
  }
  return names;
}

function lineDuplicatesCard(line: string, titles: string[]): boolean {
  const trimmed = line.trim().replace(/^[-*•]\s+/, "").replace(/\*\*/g, "").trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  return titles.some((title) => {
    const t = title.toLowerCase();
    if (lower === t) return true;
    if (lower.startsWith(`${t} —`) || lower.startsWith(`${t} -`) || lower.startsWith(`${t}:`)) return true;
    if (lower === `view ${t}` || lower === `view details` || lower.startsWith("view details")) return true;
    return false;
  });
}

/**
 * When product/kit cards are present, strip duplicated catalog dumps:
 * markdown tables, image markdown, raw image/CDN URLs, and repeated product
 * name / link lines that the cards already show.
 * Keeps short conversational prose for the bubble.
 */
export function sanitizeCopilotAssistantText(
  content: string,
  artifacts?: CopilotArtifact[] | null,
): string {
  if (!content) return "";
  let text = content.replace(/\r\n/g, "\n");
  const titles = cardTitles(artifacts);

  if (hasCardArtifacts(artifacts)) {
    const kept: string[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        kept.push("");
        continue;
      }
      if (MARKDOWN_TABLE_LINE_RE.test(trimmed) || MARKDOWN_TABLE_SEP_RE.test(trimmed)) {
        continue;
      }
      if (IMAGE_URL_RE.test(trimmed) && trimmed.length > 80) {
        IMAGE_URL_RE.lastIndex = 0;
        continue;
      }
      IMAGE_URL_RE.lastIndex = 0;
      if (lineDuplicatesCard(trimmed, titles)) continue;
      // Drop lines that are only a markdown/bare link once cards are present.
      const withoutLinks = trimmed
        .replace(MARKDOWN_LINK_RE, "")
        .replace(BARE_URL_RE, "")
        .replace(/[*_`]/g, "")
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
    text = kept.join("\n");
    text = text.replace(MARKDOWN_IMAGE_RE, "");
    text = text.replace(IMAGE_URL_RE, "");
    text = text.replace(MARKDOWN_LINK_RE, "");
    text = text.replace(/\n{3,}/g, "\n\n").trim();
  } else {
    text = text.replace(MARKDOWN_IMAGE_RE, "");
    text = text.replace(IMAGE_URL_RE, "");
  }

  return text.trim();
}

export function looksLikeRawProductTable(content: string): boolean {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const tableLines = lines.filter((l) => MARKDOWN_TABLE_LINE_RE.test(l));
  return tableLines.length >= 2;
}

export function containsRawImageUrl(content: string): boolean {
  IMAGE_URL_RE.lastIndex = 0;
  MARKDOWN_IMAGE_RE.lastIndex = 0;
  return IMAGE_URL_RE.test(content) || MARKDOWN_IMAGE_RE.test(content);
}