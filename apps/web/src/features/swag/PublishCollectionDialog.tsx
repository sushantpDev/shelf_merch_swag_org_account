import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { UiCollection, UiShop } from "@/services/mappers";
import { ShopPickerList } from "./wizard/ShopPickerList";
import { useSyncCollectionPublish } from "./model";
import { acquirePublishLock, releasePublishLock } from "./controllers/publishLock";

export function PublishCollectionDialog({
  collection,
  shops,
  open,
  onOpenChange,
}: {
  collection: UiCollection | null;
  shops: UiShop[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const syncPublish = useSyncCollectionPublish();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const publishingRef = useRef(false);

  useEffect(() => {
    if (open && collection) {
      const available = new Set(shops.map((s) => s.id));
      const linked = collection.shopIds.length
        ? collection.shopIds
        : collection.shopId
          ? [collection.shopId]
          : [];
      setPicked(new Set(linked.filter((id) => available.has(id))));
    }
  }, [open, collection, shops]);

  function toggle(shopId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(shopId)) next.delete(shopId);
      else next.add(shopId);
      return next;
    });
  }

  async function save() {
    if (!collection || !acquirePublishLock(publishingRef)) return;
    const available = new Set(shops.map((s) => s.id));
    const shopIds = [...picked].filter((id) => available.has(id));
    setSaving(true);
    try {
      await syncPublish.mutateAsync({
        collectionId: collection.id,
        shopIds,
      });
      toast.success(
        shopIds.length === 1
          ? "Published to 1 shop 🎉"
          : shopIds.length
            ? `Published to ${shopIds.length} shops 🎉`
            : "Collection unpublished",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish collection");
    } finally {
      releasePublishLock(publishingRef);
      setSaving(false);
    }
  }

  if (!collection) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm-modal sm-publish-dialog"
        style={{ borderRadius: 16, border: "none" }}
      >
        <DialogTitle>Publish collection</DialogTitle>
        <p className="muted" style={{ fontSize: "var(--workspace-font-caption, 13.5px)", marginTop: 4, marginBottom: 16 }}>
          Choose one or more shops where <b>{collection.name}</b> should be available.
        </p>

        {shops.length === 0 ? (
          <p className="muted">Create a shop first, then publish this collection.</p>
        ) : (
          <ShopPickerList shops={shops} picked={picked} onToggle={toggle} />
        )}

        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-brand"
            disabled={saving || syncPublish.isPending || shops.length === 0}
            onClick={save}
          >
            {saving || syncPublish.isPending ? "Publishing…" : "Publish"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
