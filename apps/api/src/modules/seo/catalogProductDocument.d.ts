export function catalogProductMeta(
  product: {
    id: string;
    name?: string;
    description?: string;
    brand?: string;
    category?: string;
    image?: string;
    offer?: { price?: unknown; priceCurrency?: string; availability?: string };
    review?: { reviewBody?: string; author?: string };
    aggregateRating?: { ratingValue?: unknown; reviewCount?: unknown };
  },
  origin: string,
): {
  title: string;
  description: string;
  canonical: string;
  image: string | null;
  jsonLd: Record<string, unknown> | null;
};
