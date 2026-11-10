import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShopBanner } from "@/features/shops/banner";
import { PreDesignedKits } from "@/features/kits/PreDesignedKits";
import type { SendGiftVm } from "../controllers/useCampaignsController";

type SendChoice = "kit" | "points";

const titleStyle = { fontSize: 20, fontFamily: "var(--font-family-primary)" } as const;
const descStyle = { fontSize: 14, margin: "8px 0 0" } as const;
const actionRowStyle = { gap: 10, marginTop: 24 } as const;
const actionBtnStyle = { flex: 1, justifyContent: "center" } as const;

/** "Send Gift" chooser: pick points or a kit, then shop / kit to send. */
export function SendGiftDialogView({
  open,
  view,
  availableKits,
  availableShops,
  onOpenChange,
  onPickKitView,
  onStartSendPoints,
  onSelectShopForPoints,
  onBackToChoose,
  onSelectKit,
  onCreateKit,
  onCreateShop,
  canCreateKit,
  canCreateShop,
}: SendGiftVm) {
  const modalWidth = view === "choose" ? 440 : 560;
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [sendChoice, setSendChoice] = useState<SendChoice | null>(null);

  useEffect(() => {
    if (view !== "points") setSelectedShopId(null);
  }, [view]);

  useEffect(() => {
    if (!open || view !== "choose") setSendChoice(null);
  }, [open, view]);

  const selectedShop = availableShops.find((shop) => shop.id === selectedShopId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`sm-modal send-gift-modal${view === "choose" ? " send-gift-modal--choose" : view === "kit" ? " send-gift-modal--kit" : ""}`}
        style={{ maxWidth: modalWidth }}
      >
        {view === "choose" ? (
            <div className="send-gift-choose">
              <div className="send-gift-choose__body">
                <DialogHeader>
                  <DialogTitle className="send-gift-choose__title">
                    What would you like to send?
                  </DialogTitle>
                  <DialogDescription className="send-gift-choose__desc">
                    Select one option to continue. Recipients and branding come next.
                  </DialogDescription>
                </DialogHeader>
                <div className="send-gift-choices" role="radiogroup" aria-label="Send type">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={sendChoice === "kit"}
                    className={`send-gift-choice${sendChoice === "kit" ? " is-on" : ""}`}
                    onClick={() => setSendChoice("kit")}
                  >
                    <span className="send-gift-choice__copy">
                      <span className="send-gift-choice__title">Send a kit</span>
                      <span className="send-gift-choice__sub">
                        Ship a merch kit to selected people
                      </span>
                    </span>
                    <span className="send-gift-choice__radio" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={sendChoice === "points"}
                    className={`send-gift-choice${sendChoice === "points" ? " is-on" : ""}`}
                    onClick={() => setSendChoice("points")}
                  >
                    <span className="send-gift-choice__copy">
                      <span className="send-gift-choice__title">Send points</span>
                      <span className="send-gift-choice__sub">
                        Give shop credit they can redeem
                      </span>
                    </span>
                    <span className="send-gift-choice__radio" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="send-gift-choose__footer">
                <button
                  type="button"
                  className="send-gift-choose__btn send-gift-choose__btn--ghost"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="send-gift-choose__btn send-gift-choose__btn--primary"
                  disabled={!sendChoice}
                  onClick={() => {
                    if (sendChoice === "kit") onPickKitView();
                    if (sendChoice === "points") onStartSendPoints();
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
          <div className="modal-pad">
          {view === "points" ? (
            <>
              <DialogHeader>
                <DialogTitle style={titleStyle}>Choose a shop</DialogTitle>
                <DialogDescription className="muted" style={descStyle}>
                  Recipients redeem points from the shop you select. Pick the storefront they should
                  browse and order from.
                </DialogDescription>
              </DialogHeader>

              {availableShops.length > 0 ? (
                <div className="send-gift-shop-list" style={{ marginTop: 20 }}>
                  {availableShops.map((shop) => {
                    const isSelected = shop.id === selectedShopId;
                    return (
                      <button
                        key={shop.id}
                        type="button"
                        className={`send-gift-shop-card${isSelected ? " is-selected" : ""}`}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedShopId(shop.id)}
                      >
                        <div className="send-gift-shop-thumb" aria-hidden="true">
                          <ShopBanner
                            source={shop}
                            height={72}
                            layout="center"
                            logoSize={32}
                            radius={10}
                          />
                        </div>
                        <div className="send-gift-kit-meta">
                          <div className="send-gift-shop-title-row">
                            <span className="send-gift-kit-name">{shop.name}</span>
                            <span
                              className={`send-gift-status ${shop.live ? "is-live" : "is-draft"}`}
                            >
                              {shop.live ? "Live" : "Draft"}
                            </span>
                          </div>
                          <div className="send-gift-kit-sub">
                            <span className="send-gift-currency-tag">{shop.currency}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="send-gift-kit-empty" style={{ marginTop: 20 }}>
                  <h3>No shops yet</h3>
                  <p>Create a shop before sending points to your recipients.</p>
                </div>
              )}

              <div className="row" style={actionRowStyle}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={actionBtnStyle}
                  onClick={() => {
                    setSelectedShopId(null);
                    onBackToChoose();
                  }}
                >
                  Back
                </button>
                {availableShops.length === 0 && canCreateShop ? (
                  <button
                    type="button"
                    className="btn btn-brand"
                    style={actionBtnStyle}
                    onClick={onCreateShop}
                  >
                    Create a shop
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-brand"
                    style={actionBtnStyle}
                    disabled={!selectedShop}
                    onClick={() => selectedShop && onSelectShopForPoints(selectedShop.id)}
                  >
                    {selectedShop ? `Select ${selectedShop.name}` : "Select shop"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle style={titleStyle}>Choose a kit to send</DialogTitle>
                <DialogDescription className="muted" style={descStyle}>
                  Select a customized or curated kit to send, or create a new kit.
                </DialogDescription>
              </DialogHeader>

              <Tabs
                defaultValue={availableKits.length > 0 ? "customized" : "curated"}
                style={{ marginTop: 20 }}
              >
                <TabsList className="grid w-full grid-cols-2" aria-label="Kit type">
                  <TabsTrigger value="customized">Customized</TabsTrigger>
                  <TabsTrigger value="curated">Curated</TabsTrigger>
                </TabsList>
                <TabsContent value="customized">
                  {availableKits.length > 0 ? (
                    <div className="send-gift-kit-list">
                      {availableKits.map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          className="send-gift-kit-card"
                          onClick={() => onSelectKit(k.id)}
                        >
                          <div className="send-gift-kit-meta">
                            <div className="send-gift-kit-name">{k.name}</div>
                            <div className="send-gift-kit-sub">
                              {k.items} item{k.items === 1 ? "" : "s"} · {k.status}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="muted" style={descStyle}>
                      No customized kits yet.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="curated" className="send-gift-curated-kits">
                  <PreDesignedKits onBeforeSend={() => onOpenChange(false)} />
                </TabsContent>
              </Tabs>

              <div className="row" style={actionRowStyle}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={actionBtnStyle}
                  onClick={onBackToChoose}
                >
                  Back
                </button>
                {canCreateKit ? (
                  <button
                    type="button"
                    className="btn btn-brand"
                    style={actionBtnStyle}
                    onClick={onCreateKit}
                  >
                    <Plus size={15} /> Create kit
                  </button>
                ) : (
                  <button type="button" className="btn btn-brand" style={actionBtnStyle} disabled>
                    Select kit
                  </button>
                )}
              </div>
            </>
          )}
          </div>
          )}
      </DialogContent>
    </Dialog>
  );
}
