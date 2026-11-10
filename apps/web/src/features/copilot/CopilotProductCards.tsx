import { useState } from "react";
import { Link } from "react-router";
import { ImageOff } from "lucide-react";
import { tenantPath } from "@/lib/workspaceSlug";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type {
  CopilotArtifact,
  CopilotConfirmationArtifact,
  CopilotDepartmentBudgetsArtifact,
  CopilotSuccessArtifact,
  CopilotWalletBalanceArtifact,
} from "./api";
import { CopilotConfirmationCard, CopilotWriteSuccess } from "./CopilotConfirmationCard";
import {
  CopilotDepartmentBudgetsCard,
  CopilotWalletBalanceCard,
} from "./CopilotBalanceCard";

function formatInr(value: unknown) {
  if (value == null || value === "") return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** Kit MCP summaries expose `imageUrl`; older payloads used heroImage / imageUrls. */
function kitImageSrc(kit: Record<string, unknown>): string {
  const urls = Array.isArray(kit.imageUrls) ? (kit.imageUrls as unknown[]) : [];
  const raw = kit.imageUrl || kit.heroImage || kit.primaryImageUrl || urls[0] || "";
  return resolveMediaUrl(String(raw || "")) || "";
}

function productImageSrc(product: Record<string, unknown>): string {
  const urls = Array.isArray(product.imageUrls) ? (product.imageUrls as unknown[]) : [];
  const raw = product.primaryImageUrl || product.imageUrl || urls[0] || "";
  return resolveMediaUrl(String(raw || "")) || "";
}

function CardImage({ src, alt, emptyLabel }: { src: string; alt: string; emptyLabel: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <ImageOff size={22} aria-label={emptyLabel} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** Customer-facing availability only — never exact stock counts. */
export function stockLabel(product: Record<string, unknown>) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length) {
    if (product.inStock === true || product.available === true) return "In stock";
    if (product.inStock === false || product.available === false) return "Out of stock";
    return "Availability unknown";
  }
  let known = false;
  let available = false;
  for (const row of variants) {
    const n = Number((row as { stock?: number })?.stock);
    if (!Number.isFinite(n)) continue;
    known = true;
    if (n > 0) available = true;
  }
  if (!known) return "Availability unknown";
  return available ? "In stock" : "Out of stock";
}

function kitHref(kit: Record<string, unknown>) {
  const id = String(kit.id || "");
  if (!id) return undefined;
  // Workspace kits include status; platform curated summaries do not.
  if (kit.status) return tenantPath(`/kits/${encodeURIComponent(id)}`);
  if (Boolean(kit.curated) || kit.type === "curated") return tenantPath("/kits");
  return tenantPath(`/kits/${encodeURIComponent(id)}`);
}

export function CopilotArtifacts({
  artifacts,
  conversationId,
  onArtifactChange,
}: {
  artifacts?: CopilotArtifact[];
  conversationId?: string | null;
  onArtifactChange?: (index: number, next: CopilotArtifact) => void;
}) {
  if (!artifacts?.length) return null;
  const products = artifacts.filter((row) => row.kind === "product");
  const kits = artifacts.filter((row) => row.kind === "kit");
  const wallets = artifacts.filter(
    (row): row is CopilotWalletBalanceArtifact => row.kind === "wallet_balance",
  );
  const hasWalletCards = wallets.length > 0;
  const departmentGroups = artifacts.filter(
    (row): row is CopilotDepartmentBudgetsArtifact => row.kind === "department_budgets",
  );
  const confirmations = artifacts
    .map((row, index) => ({ row, index }))
    .filter((entry): entry is { row: CopilotConfirmationArtifact; index: number } => entry.row.kind === "confirmation");
  const successes = artifacts.filter((row): row is CopilotSuccessArtifact => row.kind === "success");

  return (
    <div className="sm-copilot-products" aria-label="Results">
      {confirmations.map(({ row, index }) => (
        <CopilotConfirmationCard
          key={row.confirmationId || index}
          artifact={row}
          conversationId={conversationId}
          onChange={(next) => onArtifactChange?.(index, next)}
        />
      ))}
      {successes.map((row, index) => (
        <CopilotWriteSuccess key={`success-${index}`} artifact={row} />
      ))}
      {wallets.map((row, index) => (
        <CopilotWalletBalanceCard key={row.wallet?.id || `wallet-${index}`} artifact={row} />
      ))}
      {!hasWalletCards
        ? departmentGroups.map((row, index) => (
            <CopilotDepartmentBudgetsCard key={`departments-${index}`} artifact={row} />
          ))
        : null}
      {products.map((row) => {
        const product = row.product;
        const id = String(product.id || "");
        const name = String(product.name || "Product");
        const img = productImageSrc(product);
        const href = id ? tenantPath(`/catalog/${encodeURIComponent(id)}`) : undefined;
        const price = formatInr(product.sellingPriceInr);
        const body = (
          <>
            <div className="sm-copilot-product__img">
              <CardImage src={img} alt={name} emptyLabel="No product image available" />
            </div>
            <div className="sm-copilot-product__meta">
              <strong>{name}</strong>
              <span>{price ? `${price} incl. GST` : "Price on request"}</span>
              <span>{stockLabel(product)}</span>
              {href ? <span className="sm-copilot-product__link">View details ↗</span> : null}
            </div>
          </>
        );
        return href ? (
          <Link
            key={id || name}
            to={href}
            className="sm-copilot-product"
            aria-label={`View ${name}`}
          >
            {body}
          </Link>
        ) : (
          <div key={name} className="sm-copilot-product">
            {body}
          </div>
        );
      })}
      {kits.map((row, index) => {
        const kit = row.kit;
        const name = String(kit.name || "Kit");
        const img = kitImageSrc(kit);
        const curated = Boolean(kit.curated) || kit.type === "curated";
        const href = kitHref(kit);
        const price =
          kit.approxValueInr != null
            ? formatInr(kit.approxValueInr)
            : kit.priceInr != null
              ? formatInr(kit.priceInr)
              : "";
        const body = (
          <>
            <div className="sm-copilot-product__img">
              <CardImage src={img} alt={name} emptyLabel="No kit image available" />
            </div>
            <div className="sm-copilot-product__meta">
              <strong>{name}</strong>
              <span>{curated ? "Curated kit" : "Customized kit"}</span>
              {price ? <span>~{price}</span> : null}
              {href ? <span className="sm-copilot-product__link">View details ↗</span> : null}
            </div>
          </>
        );
        return href ? (
          <Link
            key={`${name}-${index}`}
            to={href}
            className="sm-copilot-product"
            aria-label={`View ${name}`}
          >
            {body}
          </Link>
        ) : (
          <div key={`${name}-${index}`} className="sm-copilot-product">
            {body}
          </div>
        );
      })}
    </div>
  );
}
