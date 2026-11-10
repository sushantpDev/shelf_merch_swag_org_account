import { Plus, Shirt, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { CollectionInlineCard } from "@/features/swag/CollectionInlineCard";
import type { UiCollection, UiProduct, UiShop } from "@/services/mappers";
import { useUnpublishCollectionFromShop } from "../model";
import { shopDesignPath } from "../paths";
import { collectionPublishedAt } from "../shopListings";

export function BrandedSwagTab({
  shop,
  collections,
  canDesignSwag,
  onStartDesigning,
}: {
  shop: UiShop;
  collections: UiCollection[];
  canDesignSwag: boolean;
  onStartDesigning: () => void;
}) {
  const navigate = useNavigate();
  const unpublish = useUnpublishCollectionFromShop();
  const published = collections.filter((c) => c.status !== "archived");

  return (
    <div className="shop-swag-content">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: "var(--workspace-font-heading, 17px)", marginBottom: 4 }}>Published collections</h3>
          <p className="muted" style={{ fontSize: "var(--workspace-font-caption, 13px)" }}>
            Collections published to <b>{shop.name}</b>. Manage visibility per product in Shop Catalog.
          </p>
        </div>
        {canDesignSwag ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onStartDesigning}>
            <Plus size={15} /> Start designing
          </button>
        ) : null}
      </div>

      {published.length === 0 ? (
        <div className="card empty" style={{ padding: 48 }}>
          <div className="ic" aria-hidden="true">
            <Shirt size={34} color="var(--gray-300)" />
          </div>
          <h3>No collections published yet</h3>
          <p>
            {canDesignSwag
              ? "Design a collection in Swag, then publish it to this shop."
              : "Your company admin publishes branded collections to this shop."}
          </p>
          {canDesignSwag ? (
            <button type="button" className="btn btn-dark btn-lg" style={{ marginTop: 14 }} onClick={onStartDesigning}>
              <Plus size={16} /> Start designing
            </button>
          ) : null}
        </div>
      ) : (
        <div className="swag-col-list">
          {published.map((col) => (
            <ShopCollectionCard
              key={col.id}
              shop={shop}
              collection={col}
              busy={unpublish.isPending}
              onProductClick={(_product, pIdx) =>
                navigate(shopDesignPath(shop.id, col.id, pIdx))
              }
              onRemove={async () => {
                try {
                  await unpublish.mutateAsync({ collectionId: col.id, shopId: shop.id });
                  toast.success("Collection removed");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not remove collection");
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShopCollectionCard({
  shop,
  collection,
  busy,
  onRemove,
  onProductClick,
}: {
  shop: UiShop;
  collection: UiCollection;
  busy: boolean;
  onRemove: () => void;
  onProductClick: (product: UiProduct, pIdx: number) => void;
}) {
  const publishedAt = collectionPublishedAt(collection, shop.id);
  const publishedLabel = publishedAt
    ? new Date(publishedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : collection.created;

  return (
    <CollectionInlineCard
      collection={collection}
      onProductClick={onProductClick}
      actions={
        <>
          <span className="tag tag-live">
            <span className="dot" />
            Published
          </span>
          {publishedLabel ? <span className="mut3 shop-collection-date">{publishedLabel}</span> : null}
          <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" disabled={busy} onClick={onRemove}>
            <Trash2 size={14} /> Remove from shop
          </button>
        </>
      }
    />
  );
}
