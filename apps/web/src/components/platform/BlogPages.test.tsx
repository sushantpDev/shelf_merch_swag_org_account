// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { BlogEditorPage, BlogListPage } from "./BlogPages";
import { deleteBlogDraft, getBlogPost, listBlogPosts, type BlogPost } from "@/services/blog-api";
import { getStoredUser } from "@/services/api-bridge";

const editor = vi.hoisted(() => ({ commands: { setContent: vi.fn() }, setEditable: vi.fn() }));
vi.mock("@tiptap/react", () => ({ useEditor: () => editor, EditorContent: () => <div /> }));
vi.mock("@/services/api-bridge", () => ({ getStoredUser: vi.fn() }));
vi.mock("@/services/blog-api", () => ({
  deleteBlogDraft: vi.fn(), getBlogPost: vi.fn(), listBlogPosts: vi.fn(),
  createBlogPost: vi.fn(), publishBlogPost: vi.fn(), unpublishBlogPost: vi.fn(),
  updateBlogPost: vi.fn(), uploadBlogImage: vi.fn(),
}));

const post: BlogPost = {
  _id: "article1", title: "Welcome kit guide", slug: "welcome-kit-guide", status: "draft",
  publishedAt: null, updatedAt: "2026-11-04T00:00:00.000Z", excerpt: "Plan a kit.",
  content: { type: "doc", content: [] }, authorName: "ShelfMerch", coverImageUrl: "",
  coverImageAlt: "", seoTitle: "", seoDescription: "",
};
const listing = (items = [post], page = 1, total = items.length) => ({ items, page, total, limit: 25 });
const mountList = () => render(<MemoryRouter><BlogListPage /></MemoryRouter>);
const mountEditor = () => render(
  <MemoryRouter initialEntries={["/platform/blog/article1"]}>
    <Routes>
      <Route path="/platform/blog/:id" element={<BlogEditorPage />} />
      <Route path="/platform/blog" element={<p>All articles destination</p>} />
    </Routes>
  </MemoryRouter>,
);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStoredUser).mockReturnValue({ role: "platform_super_admin" } as ReturnType<typeof getStoredUser>);
  vi.mocked(listBlogPosts).mockResolvedValue(listing());
  vi.mocked(getBlogPost).mockResolvedValue(post);
  vi.mocked(deleteBlogDraft).mockResolvedValue({ deleted: true, id: post._id });
  Object.defineProperty(window, "confirm", { configurable: true, writable: true, value: vi.fn(() => true) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("blog draft deletion", () => {
  it("cancels without deleting, then removes a confirmed draft and updates the count", async () => {
    vi.mocked(listBlogPosts).mockResolvedValueOnce(listing()).mockResolvedValue(listing([]));
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValue(true);
    mountList();
    const button = await screen.findByRole("button", { name: "Delete draft" });
    fireEvent.click(button);
    expect(deleteBlogDraft).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(deleteBlogDraft).toHaveBeenCalledWith("article1"));
    expect(await screen.findByText("No articles yet. Create a draft to get started.")).toBeTruthy();
    expect(screen.getByText(/0 articles/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Draft deleted.");
  });

  it("keeps the draft visible and shows an API deletion error", async () => {
    vi.mocked(deleteBlogDraft).mockRejectedValueOnce(new Error("Research is in progress."));
    mountList();
    fireEvent.click(await screen.findByRole("button", { name: "Delete draft" }));
    expect(await screen.findByText("Research is in progress.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Welcome kit guide" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Delete draft" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("returns to the previous page after deleting the last item on a later page", async () => {
    vi.mocked(listBlogPosts).mockResolvedValueOnce(listing([post], 1, 26))
      .mockResolvedValueOnce(listing([post], 2, 26)).mockResolvedValue(listing([], 1, 25));
    mountList();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await screen.findByText(/Page 2/);
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    await screen.findByText(/Page 1/);
    expect(vi.mocked(listBlogPosts).mock.calls.map(([page]) => page)).toEqual([1, 2, 1]);
  });

  it.each(["published", "readonly"])("hides deletion for %s in the list and editor", async (mode) => {
    if (mode === "readonly") vi.mocked(getStoredUser).mockReturnValue({ role: "platform_readonly_auditor" } as ReturnType<typeof getStoredUser>);
    const article: BlogPost = mode === "published" ? { ...post, status: "published", publishedAt: post.updatedAt } : post;
    vi.mocked(listBlogPosts).mockResolvedValue(listing([article]));
    vi.mocked(getBlogPost).mockResolvedValue(article);
    mountList();
    await screen.findByRole("link", { name: "Welcome kit guide" });
    expect(screen.queryByRole("button", { name: "Delete draft" })).toBeNull();
    cleanup();
    mountEditor();
    await screen.findByText("Edit article");
    expect(screen.queryByRole("button", { name: "Delete draft" })).toBeNull();
  });

  it("deletes from the editor and navigates to the article list", async () => {
    mountEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Delete draft" }));
    expect(await screen.findByText("All articles destination")).toBeTruthy();
    expect(deleteBlogDraft).toHaveBeenCalledWith("article1");
  });

  it("keeps the editor open when deletion fails", async () => {
    vi.mocked(deleteBlogDraft).mockRejectedValueOnce(new Error("Unpublish this article before deleting it."));
    mountEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Delete draft" }));
    expect(await screen.findByText("Unpublish this article before deleting it.")).toBeTruthy();
    expect(screen.queryByText("All articles destination")).toBeNull();
  });
});
