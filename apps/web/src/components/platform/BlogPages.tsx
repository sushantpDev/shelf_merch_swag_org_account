import { useEffect, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { getStoredUser } from "@/services/api-bridge";
import { canAccessArea } from "@/services/platform-access";
import {
  createBlogPost, getBlogPost, listBlogPosts, publishBlogPost, unpublishBlogPost,
  updateBlogPost, uploadBlogImage, type BlogDocument, type BlogPost, type BlogPostInput,
} from "@/services/blog-api";
import { PlatformError, PlatformLoading, PlatformPageHeader } from "./platform-ui";
import "./blog-admin.css";

const EMPTY: BlogPostInput = { slug: "", title: "", excerpt: "", content: { type: "doc", content: [] },
  authorName: "ShelfMerch", coverImageUrl: "", coverImageAlt: "", seoTitle: "", seoDescription: "" };
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";
const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);

export function BlogListPage() {
  const canWrite = canAccessArea(getStoredUser()?.role, "blog", "write");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof listBlogPosts>> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    listBlogPosts(page).then((value) => { if (alive) setData(value); })
      .catch((err) => { if (alive) setError(message(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page]);
  return <div className="blog-admin">
    <PlatformPageHeader title="Blog" subtitle="Write and publish articles for the ShelfMerch website."
      actions={canWrite ? <Link className="btn btn-brand btn-sm" to="/platform/blog/new">+ New article</Link> : null} />
    {loading && <PlatformLoading />}{error && <PlatformError message={error} />}
    {!loading && data && <><div className="blog-admin-list">
      {data.items.length === 0 ? <p className="blog-admin-empty">No articles yet. Create a draft to get started.</p> :
        data.items.map((post) => <article className="blog-admin-list-row" key={post._id}>
          <div><span className={`blog-admin-status ${post.status}`}>{post.status}</span>
            <h2><Link to={`/platform/blog/${post._id}`}>{post.title}</Link></h2>
            <p>/blog/{post.slug} · Updated {new Date(post.updatedAt).toLocaleDateString()}</p></div>
          <div className="blog-admin-row-actions"><Link className="btn btn-ghost btn-sm" to={`/platform/blog/${post._id}`}>{canWrite ? "Edit" : "View"}</Link>
            {post.status === "published" && <a className="btn btn-ghost btn-sm" href={`/blog/${post.slug}`} target="_blank" rel="noreferrer">Open article</a>}</div>
        </article>)}
    </div><div className="blog-admin-pager"><button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page} · {data.total} articles</span>
      <button className="btn btn-ghost btn-sm" disabled={page * data.limit >= data.total} onClick={() => setPage(page + 1)}>Next</button></div></>}
  </div>;
}

export function BlogEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canWrite = canAccessArea(getStoredUser()?.role, "blog", "write");
  const [fields, setFields] = useState<BlogPostInput>(EMPTY);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false,
      underline: false, link: { openOnClick: false, autolink: false } }), Image.configure({ allowBase64: false })],
    content: "", immediatelyRender: false,
  });

  useEffect(() => { editor?.setEditable(canWrite && !preview); }, [editor, canWrite, preview]);
  useEffect(() => {
    if (!id || !editor) return;
    let alive = true;
    setLoading(true);
    getBlogPost(id).then((value) => {
      if (!alive) return;
      setPost(value);
      setSlugEdited(true);
      setFields({ slug: value.slug, title: value.title, excerpt: value.excerpt, content: value.content,
        authorName: value.authorName, coverImageUrl: value.coverImageUrl, coverImageAlt: value.coverImageAlt,
        seoTitle: value.seoTitle, seoDescription: value.seoDescription });
      editor.commands.setContent(value.content as Parameters<typeof editor.commands.setContent>[0]);
    }).catch((err) => { if (alive) setError(message(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, editor]);

  function change(field: keyof BlogPostInput, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }
  async function save(publish = false) {
    if (!editor || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const input = { ...fields, content: editor.getJSON() as BlogDocument };
      const saved = id ? await updateBlogPost(id, input) : await createBlogPost(input);
      const result = publish ? await publishBlogPost(saved._id) : saved;
      setPost(result);
      setNotice(publish ? "Article published. The blog sitemap now includes it." : "Changes saved.");
      if (!id) navigate(`/platform/blog/${result._id}`, { replace: true });
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function unpublish() {
    if (!post || busy) return;
    setBusy(true); setError(""); setNotice("");
    try { setPost(await unpublishBlogPost(post._id)); setNotice("Article unpublished and removed from the blog sitemap."); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function upload(file: File, placement: "cover" | "inline") {
    if (!editor || busy) return;
    const alt = window.prompt("Describe this image for readers and search engines:");
    if (!alt?.trim()) return;
    setUploading(true); setError("");
    try {
      const { url } = await uploadBlogImage(file);
      if (placement === "cover") setFields((current) => ({ ...current, coverImageUrl: url, coverImageAlt: alt.trim() }));
      else editor.chain().focus().setImage({ src: url, alt: alt.trim() }).run();
    } catch (err) { setError(message(err)); }
    finally { setUploading(false); }
  }
  function chooseImage(event: ChangeEvent<HTMLInputElement>, placement: "cover" | "inline") {
    const file = event.target.files?.[0]; event.target.value = "";
    if (file) void upload(file, placement);
  }
  function addLink() {
    if (!editor) return;
    const href = window.prompt("Link URL (https://, http://, mailto:, or a site path):", editor.getAttributes("link").href || "https://");
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().unsetLink().run();
    else if (/^(https?:\/\/|mailto:|\/(?!\/))/i.test(href.trim())) editor.chain().focus().setLink({ href: href.trim() }).run();
    else setError("Use an http(s), mailto, or site link.");
  }

  return <div className="blog-admin">
    <div className="blog-admin-breadcrumb"><Link to="/platform/blog">← All articles</Link></div>
    <PlatformPageHeader title={post ? "Edit article" : "New article"} subtitle={post ? `Status: ${post.status}` : "Start with a draft, then preview and publish."} />
    {loading && <PlatformLoading />}{error && <PlatformError message={error} />}
    {notice && <p className="blog-admin-notice" role="status">{notice}</p>}
    {!loading && editor && <><div className="blog-admin-actions">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(!preview)}>{preview ? "Back to editing" : "Preview"}</button>
      {canWrite && <><button type="button" className="btn btn-ghost btn-sm" disabled={busy || uploading} onClick={() => void save()}>{busy ? "Saving…" : post?.status === "published" ? "Save changes" : "Save draft"}</button>
        <button type="button" className="btn btn-brand btn-sm" disabled={busy || uploading} onClick={() => void save(true)}>{post?.status === "published" ? "Save and publish" : "Publish"}</button>
        {post?.status === "published" && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void unpublish()}>Unpublish</button>}</>}
      {post?.status === "published" && <a className="btn btn-ghost btn-sm" href={`/blog/${post.slug}`} target="_blank" rel="noreferrer">View live article →</a>}
    </div><div className={`blog-admin-layout${preview ? " blog-admin-layout-preview" : ""}`}>
      <section className="blog-admin-main">
        {preview ? <><span className="blog-admin-eyebrow">ShelfMerch Blog</span><h1>{fields.title || "Untitled article"}</h1><p className="blog-admin-lede">{fields.excerpt}</p>
          {fields.coverImageUrl && <img className="blog-admin-cover" src={fields.coverImageUrl} alt={fields.coverImageAlt} />}</> :
          <><label>Article title<input value={fields.title} disabled={!canWrite} maxLength={180} onChange={(event) => {
            const title = event.target.value;
            setFields((current) => ({ ...current, title, slug: slugEdited ? current.slug : slugify(title) }));
          }} placeholder="A clear, useful headline" /></label>
          <label>Short summary<textarea value={fields.excerpt} disabled={!canWrite} maxLength={400} rows={3} onChange={(event) => change("excerpt", event.target.value)} placeholder="What will readers learn?" /></label></>}
        <div className="blog-admin-editor-shell">
          {!preview && canWrite && <div className="blog-admin-toolbar" aria-label="Article formatting">
            <button type="button" onClick={() => editor.chain().focus().setParagraph().run()}>Paragraph</button>
            <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
            <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
            <button type="button" aria-label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
            <button type="button" aria-label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
            <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}>Bullets</button>
            <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}>Numbers</button>
            <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}>Quote</button>
            <button type="button" onClick={addLink}>Link</button>
            <label className="blog-admin-upload-button">Image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={(event) => chooseImage(event, "inline")} /></label>
          </div>}
          <EditorContent editor={editor} className="blog-admin-richtext" />
        </div>
      </section>
      {!preview && <aside className="blog-admin-side">
        <div className="blog-admin-panel"><h2>Publishing</h2>
          <label>URL slug<input value={fields.slug} disabled={!canWrite || Boolean(post?.publishedAt)} maxLength={100} onChange={(event) => { setSlugEdited(true); change("slug", slugify(event.target.value)); }} /></label>
          <small>{post?.publishedAt ? "The URL is fixed after first publication." : `shelfmerch.io/blog/${fields.slug || "your-article"}`}</small>
          <label>Author name<input value={fields.authorName} disabled={!canWrite} maxLength={100} onChange={(event) => change("authorName", event.target.value)} /></label>
        </div>
        <div className="blog-admin-panel"><h2>Cover image</h2>
          {fields.coverImageUrl && <img className="blog-admin-cover-thumb" src={fields.coverImageUrl} alt={fields.coverImageAlt} />}
          {canWrite && <><label className="blog-admin-upload-button">{uploading ? "Uploading…" : "Upload image"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={(event) => chooseImage(event, "cover")} /></label>
            {fields.coverImageUrl && <button type="button" className="blog-admin-text-button" onClick={() => setFields((current) => ({ ...current, coverImageUrl: "", coverImageAlt: "" }))}>Remove cover</button>}</>}
          {fields.coverImageUrl && <label>Image description<input value={fields.coverImageAlt} disabled={!canWrite} maxLength={200} onChange={(event) => change("coverImageAlt", event.target.value)} /></label>}
        </div>
        <div className="blog-admin-panel"><h2>Search preview</h2>
          <div className="blog-admin-search-preview"><strong>{fields.seoTitle || fields.title || "Article title"}</strong><small>shelfmerch.io/blog/{fields.slug || "your-article"}</small><p>{fields.seoDescription || fields.excerpt || "Article summary"}</p></div>
          <label>SEO title<input value={fields.seoTitle} disabled={!canWrite} maxLength={180} onChange={(event) => change("seoTitle", event.target.value)} placeholder="Defaults to article title" /></label>
          <label>SEO description<textarea value={fields.seoDescription} disabled={!canWrite} maxLength={400} rows={3} onChange={(event) => change("seoDescription", event.target.value)} placeholder="Defaults to short summary" /></label>
        </div>
      </aside>}
    </div></>}
  </div>;
}
