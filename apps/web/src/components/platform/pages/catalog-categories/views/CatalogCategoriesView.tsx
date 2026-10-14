import { Link } from "react-router";
import {
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { PlatformCategory } from "@/services/platform-api";
import type { CatalogCategoriesVm } from "../controllers/useCatalogCategoriesController";

function levelLabel(depth: number): string {
  if (depth <= 0) return "Parent Category";
  if (depth === 1) return "Category";
  return "Sub-Category";
}

function CategoryRow({
  category,
  siblings,
  depth,
  canWrite,
  busy,
  onEdit,
  onArchive,
  onMove,
}: {
  category: PlatformCategory;
  siblings: PlatformCategory[];
  depth: number;
  canWrite: boolean;
  busy: boolean;
  onEdit: (category: PlatformCategory) => void;
  onArchive: (category: PlatformCategory) => void;
  onMove: (category: PlatformCategory, siblings: PlatformCategory[], direction: -1 | 1) => void;
}) {
  const index = siblings.findIndex((row) => row._id === category._id);
  return (
    <div
      className="row"
      style={{
        gap: 10,
        alignItems: "center",
        padding: "8px 0",
        marginLeft: depth * 28,
      }}
    >
      <div style={{ flex: 1 }}>
        <strong>{depth ? "├── " : ""}{category.name}</strong>
        <div className="muted" style={{ fontSize: 12 }}>
          {levelLabel(depth)}
          {category.description ? ` · ${category.description}` : ""}
        </div>
      </div>
      <StatusTag status={category.status} />
      {canWrite ? (
        <>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy || index <= 0} onClick={() => onMove(category, siblings, -1)}>
            Up
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy || index < 0 || index >= siblings.length - 1}
            onClick={() => onMove(category, siblings, 1)}
          >
            Down
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onEdit(category)}>
            Edit
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onArchive(category)}>
            {category.status === "archived" ? "Restore" : "Archive"}
          </button>
        </>
      ) : null}
    </div>
  );
}

function CategoryNodes({
  nodes,
  depth,
  canWrite,
  busy,
  onEdit,
  onArchive,
  onMove,
}: {
  nodes: PlatformCategory[];
  depth: number;
  canWrite: boolean;
  busy: boolean;
  onEdit: (category: PlatformCategory) => void;
  onArchive: (category: PlatformCategory) => void;
  onMove: (category: PlatformCategory, siblings: PlatformCategory[], direction: -1 | 1) => void;
}) {
  return nodes.map((category) => (
    <div key={category._id} style={depth === 0 ? { borderTop: "1px solid var(--line, #e6e6e6)", padding: "4px 0" } : undefined}>
      <CategoryRow
        category={category}
        siblings={nodes}
        depth={depth}
        canWrite={canWrite}
        busy={busy}
        onEdit={onEdit}
        onArchive={onArchive}
        onMove={onMove}
      />
      {category.children?.length ? (
        <CategoryNodes
          nodes={category.children}
          depth={depth + 1}
          canWrite={canWrite}
          busy={busy}
          onEdit={onEdit}
          onArchive={onArchive}
          onMove={onMove}
        />
      ) : null}
    </div>
  ));
}

export function CatalogCategoriesView({
  error,
  loading,
  canWrite,
  tree,
  parentOptions,
  name,
  description,
  parentId,
  editingId,
  formError,
  busy,
  onName,
  onDescription,
  onParentId,
  onEdit,
  onCancel,
  onSubmit,
  onArchive,
  onMove,
}: CatalogCategoriesVm) {
  return (
    <>
      <PlatformPageHeader
        title="Categories"
        subtitle="Parent categories, categories, and sub-categories used by the catalog and product wizard."
        actions={
          <Link to="/platform/catalog" className="btn btn-ghost btn-sm">
            Back to catalog
          </Link>
        }
      />
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {formError && <PlatformError message={formError} />}

      {canWrite ? (
        <form className="card" style={{ padding: 16, marginBottom: 16, maxWidth: 720 }} onSubmit={onSubmit}>
          <h3 style={{ marginTop: 0 }}>{editingId ? "Edit category" : "Add category"}</h3>
          <div className="field">
            <label className="lbl">Name</label>
            <input className="inp" value={name} onChange={(e) => onName(e.target.value)} />
          </div>
          <div className="field">
            <label className="lbl">Parent category</label>
            <select
              className="inp"
              value={parentId}
              onChange={(e) => onParentId(e.target.value)}
            >
              <option value="">None, top-level parent category</option>
              {parentOptions.map(({ category, depth }) => (
                <option key={category._id} value={category._id}>
                  {`${"\u00A0".repeat(depth * 2)}${depth ? "↳ " : ""}${category.name}`}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="lbl">Description</label>
            <input className="inp" value={description} onChange={(e) => onDescription(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-brand btn-sm" disabled={busy || !name.trim()}>
              {editingId ? "Save" : "Add category"}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="card" style={{ padding: 16 }}>
        {tree.length === 0 && !loading ? <p className="muted">No categories yet.</p> : null}
        <CategoryNodes
          nodes={tree}
          depth={0}
          canWrite={canWrite}
          busy={busy}
          onEdit={onEdit}
          onArchive={onArchive}
          onMove={onMove}
        />
      </div>
    </>
  );
}
