import { useMemo, useState } from "react";
import {
  submitRedemption,
  type KitRedemptionData,
  type KitRedemptionItem,
} from "@/services/api-bridge";
import { DesignedProductThumb } from "@/features/swag/DesignedProductThumb";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { normalizeVariantImages, variantLabel } from "@/lib/kitVariantImages";
import { productVariantSwatches } from "@/lib/variantColors";
import { mapPlacement, type UiProduct } from "@/services/mappers";
import {
  EMPTY_KIT_REDEEM_ADDRESS,
  KitRedeemAddressForm,
  validateKitRedeemAddress,
} from "@/components/kit-redeem/KitRedeemAddressForm";
import type { ShippingAddress } from "./store/StoreShell";

type Selection = { size?: string; color?: string };

function kitItemAsProduct(item: KitRedemptionItem): UiProduct {
  const photo =
    resolveMediaUrl(item.primaryImageUrl) ||
    resolveMediaUrl(item.imageUrls?.[0]) ||
    "";
  const base = resolveMediaUrl(item.baseImageUrl) || "";
  return {
    id: item.productId,
    g: item.group || "tee",
    brand: item.brand,
    nm: item.name,
    sw: 4,
    photoUrl: photo,
    baseImageUrl: base,
    // Mask PNGs include "YOUR DESIGN HERE" placeholders — use clean base/photo only.
    maskImageUrl: undefined,
    imgUrl: base || photo,
    mockupUrl: item.mockupUrl,
    placement: mapPlacement(item.placement),
    printAreas: item.printAreas,
    imageUrls: item.imageUrls,
  };
}

/** Redeem preview: baked mockup when available, else logo on clean product photo. */
function KitRedeemProductImage({ item }: { item: KitRedemptionItem }) {
  const baked = resolveMediaUrl(item.mockupUrl || "");
  if (baked) {
    return (
      <img
        src={baked}
        alt={item.name}
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    );
  }

  return (
    <DesignedProductThumb
      product={kitItemAsProduct(item)}
      artworkUrl={item.artworkUrl || undefined}
      frontOnly
    />
  );
}

function KitItemCard({
  item,
  selection,
  onChange,
  curatedPlain,
}: {
  item: KitRedemptionItem;
  selection: Selection;
  onChange: (sel: Selection) => void;
  /** Curated kits: show the product photo only — never overlay kit artwork. */
  curatedPlain?: boolean;
}) {
  const colorSwatches = productVariantSwatches({
    colors: item.colors,
    colorHexByName: item.colorHexByName,
  });

  const plainSrc = resolveMediaUrl(
    item.mockupUrl || item.imageUrl || item.primaryImageUrl || item.imageUrls?.[0] || "",
  );

  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        className="img-mockup"
        style={{
          aspectRatio: "1",
          borderRadius: 12,
          background: "#f4f6f4",
          overflow: "hidden",
          marginBottom: 12,
          position: "relative",
        }}
      >
        {curatedPlain ? (
          plainSrc ? (
            <img
              src={plainSrc}
              alt={item.name}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          ) : (
            <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
              <span className="mut3" style={{ fontSize: 12 }}>
                No image
              </span>
            </div>
          )
        ) : (
          <KitRedeemProductImage item={item} />
        )}
      </div>
      {item.brand && (
        <div className="mut3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>
          {item.brand}
        </div>
      )}
      <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: 14, marginBottom: 10 }}>{item.name}</div>

      {!curatedPlain && item.requiresColor && colorSwatches.length > 0 && (
        <div className="field" style={{ marginBottom: 10 }}>
          <label className="lbl">Colour *</label>
          <div className="pd-swatches kit-redeem-swatches">
            {colorSwatches.map((c) => (
              <button
                key={c.name}
                type="button"
                className={`pd-sw${selection.color === c.name ? " on" : ""}`}
                style={{ background: c.hex }}
                onClick={() => onChange({ ...selection, color: c.name })}
                title={c.name}
                aria-label={c.name}
                aria-pressed={selection.color === c.name}
              />
            ))}
          </div>
        </div>
      )}

      {!curatedPlain && item.requiresSize && item.sizes.length > 0 && (
        <div className="field">
          <label className="lbl">Size *</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {item.sizes.map((s) => (
              <button
                key={s}
                type="button"
                className={selection.size === s ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
                onClick={() => onChange({ ...selection, size: s })}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {!curatedPlain &&
      !item.requiresSize &&
      !item.requiresColor &&
      item.sizes.length === 0 &&
      colorSwatches.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          No variants for this product
        </p>
      ) : null}
    </div>
  );
}

const EMPTY_ADDRESS = EMPTY_KIT_REDEEM_ADDRESS;

export default function KitAcceptPortal({
  token,
  sessionToken,
  kitData,
  recipientName,
  campaignName,
  welcome,
  onAccepted,
}: {
  token: string;
  sessionToken: string;
  kitData: KitRedemptionData;
  recipientName: string;
  campaignName: string;
  welcome?: string;
  onAccepted: (orderNumber: string) => void;
}) {
  const [selections, setSelections] = useState<Record<string, Selection>>(() =>
    Object.fromEntries(kitData.items.map((i) => [i.productId, {}])),
  );
  const kitVariants = useMemo(() => {
    if (kitData.kitVariants?.length) {
      return kitData.kitVariants.map((v, i) => ({
        imageUrl: resolveMediaUrl(v.imageUrl) || v.imageUrl,
        label: v.label?.trim() || variantLabel({ imageUrl: v.imageUrl, label: v.label }, i),
      }));
    }
    return normalizeVariantImages(kitData.variantImages).map((v, i) => ({
      imageUrl: resolveMediaUrl(v.imageUrl) || v.imageUrl,
      label: variantLabel(v, i),
    }));
  }, [kitData.kitVariants, kitData.variantImages]);
  const variantImages = kitVariants.map((v) => v.imageUrl);
  const [kitVariantImage, setKitVariantImage] = useState(
    () => (kitData.requiresKitVariant ? variantImages[0] || "" : ""),
  );
  const [address, setAddress] = useState<ShippingAddress>({ ...EMPTY_ADDRESS, name: recipientName });
  const [error, setError] = useState("");
  const [showAddressErrors, setShowAddressErrors] = useState(false);
  const [placing, setPlacing] = useState(false);

  const missingSizes = useMemo(
    () =>
      kitData.items.filter(
        (i) => i.requiresSize && i.sizes.length > 0 && !selections[i.productId]?.size,
      ),
    [kitData.items, selections],
  );
  const missingColors = useMemo(
    () =>
      kitData.items.filter(
        (i) => i.requiresColor && i.colors.length > 0 && !selections[i.productId]?.color,
      ),
    [kitData.items, selections],
  );

  const isCuratedAccept =
    Boolean(kitData.curatedBundle) ||
    kitData.items.every((i) => i.productId.startsWith("curated:"));

  async function acceptOrder() {
    setError("");
    setShowAddressErrors(false);
    if (!isCuratedAccept && missingSizes.length) {
      setError(`Please choose a size for: ${missingSizes.map((i) => i.name).join(", ")}`);
      return;
    }
    if (!isCuratedAccept && missingColors.length) {
      setError(`Please choose a colour for: ${missingColors.map((i) => i.name).join(", ")}`);
      return;
    }
    if (isCuratedAccept && kitData.requiresKitVariant && !kitVariantImage) {
      setError("Please choose a kit variant.");
      return;
    }
    const addressError = validateKitRedeemAddress(address);
    if (addressError) {
      setShowAddressErrors(true);
      return;
    }

    setPlacing(true);
    try {
      const items = isCuratedAccept
        ? []
        : kitData.items.map((i) => {
            const sel = selections[i.productId] || {};
            const variant: { size?: string; color?: string } = {};
            if (sel.size) variant.size = sel.size;
            if (sel.color) variant.color = sel.color;
            return {
              productId: i.productId,
              qty: 1,
              ...(Object.keys(variant).length ? { variant } : {}),
            };
          });
      const result = (await submitRedemption(
        token,
        sessionToken,
        {
          items,
          shippingAddress: address,
          ...(isCuratedAccept && kitVariantImage ? { kitVariantImage } : {}),
        },
        `kit-accept-${token}-${Date.now()}`,
      )) as { orderNumber: string };
      onAccepted(result.orderNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place your order");
    } finally {
      setPlacing(false);
    }
  }

  const kitArt = resolveMediaUrl(kitData.kit.artworkUrl);

  return (
    <div className="store" style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px 80px" }}>
        <div className="eyebrow">Your gift kit</div>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>{kitData.kit.name || campaignName}</h1>
        <p className="muted" style={{ marginBottom: 20, maxWidth: 560 }}>
          {welcome ||
            (isCuratedAccept
              ? `Hi ${recipientName}, confirm your shipping address${
                  kitData.requiresKitVariant ? ", choose a kit variant," : ""
                } to accept your gift kit.`
              : `Hi ${recipientName}, confirm your kit items${kitData.items.some((i) => i.requiresSize) ? ", choose sizes where needed" : ""}, then enter your shipping address to accept.`)}
        </p>

        {kitArt && (
          <div className="card" style={{ padding: "16px 20px", marginBottom: 28, display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                background: "var(--brand-50)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                overflow: "hidden",
                padding: 6,
              }}
            >
              <img src={kitArt} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <div className="mut3" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: "var(--font-weight-bold)" }}>
                Kit artwork
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Branded across all items</div>
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 17, marginBottom: 14 }}>Items in your kit</h2>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 32,
          }}
        >
          {kitData.items.map((item) => (
            <KitItemCard
              key={item.productId}
              item={item}
              selection={selections[item.productId] || {}}
              onChange={(sel) => setSelections((prev) => ({ ...prev, [item.productId]: sel }))}
              curatedPlain={isCuratedAccept}
            />
          ))}
        </div>

        {isCuratedAccept && variantImages.length > 0 && (
          <>
            <h2 style={{ fontSize: 17, marginBottom: 14 }}>Choose a variant</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 12,
                marginBottom: 32,
              }}
            >
              {kitVariants.map((variant) => {
                const selected = kitVariantImage === variant.imageUrl;
                return (
                  <button
                    key={`${variant.imageUrl}-${variant.label}`}
                    type="button"
                    className="card"
                    onClick={() => setKitVariantImage(variant.imageUrl)}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: selected ? "2px solid var(--brand)" : "1px solid var(--line)",
                      background: selected ? "var(--surface-2)" : undefined,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: "1",
                        borderRadius: 8,
                        overflow: "hidden",
                        background: "var(--gray-100)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 8,
                      }}
                    >
                      <img
                        src={variant.imageUrl}
                        alt={variant.label}
                        style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }}
                      />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: "var(--font-weight-bold)" }}>{variant.label}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <KitRedeemAddressForm
          address={address}
          onChange={setAddress}
          heading="Shipping address"
          showFieldErrors={showAddressErrors}
        />

        {error ? (
          <div className="card" style={{ padding: 12, marginBottom: 16, color: "var(--danger)" }}>
            {error}
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn-brand"
          style={{ minWidth: 200 }}
          disabled={placing}
          onClick={acceptOrder}
        >
          {placing ? "Placing order…" : "Accept order"}
        </button>
      </div>
    </div>
  );
}
