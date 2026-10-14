import type { PaymentMethod, ScheduleDraft, WhenMode } from "@/features/send/types";

export type SendPointsDraft = {
  orderName: string;
  ppr: number; // budget per recipient, in INR
  recips: number; // headline recipient count (budget step)
  selRecips: string[];
  pointsScope: "stadium" | "shop";
  from: string;
  msg: string;
  when: WhenMode;
  schedule: ScheduleDraft;
  preview: "landing" | "email";
  pay: PaymentMethod;
};

export type SendPointsAction =
  | { type: "replace"; draft: SendPointsDraft }
  | { type: "setOrderName"; orderName: string }
  | { type: "setPpr"; ppr: number }
  | { type: "setRecips"; recips: number }
  | { type: "toggleRecip"; id: string }
  | { type: "setSelRecips"; selRecips: string[] }
  | { type: "remapRecipId"; fromId: string; toId: string }
  | { type: "deselectRecips" }
  | { type: "setPointsScope"; pointsScope: "stadium" | "shop" }
  | { type: "setFrom"; from: string }
  | { type: "setMsg"; msg: string }
  | { type: "setWhen"; when: WhenMode }
  | { type: "setSchedule"; key: keyof ScheduleDraft; value: string }
  | { type: "setPreview"; preview: "landing" | "email" }
  | { type: "setPay"; pay: PaymentMethod };

export function sendPointsReducer(
  state: SendPointsDraft,
  action: SendPointsAction,
): SendPointsDraft {
  switch (action.type) {
    case "replace":
      return action.draft;
    case "setOrderName":
      return { ...state, orderName: action.orderName };
    case "setPpr":
      return { ...state, ppr: action.ppr };
    case "setRecips": {
      const recips = action.recips;
      const selRecips =
        recips > 0 && state.selRecips.length > recips
          ? state.selRecips.slice(0, recips)
          : state.selRecips;
      return { ...state, recips, selRecips };
    }
    case "toggleRecip": {
      const has = state.selRecips.includes(action.id);
      return {
        ...state,
        selRecips: has
          ? state.selRecips.filter((id) => id !== action.id)
          : [...state.selRecips, action.id],
      };
    }
    case "setSelRecips":
      return { ...state, selRecips: action.selRecips };
    case "remapRecipId":
      return {
        ...state,
        selRecips: [...new Set(state.selRecips.map((id) => (id === action.fromId ? action.toId : id)))],
      };
    case "deselectRecips":
      return { ...state, selRecips: [] };
    case "setPointsScope":
      return { ...state, pointsScope: action.pointsScope };
    case "setFrom":
      return { ...state, from: action.from };
    case "setMsg":
      return { ...state, msg: action.msg };
    case "setWhen":
      return { ...state, when: action.when };
    case "setSchedule":
      return { ...state, schedule: { ...state.schedule, [action.key]: action.value } };
    case "setPreview":
      return { ...state, preview: action.preview };
    case "setPay":
      return { ...state, pay: action.pay };
    default:
      return state;
  }
}

export const SEND_POINTS_PLACEHOLDERS = {
  orderName: "e.g. Diwali Campaign 2026",
  recips: "100",
  ppr: "1500",
  points: "1500.00",
  from: "shelfmerch",
  msg: "Appreciate your turnaround completing the key project, which is critical to company revenue.",
} as const;

/** Minimum budget per recipient (INR) for Send Points. */
export const MIN_POINTS_BUDGET_INR = 250;

/**
 * Inline validation for budget-per-recipient.
 * `raw` is the field string so decimals like "250." / "250.5" are caught.
 */
export function budgetPerRecipientError(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Minimum of ₹250 must be allocated.";
  if (trimmed.includes(".") || trimmed.includes("e") || trimmed.includes("E")) {
    return "Enter a whole number";
  }
  if (!/^\d+$/.test(trimmed)) {
    return "Enter a whole number";
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < MIN_POINTS_BUDGET_INR) {
    return "Minimum of ₹250 must be allocated.";
  }
  return null;
}

export function isValidBudgetPerRecipient(raw: string): boolean {
  return budgetPerRecipientError(raw) === null;
}

export function suggestOrderName() {
  const now = new Date();
  const month = now.toLocaleString("en-IN", { month: "short" });
  const year = now.getFullYear();
  return `Campaign ${month} ${year}`;
}

export function resolveOrderName(orderName: string) {
  return orderName.trim() || suggestOrderName();
}

export function resolveFrom(from: string, placeholder = SEND_POINTS_PLACEHOLDERS.from) {
  return from.trim() || placeholder;
}

export function resolveMessage(msg: string, placeholder = SEND_POINTS_PLACEHOLDERS.msg) {
  return msg.trim() || placeholder;
}

export function initialSendPointsDraft(
  pointsScope: "stadium" | "shop" = "shop",
): SendPointsDraft {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return {
    orderName: "",
    ppr: 0,
    recips: 0,
    selRecips: [],
    pointsScope,
    from: "",
    msg: "",
    when: "now",
    schedule: { date: tomorrow, time: "10:00", tz: "Asia/Kolkata (IST)" },
    preview: "landing",
    pay: "wallet",
  };
}

export function sendPointsDraftFromCampaign(
  campaign: {
    name: string;
    creditsPerRecipient?: number;
    recipientCount?: number;
    pointsScope?: "stadium" | "shop";
    senderName?: string;
    messageBody?: string;
    draftState?: {
      step?: 0 | 1 | 2 | 3;
      selectedWalletId?: string;
      selRecips?: string[];
      recips?: number;
      pay?: "wallet" | "card";
      preview?: "landing" | "email";
      when?: "now" | "scheduled" | "self";
    };
  },
  fallback: SendPointsDraft,
): { draft: SendPointsDraft; step: 0 | 1 | 2 | 3; selectedWalletId: string } {
  const ds = campaign.draftState ?? {};
  const step =
    ds.step === 0 || ds.step === 1 || ds.step === 2 || ds.step === 3 ? ds.step : 0;
  return {
    draft: {
      ...fallback,
      orderName: campaign.name || "",
      ppr: campaign.creditsPerRecipient ?? 0,
      recips: ds.recips ?? campaign.recipientCount ?? 0,
      selRecips: ds.selRecips ?? [],
      pointsScope: campaign.pointsScope ?? fallback.pointsScope,
      from: campaign.senderName || "",
      msg: campaign.messageBody || "",
      when:
        ds.when === "scheduled"
          ? "sched"
          : ds.when === "now" || ds.when === "self"
            ? ds.when
            : fallback.when,
      preview: ds.preview ?? fallback.preview,
      pay: ds.pay ?? fallback.pay,
    },
    step,
    selectedWalletId: ds.selectedWalletId ?? "",
  };
}
