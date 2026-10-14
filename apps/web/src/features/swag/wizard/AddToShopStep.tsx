import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  Home,
  Info,
  Package,
  Search,
  Store,
  Users,
} from "lucide-react";
import { MockupCanvas, buildMockupLayers } from "../MockupCanvas";
import { MockupViewGallery } from "../MockupViewGallery";
import {
  areaPlacementKey,
  designImgUrlForView,
  listPrintAreas,
  listPrintAreasForView,
  listProductViews,
  placementKey,
  printAreaKey,
  printAreaViewKey,
  type Placement,
  type ProductViewKey,
} from "../mockup-bake";
import type { ArtFile } from "../swagDraft";
import type { UiProduct, UiShop } from "@/services/mappers";

function areaArtCount(
  product: UiProduct,
  idx: number,
  areaArts: Record<string, ArtFile>,
): { designed: number; total: number } {
  const areas = listPrintAreas(product);
  const list = areas.length ? areas : [null];
  const total = Math.max(1, list.length);
  const designed = list.filter((a, i) =>
    Boolean(areaArts[areaPlacementKey(product, idx, printAreaKey(product, a, i))]),
  ).length;
  return { designed, total };
}

function productHasArtwork(
  product: UiProduct,
  idx: number,
  areaArts: Record<string, ArtFile>,
): boolean {
  return areaArtCount(product, idx, areaArts).designed > 0;
}

function designStatusLabel(designed: number, total: number): string {
  if (designed <= 0) return "No artwork added";
  if (designed >= total) return "Fully designed";
  return `${designed} of ${total} print areas designed`;
}

export function AddToShopStep({
  collectionName,
  products,
  placements = {},
  areaArts = {},
  shops,
  picked,
  onToggle,
}: {
  collectionName: string;
  products: UiProduct[];
  /** Artwork-step placements keyed by product / area. */
  placements?: Record<string, Placement>;
  /** Per print-area artwork from the artwork step. */
  areaArts?: Record<string, ArtFile>;
  shops: UiShop[];
  picked: Set<string>;
  onToggle: (shopId: string) => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [previewView, setPreviewView] = useState<ProductViewKey>("front");
  const [shopQuery, setShopQuery] = useState("");

  useEffect(() => {
    if (selectedIdx >= products.length) {
      setSelectedIdx(Math.max(0, products.length - 1));
    }
  }, [products.length, selectedIdx]);

  const withArtwork = useMemo(
    () => products.filter((p, i) => productHasArtwork(p, i, areaArts)).length,
    [products, areaArts],
  );
  void withArtwork;

  const selected = products[selectedIdx] ?? null;
  const selectedViews = selected ? listProductViews(selected) : (["front"] as ProductViewKey[]);
  const activeView: ProductViewKey = selectedViews.includes(previewView)
    ? previewView
    : selectedViews[0] || "front";

  useEffect(() => {
    if (!selected) return;
    const views = listProductViews(selected);
    if (!views.includes(previewView)) {
      setPreviewView(views[0] || "front");
    }
  }, [selected, previewView]);

  const selectedLayers = selected
    ? buildMockupLayers(selected, {
        idx: selectedIdx,
        areaArts,
        placements,
        view: activeView,
      })
    : [];
  const selectedCounts = selected
    ? areaArtCount(selected, selectedIdx, areaArts)
    : { designed: 0, total: 0 };
  const selectedHasArt = selectedCounts.designed > 0;
  const backMaskMissing =
    activeView === "back" && selected && !designImgUrlForView(selected, "back");

  const filteredShops = useMemo(() => {
    const q = shopQuery.trim().toLowerCase();
    if (!q) return shops;
    return shops.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.currency || "").toLowerCase().includes(q) ||
        (s.slug || "").toLowerCase().includes(q),
    );
  }, [shops, shopQuery]);

  const defaultShopId = shops[0]?.id;

  return (
    <div className="sw-publish-review">
      <header className="sw-publish-summary">
        <div className="sw-publish-summary-main">
          <div className="sw-publish-kicker">Review &amp; publish</div>
          <h1 className="sw-publish-title">{collectionName}</h1>
          <p className="sw-publish-lead">
            Choose which shops should receive this collection. Artwork is optional. Undrafted
            products still publish.
          </p>
        </div>
        <div className="sw-publish-stats">
          <div className="sw-publish-stat sw-publish-stat--products">
            <span className="sw-publish-stat-icon" aria-hidden="true">
              <Package size={16} strokeWidth={2.25} />
            </span>
            <div>
              <div className="sw-publish-stat-label">Products</div>
              <div className="sw-publish-stat-value">{products.length}</div>
            </div>
          </div>
          <div className="sw-publish-stat sw-publish-stat--shops">
            <span className="sw-publish-stat-icon" aria-hidden="true">
              <Store size={16} strokeWidth={2.25} />
            </span>
            <div>
              <div className="sw-publish-stat-label">Selected shops</div>
              <div className="sw-publish-stat-value">{picked.size}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="sw-publish-layout">
        <section className="sw-publish-panel sw-publish-shops">
          <div className="sw-publish-shops-head">
            <div className="sw-publish-shops-title-row">
              <span className="sw-publish-shops-glyph" aria-hidden="true">
                <Store size={18} strokeWidth={2.25} />
              </span>
              <div>
                <h2 className="sw-publish-shops-title">Publish to</h2>
                <p className="sw-publish-shops-sub">
                  Select one or more shops to add this collection.
                </p>
              </div>
            </div>
            <label className="sw-publish-shop-search">
              <Search size={15} strokeWidth={2.25} aria-hidden="true" />
              <input
                type="search"
                value={shopQuery}
                onChange={(e) => setShopQuery(e.target.value)}
                placeholder="Search shops..."
                aria-label="Search shops"
              />
            </label>
          </div>

          <div className="sw-publish-shop-list">
            {shops.length === 0 ? (
              <div className="sw-publish-empty mut3">
                Create a shop first, then publish this collection.
              </div>
            ) : filteredShops.length === 0 ? (
              <div className="sw-publish-empty mut3">No shops match your search.</div>
            ) : (
              filteredShops.map((shop) => {
                const on = picked.has(shop.id);
                const isDefault = shop.id === defaultShopId;
                return (
                  <button
                    key={shop.id}
                    type="button"
                    className={`sw-publish-shop-row${on ? " is-on" : ""}`}
                    onClick={() => onToggle(shop.id)}
                    aria-pressed={on}
                  >
                    <span
                      className={`sw-publish-shop-checkbox${on ? " is-on" : ""}`}
                      aria-hidden="true"
                    >
                      {on ? <Check size={12} strokeWidth={3} /> : null}
                    </span>
                    <span className="sw-publish-shop-icon" aria-hidden="true">
                      <Store size={16} />
                    </span>
                    <span className="sw-publish-shop-meta">
                      <span className="sw-publish-shop-name">{shop.name}</span>
                      <span className="sw-publish-shop-currency">{shop.currency}</span>
                    </span>
                    {isDefault ? (
                      <span className="sw-publish-default-badge">
                        <Home size={12} strokeWidth={2.25} aria-hidden="true" />
                        Default
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          <div className="sw-publish-tip">
            <Info size={15} />
            <span>
              <strong>Publishing adds every product in this collection to the selected shops.</strong>{" "}
              Visibility is managed per shop in Shop Catalog.
            </span>
          </div>
        </section>

        <aside className="sw-publish-aside" aria-label="Publish summary">
          <div className="sw-publish-aside-kicker">Final step</div>
          <h2 className="sw-publish-aside-title">Publish your collection</h2>
          <p className="sw-publish-aside-lead">
            Make your curated collection available in the selected shop(s).
          </p>
          <ul className="sw-publish-aside-list">
            <li>
              <span className="sw-publish-aside-icon" aria-hidden="true">
                <ArrowRight size={14} strokeWidth={2.5} />
              </span>
              <div>
                <div className="sw-publish-aside-item-title">All products</div>
                <div className="sw-publish-aside-item-text">
                  Publishes all products in this collection
                </div>
              </div>
            </li>
            <li>
              <span className="sw-publish-aside-icon" aria-hidden="true">
                <Eye size={14} strokeWidth={2.5} />
              </span>
              <div>
                <div className="sw-publish-aside-item-title">Manage visibility</div>
                <div className="sw-publish-aside-item-text">
                  Control visibility per shop in Shop Catalog
                </div>
              </div>
            </li>
            <li>
              <span className="sw-publish-aside-icon" aria-hidden="true">
                <Users size={14} strokeWidth={2.5} />
              </span>
              <div>
                <div className="sw-publish-aside-item-title">Reach your team</div>
                <div className="sw-publish-aside-item-text">
                  Make it easy for your team to access and redeem their rewards
                </div>
              </div>
            </li>
          </ul>
          <div className="sw-publish-aside-art">
            <p className="sw-publish-aside-prompt">
              Ready to share
              <br />
              your collection?
            </p>
            <img
              className="sw-publish-aside-bag-img"
              src="/images/swag/publish-bag.png"
              alt=""
              width={140}
              height={140}
            />
          </div>
        </aside>
      </div>

      {/* Collection preview + product preview — hidden for now (keep for later). */}
      {false && (
        <>
          <section className="sw-publish-panel sw-publish-collection">
            <div className="sw-publish-panel-head">
              <div>
                <h2 className="sw-publish-panel-title">Collection preview</h2>
                <p className="sw-publish-panel-hint mut3">
                  {products.length} {products.length === 1 ? "product" : "products"} · click to
                  review
                </p>
              </div>
            </div>

            <div className="sw-publish-collection-grid">
              {products.map((p, i) => {
                const cardView = listProductViews(p)[0] || "front";
                const layers = buildMockupLayers(p, {
                  idx: i,
                  areaArts,
                  placements,
                  view: cardView,
                });
                const { designed, total } = areaArtCount(p, i, areaArts);
                const selectedCard = i === selectedIdx;
                return (
                  <button
                    key={placementKey(p, i)}
                    type="button"
                    className={`sw-publish-product-card${selectedCard ? " is-selected" : ""}${
                      designed > 0 ? " has-art" : ""
                    }`}
                    onClick={() => {
                      setSelectedIdx(i);
                      setPreviewView(listProductViews(p)[0] || "front");
                    }}
                  >
                    <div className="sw-publish-product-mock">
                      <MockupCanvas product={p} layers={layers} view={cardView} />
                    </div>
                    <div className="sw-publish-product-meta">
                      {p.brand ? <div className="sw-publish-product-brand">{p.brand}</div> : null}
                      <div className="sw-publish-product-name">{p.nm}</div>
                      <div
                        className={`sw-publish-product-status${designed > 0 ? " is-designed" : ""}`}
                      >
                        {designStatusLabel(designed, total)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="sw-publish-panel sw-publish-detail">
            <div className="sw-publish-panel-head">
              <div>
                <h2 className="sw-publish-panel-title">Product preview</h2>
                <p className="sw-publish-panel-hint mut3">
                  Review only. Editing happens in Artwork
                </p>
              </div>
            </div>

            {!selected ? (
              <div className="sw-publish-detail-empty mut3">No products in this collection.</div>
            ) : (
              <div className="sw-publish-detail-body">
                <div className="sw-publish-detail-mock">
                  <MockupViewGallery
                    views={selectedViews}
                    activeView={activeView}
                    onChange={setPreviewView}
                    style={{ width: "100%", minHeight: 280 }}
                    mediaStyle={{
                      minHeight: 260,
                      padding: 12,
                      background: "var(--gray-100)",
                    }}
                    renderThumb={(view) => {
                      const thumbLayers = buildMockupLayers(selected, {
                        idx: selectedIdx,
                        areaArts,
                        placements,
                        view,
                      });
                      return <MockupCanvas product={selected} layers={thumbLayers} view={view} />;
                    }}
                  >
                    {backMaskMissing ? (
                      <div className="mut3" style={{ padding: 24, textAlign: "center" }}>
                        Back view image unavailable for this product.
                      </div>
                    ) : (
                      <MockupCanvas product={selected} layers={selectedLayers} view={activeView} />
                    )}
                  </MockupViewGallery>
                </div>

                <div className="sw-publish-detail-info">
                  {selected.brand ? (
                    <div className="sw-publish-detail-brand">{selected.brand}</div>
                  ) : null}
                  <h3 className="sw-publish-detail-name">{selected.nm}</h3>

                  <div className="sw-publish-areas-label">Print areas</div>
                  <ul className="sw-publish-areas">
                    {listPrintAreas(selected).map((area, i) => {
                      const areaKey = printAreaKey(selected, area, i);
                      const draftKey = areaPlacementKey(selected, selectedIdx, areaKey);
                      const designed = Boolean(areaArts[draftKey]?.preview);
                      const view = printAreaViewKey(selected, area);
                      const label = area.label || `Print area ${i + 1}`;
                      return (
                        <li
                          key={areaKey}
                          className={`sw-publish-area${designed ? " is-designed" : ""}`}
                          style={
                            view === activeView
                              ? { borderColor: "var(--brand)", background: "var(--brand-50)" }
                              : undefined
                          }
                        >
                          {designed ? (
                            <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                          ) : (
                            <span className="sw-publish-area-dot" aria-hidden="true" />
                          )}
                          <span>
                            {designed ? `${label} · ${view}` : `Not designed: ${label} · ${view}`}
                          </span>
                        </li>
                      );
                    })}
                    {!listPrintAreas(selected).length ? (
                      <li className="sw-publish-area">
                        <span className="sw-publish-area-dot" aria-hidden="true" />
                        <span>No print areas configured</span>
                      </li>
                    ) : null}
                  </ul>

                  {!selectedHasArt ? (
                    <div className="sw-publish-empty-art">
                      <strong>No artwork added.</strong>
                      <span>This product will still be published.</span>
                    </div>
                  ) : (
                    <div className="sw-publish-detail-summary mut3">
                      {selectedCounts.designed} of {selectedCounts.total} print areas designed
                      {listPrintAreasForView(selected, "back").length
                        ? ` · ${listPrintAreasForView(selected, "back").length} on back`
                        : ""}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
