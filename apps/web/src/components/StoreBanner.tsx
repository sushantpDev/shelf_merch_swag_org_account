import { shopBannerPresetLabel, shopHeroBannerUrl } from "@/lib/shop-banners";

export type StoreShop = {
  name: string;
  logoUrl?: string;
  bannerTheme?: string;
  bannerPreset?: string;
  bannerImageUrl?: string;
  featuredCatalogProductIds?: string[];
  featuredListingKeys?: string[];
  activeListingKeys?: string[];
};

// Banner theme presets shared with the tenant shop builder.
// branding the admin picked in the shop builder.
export const BANNER_THEMES: Record<string, { bg: string; text: string }> = {
  light: { bg: "#FBFCFB", text: "#0E1E16" },
  brand: { bg: "linear-gradient(135deg, var(--brand), var(--brand-d))", text: "#fff" },
  dark: { bg: "#0E1E16", text: "#fff" },
  blue: { bg: "linear-gradient(135deg,#2563C9,#1e40af)", text: "#fff" },
  purple: { bg: "linear-gradient(135deg,#7a3fb0,#5b21b6)", text: "#fff" },
};

export function StoreBanner({ shop, eyebrow = "Welcome to" }: { shop: StoreShop; eyebrow?: string }) {
  const bannerUrl = shopHeroBannerUrl(shop);
  if (bannerUrl) {
    return (
      <div
        style={{
          position: "relative",
          borderRadius: 14,
          marginBottom: 20,
          overflow: "hidden",
          border: "1px solid var(--line)",
        }}
      >
        <img
          src={bannerUrl}
          alt={
            shop.bannerImageUrl
              ? `${shop.name} banner`
              : shopBannerPresetLabel(shop.bannerPreset) || `${shop.name} banner`
          }
          style={{ display: "block", width: "100%", height: "auto", aspectRatio: "4 / 1", objectFit: "cover" }}
        />
        {shop.logoUrl ? (
          <div
            style={{
              position: "absolute",
              left: 16,
              bottom: 16,
              width: 48,
              height: 48,
              background: "#fff",
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
              padding: 4,
              boxShadow: "0 2px 8px rgba(0,0,0,.18)",
            }}
          >
            <img
              src={shop.logoUrl}
              alt={shop.name}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  const theme = BANNER_THEMES[shop.bannerTheme || "light"] || BANNER_THEMES.light;
  const isLight = !shop.bannerTheme || shop.bannerTheme === "light";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "20px 24px",
        borderRadius: 14,
        marginBottom: 20,
        background: theme.bg,
        color: theme.text,
        border: isLight ? "1px solid var(--line)" : "none",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          flex: "none",
          background: "#fff",
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          padding: 6,
          boxShadow: "0 2px 8px rgba(0,0,0,.12)",
        }}
      >
        {shop.logoUrl ? (
          <img
            src={shop.logoUrl}
            alt={shop.name}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontWeight: "var(--font-weight-bold)", color: "var(--brand)", fontSize: 20 }}>
            {shop.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 12, opacity: 0.8, textTransform: "uppercase", letterSpacing: ".06em" }}>
          {eyebrow}
        </div>
        <div style={{ fontSize: 22, fontWeight: "var(--font-weight-bold)" }}>{shop.name}</div>
      </div>
    </div>
  );
}
