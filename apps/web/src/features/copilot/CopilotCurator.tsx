import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Check, Gift, ImageOff, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { tenantPath } from "@/lib/workspaceSlug";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { Curation, CuratorItem, GiftingBrief } from "./curatorTypes";
import { shortlistSummary } from "./curatorTypes";

export const CURATOR_STARTERS = ["Welcome kits for new employees", "Employee appreciation gifts", "Work anniversary gifting", "Festival gifting", "Executive gifts", "Unique gifts beyond ordinary merchandise"];
export function curatorMoney(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}
export function CuratorIntro({ onDraft }: { onDraft: (text: string) => void }) {
  return <div className="sm-curator-intro">
    <span className="sm-curator-eyebrow"><Sparkles size={16} /> A thoughtful place to start</span>
    <h1>Great gifts start with your team.</h1>
    <p>Tell me the occasion, number of people and your budget. We’ll find gifts that feel right.</p>
    <div className="sm-curator-starters">{CURATOR_STARTERS.map(text => <button type="button" key={text} onClick={() => onDraft(text)}>{text}</button>)}</div>
    <p className="sm-curator-hint">Try: “Unique welcome gifts for 10 Toast employees, ₹3,000 each. No mugs, bottles or apparel.”</p>
  </div>;
}
export function CuratorToolbar({ onExit, busy }: { onExit: () => void; busy: boolean }) {
  return <div className="sm-curator-toolbar"><strong><Gift size={17} /> Curate Gifts</strong><button type="button" disabled={busy} onClick={onExit}><ArrowLeft size={15} /> Normal Copilot</button></div>;
}
function Brief({ brief }: { brief: GiftingBrief }) {
  const rows = [brief.company, brief.occasion, brief.recipients ? `${brief.recipients} recipients` : null, brief.budgetPerRecipient ? `${curatorMoney(brief.budgetPerRecipient, brief.currency)} / person` : null, brief.style];
  return <div className="sm-curator-brief" aria-label="Gifting brief"><span className="sm-curator-eyebrow">Your gifting brief</span><div>{rows.filter(Boolean).map((row, i) => <span key={i}>{row}</span>)}</div>{brief.exclusions?.length ? <p>Avoiding: {brief.exclusions.join(", ")}</p> : null}</div>;
}
function ItemImage({ item }: { item: CuratorItem }) {
  const [failed, setFailed] = useState(false);
  const src = item.imageUrl ? resolveMediaUrl(item.imageUrl) : "";
  return <div className="sm-curator-card__image">{src && !failed ? <img src={src} alt={item.name} loading="lazy" onError={() => setFailed(true)} /> : <><ImageOff size={24} /><span>{item.kind === "idea" ? "Concept only" : "Image unavailable"}</span></>}</div>;
}
function ItemCard({ item, selected, onToggle }: { item: CuratorItem; selected: boolean; onToggle: () => void }) {
  const details = item.kind === "idea" || !item.id ? null : item.kind === "kit" ? item.curated ? tenantPath("/kits") : tenantPath(`/kits/${encodeURIComponent(item.id)}`) : tenantPath(`/catalog/${encodeURIComponent(item.id)}`);
  return <article className={`sm-curator-card${selected ? " is-selected" : ""}`}>
    <ItemImage item={item} />
    <button type="button" className="sm-curator-select" aria-pressed={selected} aria-label={`${selected ? "Deselect" : "Select"} ${item.name}`} onClick={onToggle}>{selected ? <Check size={14} /> : <span />}</button>
    <div className="sm-curator-card__body"><span className="sm-curator-source">{item.source === "shelfmerch" ? item.kind === "kit" ? item.curated ? "ShelfMerch curated kit" : "ShelfMerch customized kit" : "ShelfMerch catalog" : "Unverified inspiration"}</span><h3>{item.name}</h3>
      {item.description ? <p>{item.description}</p> : null}
      <strong className="sm-curator-price">{item.price != null && item.currency ? curatorMoney(item.price, item.currency) : "Price not verified"}</strong>
      <small>{item.availability}</small>
      {item.products?.length ? <details><summary>Kit contents</summary><ul>{item.products.map((p, i) => <li key={i}>{p.name}{p.quantity ? ` × ${p.quantity}` : ""}</li>)}</ul></details> : null}
      {details ? <Link to={details}>View details ↗</Link> : null}
    </div>
  </article>;
}
export function CuratorRecommendations({ curation, busy, onDraft }: { curation?: Curation; busy: boolean; onDraft: (text: string) => void }) {
  const [selected, setSelected] = useState<Record<string, CuratorItem>>({});
  const [compare, setCompare] = useState(false);
  const items = Object.values(selected);
  const brief = curation?.brief || {};
  const summary = useMemo(() => shortlistSummary(items, brief), [selected, curation]);
  function toggle(item: CuratorItem) { setSelected(prev => { const next = { ...prev }; if (next[item.key]) delete next[item.key]; else next[item.key] = item; return next; }); }
  return <aside className="sm-curator-results" aria-label="Gift recommendations" aria-busy={busy}>
    <div className="sm-curator-results__top"><div><span className="sm-curator-eyebrow">Made for your team</span><h2>Your gifting canvas</h2></div><SlidersHorizontal size={19} /></div>
    <div className="sm-curator-sources" aria-label="Recommendation sources"><button type="button" disabled={busy} aria-pressed={brief.source !== "external"} onClick={() => onDraft("Use only the ShelfMerch catalog for these gifts. Keep my existing requirements.")}>ShelfMerch catalog</button><button type="button" disabled={busy} aria-pressed={brief.source === "external"} onClick={() => onDraft("Suggest gifts outside ShelfMerch. Keep my existing requirements.")}>Beyond ShelfMerch</button></div>
    {curation ? <Brief brief={brief} /> : null}
    {brief.source === "external" ? <p className="sm-curator-disclaimer">Ideas for inspiration — availability and pricing not verified. External shopping research is not connected.</p> : null}
    {!curation?.concepts.length ? <div className="sm-curator-empty"><Gift size={28} /><h3>{busy ? "Finding a thoughtful fit…" : "A few details. Better gifts."}</h3><p>{curation ? "Share any missing details or refine your request in the conversation. Your preferences stay with your brief." : "Your curated concepts and genuine product images will appear here after you share your gifting brief."}</p></div> : curation.concepts.map(concept => <section className="sm-curator-concept" key={concept.id}>
      <span className="sm-curator-eyebrow">{concept.kind === "existing_kit" ? "Existing kit" : concept.kind === "inspiration" ? "Concept only" : "AI-suggested catalog combination"}</span><h3>{concept.name}</h3><p>{concept.rationale}</p>
      <div className="sm-curator-grid">{concept.items.map(item => <ItemCard key={item.key} item={item} selected={Boolean(selected[item.key])} onToggle={() => toggle(item)} />)}</div>
      <div className="sm-curator-concept__estimate"><strong>{concept.knownPerRecipient > 0 ? `${concept.completePrice ? "Item estimate" : "Known item subtotal"}: ${curatorMoney(concept.knownPerRecipient)} / person` : "Pricing not verified"}</strong>{concept.estimatedTotal != null ? <span>{curatorMoney(concept.estimatedTotal)} for {brief.recipients} people</span> : null}{concept.overBudget ? <b>Above your stated budget</b> : null}</div>
      <p className="sm-curator-packaging">Packaging idea: {concept.packaging}. Packaging and delivery are not included in item estimates.</p>
      <button className="sm-curator-refine" type="button" disabled={busy} onClick={() => onDraft(`Find alternatives to “${concept.name}”. Keep my budget, recipients, exclusions and source preference.`)}>Explore alternatives →</button>
    </section>)}
    {items.length ? <section className="sm-curator-shortlist" aria-label="Gift shortlist"><div className="sm-curator-shortlist__head"><h3>Your shortlist <span>{items.length}</span></h3><button type="button" onClick={() => { setSelected({}); setCompare(false); }}>Clear</button></div>
      <ul>{items.map(item => <li key={item.key}><span>{item.name}<small>{item.source === "shelfmerch" ? "ShelfMerch" : "Inspiration"}</small></span><button type="button" aria-label={`Remove ${item.name}`} onClick={() => toggle(item)}><X size={15} /></button></li>)}</ul>
      {Object.entries(summary.totals).map(([currency, total]) => <p key={currency}><strong>{curatorMoney(total, currency)} / person</strong>{brief.recipients ? ` · ${curatorMoney(total * brief.recipients, currency)} for ${brief.recipients} people` : ""}</p>)}
      {summary.missing ? <p>Partial estimate: {summary.missing} selected {summary.missing === 1 ? "item has" : "items have"} no verified price.</p> : null}
      {summary.difference != null ? <p>{curatorMoney(Math.abs(summary.difference), brief.currency)} {summary.difference >= 0 ? "under" : "over"} budget per person</p> : null}
      <small>Item estimate only. Packaging and delivery are excluded. Shortlisting does not purchase, send gifts or create a kit.</small>
      <button type="button" className="sm-curator-refine" onClick={() => setCompare(value => !value)}>{compare ? "Hide comparison" : "Compare selected items"}</button>
      {compare ? <div className="sm-curator-compare"><table><caption>Selected gift comparison</caption><thead><tr><th>Gift</th><th>Price</th><th>Source</th></tr></thead><tbody>{items.map(item => <tr key={item.key}><td>{item.name}</td><td>{item.price != null && item.currency ? curatorMoney(item.price, item.currency) : "Unverified"}</td><td>{item.source === "shelfmerch" ? "ShelfMerch" : "Inspiration"}</td></tr>)}</tbody></table></div> : null}
    </section> : null}
    {curation?.suggestions.length ? <div className="sm-curator-replies" aria-label="Suggested refinements">{curation.suggestions.map(text => <button key={text} type="button" disabled={busy} onClick={() => onDraft(text)}>{text}</button>)}</div> : null}
  </aside>;
}
