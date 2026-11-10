import mongoose from 'mongoose';

const blogPostSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    excerpt: { type: String, default: '', trim: true },
    content: { type: mongoose.Schema.Types.Mixed, default: { type: 'doc', content: [] } },
    authorName: { type: String, default: 'ShelfMerch', trim: true },
    coverImageUrl: { type: String, default: '' },
    coverImageAlt: { type: String, default: '' },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    publishedAt: { type: Date, default: null },
    // Managed by the SEO growth pipeline; publish requires matching approval when set.
    seoManaged: { type: Boolean, default: false },
    seoApprovedHash: { type: String, default: '' },
  },
  { timestamps: true },
);

blogPostSchema.index({ status: 1, publishedAt: -1 });

export const BlogPost = mongoose.model('BlogPost', blogPostSchema);
