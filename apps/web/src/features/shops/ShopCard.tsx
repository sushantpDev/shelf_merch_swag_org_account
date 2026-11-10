import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Copy, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { UiShop } from "@/services/mappers";
import { shopPublicLinkLabel, shopRedeemHref, slugifyShopName } from "@/lib/shopRedeemUrl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShopBanner } from "./banner";
import { useArchiveShop, useDuplicateShop } from "./model";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { shopCardMeta } from "./types";

export function ShopCard({ shop, fallbackUser }: { shop: UiShop; fallbackUser: string }) {
  const navigate = useNavigate();
  const { canWrite } = useTenantAccess();
  const canEditShop = canWrite("shops");
  const duplicate = useDuplicateShop();
  const archive = useArchiveShop();
  const [confirmArchive, setConfirmArchive] = useState(false);

  async function onDuplicate() {
    try {
      const copy = await duplicate.mutateAsync(shop);
      toast.success(`Duplicated as “${copy.name}”`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not duplicate shop");
    }
  }

  async function onArchive() {
    try {
      await archive.mutateAsync(shop.id);
      toast.success(`“${shop.name}” archived`);
      setConfirmArchive(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive shop");
    }
  }

  const slug = shop.slug || slugifyShopName(shop.name);
  const redeemLabel = shopPublicLinkLabel(slug);

  async function copyRedeemLink() {
    try {
      await navigator.clipboard.writeText(shopRedeemHref(slug));
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <>
      <div className="card shop-card">
        <div className="shop-card-banner-wrap">
          <Link
            to={`/app/shops/${shop.id}`}
            aria-label={`Open ${shop.name}`}
            style={{ display: "block", color: "inherit", textDecoration: "none" }}
          >
            <ShopBanner source={shop} aspect="3 / 1" layout="center" logoSize={48} />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="shopbanner-menu"
                aria-label="Shop actions"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenuTrigger>
            {canEditShop ? (
              <DropdownMenuContent align="end" side="bottom" className="shop-card-menu">
                <DropdownMenuItem onSelect={() => navigate(`/app/shops/${shop.id}?tab=layout`)}>
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/app/contacts")}>
                  Add Users
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onDuplicate} disabled={duplicate.isPending}>
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="shop-card-menu-item--danger"
                  onSelect={() => setConfirmArchive(true)}
                >
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            ) : null}
          </DropdownMenu>
        </div>
        <div className="shop-card-body">
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}
          >
            <h3>{shop.name}</h3>
            {shop.live ? (
              <span className="tag tag-live tag-live-outline">
                <span className="dot" />
                Live
              </span>
            ) : (
              <span className="tag tag-draft">Draft</span>
            )}
          </div>
          <div className="shop-card-meta">{shopCardMeta(shop, fallbackUser)}</div>
          {shop.live ? (
            <button
              type="button"
              className="shop-card-redeem-link"
              onClick={() => void copyRedeemLink()}
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--brand-d)",
                fontSize: "var(--workspace-font-body, 13px)",
                fontWeight: "var(--font-weight-semibold)",
              }}
            >
              <Copy size={14} aria-hidden />
              {redeemLabel}
            </button>
          ) : null}
          <div style={{ marginTop: 14, textAlign: "right" }}>
            <Link to={`/app/shops/${shop.id}`} className="btn btn-soft btn-sm">
              Open
            </Link>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{shop.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This shop will be removed from your list. You can restore it later from support if
              needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onArchive}
              disabled={archive.isPending}
              style={{ background: "var(--danger)" }}
            >
              {archive.isPending ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
