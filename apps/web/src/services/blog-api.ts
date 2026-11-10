import { apiFetch } from "./api";

export type BlogDocument = { type: "doc"; content: Record<string, unknown>[] };

export type BlogPost = {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: BlogDocument;
  authorName: string;
  coverImageUrl: string;
  coverImageAlt: string;
  seoTitle: string;
  seoDescription: string;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string;
};

export type BlogPostInput = Pick<
  BlogPost,
  "slug" | "title" | "excerpt" | "content" | "authorName" | "coverImageUrl" | "coverImageAlt" | "seoTitle" | "seoDescription"
>;

export function listBlogPosts(page = 1) {
  return apiFetch<{ items: Omit<BlogPost, "content">[]; total: number; page: number; limit: number }>(
    `/platform/blog-posts?page=${page}`,
  );
}

export function getBlogPost(id: string) {
  return apiFetch<BlogPost>(`/platform/blog-posts/${id}`);
}

export function createBlogPost(input: BlogPostInput) {
  return apiFetch<BlogPost>("/platform/blog-posts", { method: "POST", body: JSON.stringify(input) });
}

export function updateBlogPost(id: string, input: BlogPostInput) {
  return apiFetch<BlogPost>(`/platform/blog-posts/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function publishBlogPost(id: string) {
  return apiFetch<BlogPost>(`/platform/blog-posts/${id}/publish`, { method: "POST" });
}

export function unpublishBlogPost(id: string) {
  return apiFetch<BlogPost>(`/platform/blog-posts/${id}/unpublish`, { method: "POST" });
}

export function deleteBlogDraft(id: string) {
  return apiFetch<{ deleted: boolean; id: string }>(`/platform/blog-posts/${id}`, { method: "DELETE" });
}

export function uploadBlogImage(file: File) {
  const form = new FormData();
  form.append("image", file);
  return apiFetch<{ url: string }>("/platform/blog-posts/images", { method: "POST", body: form });
}
