import { z } from "zod";
import { selectedDepartments, type WizardDept } from "./types";

export type ManagerField = "name" | "role" | "email" | "mobile";
export type ManagerErrors = Partial<Record<ManagerField, string>>;
const emailSchema = z.string().email().max(254);

/** Accept saved numbers and pasted numbers with the Indian country code. */
export function managerMobileDigits(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (/^\+91\d*$/.test(compact)) return compact.slice(3);
  if (/^91\d{10}$/.test(compact)) return compact.slice(2);
  return compact;
}

export function validateManager(manager: WizardDept["mgr"]): ManagerErrors {
  const errors: ManagerErrors = {};
  if (!manager.name.trim()) errors.name = "Enter the manager's name.";
  else if (manager.name.trim().length > 100) errors.name = "Use 100 characters or fewer.";
  if (manager.role.trim().length > 100) errors.role = "Use 100 characters or fewer.";
  if (!manager.email.trim()) errors.email = "Enter the manager's work email.";
  else if (!emailSchema.safeParse(manager.email.trim()).success) {
    errors.email = "Enter a valid work email, such as name@company.com.";
  }
  if (manager.mobile.trim() && !/^\d{10}$/.test(managerMobileDigits(manager.mobile))) {
    errors.mobile = "Enter a valid 10-digit mobile number.";
  }
  return errors;
}

export function managersValid(departments: WizardDept[]): boolean {
  return selectedDepartments(departments).every((d) => Object.keys(validateManager(d.mgr)).length === 0);
}
