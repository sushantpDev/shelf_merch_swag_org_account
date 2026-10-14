import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useWorkspace, useInvalidateWorkspace } from "@/hooks/useWorkspace";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { formatWalletAmount } from "@/lib/walletFormat";
import {
  createRazorpayOrderApi,
  ensureSpendEntityForWalletApi,
  getCampaignApi,
  verifyRazorpayPaymentApi,
} from "@/services/mutations-api";
import { entityIdForWallet, spendableForWallet, walletsForCheckout } from "@/services/workspace-api";
import { pointsSendTotals } from "@/features/send/money";
import {
  getInsufficientFundsReason,
  type SendFlowBlockReason,
} from "@/features/send/fundsGate";
import { toSchedulePayload } from "@/features/send/types";
import {
  addRecipientsUpToLimit,
  emailFromManualRecipientId,
  isManualRecipientId,
  mergePickerContacts,
  parseCsvEmails,
  parseEmailInput,
  selectAllRecipientIds,
} from "@/features/send/recipientSelection";
import type { PointsSendTotals } from "@/features/send/money";
import type { ShopCurrencyMode } from "@/lib/storeCurrency";
import type { UiShop } from "@/services/mappers";
import type { SendingPointsRecipient } from "@/components/SendingPointsAnimation";
import { useLaunchPointsCampaign, useSavePointsCampaignDraft } from "../model";
import type { UiContact, UiWallet } from "../model";
import {
  initialSendPointsDraft,
  isValidBudgetPerRecipient,
  MIN_POINTS_BUDGET_INR,
  resolveFrom,
  resolveMessage,
  resolveOrderName,
  sendPointsDraftFromCampaign,
  sendPointsReducer,
} from "../pointsDraft";
import type { SendPointsAction, SendPointsDraft } from "../pointsDraft";

export type SendPointsStep = 0 | 1 | 2 | 3;

export type SendPointsPhase = "idle" | "sending" | "success" | "error";

export type SendPointsVm = {
  isLoading: boolean;
  isSending: boolean;
  isSaving: boolean;
  sendPhase: SendPointsPhase;
  sendError: string | null;
  sendRecipients: SendingPointsRecipient[];
  onDismissSendError: () => void;
  step: SendPointsStep;
  draft: SendPointsDraft;
  dispatch: (action: SendPointsAction) => void;
  totals: PointsSendTotals;
  billableRecipientCount: number;
  contacts: UiContact[];
  pickerContacts: UiContact[];
  shop: UiShop | undefined;
  shopCurrencyLabel: string;
  currencyMode: ShopCurrencyMode;
  wallet: UiWallet | undefined;
  wallets: UiWallet[];
  selectedWalletId: string | undefined;
  onWalletSelect: (walletId: string) => void;
  walletAvailable: (wallet: UiWallet) => number;
  onExit: () => void;
  onNext: () => void;
  onBack: () => void;
  onPayNow: () => void;
  onSaveAndExit: () => void;
  /** Set when budget is pending/insufficient — show draft CTA before checkout. */
  fundsBlockReason: SendFlowBlockReason | null;
  onToggleRecip: (id: string) => void;
  onSelectAllRecips: () => void;
  onAddRecipientEmails: (raw: string) => void;
  onImportRecipientCsv: (file: File) => void;
};

/** Controller for the send-points wizard: draft reducer, hydration, save, and launch. */
export function useSendPointsController(): SendPointsVm {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shopParam = searchParams.get("shop") ?? undefined;
  const campaignParam = searchParams.get("campaign") ?? undefined;
  const { data: workspace, isLoading } = useWorkspace();
  const refreshWorkspace = useInvalidateWorkspace();
  const launch = useLaunchPointsCampaign();
  const saveDraft = useSavePointsCampaignDraft();
  const [step, setStep] = useState<SendPointsStep>(0);
  const [sending, setSending] = useState(false);
  const [sendPhase, setSendPhase] = useState<SendPointsPhase>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const successNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hydrating, setHydrating] = useState(Boolean(campaignParam));
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [campaignId, setCampaignId] = useState<string | undefined>(campaignParam);
  const seededScope = useRef(false);
  const hydratedKey = useRef("");

  const contacts: UiContact[] = useMemo(() => workspace?.contacts ?? [], [workspace]);
  const shops = workspace?.shops ?? [];
  const shopId = shopParam || shops[0]?.id;
  const shop = shops.find((s) => s.id === shopId);

  const initial = useMemo(
    () => initialSendPointsDraft(shop?.pointsConversionEnabled ? "stadium" : "shop"),
    [shop?.pointsConversionEnabled],
  );
  const [draft, dispatch] = useReducer(sendPointsReducer, initial);
  const pickerContacts = useMemo(
    () => mergePickerContacts(contacts, draft.selRecips),
    [contacts, draft.selRecips],
  );
  const sendRecipients = useMemo<SendingPointsRecipient[]>(
    () =>
      draft.selRecips.map((id) => {
        if (isManualRecipientId(id)) {
          const email = emailFromManualRecipientId(id);
          return { id, name: email.split("@")[0] || email };
        }
        const contact = pickerContacts.find((c) => c.id === id);
        return {
          id,
          name: contact?.name || contact?.email || "Recipient",
        };
      }),
    [draft.selRecips, pickerContacts],
  );
  const recipientLimit = draft.recips;

  useEffect(() => {
    return () => {
      if (successNavTimer.current) clearTimeout(successNavTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!shop || seededScope.current) return;
    dispatch({
      type: "setPointsScope",
      pointsScope: shop.pointsConversionEnabled ? "stadium" : "shop",
    });
    seededScope.current = true;
  }, [shop]);

  useEffect(() => {
    const key = `${shopId || "default"}:${campaignParam || "new"}`;
    if (!workspace || hydratedKey.current === key) return;

    let cancelled = false;
    async function hydrate() {
      if (campaignParam) {
        setHydrating(true);
        try {
          const campaign = await getCampaignApi(campaignParam);
          if (cancelled) return;
          const restored = sendPointsDraftFromCampaign(campaign, initial);
          dispatch({
            type: "replace",
            draft: {
              ...restored.draft,
              schedule: { ...initial.schedule, ...restored.draft.schedule },
            },
          });
          setStep(restored.step);
          setSelectedWalletId(restored.selectedWalletId);
          setCampaignId(campaign.id);
        } catch (err) {
          if (!cancelled) {
            toast.error(err instanceof Error ? err.message : "Could not load draft");
            dispatch({ type: "replace", draft: initial });
            setStep(0);
            setSelectedWalletId("");
            setCampaignId(undefined);
          }
        } finally {
          if (!cancelled) setHydrating(false);
        }
      } else {
        dispatch({ type: "replace", draft: initial });
        setStep(0);
        setSelectedWalletId("");
        setCampaignId(undefined);
      }
      hydratedKey.current = key;
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [campaignParam, shopId, initial, workspace]);

  const billableRecipientCount = draft.selRecips.length || recipientLimit;
  const totals = pointsSendTotals(draft.ppr, billableRecipientCount);
  const checkoutWallets = useMemo(
    () => (workspace ? walletsForCheckout(workspace) : []),
    [workspace],
  );
  const wallet =
    checkoutWallets.find((w) => w.id === selectedWalletId) ?? checkoutWallets[0];
  const shopCurrencyLabel = shop?.currency || "Points";
  const currencyMode: ShopCurrencyMode = shop?.currencyMode ?? "points";

  function reportRecipientAddResult(result: {
    added: string[];
    invalid: string[];
    duplicates: string[];
    truncated: number;
  }) {
    if (result.invalid.length) {
      toast.error(result.invalid.length === 1 ? "Skipped 1 invalid email" : `Skipped ${result.invalid.length} invalid emails`);
    }
    if (result.duplicates.length) {
      toast.message(
        result.duplicates.length === 1 ? "Skipped 1 duplicate" : `Skipped ${result.duplicates.length} duplicates`,
      );
    }
    if (result.truncated > 0) {
      toast.error(`Recipient limit: ${recipientLimit}`);
    }
    if (result.added.length) {
      toast.success(result.added.length === 1 ? "Added 1 recipient" : `Added ${result.added.length} recipients`);
    } else if (!result.invalid.length && !result.duplicates.length && !result.truncated) {
      toast.error("No new recipients to add");
    }
  }

  function autoSelectRecipients() {
    if (!recipientLimit || draft.selRecips.length > 0) return;
    const ids = selectAllRecipientIds(contacts, draft.selRecips, recipientLimit);
    if (ids.length) dispatch({ type: "setSelRecips", selRecips: ids });
  }

  function onToggleRecip(id: string) {
    const has = draft.selRecips.includes(id);
    if (!has && recipientLimit && draft.selRecips.length >= recipientLimit) {
      toast.error(`Maximum ${recipientLimit} recipients`);
      return;
    }
    dispatch({ type: "toggleRecip", id });
  }

  function onSelectAllRecips() {
    if (!recipientLimit) {
      toast.error("Set recipient count first");
      return;
    }
    const ids = selectAllRecipientIds(contacts, draft.selRecips, recipientLimit);
    if (ids.length === draft.selRecips.length) {
      toast.message("All recipients already selected");
      return;
    }
    dispatch({ type: "setSelRecips", selRecips: ids });
  }

  function onAddRecipientEmails(raw: string) {
    if (!recipientLimit) {
      toast.error("Set recipient count first");
      return;
    }
    const { ids, result } = addRecipientsUpToLimit(
      parseEmailInput(raw),
      draft.selRecips,
      contacts,
      recipientLimit,
    );
    dispatch({ type: "setSelRecips", selRecips: ids });
    reportRecipientAddResult(result);
  }

  function onImportRecipientCsv(file: File) {
    if (!recipientLimit) {
      toast.error("Set recipient count first");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { ids, result } = addRecipientsUpToLimit(
        parseCsvEmails(text),
        draft.selRecips,
        contacts,
        recipientLimit,
      );
      dispatch({ type: "setSelRecips", selRecips: ids });
      reportRecipientAddResult(result);
    };
    reader.onerror = () => toast.error("Could not read CSV file");
    reader.readAsText(file);
  }

  function resolveRecipientPayload(id: string) {
    if (isManualRecipientId(id)) {
      const email = emailFromManualRecipientId(id);
      return {
        name: email.split("@")[0] || email,
        email,
      };
    }
    const contact = contacts.find((c) => c.id === id);
    if (!contact) return null;
    return {
      contactId: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
    };
  }

  function buildRecipients() {
    return draft.selRecips
      .map((id) => resolveRecipientPayload(id))
      .filter(Boolean)
      .map((r) => r!);
  }

  function exit() {
    if (shopId) {
      navigate(`/app/shops/${shopId}?tab=sent-gifts`);
      return;
    }
    navigate("/app/campaigns");
  }

  async function resolveEntityId(): Promise<string | undefined> {
    const walletId = selectedWalletId || checkoutWallets[0]?.id || workspace?.wallets[0]?.id;
    if (!walletId || !workspace) return undefined;

    const local = entityIdForWallet(workspace, walletId);
    if (local) return local;

    if (workspace.userPatch.role === "entity_manager") return undefined;

    return ensureSpendEntityForWalletApi(walletId);
  }

  async function saveAndExit() {
    let entityId: string | undefined;
    try {
      entityId = await resolveEntityId();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve wallet budget");
      return;
    }
    if (!entityId) {
      toast.error("Allocate funds to a department first");
      return;
    }
    if (!shopId) {
      toast.error("Select a shop for this campaign");
      return;
    }
    setSaving(true);
    try {
      const recipients = buildRecipients();
      const schedulePayload = toSchedulePayload(draft.when, draft.schedule);
      const saved = await saveDraft.mutateAsync({
        campaignId,
        entityId,
        shopId: String(shopId),
        name: resolveOrderName(draft.orderName),
        pointsScope: draft.pointsScope,
        creditsPerRecipient: draft.ppr,
        message: {
          from: resolveFrom(draft.from),
          body: resolveMessage(draft.msg),
        },
        schedule: schedulePayload,
        draftState: {
          step,
          selectedWalletId,
          selRecips: draft.selRecips,
          recips: draft.recips,
          pay: draft.pay === "upi" || draft.pay === "card" ? draft.pay : "wallet",
          preview: draft.preview,
          when: schedulePayload.mode,
        },
        ...(recipients.length ? { recipients } : {}),
      });
      setCampaignId(saved.id);
      await refreshWorkspace();
      toast.success("Draft saved");
      exit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (step === 0) {
      if (!draft.recips) {
        toast.error("Enter number of recipients");
        return;
      }
      if (!isValidBudgetPerRecipient(String(draft.ppr || ""))) {
        toast.error(
          draft.ppr > 0 && !Number.isInteger(draft.ppr)
            ? "Enter a whole number"
            : `Allocate at least ₹${MIN_POINTS_BUDGET_INR}`,
        );
        return;
      }
      autoSelectRecipients();
    }
    if (step === 1) {
      if (recipientLimit && draft.selRecips.length !== recipientLimit) {
        toast.error(`Select exactly ${recipientLimit} recipients`);
        return;
      }
      if (!recipientLimit && !draft.selRecips.length) {
        toast.error("Select at least one recipient");
        return;
      }
    }
    setStep((s) => Math.min(s + 1, 3) as SendPointsStep);
  }

  async function payNow() {
    const walletId = selectedWalletId || checkoutWallets[0]?.id || workspace?.wallets[0]?.id;
    let entityId: string | undefined;
    try {
      entityId = await resolveEntityId();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve wallet budget");
      return;
    }
    if (!entityId) {
      toast.error("Allocate funds to a department first");
      return;
    }
    if (!shopId) {
      toast.error("Select a shop for this campaign");
      return;
    }
    if (recipientLimit && draft.selRecips.length !== recipientLimit) {
      toast.error(`Select exactly ${recipientLimit} recipients`);
      return;
    }
    if (!recipientLimit && !draft.selRecips.length) {
      toast.error("Select at least one recipient");
      return;
    }
    if (!isValidBudgetPerRecipient(String(draft.ppr || ""))) {
      toast.error(`Allocate at least ₹${MIN_POINTS_BUDGET_INR}`);
      return;
    }
    const paymentTotal = Math.round(totals.sub);
    const payingWithWallet = draft.pay === "wallet";
    const paymentMode = draft.pay === "card" ? "card" : draft.pay === "upi" ? "upi" : "wallet";

    if (payingWithWallet) {
      const available = walletId && workspace ? spendableForWallet(workspace, walletId) : 0;
      if (available < paymentTotal) {
        toast.error(
          "Insufficient wallet balance",
        );
        return;
      }
    }

    setSending(true);
    setSendPhase("sending");
    setSendError(null);


    if (!payingWithWallet && !walletId) {
      toast.error("Select a wallet first");
      return;
    }

    let razorpay:
      | { orderId: string; paymentId: string; signature: string }
      | undefined;


    try {
      // Collect UPI/card payment first — do not flip `sending` yet or the checkout
      // unmounts into LoadingState and Razorpay cannot open cleanly.
      if (!payingWithWallet) {
        const order = await createRazorpayOrderApi(walletId!, paymentTotal, "campaign_spend");
        const response = await new Promise<{
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }>((resolve, reject) => {
          void openRazorpayCheckout({
            order,
            description: `Pay ₹${paymentTotal.toLocaleString("en-IN")} for shop points`,
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

      setSending(true);
      await launch.mutateAsync({
        campaignId,
        entityId: String(entityId),
        shopId: String(shopId),
        name: resolveOrderName(draft.orderName),
        pointsScope: draft.pointsScope,
        creditsPerRecipient: draft.ppr,
        totalBudget: paymentTotal,
        message: {
          from: resolveFrom(draft.from),
          body: resolveMessage(draft.msg),
        },
        schedule: toSchedulePayload(draft.when, draft.schedule),
        contactIds: draft.selRecips,
        contacts: contacts.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
        })),
        paymentMode,
        razorpay,
      });
      await refreshWorkspace();
      setSendPhase("success");
      const scheduled = draft.when === "sched";
      toast.success(
        scheduled
          ? payingWithWallet
            ? "Campaign scheduled 🙌"
            : "Campaign scheduled 🙌"
          : draft.selRecips.length === 1 ? "Points sent to 1 recipient 🎉" : `Points sent to ${draft.selRecips.length} recipients 🎉`,
      );
      if (successNavTimer.current) clearTimeout(successNavTimer.current);
      successNavTimer.current = setTimeout(() => {
        navigate(`/app/shops/${String(shopId)}?tab=sent-gifts`);
      }, 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to launch campaign";
      setSendPhase("error");
      setSendError(message);
      setSending(false);

      if (message === "Payment cancelled") {
        toast.message("Payment cancelled");
        return;
      }
      if (message.includes("RAZORPAY_NOT_CONFIGURED") || message.includes("not configured")) {
        toast.error("Payment setup incomplete");
        return;
      }
      if (message.includes("temporarily unavailable") || message.includes("GATEWAY")) {
        toast.error("Payment server unavailable");
        return;
      }

      toast.error(message);
    }
  }

  return {
    isLoading: (isLoading && !workspace) || hydrating,
    isSending: sending || launch.isPending || sendPhase === "success" || sendPhase === "error",
    isSaving: saving || saveDraft.isPending,
    sendPhase,
    sendError,
    sendRecipients,
    onDismissSendError: () => {
      setSendPhase("idle");
      setSendError(null);
      setSending(false);
    },
    step,
    draft,
    dispatch,
    totals,
    billableRecipientCount,
    contacts,
    pickerContacts,
    shop,
    shopCurrencyLabel,
    currencyMode,
    wallet,
    wallets: checkoutWallets,
    selectedWalletId: selectedWalletId || checkoutWallets[0]?.id,
    onWalletSelect: setSelectedWalletId,
    walletAvailable: (w) => (workspace ? spendableForWallet(workspace, w.id) : 0),
    onExit: exit,
    onNext: next,
    onBack: () => setStep((s) => (s - 1) as SendPointsStep),
    onPayNow: payNow,
    onSaveAndExit: saveAndExit,
    fundsBlockReason: getInsufficientFundsReason(
      workspace,
      totals.sub,
      selectedWalletId || checkoutWallets[0]?.id,
    ),
    onToggleRecip,
    onSelectAllRecips,
    onAddRecipientEmails,
    onImportRecipientCsv,
  };
}
