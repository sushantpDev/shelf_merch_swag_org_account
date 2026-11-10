import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { PlatformKitTemplate } from "../model";
import type { PreDesignedKitsVm } from "../controllers/usePreDesignedKitsController";
import {
  curatedKitPriceStyle,
  curatedPreviewBtnStyle,
  curatedSampleBtnStyle,
  curatedSendBtnStyle,
} from "../curatedKitCardStyles";
import { inr } from "@/components/platform/platform-ui";
import noKitsYetImg from "../../../../assets/no-kits-yet.png";

function templateImage(kit: PlatformKitTemplate): string {
  if (kit.heroImage) return resolveMediaUrl(kit.heroImage) || noKitsYetImg;
  return resolveMediaUrl(kit.imageUrls?.[0]) || noKitsYetImg;
}

function templateItemLabel(kit: PlatformKitTemplate): string {
  const itemCount =
    (Array.isArray(kit.itemImages) && kit.itemImages.length) || kit.items?.length || 0;
  return itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "Curated bundle";
}

export function PreDesignedKitsView({
  isLoading,
  kits,
  canSendKits,
  onPreview,
  onSend,
  onRequestSample,
  sendPendingId,
  samplePendingId,
}: PreDesignedKitsVm) {
  if (isLoading) {
    return (
      <div
        className="muted"
        style={{
          textAlign: "center",
          padding: "32px 12px",
          fontSize: "var(--workspace-font-caption, 13px)",
        }}
      >
        Loading pre-designed kits…
      </div>
    );
  }
  if (!kits || kits.length === 0) {
    return (
      <div
        className="muted"
        style={{
          textAlign: "center",
          padding: "32px 12px",
          fontSize: "var(--workspace-font-caption, 13px)",
        }}
      >
        No pre-designed kits available yet.
      </div>
    );
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      {kits.map((kit) => {
        const isSending = sendPendingId === kit._id;
        const isRequestingSample = samplePendingId === kit._id;
        return (
          <div
            key={kit._id}
            className="card"
            style={{
              padding: 14,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              border: "1px solid var(--line)",
              borderRadius: "var(--r)",
              background: "#fff",
            }}
          >
            <div
              style={{
                width: "100%",
                aspectRatio: "1",
                background: "transparent",
                borderRadius: "var(--r-sm)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                marginBottom: 10,
              }}
            >
              <img
                src={templateImage(kit)}
                alt={kit.name}
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <div
              style={{
                fontWeight: "var(--font-weight-bold)",
                fontSize: "var(--workspace-font-body, 13.5px)",
                marginBottom: 2,
                color: "var(--ink)",
                textAlign: "center",
              }}
            >
              {kit.name}
            </div>
            <div
              className="muted"
              style={{
                fontSize: "var(--workspace-font-caption, 11.5px)",
                marginBottom: 10,
                textAlign: "center",
              }}
            >
              {templateItemLabel(kit)}
            </div>
            {Math.round(Number(kit.approxValueInr) || 0) > 0 ? (
              <div
                style={{ ...curatedKitPriceStyle, width: "100%", marginBottom: 8 }}
                aria-label={`Price per kit ${inr(Math.round(Number(kit.approxValueInr) || 0))}`}
              >
                {inr(Math.round(Number(kit.approxValueInr) || 0))}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, width: "100%", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onPreview(kit)}
                style={{ ...curatedPreviewBtnStyle, flex: "1 1 30%" }}
              >
                Preview
              </button>
              {canSendKits ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void onRequestSample(kit)}
                  style={{ ...curatedSampleBtnStyle, flex: "1 1 38%" }}
                  disabled={isRequestingSample}
                  aria-busy={isRequestingSample}
                >
                  {isRequestingSample ? "Opening…" : "Request a Sample"}
                </button>
              ) : null}
              {canSendKits ? (
                <button
                  type="button"
                  className="btn btn-brand btn-sm"
                  onClick={() => void onSend(kit)}
                  style={{ ...curatedSendBtnStyle, flex: "1 1 22%" }}
                  disabled={isSending}
                  aria-busy={isSending}
                >
                  {isSending ? "Opening…" : "Send"}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
