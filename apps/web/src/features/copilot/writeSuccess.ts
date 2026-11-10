import { shopStorefrontHref } from "@/lib/shopRedeemUrl";
import { tenantPath } from "@/lib/workspaceSlug";
import type { CopilotSuccessArtifact } from "./api";

function titleCaseOperation(operation: string) {
  return operation.replace(/[_.]/g, " ");
}

type WriteResult = Record<string, unknown> & {
  id?: string;
  name?: string;
  status?: string;
  slug?: string;
  currencyMode?: string;
  storefrontUrl?: string;
};

export function buildWriteSuccessArtifact(
  workflow: string,
  result: WriteResult,
  options?: { preview?: Record<string, unknown>; request?: Record<string, unknown> },
): CopilotSuccessArtifact {
  const preview = options?.preview || {};
  const request = options?.request || {};
  const name = String(result.name || preview.name || request.name || "").trim();
  const status = String(result.status || "").toLowerCase();
  const shopId = String(result.id || request.shopId || preview.shopId || "").trim();
  const slug = String(result.slug || preview.slug || "").trim();
  const currency = String(result.currencyMode || preview.currencyMode || request.currencyMode || "").trim();
  const storefrontUrl =
    typeof result.storefrontUrl === "string" && result.storefrontUrl
      ? result.storefrontUrl
      : shopId || slug
        ? shopStorefrontHref({ id: shopId, slug: slug || undefined })
        : undefined;
  const manageHref = shopId ? tenantPath(`/shops/${shopId}`) : undefined;

  if (workflow === "shops.publish") {
    return {
      kind: "success",
      operation: workflow,
      title: "Store published successfully!",
      message: name ? `${name} is now Live.` : "Your store is now Live.",
      details: [
        name ? `Store: ${name}` : null,
        "Status: Live",
        currency ? `Currency: ${currency}` : null,
        storefrontUrl ? `Storefront: ${storefrontUrl}` : null,
      ].filter(Boolean) as string[],
      actions: [
        storefrontUrl ? { label: "View Store", href: storefrontUrl, external: true } : null,
        manageHref ? { label: "Manage Store", href: manageHref } : null,
      ].filter(Boolean) as CopilotSuccessArtifact["actions"],
      result,
      shop: result,
    };
  }

  if (workflow === "shops.create") {
    return {
      kind: "success",
      operation: workflow,
      title: "Store created",
      message: status === "live"
        ? name ? `${name} is now Live.` : "Your store is now Live."
        : name ? `${name} was created.` : "Your store was created.",
      details: [
        name ? `Store: ${name}` : null,
        status ? `Status: ${status}` : null,
        currency ? `Currency: ${currency}` : null,
      ].filter(Boolean) as string[],
      actions: [
        status === "live" && storefrontUrl ? { label: "View Store", href: storefrontUrl, external: true } : null,
        manageHref ? { label: "Manage Store", href: manageHref } : null,
      ].filter(Boolean) as CopilotSuccessArtifact["actions"],
      result,
      shop: result,
    };
  }

  if (workflow === "shops.update") {
    const changes = Array.isArray(preview.changes)
      ? (preview.changes as Array<{ field?: string }>).map((row) => String(row.field || "")).filter(Boolean)
      : Object.keys(request).filter((key) => !["shopId", "confirmationId", "idempotencyKey"].includes(key));
    return {
      kind: "success",
      operation: workflow,
      title: "Store updated",
      message: name ? `${name} was updated successfully.` : "Store details were updated successfully.",
      details: [
        name ? `Store: ${name}` : null,
        changes.length ? `Updated: ${changes.join(", ")}` : null,
        status ? `Status: ${status}` : null,
      ].filter(Boolean) as string[],
      actions: manageHref ? [{ label: "Manage Store", href: manageHref }] : undefined,
      result,
      shop: result,
    };
  }

  if (workflow === "shops.catalog_update") {
    const shown = Array.isArray(preview.shown) ? preview.shown.length : undefined;
    const productNames = Array.isArray(preview.shown)
      ? (preview.shown as Array<{ productName?: string }>)
          .map((row) => String(row.productName || "").trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];
    return {
      kind: "success",
      operation: workflow,
      title: "Store products updated",
      message:
        productNames.length === 1
          ? `${productNames[0]} is now on the store.`
          : "Store product visibility was updated successfully.",
      details: [
        typeof shown === "number" ? `Products shown: ${shown}` : null,
        productNames.length ? `Including: ${productNames.join(", ")}` : null,
      ].filter(Boolean) as string[],
      actions: manageHref ? [{ label: "Manage Store", href: manageHref }] : undefined,
      result,
      shop: shopId ? { id: shopId, name: name || undefined } : undefined,
    };
  }

  return {
    kind: "success",
    operation: workflow,
    title: "Completed",
    message: `Confirmed ${titleCaseOperation(workflow)}.`,
    result,
    shop: workflow.startsWith("shops.") ? result : undefined,
  };
}
