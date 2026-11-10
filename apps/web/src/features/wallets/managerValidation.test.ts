import { describe, expect, it } from "vitest";
import { managerMobileDigits, managersValid, validateManager } from "./managerValidation";
import type { WizardDept } from "./types";

const manager: WizardDept["mgr"] = {
  name: "Tom Banton", role: "Operations Manager", email: "tom@company.com", mobile: "9876543210", invite: true,
};

describe("manager validation", () => {
  it("rejects the malformed email and mobile from the reported form", () => {
    const errors = validateManager({ ...manager, email: "tom@company.com11111111111", mobile: "ssss1111111111111@@@@" });
    expect(errors.email).toBeDefined();
    expect(errors.mobile).toBeDefined();
  });

  it.each(["tom", "tom@company", "tom@@company.com", "tom @company.com"])("rejects invalid email %s", (email) => {
    expect(validateManager({ ...manager, email }).email).toBeDefined();
  });

  it("requires a nonblank name and email, with reasonable text limits", () => {
    expect(validateManager({ ...manager, name: "  ", email: " " })).toHaveProperty("name");
    expect(validateManager({ ...manager, name: "  ", email: " " })).toHaveProperty("email");
    expect(validateManager({ ...manager, name: "x".repeat(101), role: "x".repeat(101) })).toHaveProperty("role");
  });

  it.each(["9876543210", "+91 98765 43210", "919876543210", ""])("accepts mobile %s", (mobile) => {
    expect(validateManager({ ...manager, mobile })).toEqual({});
  });

  it.each(["123", "98765432101", "+1 9876543210", "abcdefghij"])("rejects invalid mobile %s", (mobile) => {
    expect(validateManager({ ...manager, mobile }).mobile).toBeDefined();
  });

  it("normalizes country codes without stripping invalid letters", () => {
    expect(managerMobileDigits("+91 (98765) 43210")).toBe("9876543210");
    expect(managerMobileDigits("sss123@@")).toBe("sss123@@");
  });

  it("checks every selected department and ignores unselected departments", () => {
    const dept: WizardDept = { id: 1, name: "Operations", desc: "", users: 1, allocated: 100, color: "#fff", mgr: manager, selected: true };
    const invalid = { ...dept, id: 2, mgr: { ...manager, email: "bad" } };
    expect(managersValid([dept, invalid])).toBe(false);
    expect(managersValid([dept, { ...invalid, selected: false }])).toBe(true);
  });
});
