import { normalizeMongoId } from "@/lib/mongoId";
import { apiFetch } from "./api";
import type { WalletUploadFile } from "@/features/wallets/types";
import {
  applyAuthUser,
  mapCampaign,
  mapCatalogProduct,
  mapCollection,
  mapContact,
  mapEntityToDept,
  mapKit,
  mapOrder,
  mapShop,
  mapWallet,
  type UiCampaign,
  type UiOrder,
  type UiCollection,
  type UiContact,
  type UiKit,
  type UiProduct,
  type UiShop,
  type UiWallet,
} from "./mappers";
import { getStoredUser, type AuthUser } from "./auth-store";
import { walletUnallocated } from "@/lib/walletFormat";

export type WalletOrgView = {
  active: boolean;
  wallet: WorkspaceSnapshot["org"]["wallet"];
  departments: WorkspaceSnapshot["org"]["departments"];
};

export type WorkspaceOwner = { id: string; name: string; email: string };

export type WorkspaceSnapshot = {
  account: string;
  slug?: string;
  logoUrl: string;
  userPatch: { name: string; initials: string; email: string; role: string };
  owner?: WorkspaceOwner;
  shops: UiShop[];
  contacts: UiContact[];
  kits: UiKit[];
  collections: UiCollection[];
  catalogProducts: UiProduct[];
  catalogTotal: number;
  campaigns: UiCampaign[];
  orders: UiOrder[];
  wallets: UiWallet[];
  primaryWalletId?: string;
  walletViews: Record<string, WalletOrgView>;
  primaryEntityId?: string;
  primaryEntityWalletId?: string;
  org: {
    active: boolean;
    done: boolean;
    inWizard: boolean;
    wallet: {
      id?: string;
      name: string;
      amount: number;
      unallocated?: number;
      status?: string;
      start: string;
      end: string;
      funding: string;
      docType: string;
      docNumber: string;
      uploaded: boolean;
      uploadFile: WalletUploadFile | null;
      pay: string;
      fundingApproval?: string;
      requestedAmount?: number;
      fundingFileUrl?: string;
      address?: string;
      pinCode?: string;
      mobileNumber?: string;
      gstin?: string;
    };
    departments: ReturnType<typeof mapEntityToDept>[];
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function usersMap(users: any[]) {
  return new Map(users.map((u) => [String(u._id ?? u.id), u]));
}

function fileNameFromFundingUrl(fileUrl: string): string {
  try {
    const path = new URL(fileUrl, "https://placeholder.local").pathname;
    const base = path.split("/").pop() || "Document";
    return decodeURIComponent(base);
  } catch {
    return "Document";
  }
}

type ApiWalletRow = {
  _id?: string;
  id?: string;
  name: string;
  balance: number;
  totalAmount: number;
  allocatedAmount?: number;
  validFrom?: string;
  validTo?: string;
  fundingMethod?: string;
  fundingDocument?: {
    docType?: string;
    docNumber?: string;
    fileUrl?: string;
    approvalStatus?: string;
    requestedAmount?: number;
  };
  status?: string;
  updatedAt?: string;
  address?: string;
  pinCode?: string;
  mobileNumber?: string;
  gstin?: string;
};

function isEmptyDraftWallet(w: ApiWalletRow): boolean {
  const doc = w.fundingDocument ?? {};
  return (
    (w.status ?? "draft") === "draft" &&
    Number(w.balance ?? 0) === 0 &&
    Number(w.totalAmount ?? 0) === 0 &&
    Number(w.allocatedAmount ?? 0) === 0 &&
    Number(doc.requestedAmount ?? 0) === 0 &&
    !doc.fileUrl &&
    !doc.docNumber &&
    !doc.approvalStatus
  );
}

function mapWalletOrgFields(
  w: ApiWalletRow,
  isEntityManager: boolean,
  myEntity?: { allocatedAmount?: number; spentAmount?: number },
): WorkspaceSnapshot["org"]["wallet"] {
  const id = String(w._id ?? w.id ?? "");
  const balance = Math.round(Number(w.balance) || 0);
  const funded = Math.round(Number(w.totalAmount) || 0);
  const allocated = Math.round(Number(w.allocatedAmount) || 0);
  return {
    id: id || undefined,
    name: w.name || "Merchandise Budget",
    status: w.status || "",
    // Admin Budget balance = lifetime funded amount (not reduced by department spend).
    // Live cash stays on workspace.wallets / spendableForWallet for checkout.
    amount: isEntityManager
      ? (myEntity?.allocatedAmount ?? 0)
      : funded || balance,
    unallocated: isEntityManager
      ? Math.max(0, (myEntity?.allocatedAmount ?? 0) - (myEntity?.spentAmount ?? 0))
      : Math.max(0, balance - allocated),
    start: w.validFrom ? new Date(w.validFrom).toISOString().slice(0, 10) : "",
    end: w.validTo ? new Date(w.validTo).toISOString().slice(0, 10) : "",
    address: w.address || "",
    pinCode: w.pinCode || "",
    mobileNumber: w.mobileNumber || "",
    gstin: w.gstin || "",
    funding: w.fundingMethod === "online" ? "pay" : "upload",
    docType: w.fundingDocument?.docType || "Purchase Order",
    docNumber: w.fundingDocument?.docNumber || "",
    uploaded: Boolean(w.fundingDocument?.fileUrl),
    uploadFile: w.fundingDocument?.fileUrl
      ? {
          name: fileNameFromFundingUrl(w.fundingDocument.fileUrl),
          size: 0,
          source: "device",
        }
      : null,
    pay: "card",
    fundingApproval: w.fundingDocument?.approvalStatus || "",
    requestedAmount: Number(w.fundingDocument?.requestedAmount ?? 0),
    fundingFileUrl: w.fundingDocument?.fileUrl || undefined,
  };
}

/** Resolve the signed-in entity manager's department row from workspace data. */
function allWorkspaceDepartments(
  workspace: WorkspaceSnapshot,
): WorkspaceSnapshot["org"]["departments"] {
  const rows = [
    ...workspace.org.departments,
    ...Object.values(workspace.walletViews).flatMap((view) => view.departments),
  ];
  const seen = new Set<string>();
  return rows.filter((d) => {
    const key = `${d.walletId ?? ""}:${String(d.id)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Resolve every department row assigned to the signed-in entity manager. */
export function entityManagerDepartments(
  workspace: WorkspaceSnapshot,
): WorkspaceSnapshot["org"]["departments"] {
  const id = workspace.primaryEntityId;
  const email = workspace.userPatch.email?.toLowerCase();
  const assignedIds = new Set(
    (getStoredUser()?.assignedEntityIds ?? []).map(String),
  );
  const departments = allWorkspaceDepartments(workspace);
  const matches = departments.filter((d) => {
    if (id && String(d.id) === String(id)) return true;
    if (assignedIds.has(String(d.id))) return true;
    return Boolean(email && d.mgr?.email?.toLowerCase() === email);
  });
  if (matches.length) return matches;

  if (workspace.org.departments.length === 1) {
    return workspace.org.departments;
  }

  return workspace.org.departments[0] ? [workspace.org.departments[0]] : [];
}

/** Resolve the signed-in entity manager's primary department row from workspace data. */
export function entityManagerDepartment(
  workspace: WorkspaceSnapshot,
): WorkspaceSnapshot["org"]["departments"][number] | undefined {
  return entityManagerDepartments(workspace)[0];
}

export function entityManagerBudgetRemaining(
  workspace: WorkspaceSnapshot,
): number {
  return entityManagerDepartments(workspace).reduce(
    (sum, dept) => sum + Math.max(0, (dept.allocated ?? 0) - (dept.spent ?? 0)),
    0,
  );
}

/** Resolve org snapshot for a specific wallet (defaults to primary). */
export function orgForWallet(
  workspace: WorkspaceSnapshot,
  walletId?: string,
): WorkspaceSnapshot["org"] {
  const id = walletId || workspace.primaryWalletId || workspace.org.wallet.id;
  const view = id ? workspace.walletViews[id] : undefined;
  if (view) {
    return {
      active: view.active,
      done: workspace.org.done,
      inWizard: workspace.org.inWizard,
      wallet: view.wallet,
      departments: view.departments,
    };
  }
  return workspace.org;
}

/** Map wallet id → department rows for spendable-balance UI. */
export function walletDepartmentsMap(
  workspace: WorkspaceSnapshot,
): Record<string, WorkspaceSnapshot["org"]["departments"]> {
  return Object.fromEntries(
    Object.entries(workspace.walletViews).map(([id, view]) => [id, view.departments]),
  );
}

export function spendableForWallet(workspace: WorkspaceSnapshot, walletId: string): number {
  const wid = String(walletId);

  if (workspace.userPatch.role === "entity_manager") {
    const departments = entityManagerDepartments(workspace).filter(
      (d) => normalizeMongoId(d.walletId) === wid,
    );
    if (!departments.length) return 0;
    return departments.reduce(
      (sum, d) => sum + Math.max(0, (d.allocated ?? 0) - (d.spent ?? 0)),
      0,
    );
  }

  const wallet = workspace.wallets.find((w) => w.id === walletId);
  if (!wallet) return 0;
  return walletUnallocated(wallet);
}

function synthesizeDepartmentWallet(
  workspace: WorkspaceSnapshot,
  walletId: string,
  departments: WorkspaceSnapshot["org"]["departments"],
): UiWallet {
  const remaining = departments.reduce(
    (sum, d) => sum + Math.max(0, (d.allocated ?? 0) - (d.spent ?? 0)),
    0,
  );
  const allocated = departments.reduce((sum, d) => sum + (d.allocated ?? 0), 0);
  const label =
    departments.length === 1
      ? departments[0].name
      : `${departments[0]?.name ?? "Department"} +${departments.length - 1}`;
  return {
    id: walletId,
    name: label,
    cur: "INR",
    balance: remaining,
    unalloc: remaining,
    alloc: Math.max(0, allocated - remaining),
    owner: workspace.account,
    email: "",
    activity: [],
  };
}

/** Wallets the signed-in user can pay from at campaign checkout. */
export function walletsForCheckout(workspace: WorkspaceSnapshot): UiWallet[] {
  if (workspace.userPatch.role !== "entity_manager") {
    return workspace.wallets;
  }

  const departments = entityManagerDepartments(workspace);
  if (!departments.length) return [];

  const byWallet = new Map<string, WorkspaceSnapshot["org"]["departments"]>();
  for (const dept of departments) {
    const walletId = normalizeMongoId(dept.walletId);
    if (!walletId) continue;
    const rows = byWallet.get(walletId) ?? [];
    rows.push(dept);
    byWallet.set(walletId, rows);
  }

  const checkout: UiWallet[] = [];
  for (const [walletId, depts] of byWallet) {
    const live = workspace.wallets.find((w) => w.id === walletId);
    const deptWallet = synthesizeDepartmentWallet(workspace, walletId, depts);
    // Always show department remaining — never the parent org cash/unallocated.
    checkout.push(live ? { ...deptWallet, name: live.name, owner: live.owner, email: live.email } : deptWallet);
  }
  return checkout;
}

/** First department entity for a wallet — used when paying from a selected wallet. */
export function entityIdForWallet(
  workspace: WorkspaceSnapshot,
  walletId: string,
): string | undefined {
  const wid = String(walletId);
  const view = workspace.walletViews[wid];
  if (workspace.userPatch.role === "entity_manager") {
    const dept = entityManagerDepartments(workspace).find(
      (d) => normalizeMongoId(d.walletId) === wid,
    );
    if (dept?.id != null && dept.id !== "") return String(dept.id);
    return undefined;
  }
  const dept = view?.departments?.[0];
  if (dept?.id != null && dept.id !== "") return String(dept.id);

  const fromOrg = workspace.org.departments.find(
    (d) => normalizeMongoId(d.walletId) === wid,
  );
  if (fromOrg?.id != null && fromOrg.id !== "") return String(fromOrg.id);

  return undefined;
}

function managerUserIdFromEntity(entity: {
  managerUserId?: { _id?: string; email?: string } | string;
}): string {
  const mgr = entity.managerUserId;
  if (mgr && typeof mgr === "object" && mgr._id) return String(mgr._id);
  if (mgr) return String(mgr);
  return "";
}

function resolveMyEntityForManager(
  me: AuthUser,
  assignedEntities: never[],
):
  | { allocatedAmount?: number; spentAmount?: number; name?: string; walletId?: string; _id?: string }
  | undefined {
  const byManager = assignedEntities.find(
    (e) => managerUserIdFromEntity(e as never) === String(me.id),
  );
  if (byManager) return byManager as never;

  const email = me.email?.toLowerCase();
  if (email) {
    const byEmail = assignedEntities.find((e) => {
      const row = e as {
        managerEmail?: string;
        managerUserId?: { email?: string };
      };
      const mgrEmail = String(row.managerEmail ?? "").toLowerCase();
      const populated = row.managerUserId?.email?.toLowerCase();
      return mgrEmail === email || populated === email;
    });
    if (byEmail) return byEmail as never;
  }

  if (me.assignedEntityIds?.length) {
    const byJwt = assignedEntities.find((e) =>
      me.assignedEntityIds.some((id) => String(id) === String((e as { _id: string })._id)),
    );
    if (byJwt) return byJwt as never;
  }

  return assignedEntities[0] as never;
}

export async function fetchWorkspaceSnapshot(sessionUser?: AuthUser | null): Promise<WorkspaceSnapshot> {
  const me = sessionUser ?? getStoredUser();
  if (!me?.tenantId) throw new Error("No tenant context");

  const [
    tenant,
    shops,
    contacts,
    kits,
    collections,
    catalog,
    campaigns,
    ordersPage,
    wallets,
    entities,
    users,
  ] = await Promise.all([
    apiFetch<{ name: string; slug?: string; logoUrl?: string; owner?: WorkspaceOwner }>("/tenants/me"),
    apiFetch<unknown[]>("/shops"),
    apiFetch<unknown[]>("/contacts"),
    apiFetch<unknown[]>("/kits"),
    apiFetch<unknown[]>("/collections"),
    apiFetch<{ items: unknown[]; pagination?: { total?: number } }>("/catalog/products?limit=100"),
    apiFetch<unknown[]>("/campaigns").catch(() => []),
    apiFetch<{ items: unknown[] }>("/orders?limit=100"),
    apiFetch<unknown[]>("/wallets"),
    apiFetch<unknown[]>("/entities"),
    apiFetch<unknown[]>("/users").catch(() => []),
  ]);

  const userById = usersMap(users);
  const workspaceOwner = tenant.owner;
  const walletOwner = workspaceOwner
    ? { name: workspaceOwner.name, email: workspaceOwner.email }
    : undefined;
  const catalogProducts = (catalog.items || []).map(mapCatalogProduct);
  const catalogTotal = catalog.pagination?.total ?? catalogProducts.length;
  const catalogById = new Map(
    catalogProducts.filter((p) => p.id).map((p) => [p.id as string, p]),
  );

  // Collections may reference draft/archived catalog rows excluded from the tenant list.
  const collectionCatalogIds = new Set<string>();
  for (const col of collections as Array<{ productRefs?: Array<{ catalogProductId?: string }> }>) {
    for (const ref of col.productRefs || []) {
      const id = ref.catalogProductId ? String(ref.catalogProductId) : "";
      if (id && !catalogById.has(id)) collectionCatalogIds.add(id);
    }
  }
  await Promise.all(
    [...collectionCatalogIds].map(async (id) => {
      try {
        const product = await apiFetch<unknown>(`/catalog/products/${id}`);
        const mapped = mapCatalogProduct(product);
        catalogById.set(id, mapped);
        if (!catalogProducts.some((p) => p.id === id)) {
          catalogProducts.push(mapped);
        }
      } catch {
        // Linked catalog product was removed.
      }
    }),
  );

  const mappedShops = shops.map((s) => mapShop(s as never));
  const mappedCollections = (collections as never[]).map((c) => {
    const creator = userById.get(String((c as { createdBy?: string }).createdBy));
    return mapCollection(c, creator?.name || "", catalogById);
  });

  for (const shop of mappedShops) {
    shop.collections = mappedCollections
      .filter((c) => {
        const linked = c.shopIds?.length ? c.shopIds : c.shopId ? [c.shopId] : [];
        return linked.includes(shop.id);
      })
      .map((c) => c.id);
  }

  const walletList = wallets as ApiWalletRow[];
  const visibleWalletList = walletList.filter((w) => !isEmptyDraftWallet(w));
  // Surface an in-progress wallet that still needs allocation before the live one.
  const stuckSetup = [...visibleWalletList]
    .filter(
      (w) =>
        ["entities_added", "budget_allocated", "managers_assigned"].includes(w.status ?? "") &&
        (w.balance ?? 0) > 0 &&
        (w.allocatedAmount ?? 0) === 0,
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
    )[0];
  const fundedSetup = [...visibleWalletList]
    .filter((w) => (w.balance ?? 0) > 0 || (w.totalAmount ?? 0) > 0)
    .sort(
      (a, b) =>
        new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
    )[0];
  const primaryWallet =
    stuckSetup ??
    visibleWalletList.find((w) => w.status === "active") ??
    fundedSetup ??
    [...visibleWalletList].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0];

  const primaryWalletId = primaryWallet
    ? String(primaryWallet._id ?? primaryWallet.id ?? "")
    : "";

  const isEntityManager = me.role === "entity_manager";
  const assignedEntities = entities as never[];

  const walletEntities = isEntityManager
    ? assignedEntities
    : primaryWalletId
      ? (entities as never[]).filter(
          (e) => normalizeMongoId((e as { walletId?: unknown }).walletId) === primaryWalletId,
        )
      : (entities as never[]);

  const myEntity = isEntityManager ? resolveMyEntityForManager(me, assignedEntities) : undefined;

  const orgActive = isEntityManager ? Boolean(myEntity) : Boolean(primaryWallet);

  const entityRows = entities as never[];
  const walletViews: Record<string, WalletOrgView> = {};
  for (const w of visibleWalletList) {
    const id = String(w._id ?? w.id ?? "");
    if (!id) continue;
    const ents = entityRows.filter(
      (e) => normalizeMongoId((e as { walletId?: unknown }).walletId) === id,
    );
    walletViews[id] = {
      active: Boolean(w),
      wallet: mapWalletOrgFields(w, isEntityManager, myEntity),
      departments: ents.map((e) => mapEntityToDept(e, userById)),
    };
  }

  const auth = applyAuthUser(me, tenant.name);
  return {
    account: auth.account,
    slug: tenant.slug || undefined,
    logoUrl: tenant.logoUrl || "",
    userPatch: { ...auth.user, role: me.role },
    owner: workspaceOwner,
    shops: mappedShops,
    contacts: (contacts as never[]).map(mapContact),
    kits: (kits as never[]).map(mapKit),
    collections: mappedCollections,
    catalogProducts,
    catalogTotal,
    campaigns: (campaigns as never[]).map(mapCampaign),
    orders: (ordersPage.items || []).map((o) =>
      mapOrder(o, (o as { campaignName?: string }).campaignName || ""),
    ),
    wallets: (visibleWalletList as never[]).map((w) => mapWallet(w, walletOwner)),
    primaryWalletId: primaryWalletId || undefined,
    walletViews,
    primaryEntityId: isEntityManager
      ? (myEntity ? String((myEntity as { _id: string })._id) : undefined)
      : walletEntities[0]
        ? String((walletEntities[0] as { _id: string })._id)
        : undefined,
    primaryEntityWalletId:
      isEntityManager && myEntity
        ? normalizeMongoId((myEntity as { walletId?: unknown }).walletId) || undefined
        : undefined,
    org: {
      active: orgActive,
      done: false,
      inWizard: false,
      wallet: primaryWallet
        ? mapWalletOrgFields(primaryWallet, isEntityManager, myEntity)
        : mapWalletOrgFields(
            { name: "Merchandise Budget", balance: 0, totalAmount: 0 },
            isEntityManager,
            myEntity,
          ),
      departments: walletEntities.map((e) => mapEntityToDept(e, userById)),
    },
  };
}

export async function createShopApi(payload: {
  name: string;
  currencyMode: "points" | "inr";
  categories: string[];
  companyEmailDomain?: string;
  logoUrl?: string;
  bannerConfig?: Record<string, unknown>;
}) {
  const shop = await apiFetch<unknown>("/shops", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapShop(shop as never);
}

/** Upload a shop logo or custom banner; returns a short `/uploads/…` URL. */
export async function uploadShopAssetApi(
  file: File,
  kind: "logo" | "banner" = "logo",
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch<{ url: string }>(`/shops/assets?kind=${kind}`, {
    method: "POST",
    body: form,
  });
  return res.url;
}

export async function publishShopApi(shopId: string) {
  const shop = await apiFetch<unknown>(`/shops/${shopId}/publish`, { method: "POST" });
  return mapShop(shop as never);
}

export async function updateShopApi(
  shopId: string,
  payload: {
    name?: string;
    currencyMode?: "points" | "inr";
    pointsConversionEnabled?: boolean;
    companyEmailDomain?: string;
    logoUrl?: string;
    bannerConfig?: Record<string, unknown>;
    categories?: string[];
    selectedCatalogProductIds?: string[];
    featuredCatalogProductIds?: string[];
    activeListingKeys?: string[];
    featuredListingKeys?: string[];
  },
) {
  const shop = await apiFetch<unknown>(`/shops/${shopId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapShop(shop as never);
}

export async function archiveShopApi(shopId: string) {
  return apiFetch<{ ok: boolean }>(`/shops/${shopId}`, { method: "DELETE" });
}

function shopCurrencyMode(currency: string): "points" | "inr" {
  return currency === "INR" ? "inr" : "points";
}

export async function duplicateShopApi(shop: UiShop) {
  const draft = await createShopApi({
    name: `${shop.name} (copy)`,
    currencyMode: shopCurrencyMode(shop.currency),
    categories: shop.categories.length ? shop.categories : ["Merch"],
    logoUrl: shop.logoUrl || "",
    bannerConfig: shop.bannerConfig || {},
  });
  if (shop.selectedCatalogProductIds.length > 0) {
    return updateShopApi(draft.id, { selectedCatalogProductIds: shop.selectedCatalogProductIds });
  }
  return draft;
}

export async function createContactsApi(
  entries: Array<{
    name: string;
    email: string;
    role: string;
    phone?: string;
    department?: string;
    employeeCode?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      pincode?: string;
      country?: string;
    };
  }>,
) {
  const created = await Promise.all(
    entries.map((c) =>
      apiFetch<unknown>("/contacts", {
        method: "POST",
        body: JSON.stringify({
          name: c.name,
          email: c.email,
          role: c.role,
          phone: c.phone,
          department: c.department,
          employeeCode: c.employeeCode,
          address: c.address,
        }),
      }),
    ),
  );
  return created.map(mapContact);
}

export async function updateContactApi(
  contactId: string,
  payload: {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    department?: string;
    employeeCode?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      pincode?: string;
      country?: string;
    };
  },
) {
  const contact = await apiFetch<unknown>(`/contacts/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapContact(contact as never);
}

export async function deleteContactApi(contactId: string) {
  await apiFetch<void>(`/contacts/${contactId}`, { method: "DELETE" });
}

export type ContactImportStatus = {
  status: "queued" | "processing" | "done" | "failed";
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: Array<{ row: number; message: string }>;
};

export async function uploadContactsImportApi(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<{ importJobId: string; status: string }>("/contacts/import", {
    method: "POST",
    body: form,
  });
}

export async function fetchContactsImportStatusApi(jobId: string) {
  return apiFetch<ContactImportStatus>(`/contacts/import/${jobId}/status`);
}

export async function listContactsApi() {
  const contacts = await apiFetch<unknown[]>("/contacts");
  return contacts.map(mapContact);
}

export type TenantUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  role: string | null;
};

export async function listTenantUsersApi(): Promise<TenantUser[]> {
  return apiFetch<TenantUser[]>("/users");
}

export async function transferOwnershipApi(newOwnerUserId: string): Promise<WorkspaceOwner> {
  const res = await apiFetch<{ owner: WorkspaceOwner }>("/tenants/me/transfer-ownership", {
    method: "POST",
    body: JSON.stringify({ newOwnerUserId }),
  });
  return res.owner;
}

export async function uploadWorkspaceLogoApi(file: File): Promise<string> {
  const form = new FormData();
  form.append("logo", file);
  const res = await apiFetch<{ logoUrl: string }>("/tenants/me/logo", {
    method: "POST",
    body: form,
  });
  return res.logoUrl;
}

export async function updateWorkspaceSettingsApi(payload: { name?: string; logoUrl?: string }) {
  return apiFetch<{ name: string; logoUrl?: string }>("/tenants/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
