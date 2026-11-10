import { z } from "zod";
import { COUNTRY_OPTIONS, isCountryCode } from "@/data/countries";
import type { UiContact } from "@/services/mappers";

export const ROLES = ["Owner", "Admin", "Sender", "Member", "Non-Member"] as const;
/** Roles a user can pick when adding (Owner is assigned, not chosen). */
export const ADD_ROLES = ["Non-Member", "Member", "Sender", "Admin"] as const;

/** Directory-style worker status from HRIS effective status, with a role fallback. */
export function contactWorkerStatus(contact: {
  role?: string;
  employmentStatus?: string;
  effectiveEmploymentStatus?: string;
}): { key: "active" | "invited" | "inactive"; label: string } {
  const raw = String(contact.effectiveEmploymentStatus || contact.employmentStatus || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (raw === "INACTIVE" || raw === "TERMINATED" || raw === "ARCHIVED") {
    return { key: "inactive", label: "No active contracts" };
  }
  if (raw === "SUSPENDED") return { key: "inactive", label: "Suspended" };
  if (raw === "PENDING") return { key: "invited", label: "Invited" };
  if (raw === "ACTIVE") return { key: "active", label: "Active" };
  if (contact.role === "Non-Member") return { key: "invited", label: "Invited" };
  return { key: "active", label: "Active" };
}

export const COUNTRIES = COUNTRY_OPTIONS;

const PERSON_NAME_RE = /^[a-zA-Z\s'.-]+$/;
const CITY_STATE_RE = /^[a-zA-Z\s.-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactFieldKind =
  "personName" | "email" | "phone" | "city" | "state" | "postal" | "text";

/** Sanitize contact field input so only appropriate characters are kept. */
export function sanitizeContactField(kind: ContactFieldKind, value: string): string {
  switch (kind) {
    case "personName":
      return value.replace(/[^a-zA-Z\s'.-]/g, "");
    case "email":
      return value.replace(/\s/g, "");
    case "phone":
      return value.replace(/\D/g, "").slice(0, 10);
    case "city":
    case "state":
      return value.replace(/[^a-zA-Z\s.-]/g, "");
    case "postal":
      return value.replace(/\D/g, "").slice(0, 10);
    case "text":
    default:
      return value;
  }
}

const optionalPersonName = z
  .string()
  .trim()
  .default("")
  .refine((v) => !v || PERSON_NAME_RE.test(v), {
    message: "Should contain letters only",
  });

const optionalCityState = z
  .string()
  .trim()
  .default("")
  .refine((v) => !v || CITY_STATE_RE.test(v), {
    message: "Should contain letters only",
  });

export const contactSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .refine((v) => PERSON_NAME_RE.test(v), {
      message: "First name should contain letters only",
    }),
  lastName: optionalPersonName,
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .refine((v) => EMAIL_RE.test(v), { message: "Enter a valid email address" }),
  phone: z
    .string()
    .trim()
    .default("")
    .refine((v) => !v || /^\d{10}$/.test(v.replace(/\D/g, "")), {
      message: "Phone number must be exactly 10 digits",
    }),
  role: z.enum(ROLES),
  department: z.string().trim().default(""),
  employeeCode: z.string().trim().default(""),
  line1: z.string().trim().default(""),
  city: optionalCityState,
  state: optionalCityState,
  pincode: z
    .string()
    .trim()
    .default("")
    .refine((v) => !v || /^\d{4,10}$/.test(v), {
      message: "PIN code should contain 4–10 digits",
    }),
  country: z.string().trim().toUpperCase().refine(isCountryCode, "Select a valid country"),
});

export type ContactFormValues = z.infer<typeof contactSchema>;

/** API payload shape shared by add + update flows. */
export function toContactPayload(v: ContactFormValues) {
  return {
    name: [v.firstName, v.lastName].filter(Boolean).join(" "),
    email: v.email,
    phone: v.phone,
    role: v.role,
    department: v.department,
    employeeCode: v.employeeCode,
    address: {
      line1: v.line1,
      city: v.city,
      state: v.state,
      pincode: v.pincode,
      country: v.country,
    },
  };
}

/** Seed the form from an existing contact (edit mode). */
export function contactToForm(c: UiContact): ContactFormValues {
  const parts = (c.name ?? "").split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
    email: c.email ?? "",
    phone: (c.phone ?? "").replace(/\D/g, "").slice(0, 10),
    role: (ROLES as readonly string[]).includes(c.role)
      ? (c.role as ContactFormValues["role"])
      : "Member",
    department: c.department ?? "",
    employeeCode: c.employeeCode ?? "",
    line1: c.address ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    pincode: (c.pincode ?? "").replace(/\D/g, "").slice(0, 10),
    country: isCountryCode(c.country) ? c.country.toUpperCase() : "IN",
  };
}

export const EMPTY_CONTACT: ContactFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "Member",
  department: "",
  employeeCode: "",
  line1: "",
  city: "",
  state: "",
  pincode: "",
  country: "IN",
};
