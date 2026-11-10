import { ARTWORK_ACCEPT, ARTWORK_REQUIREMENTS } from "@/lib/artworkValidation";
import { useRef, useState } from "react";
import { MessageSquareText, Quote, Search } from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "@/components/LoadingState";
import { inr } from "@/components/platform/platform-ui";
import { WizardChrome } from "@/features/swag/wizard/WizardChrome";
import { LocField, CountrySelect } from "@/features/send/RecipientPicker";
import { validateSingleLocation } from "@/features/send/singleLocationValidation";
import { RecipientExperience } from "@/features/send/RecipientExperience";
import { PaymentPanel } from "@/features/send/PaymentPanel";
import {
  hasCompleteRecipientAddress,
  type RecipientProfileInput,
} from "@/features/send/recipientSelection";
import {
  ADD_ROLES,
  COUNTRIES,
  EMPTY_CONTACT,
  contactToForm,
  sanitizeContactField,
  type ContactFormValues,
} from "@/features/contacts/types";
import type { SendKitVm } from "../controllers/useSendKitController";
import type { UiContact } from "@/services/mappers";
import { DesignedProductThumb } from "@/features/swag/DesignedProductThumb";
import { ProductThumb } from "@/features/shops/ProductThumb";
import { listPrintAreas } from "@/features/swag/mockup-bake";
import {
  resolveKitItemOptions,
  getCuratedKitMeta,
  CURATED_VARIANT_KEY,
} from "../controllers/useSendKitController";
import { curatedIncludedItems, curatedKitVariantRows } from "../KitPreviewDialog";
import { usePlatformKits } from "../model";
import type { UiProduct } from "@/services/mappers";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { formatWalletAmount } from "@/lib/walletFormat";
import { KitPackagingStep } from "./KitPackagingStep";
import { KitDesignSelect, kitDesignLabel } from "../send/KitDesignSelect";

const STEPS = ["Items", "Recipients", "Experience", "Packaging", "Checkout"];

function ContactFieldsForm({
  values,
  onChange,
  requireAddress = false,
  showEmailField = false,
}: {
  values: ContactFormValues;
  onChange: <K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) => void;
  requireAddress?: boolean;
  showEmailField?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label className="lbl">First name *</label>
          <input
            className="inp"
            value={values.firstName}
            onChange={(e) =>
              onChange("firstName", sanitizeContactField("personName", e.target.value))
            }
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label className="lbl">Last name</label>
          <input
            className="inp"
            value={values.lastName}
            onChange={(e) =>
              onChange("lastName", sanitizeContactField("personName", e.target.value))
            }
          />
        </div>
      </div>
      {showEmailField ? (
        <div className="field">
          <label className="lbl">Email *</label>
          <input
            className="inp"
            type="email"
            value={values.email}
            onChange={(e) => onChange("email", sanitizeContactField("email", e.target.value))}
          />
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label className="lbl">Phone</label>
          <input
            className="inp"
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit mobile"
            value={values.phone}
            onChange={(e) => onChange("phone", sanitizeContactField("phone", e.target.value))}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label className="lbl">Role</label>
          <select
            className="inp"
            value={values.role}
            onChange={(e) => onChange("role", e.target.value as ContactFormValues["role"])}
          >
            {ADD_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label className="lbl">Department</label>
          <input
            className="inp"
            value={values.department}
            onChange={(e) => onChange("department", e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label className="lbl">Employee code</label>
          <input
            className="inp"
            value={values.employeeCode}
            onChange={(e) => onChange("employeeCode", e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label className="lbl">Address{requireAddress ? " *" : ""}</label>
        <input
          className="inp"
          value={values.line1}
          onChange={(e) => onChange("line1", e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 120 }}>
          <label className="lbl">City{requireAddress ? " *" : ""}</label>
          <input
            className="inp"
            value={values.city}
            onChange={(e) => onChange("city", sanitizeContactField("city", e.target.value))}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 120 }}>
          <label className="lbl">State{requireAddress ? " *" : ""}</label>
          <input
            className="inp"
            value={values.state}
            onChange={(e) => onChange("state", sanitizeContactField("state", e.target.value))}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 120 }}>
          <label className="lbl">PIN code{requireAddress ? " *" : ""}</label>
          <input
            className="inp"
            inputMode="numeric"
            maxLength={10}
            value={values.pincode}
            onChange={(e) => onChange("pincode", sanitizeContactField("postal", e.target.value))}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 120 }}>
          <label className="lbl">Country</label>
          <select
            className="inp"
            value={values.country}
            onChange={(e) => onChange("country", e.target.value as ContactFormValues["country"])}
          >
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

const COLOR_MAP: Record<string, string> = {
  black: "#1a1a1a",
  white: "#f8f8f8",
  navy: "#001f5b",
  red: "#c0392b",
  blue: "#2980b9",
  green: "#27ae60",
  gray: "#95a5a6",
  grey: "#95a5a6",
  brown: "#8B4513",
  beige: "#f5f5dc",
  yellow: "#f1c40f",
  orange: "#e67e22",
  purple: "#8e44ad",
  pink: "#e91e8c",
  teal: "#1abc9c",
  maroon: "#800000",
  olive: "#808000",
  cream: "#fffdd0",
  charcoal: "#36454f",
  gold: "#FFD700",
  silver: "#C0C0C0",
  coral: "#FF6B6B",
  "royal blue": "#4169e1",
};

function swatchColor(product: UiProduct, colorName: string): string {
  const variantWithHex = product.variants?.find(
    (v) => v.color?.toLowerCase() === colorName.toLowerCase() && v.colorHex,
  );
  if (variantWithHex?.colorHex) return variantWithHex.colorHex;

  if (product.colorHexByName) {
    const nameMatch = Object.keys(product.colorHexByName).find(
      (k) => k.toLowerCase() === colorName.toLowerCase(),
    );
    if (nameMatch && product.colorHexByName[nameMatch]) {
      return product.colorHexByName[nameMatch];
    }
  }

  return COLOR_MAP[colorName.toLowerCase()] ?? colorName.toLowerCase();
}

function ColorSwatch({ color, product }: { color: string; product: UiProduct }) {
  return (
    <span
      title={color}
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: swatchColor(product, color),
        border: "1.5px solid rgba(0,0,0,.18)",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

function ColorSelect({
  value,
  colors,
  onChange,
  product,
}: {
  value: string;
  colors: string[];
  onChange: (v: string) => void;
  product: UiProduct;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "4px 8px",
          background: "var(--surface)",
          width: 105,
          height: 32,
          cursor: "pointer",
          textAlign: "left",
          justifyContent: "space-between",
          color: value ? "var(--text)" : "var(--text-muted)",
          outline: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
          {value ? (
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: swatchColor(product, value),
                border: "1px solid rgba(0,0,0,0.15)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
          ) : (
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "transparent",
                border: "1px dashed var(--border)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              fontSize: "var(--workspace-font-caption, 12px)",
              fontWeight: "var(--font-weight-medium)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value || "Color"}
          </span>
        </div>
        <span style={{ fontSize: "var(--workspace-font-caption, 9px)", opacity: 0.7 }}>▼</span>
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              zIndex: 1000,
              maxHeight: 180,
              overflowY: "auto",
              padding: 4,
            }}
          >
            <div
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              style={{
                padding: "6px 8px",
                fontSize: "var(--workspace-font-caption, 12px)",
                cursor: "pointer",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: !value ? "var(--surface-2)" : "transparent",
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  border: "1px dashed var(--border)",
                  display: "inline-block",
                }}
              />
              <span style={{ color: "var(--text-muted)", fontWeight: "var(--font-weight-medium)" }}>
                Color
              </span>
            </div>
            {colors.map((c) => (
              <div
                key={c}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                style={{
                  padding: "6px 8px",
                  fontSize: "var(--workspace-font-caption, 12px)",
                  cursor: "pointer",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: value === c ? "var(--surface-2)" : "transparent",
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: swatchColor(product, c),
                    border: "1px solid rgba(0,0,0,0.15)",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "var(--text)", fontWeight: "var(--font-weight-medium)" }}>
                  {c}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SizeSelect({
  value,
  sizes,
  onChange,
}: {
  value: string;
  sizes: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "4px 8px",
        fontSize: "var(--workspace-font-caption, 12px)",
        background: "var(--surface)",
        outline: "none",
        cursor: "pointer",
        minWidth: 90,
        color: "var(--text)",
        fontWeight: "var(--font-weight-medium)",
        height: 32,
      }}
    >
      <option value="">Size</option>
      {sizes.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export function SendKitView(vm: SendKitVm) {
  const { draft, dispatch } = vm;
  const [search, setSearch] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [contactDraft, setContactDraft] = useState<ContactFormValues>({ ...EMPTY_CONTACT });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactEditDraft, setContactEditDraft] = useState<ContactFormValues>({ ...EMPTY_CONTACT });
  const [selectedCuratedVariant, setSelectedCuratedVariant] = useState<string | null>(null);
  const [bulkProductVariants, setBulkProductVariants] = useState<
    Record<string, { size?: string; color?: string }>
  >({});
  const [singleLocShowErrors, setSingleLocShowErrors] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const { data: platformKits } = usePlatformKits();

  if (vm.isLoading) return <LoadingState message="Loading kit…" fullScreen={false} />;
  if (vm.notFound || !vm.kit) {
    return (
      <div className="card" style={{ padding: 16 }}>
        Kit not found.{" "}
        <button type="button" className="lnk" onClick={vm.onExit}>
          Back to kits
        </button>
      </div>
    );
  }
  if (vm.isSending) return <LoadingState message="Placing order…" fullScreen={false} />;

  const { totals, kit } = vm;
  const customisedProductPerKit = totals.itemsSubtotal ?? totals.unitPrice ?? 0;
  const customisedKitsLineTotal = customisedProductPerKit * totals.qty;
  const customisedSubtotal = customisedKitsLineTotal + totals.pkgCost;
  const payingWithWallet = draft.pay === "wallet" && vm.walletPayEnabled;
  const checkoutWallets = vm.wallets?.length ? vm.wallets : vm.wallet ? [vm.wallet] : [];
  const activeCheckoutWallet =
    checkoutWallets.find((w) => w.id === vm.selectedWalletId) ?? checkoutWallets[0];
  const walletBalance = activeCheckoutWallet ? vm.walletAvailable(activeCheckoutWallet) : 0;
  const purchaseAmount = Math.round(totals.total);
  const remainingBalance = Math.max(0, walletBalance - purchaseAmount);
  const walletCur = activeCheckoutWallet?.cur ?? "INR";

  const curatedMeta = getCuratedKitMeta(kit);
  const isCurated = !!curatedMeta;

  const curatedItemImages = curatedMeta
    ? curatedIncludedItems(
        curatedMeta,
        platformKits,
        kit?.artworkUrl ? resolveMediaUrl(kit.artworkUrl) : undefined,
      )
    : [];

  const curatedKitVariants = curatedMeta ? curatedKitVariantRows(curatedMeta, platformKits) : [];
  const curatedVariantImages = curatedKitVariants.map((v) => v.imageUrl);
  const activeCuratedVariant =
    selectedCuratedVariant && curatedVariantImages.includes(selectedCuratedVariant)
      ? selectedCuratedVariant
      : curatedVariantImages[0] || null;

  const kitItems = draft.picked
    .map((idx) => vm.catalog[idx])
    .filter(Boolean)
    .map((p) => {
      const ref = kit.productRefs?.find((r) => r.catalogProductId === p.id);
      const branded: UiProduct = {
        ...p,
        mockupUrl: ref?.mockupUrl || p.mockupUrl,
      };
      return { product: branded, opts: resolveKitItemOptions(p, ref ?? {}) };
    });

  /** Only show when sender must configure real size/color options — or curated kit variants. */
  const showVariantCols =
    (draft.mode === "surprise" || draft.mode === "single") &&
    (isCurated
      ? curatedVariantImages.length > 0
      : kitItems.some(
          ({ opts }) =>
            (opts.requiresSize && opts.sizes.length > 0) ||
            (opts.requiresColor && opts.colors.length > 0),
        ));

  const filteredContacts = vm.pickerContacts.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()),
  );

  function profileFromForm(form: ContactFormValues): RecipientProfileInput {
    const name = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(" ");
    return {
      name: name || undefined,
      phone: form.phone.trim() || undefined,
      role: form.role || "Member",
      department: form.department.trim() || undefined,
      employeeCode: form.employeeCode.trim() || undefined,
      address: {
        line1: form.line1.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        country: form.country || "IN",
      },
    };
  }

  function handleAddEmails() {
    const raw = emailDraft.trim() || contactDraft.email.trim();
    if (!raw) {
      toast.error("Enter at least one email address");
      return;
    }
    if (!contactDraft.firstName.trim()) {
      toast.error("Enter a first name");
      return;
    }
    const profile = profileFromForm(contactDraft);
    vm.onAddRecipientEmails(raw, profile);
    setEmailDraft("");
    setContactDraft({ ...EMPTY_CONTACT });
    setShowEmailInput(false);
  }

  function handleCsvChange(file: File | undefined) {
    if (!file) return;
    vm.onImportRecipientCsv(file);
    if (csvInputRef.current) csvInputRef.current.value = "";
  }

  function downloadRecipientCsvTemplate() {
    const header =
      "First Name,Last Name,Email,Phone,Role,Department,Employee Code,Address,City,State,PIN Code,Country\n";
    const sample =
      "Rahul,Sharma,rahul.sharma@example.com,9876543210,Member,Engineering,EMP001,12 MG Road,Bengaluru,Karnataka,560001,India\n";
    const blob = new Blob([header + sample], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shelf-merch-kit-recipients-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function startEditContact(contact: UiContact) {
    setEditingContactId(contact.id);
    setContactEditDraft(contactToForm(contact));
  }

  function saveEditContact() {
    if (!editingContactId) return;
    if (!contactEditDraft.firstName.trim()) {
      toast.error("Enter a first name");
      return;
    }
    if (
      draft.mode === "surprise" &&
      (!contactEditDraft.line1.trim() ||
        !contactEditDraft.city.trim() ||
        !contactEditDraft.state.trim() ||
        !contactEditDraft.pincode.trim())
    ) {
      toast.error("Enter address, city, state, and PIN code");
      return;
    }
    vm.onUpdateRecipientProfile(editingContactId, profileFromForm(contactEditDraft));
    setEditingContactId(null);
  }

  function applyCuratedVariantToAll(variantImage: string) {
    if (!variantImage) {
      toast.error("Select a kit variant first");
      return;
    }
    const contactIds = vm.pickerContacts.map((c) => c.id);
    if (!contactIds.length) {
      toast.error("No recipients to update");
      return;
    }
    dispatch({
      type: "applyVariantToAll",
      contactIds,
      productId: CURATED_VARIANT_KEY,
      patch: { variantImage },
    });
    toast.success(
      contactIds.length === 1
        ? "Variant applied to 1 recipient"
        : `Variant applied to ${contactIds.length} recipients`,
    );
  }

  function applyProductVariantToAll(productId: string, patch: { size?: string; color?: string }) {
    const item = kitItems.find(({ product }) => product.id === productId);
    if (!item || (!item.opts.requiresSize && !item.opts.requiresColor)) return;

    const cleanPatch = {
      ...(item.opts.requiresSize && patch.size?.trim() ? { size: patch.size } : {}),
      ...(item.opts.requiresColor && patch.color?.trim() ? { color: patch.color } : {}),
    };
    if (!cleanPatch.size && !cleanPatch.color) {
      toast.error("Select a size or color first");
      return;
    }
    const contactIds = vm.pickerContacts.map((c) => c.id);
    if (!contactIds.length) {
      toast.error("No recipients to update");
      return;
    }
    dispatch({
      type: "applyVariantToAll",
      contactIds,
      productId,
      patch: cleanPatch,
    });
    toast.success(
      contactIds.length === 1
        ? "Applied to 1 recipient"
        : `Applied to ${contactIds.length} recipients`,
    );
  }

  function handleNext() {
    if (vm.step === 1 && draft.mode === "single") {
      if (validateSingleLocation(draft.singleLocation)) {
        setSingleLocShowErrors(true);
      }
    }
    vm.onNext();
  }

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
      {vm.step > 0 ? (
        <button
          type="button"
          className="lnk"
          style={{ background: "none", border: "none", cursor: "pointer" }}
          onClick={vm.onBack}
        >
          Back
        </button>
      ) : (
        <span />
      )}
      {vm.step < 4 ? (
        <button type="button" className="btn btn-dark" onClick={handleNext}>
          Next
        </button>
      ) : (
        <span />
      )}
    </div>
  );

  return (
    <WizardChrome
      title="Send Items"
      steps={STEPS}
      activeIndex={vm.step}
      onExit={vm.onExit}
      exitLabel="Cancel"
      footer={footer}
    >
      {/* ── Step 0: Items ── */}
      {vm.step === 0 && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "10px 0" }}>
          <h1 style={{ fontSize: 24, marginBottom: 6 }}>Review Items</h1>
          <p className="muted" style={{ marginBottom: 24 }}>
            Review the items included in this kit before continuing.
          </p>

          {isCurated && curatedMeta ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Editable Kit Name */}
              <div style={{ maxWidth: 480 }}>
                <label
                  style={{
                    fontSize: "var(--workspace-font-caption, 13px)",
                    fontWeight: "var(--font-weight-bold)",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Kit Name
                </label>
                <input
                  className="inp"
                  value={vm.kitName}
                  onChange={(e) => vm.setKitName(e.target.value)}
                  style={{
                    width: "100%",
                    fontSize: "var(--workspace-font-body, 14px)",
                    height: 38,
                  }}
                />
              </div>

              {/* Read-only Description */}
              <div>
                <label
                  style={{
                    fontSize: "var(--workspace-font-caption, 13px)",
                    fontWeight: "var(--font-weight-bold)",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Description
                </label>
                <p
                  style={{
                    color: "var(--text)",
                    fontSize: "var(--workspace-font-body, 14px)",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {curatedMeta.description || "No description provided."}
                </p>
              </div>

              {/* Read-only Product Images as cards */}
              <div>
                <label
                  style={{
                    fontSize: "var(--workspace-font-caption, 13px)",
                    fontWeight: "var(--font-weight-bold)",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 12,
                  }}
                >
                  Included Items ({curatedItemImages.length})
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 16,
                  }}
                >
                  {curatedItemImages.map((item, idx) => (
                    <div
                      key={`${item.imageUrl}-${idx}`}
                      className="card"
                      style={{
                        padding: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        borderRadius: 12,
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
                        }}
                      >
                        <img
                          src={resolveMediaUrl(item.imageUrl)}
                          alt={item.label}
                          style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: "var(--workspace-font-body, 13px)",
                          fontWeight: "var(--font-weight-bold)",
                          color: "var(--ink)",
                        }}
                      >
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Brand logo — only when platform kit rules.requireLogo is on (default). */}
              {vm.curatedRequiresLogo ? (
                <div>
                  <label
                    style={{
                      fontSize: "var(--workspace-font-caption, 13px)",
                      fontWeight: "var(--font-weight-bold)",
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: 12,
                    }}
                  >
                    Add logo <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <div
                    className="card"
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      display: "flex",
                      gap: 16,
                      alignItems: "stretch",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 160 }}
                    >
                      <div
                        style={{
                          width: 140,
                          height: 140,
                          borderRadius: 12,
                          border: "1px dashed var(--line)",
                          background: "var(--gray-50)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          padding: 12,
                        }}
                      >
                        {vm.curatedLogoPreview ? (
                          <img
                            src={vm.curatedLogoPreview}
                            alt="Logo preview"
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                          />
                        ) : (
                          <span
                            className="muted"
                            style={{
                              fontSize: "var(--workspace-font-caption, 12px)",
                              textAlign: "center",
                              padding: 8,
                            }}
                          >
                            Logo preview
                          </span>
                        )}
                      </div>
                      <label
                        className="btn btn-ghost btn-sm"
                        style={{
                          cursor: vm.isUploadingCuratedLogo ? "wait" : "pointer",
                          textAlign: "center",
                          opacity: vm.isUploadingCuratedLogo ? 0.7 : 1,
                        }}
                      >
                        {vm.isUploadingCuratedLogo
                          ? "Uploading…"
                          : vm.curatedLogoPreview
                            ? "Replace logo"
                            : "Upload logo"}
                        <input
                          type="file"
                          accept={ARTWORK_ACCEPT}
                          title={ARTWORK_REQUIREMENTS}
                          hidden
                          disabled={vm.isUploadingCuratedLogo}
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            vm.onCuratedLogoFile(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <span className="muted">{ARTWORK_REQUIREMENTS}</span>
                    </div>
                    <div
                      style={{
                        flex: "1 1 220px",
                        minWidth: 200,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
                        This logo will be printed on the items in the designated placeholders.
                        {!vm.hasCuratedLogo ? (
                          <span
                            style={{
                              display: "block",
                              marginTop: 8,
                              color: "var(--danger)",
                              fontSize: "var(--workspace-font-body, 13px)",
                            }}
                          >
                            Upload a logo to continue.
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <p
                    className="muted"
                    style={{
                      margin: "10px 0 0",
                      fontSize: "var(--workspace-font-caption, 12px)",
                      lineHeight: 1.5,
                    }}
                  >
                    This logo will be printed in the design area as shown in the images; there may
                    be slight variation in colour when printed.
                  </p>
                </div>
              ) : null}

              {curatedVariantImages.length > 0 ? (
                <div>
                  <label
                    style={{
                      fontSize: "var(--workspace-font-caption, 13px)",
                      fontWeight: "var(--font-weight-bold)",
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Kit designs
                  </label>
                  <p
                    className="muted"
                    style={{
                      fontSize: "var(--workspace-font-caption, 12.5px)",
                      margin: "0 0 12px",
                    }}
                  >
                    Available variants for this kit are shown below. You can select the preferred
                    variant for each recipient in the next step.
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {curatedKitVariants.map((variant) => {
                      const selected = activeCuratedVariant === variant.imageUrl;
                      return (
                        <button
                          key={`${variant.imageUrl}-${variant.label}`}
                          type="button"
                          onClick={() => setSelectedCuratedVariant(variant.imageUrl)}
                          className="card"
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
                          <div
                            style={{
                              fontSize: "var(--workspace-font-caption, 12px)",
                              fontWeight: "var(--font-weight-bold)",
                            }}
                          >
                            {variant.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 16,
              }}
            >
              {kitItems.map(({ product: p, opts }) => {
                const distinctSizes =
                  p.variants
                    ?.map((v) => v.size)
                    .filter((v): v is string => Boolean(v))
                    .filter((v, i, a) => a.indexOf(v) === i) ?? [];
                const distinctColors =
                  p.variants
                    ?.map((v) => v.color)
                    .filter((v): v is string => Boolean(v))
                    .filter((v, i, a) => a.indexOf(v) === i) ?? [];
                return (
                  <div
                    key={p.id}
                    className="card"
                    style={{
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      borderRadius: 12,
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: "1",
                        borderRadius: 8,
                        overflow: "hidden",
                        background: "var(--gray-100)",
                        position: "relative",
                      }}
                    >
                      {listPrintAreas(p).length ? (
                        <DesignedProductThumb
                          product={p}
                          artworkUrl={p.mockupUrl ? undefined : kit.artworkUrl}
                          frontOnly
                        />
                      ) : (
                        <ProductThumb product={{ ...p, mockupUrl: undefined }} />
                      )}
                    </div>
                    {p.brand && (
                      <div
                        className="mut3"
                        style={{
                          fontSize: "var(--workspace-font-caption, 11px)",
                          textTransform: "uppercase",
                          letterSpacing: ".04em",
                        }}
                      >
                        {p.brand}
                      </div>
                    )}
                    <div
                      style={{
                        fontWeight: "var(--font-weight-semibold)",
                        fontSize: "var(--workspace-font-body, 14px)",
                      }}
                    >
                      {p.nm}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--workspace-font-caption, 12px)",
                        color: "var(--text-muted)",
                      }}
                    >
                      Qty: 1 unit
                    </div>
                    <div className="divider" style={{ margin: "2px 0" }} />
                    {distinctSizes.length > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: "var(--workspace-font-caption, 11px)",
                            color: "var(--text-muted)",
                            marginBottom: 4,
                            fontWeight: "var(--font-weight-medium)",
                          }}
                        >
                          Sizes
                        </div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {distinctSizes.map((s) => (
                            <span
                              key={s}
                              style={{
                                fontSize: "var(--workspace-font-caption, 11px)",
                                fontWeight: "var(--font-weight-semibold)",
                                padding: "2px 7px",
                                borderRadius: 4,
                                background: "var(--surface-2)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {distinctColors.length > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: "var(--workspace-font-caption, 11px)",
                            color: "var(--text-muted)",
                            marginBottom: 4,
                            fontWeight: "var(--font-weight-medium)",
                          }}
                        >
                          Colors
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {distinctColors.map((c) => (
                            <div
                              key={c}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: "var(--workspace-font-caption, 12px)",
                              }}
                            >
                              <ColorSwatch color={c} product={p} />
                              {/* <span style={{ color: "var(--text)" }}>{c}</span> */}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {distinctSizes.length === 0 && distinctColors.length === 0 && (
                      <div
                        style={{
                          fontSize: "var(--workspace-font-caption, 12px)",
                          color: "var(--text-muted)",
                        }}
                      >
                        No variants for this product
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Step 1: Recipients ── */}
      {vm.step === 1 && (
        <div className="sk-recip-step">
          <div className="card sk-recip-modes">
            <h3>Choose send mode</h3>
            <p className="sk-recip-modes-lead">
              Select how you would like to deliver this kit to your recipients.
            </p>
            <div className="sk-recip-mode-grid">
              {(
                [
                  {
                    mode: "surprise",
                    title: "Surprise recipient",
                    desc: "Enter recipient details up front so gifts ship directly without requiring their input.",
                  },
                  {
                    mode: "single",
                    title: "Send all kits to a single location",
                    desc: "Ship all units to one office, event venue, or specific address.",
                  },
                  {
                    mode: "redeem",
                    title: "Let recipient choose the variant",
                    desc: "Recipients choose their own size, color & shipping address from a private link.",
                  },
                ] as const
              ).map(({ mode, title, desc }) => (
                <button
                  key={mode}
                  type="button"
                  className={`optcard ${draft.mode === mode ? "on" : ""}`}
                  onClick={() => dispatch({ type: "setMode", mode })}
                >
                  <div className="rd" />
                  <div>
                    <h4>{title}</h4>
                    <p>{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card sk-recip-panel">
            <h2>Who&apos;s receiving this?</h2>
            <p className="sk-recip-panel-lead">
              {isCurated
                ? "Choose recipients to receive this curated kit."
                : draft.mode === "redeem"
                  ? "Choose who should receive a private link to pick their size, color & address."
                  : showVariantCols
                    ? "Choose recipients and configure variants for each item."
                    : "Choose who should receive this kit."}
            </p>

            {draft.mode === "single" && (
              <div
                className="card sk-recip-single-loc"
                style={{ marginBottom: 18, boxShadow: "none" }}
              >
                <h3 style={{ fontSize: "var(--workspace-font-heading, 15px)", marginBottom: 12 }}>
                  Single delivery location
                </h3>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <LocField
                    label="Contact name"
                    k="name"
                    kind="personName"
                    required
                    showErrors={singleLocShowErrors}
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                  <LocField
                    label="Notification email"
                    k="email"
                    kind="email"
                    type="email"
                    required
                    showErrors={singleLocShowErrors}
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                  <LocField
                    label="Phone"
                    k="phone"
                    kind="phone"
                    required
                    showErrors={singleLocShowErrors}
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <LocField
                    label="Address"
                    k="line1"
                    kind="address"
                    required
                    showErrors={singleLocShowErrors}
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                    block
                  />
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <LocField
                    label="City"
                    k="city"
                    kind="city"
                    required
                    showErrors={singleLocShowErrors}
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                  <LocField
                    label="State"
                    k="state"
                    kind="state"
                    required
                    showErrors={singleLocShowErrors}
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                  <LocField
                    label="PIN / Postal code"
                    k="pincode"
                    kind="postal"
                    required
                    showErrors={singleLocShowErrors}
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                  <CountrySelect
                    value={draft.singleLocation.country || "IN"}
                    onChange={(value) => dispatch({ type: "setSingleLoc", key: "country", value })}
                    required
                  />
                </div>
              </div>
            )}

            <div className="sk-recip-list-shell">
              <div className="sk-recip-toolbar">
                <div className="sk-recip-toolbar__left">
                  <span className="sk-recip-count">
                    <strong>{draft.selRecips.length}</strong> selected
                  </span>
                  <span className="sk-recip-toolbar__divider" aria-hidden="true" />
                  <div className="sk-recip-toolbar__actions">
                    <button
                      type="button"
                      className="sk-recip-toolbar__link"
                      onClick={vm.onSelectAllRecips}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="sk-recip-toolbar__link"
                      onClick={() => dispatch({ type: "deselectRecips" })}
                    >
                      Deselect all
                    </button>
                    <button
                      type="button"
                      className="sk-recip-toolbar__link"
                      onClick={() => setShowEmailInput((open) => !open)}
                    >
                      Input emails
                    </button>
                    <button
                      type="button"
                      className="sk-recip-toolbar__link"
                      onClick={() => csvInputRef.current?.click()}
                    >
                      Add by CSV
                    </button>
                    <button
                      type="button"
                      className="sk-recip-toolbar__link"
                      onClick={downloadRecipientCsvTemplate}
                    >
                      CSV template
                    </button>
                  </div>
                </div>
                <div className="sk-recip-toolbar__right">
                  {showVariantCols && isCurated ? (
                    <div className="sk-recip-bulk-inline">
                      <KitDesignSelect
                        designs={curatedVariantImages}
                        value={activeCuratedVariant || ""}
                        onChange={(url) => setSelectedCuratedVariant(url || null)}
                        size="sm"
                        ariaLabel="Kit design for all recipients"
                      />
                      <button
                        type="button"
                        className="btn btn-dark btn-sm"
                        onClick={() => applyCuratedVariantToAll(activeCuratedVariant || "")}
                      >
                        Apply to all
                      </button>
                    </div>
                  ) : null}
                  <label className="search sk-recip-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                      type="search"
                      placeholder="Search…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Search recipients"
                    />
                  </label>
                </div>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: "none" }}
                  onChange={(e) => handleCsvChange(e.target.files?.[0])}
                />
              </div>

              {showVariantCols && !isCurated ? (
                <div className="sk-recip-bulk-strip">
                  {kitItems.map(({ product: prod, opts }) => {
                    if (!opts.requiresSize && !opts.requiresColor) return null;
                    const bulk = bulkProductVariants[prod.id || ""] || {};
                    return (
                      <div key={prod.id} className="sk-recip-bulk-strip__item">
                        <span className="sk-recip-bulk-strip__name">{prod.nm}</span>
                        <div className="sk-recip-bulk-strip__controls">
                          {opts.requiresSize && opts.sizes.length > 0 ? (
                            <SizeSelect
                              value={bulk.size || ""}
                              sizes={opts.sizes}
                              onChange={(size) =>
                                setBulkProductVariants((prev) => ({
                                  ...prev,
                                  [prod.id || ""]: { ...prev[prod.id || ""], size },
                                }))
                              }
                            />
                          ) : null}
                          {opts.requiresColor && opts.colors.length > 0 ? (
                            <ColorSelect
                              value={bulk.color || ""}
                              colors={opts.colors}
                              onChange={(color) =>
                                setBulkProductVariants((prev) => ({
                                  ...prev,
                                  [prod.id || ""]: { ...prev[prod.id || ""], color },
                                }))
                              }
                              product={prod}
                            />
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-dark btn-sm"
                            onClick={() =>
                              applyProductVariantToAll(prod.id || "", {
                                size: bulk.size,
                                color: bulk.color,
                              })
                            }
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {showEmailInput ? (
                <div className="sk-recip-email-panel">
                  <label className="lbl">Email addresses</label>
                  <textarea
                    className="inp"
                    rows={2}
                    placeholder="Please enter the email here"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                  />
                  <p
                    className="muted"
                    style={{
                      margin: "12px 0 8px",
                      fontSize: "var(--workspace-font-caption, 12px)",
                    }}
                  >
                    Contact details below are saved to Contacts (same fields as the Contacts page)
                    and applied to every email above.
                  </p>
                  <ContactFieldsForm
                    values={contactDraft}
                    requireAddress={draft.mode === "surprise"}
                    onChange={(key, value) =>
                      setContactDraft((prev) => ({ ...prev, [key]: value }))
                    }
                  />
                  <div className="sk-recip-email-panel__actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn-brand btn-sm"
                      onClick={handleAddEmails}
                    >
                      Add recipients
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setShowEmailInput(false);
                        setEmailDraft("");
                        setContactDraft({ ...EMPTY_CONTACT });
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {filteredContacts.length === 0 ? (
                <div className="sk-recip-empty">
                  {vm.pickerContacts.length === 0
                    ? "No recipients yet. Use Input emails or Add by CSV to get started."
                    : "No recipients match your search."}
                </div>
              ) : (
                <div className="sk-recip-table-wrap">
                  <table className="sk-recip-table">
                    <thead>
                      <tr>
                        <th className="sk-recip-th sk-recip-th--check" aria-label="Select" />
                        <th className="sk-recip-th">Recipient</th>
                        <th className="sk-recip-th">Email</th>
                        <th className="sk-recip-th">Address</th>
                        {showVariantCols && isCurated ? (
                          <th className="sk-recip-th sk-recip-th--variant">Kit design</th>
                        ) : null}
                        {showVariantCols && !isCurated
                          ? kitItems.map(({ product: p }) => (
                              <th key={p.id} className="sk-recip-th sk-recip-th--product">
                                <div className="sk-recip-product-head">
                                  <div className="sk-recip-product-thumb">
                                    {listPrintAreas(p).length ? (
                                      <DesignedProductThumb
                                        product={p}
                                        artworkUrl={kit.artworkUrl}
                                        frontOnly
                                      />
                                    ) : (
                                      <ProductThumb product={{ ...p, mockupUrl: undefined }} />
                                    )}
                                  </div>
                                  <span>{p.nm}</span>
                                </div>
                              </th>
                            ))
                          : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts.map((contact) => {
                        const isSelected = draft.selRecips.includes(contact.id);
                        const addr = [contact.city, contact.state, contact.country]
                          .filter(Boolean)
                          .join(", ");
                        return (
                          <tr
                            key={contact.id}
                            className={`sk-recip-row${isSelected ? " is-selected" : ""}`}
                          >
                            <td className="sk-recip-td sk-recip-td--check">
                              <input
                                type="checkbox"
                                className="sk-recip-check"
                                checked={isSelected}
                                aria-label={`Select ${contact.name}`}
                                onChange={() => dispatch({ type: "toggleRecip", id: contact.id })}
                              />
                            </td>
                            <td className="sk-recip-td">
                              <span className="sk-recip-name" title={contact.name}>
                                {contact.name}
                              </span>
                            </td>
                            <td className="sk-recip-td">
                              <span className="sk-recip-muted" title={contact.email || undefined}>
                                {contact.email}
                              </span>
                            </td>
                            <td className="sk-recip-td">
                              {editingContactId === contact.id ? (
                                <div style={{ display: "grid", gap: 8, minWidth: 280 }}>
                                  <ContactFieldsForm
                                    values={contactEditDraft}
                                    requireAddress={draft.mode === "surprise"}
                                    onChange={(key, value) =>
                                      setContactEditDraft((prev) => ({ ...prev, [key]: value }))
                                    }
                                  />
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                      type="button"
                                      className="btn btn-brand btn-sm"
                                      onClick={saveEditContact}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => setEditingContactId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <span
                                    className="sk-recip-muted"
                                    title={
                                      [
                                        contact.phone,
                                        contact.department,
                                        contact.role,
                                        contact.employeeCode,
                                        contact.address,
                                        addr,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ") || undefined
                                    }
                                  >
                                    {[
                                      contact.phone,
                                      contact.department,
                                      contact.role,
                                      contact.address
                                        ? `${contact.address}${addr ? ` · ${addr}` : ""}`
                                        : addr || null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ") || "—"}
                                  </span>
                                  {draft.mode !== "single" ? (
                                    <button
                                      type="button"
                                      className="lnk"
                                      style={{
                                        fontSize: "var(--workspace-font-caption, 12px)",
                                        alignSelf: "flex-start",
                                      }}
                                      onClick={() => startEditContact(contact)}
                                    >
                                      {hasCompleteRecipientAddress(contact)
                                        ? "Edit details"
                                        : "Add details"}
                                    </button>
                                  ) : null}
                                </div>
                              )}
                            </td>
                            {showVariantCols && isCurated ? (
                              <td className="sk-recip-td sk-recip-td--variant">
                                <KitDesignSelect
                                  designs={curatedVariantImages}
                                  value={
                                    draft.recipVariants[contact.id]?.[CURATED_VARIANT_KEY]
                                      ?.variantImage || ""
                                  }
                                  onChange={(url) =>
                                    dispatch({
                                      type: "setRecipVariant",
                                      contactId: contact.id,
                                      productId: CURATED_VARIANT_KEY,
                                      key: "variantImage",
                                      value: url,
                                    })
                                  }
                                  size="sm"
                                  ariaLabel={`Kit design for ${contact.name}`}
                                />
                              </td>
                            ) : null}
                            {showVariantCols &&
                              !isCurated &&
                              kitItems.map(({ product: prod, opts }) => {
                                const selection =
                                  draft.recipVariants[contact.id]?.[prod.id || ""] || {};
                                return (
                                  <td key={prod.id} className="sk-recip-td sk-recip-td--variant">
                                    <div className="sk-recip-variant-controls">
                                      {opts.requiresSize && opts.sizes.length > 0 ? (
                                        <SizeSelect
                                          value={selection.size || ""}
                                          sizes={opts.sizes}
                                          onChange={(v) =>
                                            dispatch({
                                              type: "setRecipVariant",
                                              contactId: contact.id,
                                              productId: prod.id || "",
                                              key: "size",
                                              value: v,
                                            })
                                          }
                                        />
                                      ) : null}
                                      {opts.requiresColor && opts.colors.length > 0 ? (
                                        <ColorSelect
                                          value={selection.color || ""}
                                          colors={opts.colors}
                                          onChange={(v) =>
                                            dispatch({
                                              type: "setRecipVariant",
                                              contactId: contact.id,
                                              productId: prod.id || "",
                                              key: "color",
                                              value: v,
                                            })
                                          }
                                          product={prod}
                                        />
                                      ) : null}
                                      {!opts.requiresSize &&
                                      !opts.requiresColor &&
                                      opts.sizes.length === 0 &&
                                      opts.colors.length === 0 ? (
                                        <span className="sk-recip-muted">
                                          No variants for this product
                                        </span>
                                      ) : null}
                                    </div>
                                  </td>
                                );
                              })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="sk-recip-foot">
                {draft.selRecips.length} recipient{draft.selRecips.length !== 1 ? "s" : ""} selected
                {filteredContacts.length > 0
                  ? ` · Showing ${filteredContacts.length} of ${vm.pickerContacts.length}`
                  : ""}
              </div>
            </div>

            {draft.mode === "surprise" && vm.surpriseMissing.length > 0 && (
              <div className="banner" style={{ marginTop: 14 }}>
                <b>{vm.surpriseMissing.length} recipient(s) missing a shipping address.</b> Surprise
                sends need addresses up front.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Experience ── */}
      {vm.step === 2 && (
        <>
          <RecipientExperience
            shopName={vm.shopName}
            mode={draft.mode}
            itemCount={draft.picked.length}
            from={draft.from}
            message={draft.msg}
            onFrom={(from) => dispatch({ type: "setFrom", from })}
            onMessage={(msg) => dispatch({ type: "setMsg", msg })}
            when={draft.when}
            onWhen={(when) => dispatch({ type: "setWhen", when })}
            schedule={draft.schedule}
            onSchedule={(key, value) => dispatch({ type: "setSchedule", key, value })}
            preview={draft.preview}
            onPreview={(preview) => dispatch({ type: "setPreview", preview })}
            extraLeft={
              <div className="card printed-note-card">
                <div className="printed-note-card__header">
                  <span className="printed-note-card__icon" aria-hidden="true">
                    <MessageSquareText size={18} strokeWidth={1.8} />
                  </span>
                  <div>
                    <h3>Printed card note</h3>
                    <p>Included inside every kit.</p>
                  </div>
                </div>
                <div className="printed-note-card__editor">
                  <textarea
                    className="inp"
                    rows={4}
                    maxLength={280}
                    aria-label="Printed card note"
                    placeholder="Write a short note for the recipient"
                    value={draft.note}
                    onChange={(e) => dispatch({ type: "setNote", note: e.target.value })}
                  />
                  <span>{draft.note.length}/280</span>
                </div>
                <div className="printed-note-preview">
                  <div className="printed-note-preview__label">
                    <span>Card preview</span>
                    <Quote size={17} strokeWidth={1.7} aria-hidden="true" />
                  </div>
                  <p>{draft.note || "Your note will appear here."}</p>
                  <div className="printed-note-preview__signature">
                    <span>With appreciation,</span>
                    <strong>The {vm.account} team</strong>
                  </div>
                </div>
              </div>
            }
          />
        </>
      )}

      {/* ── Step 3: Packaging ── */}
      {vm.step === 3 && (
        <KitPackagingStep
          kitName={kit.name}
          itemCount={draft.picked.length}
          packaging={draft.pkg}
          onPackaging={(pkg) => dispatch({ type: "setPkg", pkg })}
          stepBadge="Step 4 of 5"
        />
      )}

      {/* ── Step 4: Checkout ── */}
      {vm.step === 4 && (
        <>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Checkout</h1>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <PaymentPanel
              wallet={vm.wallet}
              wallets={vm.wallets}
              selected={draft.pay}
              onSelect={(pay) => dispatch({ type: "setPay", pay })}
              selectedWalletId={vm.selectedWalletId}
              onWalletSelect={vm.onWalletSelect}
              walletAvailable={vm.walletAvailable}
              walletPayEnabled={vm.walletPayEnabled}
              walletDisabledHint={vm.walletDisabledHint}
              walletDisabledBadge={vm.walletDisabledBadge}
            />
            <div className="card" style={{ padding: 22, height: "fit-content" }}>
              <h3 style={{ fontSize: 18, marginBottom: 12 }}>Order summary</h3>
              {!vm.isCuratedKit ? (
                <>
                  <SumRow k="Price per kit" v={inr(customisedProductPerKit)} />
                  <SumRow
                    k={`${totals.qty} kit${totals.qty === 1 ? "" : "s"} × ${inr(customisedProductPerKit)}`}
                    v={inr(customisedKitsLineTotal)}
                  />
                  {totals.pkgPerKit > 0 ? <SumRow k="Packaging" v={inr(totals.pkgCost)} /> : null}
                  <SumRow k="Subtotal" v={inr(customisedSubtotal)} large />
                  <SumRow
                    k={`GST (${Math.round((totals.kitGstRate ?? 0.18) * 100)}%)`}
                    v={inr(totals.tax)}
                  />
                </>
              ) : (
                <>
                  <SumRow k="Price per kit" v={inr(totals.unitPrice)} />
                  <SumRow
                    k={`${totals.qty} kit${totals.qty === 1 ? "" : "s"} × ${inr(totals.unitPrice)}`}
                    v={inr(totals.unitPrice * totals.qty)}
                  />
                  {totals.pkgPerKit > 0 ? <SumRow k="Packaging" v={inr(totals.pkgCost)} /> : null}
                  <SumRow k="Subtotal" v={inr(totals.sub)} large />
                  <SumRow
                    k={`GST (${Math.round((totals.kitGstRate ?? 0.18) * 100)}%)`}
                    v={inr(totals.tax)}
                  />
                </>
              )}
              <div className="divider" />
              <KitCheckoutPaymentSummary
                payingWithWallet={payingWithWallet}
                total={purchaseAmount}
                walletBalance={walletBalance}
                remainingBalance={remainingBalance}
                walletCur={walletCur}
                walletName={activeCheckoutWallet?.name}
              />
              <button
                type="button"
                className="btn btn-brand btn-block btn-lg"
                style={{ marginTop: 14 }}
                disabled={vm.isSending}
                onClick={vm.onPayAndSend}
              >
                {payingWithWallet ? "Confirm & send" : `Pay ${inr(purchaseAmount)} & send`}
              </button>
            </div>
          </div>
        </>
      )}
    </WizardChrome>
  );
}

function KitCheckoutPaymentSummary({
  payingWithWallet,
  total,
  walletBalance,
  remainingBalance,
  walletCur,
  walletName,
}: {
  payingWithWallet: boolean;
  total: number;
  walletBalance: number;
  remainingBalance: number;
  walletCur: string;
  walletName?: string;
}) {
  if (payingWithWallet) {
    return (
      <div style={{ marginTop: 4 }}>
        {walletName ? (
          <p
            className="muted"
            style={{
              fontSize: "var(--workspace-font-caption, 12.5px)",
              marginBottom: 10,
              lineHeight: 1.45,
            }}
          >
            Paying from <strong>{walletName}</strong>. No UPI or card payment needed — the order
            amount is deducted from your wallet.
          </p>
        ) : null}
        <SumRow k="Wallet balance" v={formatWalletAmount(walletBalance, walletCur)} />
        <SumRow k="Order amount" v={inr(total)} large />
        <SumRow k="Amount to be paid now" v={inr(0)} />
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 0 0",
          }}
        >
          <b style={{ fontSize: "var(--workspace-font-body, 15px)" }}>Remaining balance</b>
          <b className="num" style={{ fontSize: 18, fontFamily: "var(--font-family-primary)" }}>
            {formatWalletAmount(remainingBalance, walletCur)}
          </b>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "baseline", paddingTop: 8 }}
      >
        <b style={{ fontSize: 18 }}>Amount to be paid now</b>
        <b className="num" style={{ fontSize: 22, fontFamily: "var(--font-family-primary)" }}>
          {inr(total)}
        </b>
      </div>
    </div>
  );
}

function SumRow({
  k,
  v,
  emphasis,
  large,
}: {
  k: string;
  v: string;
  emphasis?: boolean;
  large?: boolean;
}) {
  const labelStyle = large
    ? { fontSize: 16, fontWeight: "var(--font-weight-bold)" as const, color: "var(--ink)" }
    : emphasis
      ? { fontSize: 14, fontWeight: "var(--font-weight-bold)" as const, color: "var(--ink)" }
      : { fontSize: 13 };
  const valueStyle = large
    ? { fontWeight: "var(--font-weight-bold)" as const, fontSize: 18 }
    : emphasis
      ? { fontWeight: "var(--font-weight-bold)" as const, fontSize: 15 }
      : { fontWeight: "var(--font-weight-semibold)" as const, fontSize: 13 };

  return (
    <div
      className="row"
      style={{
        justifyContent: "space-between",
        padding: large ? "10px 0" : emphasis ? "9px 0" : "7px 0",
      }}
    >
      <span className={emphasis || large ? undefined : "muted"} style={labelStyle}>
        {k}
      </span>
      <span className="num" style={valueStyle}>
        {v}
      </span>
    </div>
  );
}
