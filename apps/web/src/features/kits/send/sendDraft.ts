import {
  EMPTY_SINGLE_LOCATION,
  type PaymentMethod,
  type ScheduleDraft,
  type SendMode,
  type SingleLocation,
  type WhenMode,
} from "@/features/send/types";

export type SendKitDraft = {
  picked: number[];
  mode: SendMode;
  selRecips: string[];
  singleLocation: SingleLocation;
  note: string;
  from: string;
  msg: string;
  when: WhenMode;
  schedule: ScheduleDraft;
  preview: "landing" | "email";
  pay: PaymentMethod;
  pkg: "none" | "box";
  recipVariants: Record<string, Record<string, { size?: string; color?: string; variantImage?: string }>>;
};

export type SendKitAction =
  | { type: "togglePick"; index: number }
  | { type: "toggleRecip"; id: string }
  | { type: "deselectRecips" }
  | { type: "setSelRecips"; selRecips: string[] }
  | { type: "setMode"; mode: SendMode }
  | { type: "setSingleLoc"; key: keyof SingleLocation; value: string }
  | { type: "setNote"; note: string }
  | { type: "setFrom"; from: string }
  | { type: "setMsg"; msg: string }
  | { type: "setWhen"; when: WhenMode }
  | { type: "setSchedule"; key: keyof ScheduleDraft; value: string }
  | { type: "setPreview"; preview: "landing" | "email" }
  | { type: "setPay"; pay: PaymentMethod }
  | { type: "setPkg"; pkg: "none" | "box" }
  | { type: "hydrate"; draft: SendKitDraft }
  | { type: "setRecipVariant"; contactId: string; productId: string; key: "size" | "color" | "variantImage"; value: string }
  | {
      type: "applyVariantToAll";
      contactIds: string[];
      productId: string;
      patch: { size?: string; color?: string; variantImage?: string };
    }
  | { type: "remapRecipId"; fromId: string; toId: string };

export function sendKitReducer(state: SendKitDraft, action: SendKitAction): SendKitDraft {
  switch (action.type) {
    case "togglePick": {
      const has = state.picked.includes(action.index);
      return {
        ...state,
        picked: has
          ? state.picked.filter((i) => i !== action.index)
          : [...state.picked, action.index],
      };
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
    case "deselectRecips":
      return { ...state, selRecips: [] };
    case "setSelRecips":
      return { ...state, selRecips: action.selRecips };
    case "setMode":
      return { ...state, mode: action.mode };
    case "setSingleLoc":
      return { ...state, singleLocation: { ...state.singleLocation, [action.key]: action.value } };
    case "setNote":
      return { ...state, note: action.note };
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
    case "setPkg":
      return { ...state, pkg: action.pkg };
    case "hydrate":
      return action.draft;
    case "setRecipVariant": {
      const contactVariants = state.recipVariants[action.contactId] || {};
      const productVariant = contactVariants[action.productId] || {};
      return {
        ...state,
        recipVariants: {
          ...state.recipVariants,
          [action.contactId]: {
            ...contactVariants,
            [action.productId]: {
              ...productVariant,
              [action.key]: action.value,
            },
          },
        },
      };
    }
    case "applyVariantToAll": {
      const next = { ...state.recipVariants };
      for (const contactId of action.contactIds) {
        const contactVariants = { ...(next[contactId] || {}) };
        const productVariant = { ...(contactVariants[action.productId] || {}), ...action.patch };
        contactVariants[action.productId] = productVariant;
        next[contactId] = contactVariants;
      }
      return { ...state, recipVariants: next };
    }
    case "remapRecipId": {
      if (!action.fromId || action.fromId === action.toId) return state;
      const { [action.fromId]: fromVariants, ...restVariants } = state.recipVariants;
      return {
        ...state,
        selRecips: [...new Set(state.selRecips.map((id) => (id === action.fromId ? action.toId : id)))],
        recipVariants: fromVariants
          ? {
              ...restVariants,
              [action.toId]: { ...(restVariants[action.toId] || {}), ...fromVariants },
            }
          : restVariants,
      };
    }
    default:
      return state;
  }
}

export function initialSendKitDraft(
  picked: number[],
  packaging: "none" | "box",
  firstRecips: string[],
  account: string,
): SendKitDraft {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return {
    picked,
    mode: "redeem",
    selRecips: firstRecips,
    singleLocation: { ...EMPTY_SINGLE_LOCATION },
    note: "Welcome to the team. We are thrilled to have you!",
    from: `People Team, ${account}`,
    msg: "Your welcome kit is on its way! A little something from all of us. We're so glad you're here.",
    when: "now",
    schedule: { date: tomorrow, time: "10:00", tz: "Asia/Kolkata (IST)" },
    preview: "landing",
    pay: "wallet",
    pkg: packaging,
    recipVariants: {},
  };
}
