import { applySpaSeo } from './resolvePublicSeo.js';

/** Public catalog product HTML. No prices, inventory, supplier, or tenant fields. */

function collapse(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function plainText(value) {
  return collapse(String(value ?? '').replace(/<[^>]*>/g, ' '));
}

export function isCatalogProductId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || ''));
}

function absoluteImage(origin, image) {
  const src = String(image || '').trim();
  if (!src || src.startsWith('//') || /^javascript:/i.test(src)) return '';
  if (src.startsWith('/')) return `${origin}${src}`;
  if (/^https?:\/\//i.test(src)) return src;
  return '';
}

/** A public offer only. Missing currency or price is not filled in. */
function publicOffer(offer) {
  if (!offer || typeof offer !== 'object') return null;
  const priceCurrency = String(offer.priceCurrency || '').trim();
  const price = Number(offer.price);
  if (!/^[A-Z]{3}$/.test(priceCurrency) || !Number.isFinite(price) || price <= 0) return null;
  const result = { '@type': 'Offer', priceCurrency, price };
  const availability = String(offer.availability || '').trim();
  if (/^https:\/\/schema\.org\//.test(availability)) result.availability = availability;
  return result;
}

function publicReview(review) {
  if (!review || typeof review !== 'object') return null;
  const reviewBody = plainText(review.reviewBody);
  const author = plainText(review.author);
  if (!reviewBody || !author) return null;
  return { '@type': 'Review', reviewBody, author: { '@type': 'Person', name: author } };
}

function publicAggregateRating(rating) {
  if (!rating || typeof rating !== 'object') return null;
  const ratingValue = Number(rating.ratingValue);
  const reviewCount = Number(rating.reviewCount);
  if (!Number.isFinite(ratingValue) || !Number.isInteger(reviewCount) || reviewCount < 1) return null;
  return { '@type': 'AggregateRating', ratingValue, reviewCount };
}

export function catalogProductNotFoundHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Product not found | ShelfMerch</title><meta name="robots" content="noindex, follow" /></head><body><h1>Product not found</h1></body></html>`;
}

export function catalogProductMeta(product, origin) {
  const name = collapse(product.name) || 'ShelfMerch product';
  const description = plainText(product.description) || `${name} in the ShelfMerch catalog.`;
  const canonical = `${origin}/apps/catalog/${product.id}`;
  const image = absoluteImage(origin, product.image);
  const offer = publicOffer(product.offer);
  const review = publicReview(product.review);
  const aggregateRating = publicAggregateRating(product.aggregateRating);
  const jsonLd = offer || review || aggregateRating
    ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name,
        description,
        url: canonical,
        ...(plainText(product.brand) ? { brand: { '@type': 'Brand', name: plainText(product.brand) } } : {}),
        ...(plainText(product.category) ? { category: plainText(product.category) } : {}),
        ...(image ? { image } : {}),
        ...(offer ? { offers: offer } : {}),
        ...(review ? { review } : {}),
        ...(aggregateRating ? { aggregateRating } : {}),
      }
    : null;
  return {
    title: `${name} | ShelfMerch`,
    description,
    canonical,
    image: image || null,
    jsonLd,
  };
}

export function applyCatalogProductSeo(html, product, origin) {
  const meta = catalogProductMeta(product, origin);
  return applySpaSeo(html, {
    mode: 'public',
    title: meta.title,
    description: meta.description,
    robots: 'index, follow',
    canonical: meta.canonical,
    image: meta.image,
    ogType: 'website',
    jsonLd: meta.jsonLd,
  });
}
