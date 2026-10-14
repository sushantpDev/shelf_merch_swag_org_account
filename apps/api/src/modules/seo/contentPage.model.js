import mongoose from 'mongoose';

/**
 * Future indexable collections. Platform marketing content, not tenant data:
 * this model intentionally has no tenantId and does not use the tenant guard.
 * Nothing is published until a record is status "published".
 *
 * kind "compare"  -> /compare/:slug
 * kind "solution" -> /solutions/:slug
 */
const contentPageSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['compare', 'solution'], required: true, index: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    excerpt: { type: String, default: '', trim: true },
    content: { type: mongoose.Schema.Types.Mixed, default: { type: 'doc', content: [] } },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

contentPageSchema.index({ kind: 1, slug: 1 }, { unique: true });
contentPageSchema.index({ kind: 1, status: 1, publishedAt: -1 });

export const ContentPage = mongoose.model('ContentPage', contentPageSchema);

export const CONTENT_COLLECTIONS = {
  compare: {
    kind: 'compare',
    basePath: '/compare',
    sitemapName: 'sitemap-compare.xml',
    hubTitle: 'Compare | ShelfMerch',
    hubDescription: 'Comparisons of ShelfMerch with other ways to run company swag, gifting, and recognition.',
    hubHeading: 'Compare ShelfMerch',
    hubIntro: 'Side-by-side comparisons will be published here.',
    articleEyebrow: 'Comparison',
  },
  solution: {
    kind: 'solution',
    basePath: '/solutions',
    sitemapName: 'sitemap-solutions.xml',
    hubTitle: 'Solutions | ShelfMerch',
    hubDescription: 'ShelfMerch solutions for company stores, onboarding, recognition, and branded merchandise.',
    hubHeading: 'Solutions',
    hubIntro: 'Solution guides will be published here.',
    articleEyebrow: 'Solution',
  },
};
