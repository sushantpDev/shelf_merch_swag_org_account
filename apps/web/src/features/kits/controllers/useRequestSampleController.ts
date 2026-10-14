import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  EMPTY_KIT_REDEEM_ADDRESS,
  validateKitRedeemAddress,
} from "@/components/kit-redeem/KitRedeemAddressForm";
import type { ShippingAddress } from "@/components/store/StoreShell";
import { curatedIncludedItems, curatedKitVariantRows } from "@/features/kits/KitPreviewDialog";
import {
  CURATED_VARIANT_KEY,
  getCuratedKitMeta,
  resolveKitItemOptions,
} from "@/features/kits/controllers/useSendKitController";
import { kitPickedIndices } from "@/features/kits/wizard/kitDraft";
import { useLaunchKitCampaign, usePlatformKits, useUpdateKit, useUploadKitArtwork } from "@/features/kits/model";
import type { UiKit, UiProduct } from "@/features/kits/model";
import {
  PREMIUM_BOX_PER_RECIP,
  SAMPLE_WRAP_PER_KIT,
  sampleKitSendTotals,
  type SampleKitSendTotals,
  type SamplePackaging,
} from "@/features/send/money";
import { useWorkspace, useInvalidateWorkspace } from "@/hooks/useWorkspace";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { getStoredUser } from "@/services/auth-store";
import {
  createRazorpayOrderApi,
  ensureSpendEntityForWalletApi,
  verifyRazorpayPaymentApi,
} from "@/services/mutations-api";
import { entityIdForWallet, spendableForWallet, walletsForCheckout } from "@/services/workspace-api";
import { canPayKitWithWallet } from "@/features/send/fundsGate";
import type { PaymentMethod } from "@/features/send/types";
import type { UiWallet } from "@/services/mappers";

export type SampleStep = 0 | 1 | 2 | 3;

export type SampleProductItem = {
  key: string;
  productId?: string;
  name: string;
  imageUrl?: string;
  qty: number;
  sizes: string[];
  colors: string[];
  requiresSize: boolean;
  requiresColor: boolean;
};

export type SampleSuccess = {
  kitName: string;
  orderNumber?: string;
  orderId?: string;
  packaging: SamplePackaging;
  isCuratedKit: boolean;
  branding: boolean;
  logoPreview: string;
  address: ShippingAddress;
  total: number;
  products: Array<{ name: string; imageUrl?: string; qty: number; variantLabel?: string }>;
};

export type RequestSampleVm = {
  isLoading: boolean;
  isSubmitting: boolean;
  notFound: boolean;
  kit: UiKit | undefined;
  kitName: string;
  isCuratedKit: boolean;
  step: SampleStep;
  packaging: SamplePackaging;
  onPackaging: (pkg: SamplePackaging) => void;
  packagingPrice: number;
  wrapPrice: number;
  brandingEnabled: boolean;
  onBranding: (enabled: boolean) => void;
  logoPreview: string;
  isUploadingLogo: boolean;
  onLogoFile: (file: File | null) => void;
  onClearLogo: () => void;
  items: SampleProductItem[];
  curatedVariants: Array<{ imageUrl: string; label: string }>;
  curatedVariantImage: string;
  onCuratedVariant: (imageUrl: string) => void;
  productVariants: Record<string, { size?: string; color?: string }>;
  onProductVariant: (productId: string, patch: { size?: string; color?: string }) => void;
  address: ShippingAddress;
  onAddress: (next: ShippingAddress) => void;
  addressError: string;
  showAddressErrors: boolean;
  totals: SampleKitSendTotals;
  success: SampleSuccess | null;
  wallet: UiWallet | undefined;
  wallets: UiWallet[];
  selectedWalletId: string | undefined;
  onWalletSelect: (walletId: string) => void;
  walletAvailable: (wallet: UiWallet) => number;
  pay: PaymentMethod;
  onPay: (method: PaymentMethod) => void;
  walletPayEnabled: boolean;
  walletDisabledHint: string;
  walletDisabledBadge: string;
  onExit: () => void;
  onBack: () => void;
  onNext: () => void;
  onEditAddress: () => void;
  onRequestSample: () => void;
  onViewOrder: () => void;
  onBackToKits: () => void;
};

function productImageUrl(product: UiProduct): string | undefined {
  return (
    resolveMediaUrl(product.photoUrl) ||
    resolveMediaUrl(product.baseImageUrl) ||
    resolveMediaUrl(product.imgUrl) ||
    resolveMediaUrl(product.mockupUrl) ||
    undefined
  );
}

/** Controller for the Request a Sample wizard. */
export function useRequestSampleController(): RequestSampleVm {
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const { data: workspace, isLoading } = useWorkspace();
  const { data: platformKits } = usePlatformKits();
  const launch = useLaunchKitCampaign();
  const uploadArtwork = useUploadKitArtwork();
  const updateKit = useUpdateKit();
  const refreshWorkspace = useInvalidateWorkspace();

  const kit = workspace?.kits.find((k) => k.id === id);
  const catalog = workspace?.catalogProducts ?? [];
  const curatedMeta = getCuratedKitMeta(kit);
  const isCuratedKit = !!curatedMeta;

  const [step, setStep] = useState<SampleStep>(0);
  const [packaging, setPackaging] = useState<SamplePackaging>("wrap");
  const [brandingEnabled, setBrandingEnabled] = useState(false);
  const [logoPreview, setLogoPreview] = useState("");
  const [productVariants, setProductVariants] = useState<Record<string, { size?: string; color?: string }>>({});
  const [curatedVariantImage, setCuratedVariantImage] = useState("");
  const [address, setAddress] = useState<ShippingAddress>({ ...EMPTY_KIT_REDEEM_ADDRESS });
  const [addressError, setAddressError] = useState("");
  const [showAddressErrors, setShowAddressErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SampleSuccess | null>(null);
  const [pay, setPay] = useState<PaymentMethod>("wallet");
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const logoObjectUrlRef = useRef<string | null>(null);
  const seededKitId = useRef<string | null>(null);

  const curatedVariants = useMemo(
    () => (curatedMeta ? curatedKitVariantRows(curatedMeta, platformKits) : []),
    [curatedMeta, platformKits],
  );

  const items = useMemo<SampleProductItem[]>(() => {
    if (!kit) return [];
    if (isCuratedKit && curatedMeta) {
      const included = curatedIncludedItems(
        curatedMeta,
        platformKits,
        kit.artworkUrl ? resolveMediaUrl(kit.artworkUrl) : undefined,
      );
      const platformKit = platformKits?.find((k) => String(k._id) === String(curatedMeta.originalId));
      return included.map((item, index) => {
        const platformItem = platformKit?.items?.[index];
        return {
          key: `curated-${index}-${item.imageUrl}`,
          name: item.label,
          imageUrl: resolveMediaUrl(item.imageUrl) || item.imageUrl,
          qty: Math.max(1, Number(platformItem?.qty) || 1),
          sizes: [],
          colors: [],
          requiresSize: false,
          requiresColor: false,
        };
      });
    }

    const picked = kitPickedIndices(kit, catalog);
    return picked
      .map((idx) => catalog[idx])
      .filter(Boolean)
      .map((product) => {
        const ref = kit.productRefs?.find((r) => r.catalogProductId === product.id) ?? {};
        const opts = resolveKitItemOptions(product, ref);
        return {
          key: product.id || product.nm,
          productId: product.id,
          name: product.nm,
          imageUrl: productImageUrl(product),
          qty: 1,
          sizes: opts.sizes,
          colors: opts.colors,
          requiresSize: opts.requiresSize,
          requiresColor: opts.requiresColor,
        };
      });
  }, [kit, isCuratedKit, curatedMeta, platformKits, catalog]);

  const pickedProducts = useMemo(
    () => (kit ? kitPickedIndices(kit, catalog).map((idx) => catalog[idx]).filter(Boolean) : []) as UiProduct[],
    [kit, catalog],
  );

  const curatedPricePerKit = useMemo(() => {
    if (!isCuratedKit) return 0;
    if (curatedMeta?.approxValueInr && curatedMeta.approxValueInr > 0) {
      return Math.round(curatedMeta.approxValueInr);
    }
    const platformKit = platformKits?.find((k) => String(k._id) === String(curatedMeta?.originalId));
    if (platformKit?.approxValueInr && platformKit.approxValueInr > 0) {
      return Math.round(platformKit.approxValueInr);
    }
    if (kit?.kitPrice && kit.kitPrice > 0) return Math.round(kit.kitPrice);
    return 0;
  }, [isCuratedKit, curatedMeta, platformKits, kit]);

  const totals = useMemo(
    () =>
      sampleKitSendTotals({
        kind: isCuratedKit ? "pre-designed" : "customised",
        packaging,
        pricePerKitInr: curatedPricePerKit,
        products: pickedProducts,
        recipientCount: 1,
      }),
    [isCuratedKit, packaging, curatedPricePerKit, pickedProducts],
  );

  const packagingPrice = PREMIUM_BOX_PER_RECIP;
  const wrapPrice = SAMPLE_WRAP_PER_KIT;

  const checkoutWallets = useMemo(
    () => (workspace ? walletsForCheckout(workspace) : []),
    [workspace],
  );
  const activeWalletId = selectedWalletId || checkoutWallets[0]?.id;
  const wallet =
    checkoutWallets.find((w) => w.id === activeWalletId) ?? checkoutWallets[0];
  const walletPayEnabled = canPayKitWithWallet(workspace, totals.total, activeWalletId);
  const walletDisabledHint = "Pay via UPI or card";
  const walletDisabledBadge =
    workspace?.org.wallet.fundingApproval === "pending"
      ? "Wallet under review"
      : "Insufficient funds";

  useEffect(() => {
    if (!kit?.id) return;
    if (seededKitId.current === kit.id) return;
    seededKitId.current = kit.id;

    if (curatedVariants[0]?.imageUrl) {
      setCuratedVariantImage(curatedVariants[0].imageUrl);
    }

    if (isCuratedKit) {
      setPackaging("wrap");
    } else if (kit.packaging === "none") {
      setPackaging("none");
    } else {
      setPackaging("box");
    }

    const existingLogo =
      (curatedMeta?.brandLogoUrl ? resolveMediaUrl(curatedMeta.brandLogoUrl) : "") ||
      (kit.artworkUrl ? resolveMediaUrl(kit.artworkUrl) : "") ||
      "";
    if (existingLogo && !isCuratedKit) {
      setLogoPreview(existingLogo);
      setBrandingEnabled(true);
    }
  }, [kit, curatedVariants, curatedMeta, isCuratedKit]);

  useEffect(() => {
    return () => {
      if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    };
  }, []);

  function missingVariantLabels(): string[] {
    if (isCuratedKit) {
      if (curatedVariants.length && !curatedVariantImage) return ["kit variant"];
      return [];
    }
    const missing: string[] = [];
    for (const item of items) {
      if (!item.productId) continue;
      const sel = productVariants[item.productId] || {};
      if (item.requiresSize && item.sizes.length > 0 && !sel.size) {
        missing.push(`size for ${item.name}`);
      }
      if (item.requiresColor && item.colors.length > 0 && !sel.color) {
        missing.push(`colour for ${item.name}`);
      }
    }
    return missing;
  }

  function variantLabelForItem(item: SampleProductItem): string | undefined {
    if (isCuratedKit) {
      return curatedVariants.find((v) => v.imageUrl === curatedVariantImage)?.label;
    }
    if (!item.productId) return undefined;
    const sel = productVariants[item.productId] || {};
    const parts = [sel.color, sel.size].filter(Boolean);
    return parts.length ? parts.join(" · ") : undefined;
  }

  function onExit() {
    if (from && from !== `/app/kits/${id}/sample`) {
      navigate(from);
      return;
    }
    navigate("/app/kits");
  }

  function onNext() {
    if (step === 0) {
      const missing = missingVariantLabels();
      if (missing.length) {
        toast.error(`Select variants: ${missing.slice(0, 3).join(", ")}`);
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (brandingEnabled && !logoPreview) {
        toast.error("Upload your logo first");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      const error = validateKitRedeemAddress(address);
      if (error) {
        setAddressError(error);
        setShowAddressErrors(true);
        return;
      }
      setAddressError("");
      setShowAddressErrors(false);
      setStep(3);
    }
  }

  async function resolveEntityId(walletId: string | undefined): Promise<string | undefined> {
    if (!walletId || !workspace) return undefined;
    const local = entityIdForWallet(workspace, walletId);
    if (local) return local;
    if (workspace.userPatch.role === "entity_manager") return undefined;
    return ensureSpendEntityForWalletApi(walletId);
  }

  async function onRequestSample() {
    const error = validateKitRedeemAddress(address);
    if (error) {
      setAddressError(error);
      setShowAddressErrors(true);
      setStep(2);
      return;
    }
    setShowAddressErrors(false);
    const user = getStoredUser();
    const email = user?.email?.trim();
    if (!email) {
      toast.error("Account email required");
      return;
    }

    const walletId = activeWalletId || checkoutWallets[0]?.id || workspace?.wallets[0]?.id;
    let entityId: string | undefined;
    try {
      entityId = await resolveEntityId(walletId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve wallet budget");
      return;
    }
    if (!entityId) {
      toast.error("Allocate funds to a department first");
      return;
    }

    const paymentTotal = Math.round(totals.total);
    const walletPayOk = canPayKitWithWallet(workspace, paymentTotal, walletId);
    const payingWithWallet = pay === "wallet" && walletPayOk;
    const paymentMode = payingWithWallet ? "wallet" : pay === "card" ? "card" : "upi";

    if (pay === "wallet" && !walletPayOk) {
      toast.error("Choose UPI or card instead");
      return;
    }
    if (!payingWithWallet && !walletId) {
      toast.error("Select a wallet first");
      return;
    }

    const recipientId = `email:${email}`;
    const recipVariants: Record<string, Record<string, { size?: string; color?: string; variantImage?: string }>> = {};
    if (isCuratedKit && curatedVariantImage) {
      recipVariants[recipientId] = { [CURATED_VARIANT_KEY]: { variantImage: curatedVariantImage } };
    } else if (!isCuratedKit) {
      recipVariants[recipientId] = productVariants;
    }

    let razorpay:
      | { orderId: string; paymentId: string; signature: string }
      | undefined;

    try {
      if (!payingWithWallet) {
        const order = await createRazorpayOrderApi(walletId!, paymentTotal, "campaign_spend");
        const response = await new Promise<{
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }>((resolve, reject) => {
          void openRazorpayCheckout({
            order,
            description: `Pay ₹${paymentTotal.toLocaleString("en-IN")} for sample kit`,
            preferredMethod: paymentMode === "card" ? "card" : "upi",
            onSuccess: resolve,
            onDismiss: () => reject(new Error("Payment cancelled")),
          }).catch(reject);
        });

        await verifyRazorpayPaymentApi({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });

        razorpay = {
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        };
      }

      setSubmitting(true);
      if (kit && kit.status !== "live") {
        await updateKit.mutateAsync({
          id: kit.id,
          pickedIndices: kitPickedIndices(kit, catalog),
          catalog,
          status: "live",
        });
      }
      const launched = await launch.mutateAsync({
        entityId: String(entityId),
        kitId: String(kit!.id),
        name: `Sample: ${kit!.name}`,
        totalBudget: paymentTotal,
        packaging,
        fulfillmentMode: "single",
        isSample: true,
        brandingEnabled,
        singleLocation: {
          name: address.name.trim(),
          email,
          phone: address.phone.trim(),
          line1: address.line1.trim(),
          line2: address.line2?.trim() || "",
          city: address.city.trim(),
          state: address.state.trim(),
          pincode: address.pincode.trim(),
          country: address.country || "IN",
        },
        message: {
          from: workspace?.account || "Shelf Merch",
          body: `Sample request for ${kit!.name}`,
        },
        contactIds: [recipientId],
        contacts: [
          {
            id: recipientId,
            name: address.name.trim(),
            email,
            phone: address.phone.trim(),
          },
        ],
        recipVariants,
        paymentMode,
        razorpay,
      });

      setSuccess({
        kitName: kit!.name,
        orderNumber: launched.orderNumber,
        orderId: launched.orderId,
        packaging,
        isCuratedKit,
        branding: brandingEnabled,
        logoPreview,
        address,
        total: paymentTotal,
        products: items.map((item) => ({
          name: item.name,
          imageUrl: item.imageUrl,
          qty: item.qty,
          variantLabel: variantLabelForItem(item),
        })),
      });
      void refreshWorkspace().catch(() => undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request sample");
    } finally {
      setSubmitting(false);
    }
  }

  async function onLogoFile(file: File | null) {
    if (!kit || !file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Upload a PNG, JPG, or SVG file");
      return;
    }
    if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    const localUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = localUrl;
    setLogoPreview(localUrl);
    setBrandingEnabled(true);
    try {
      const updated = await uploadArtwork.mutateAsync({
        kitId: kit.id,
        artwork: { file, preview: localUrl, name: file.name },
      });
      const saved = updated.artworkUrl ? resolveMediaUrl(updated.artworkUrl) || updated.artworkUrl : localUrl;
      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
        logoObjectUrlRef.current = null;
      }
      setLogoPreview(saved);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload logo");
      setLogoPreview("");
      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
        logoObjectUrlRef.current = null;
      }
    }
  }

  function onClearLogo() {
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }
    setLogoPreview("");
  }

  return {
    isLoading: isLoading && !workspace,
    isSubmitting: submitting || launch.isPending,
    notFound: !isLoading && !!workspace && !kit,
    kit,
    kitName: kit?.name || "",
    isCuratedKit,
    step,
    packaging,
    onPackaging: setPackaging,
    packagingPrice,
    wrapPrice,
    brandingEnabled,
    onBranding: (enabled) => {
      setBrandingEnabled(enabled);
      if (enabled && !logoPreview && kit?.artworkUrl) {
        setLogoPreview(resolveMediaUrl(kit.artworkUrl) || kit.artworkUrl);
      }
    },
    logoPreview,
    isUploadingLogo: uploadArtwork.isPending,
    onLogoFile,
    onClearLogo,
    items,
    curatedVariants,
    curatedVariantImage,
    onCuratedVariant: setCuratedVariantImage,
    productVariants,
    onProductVariant: (productId, patch) => {
      setProductVariants((prev) => ({
        ...prev,
        [productId]: { ...prev[productId], ...patch },
      }));
    },
    address,
    onAddress: (next) => {
      setAddressError("");
      setAddress(next);
    },
    addressError,
    showAddressErrors,
    totals,
    success,
    wallet,
    wallets: checkoutWallets,
    selectedWalletId: activeWalletId,
    onWalletSelect: setSelectedWalletId,
    walletAvailable: (w) => (workspace ? spendableForWallet(workspace, w.id) : 0),
    pay,
    onPay: setPay,
    walletPayEnabled,
    walletDisabledHint,
    walletDisabledBadge,
    onExit,
    onBack: () => setStep((s) => Math.max(0, s - 1) as SampleStep),
    onNext,
    onEditAddress: () => setStep(2),
    onRequestSample: () => {
      void onRequestSample();
    },
    onViewOrder: () => {
      const q = success?.orderNumber || success?.orderId;
      navigate(q ? `/app/orders?order=${encodeURIComponent(q)}` : "/app/orders");
    },
    onBackToKits: () => navigate("/app/kits"),
  };
}
