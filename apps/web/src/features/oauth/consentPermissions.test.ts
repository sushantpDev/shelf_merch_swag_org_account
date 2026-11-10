import { describe, expect, it } from "vitest";
import { permissionLines, READ_PERMISSION_LABELS } from "./consentPermissions";

const READ_SCOPES = [
  "catalog:read",
  "orders:read",
  "campaigns:read",
  "wallets:read",
  "employees:read",
  "gifts:read",
];

describe("permissionLines", () => {
  it("shows the six read permissions and hides offline_access", () => {
    const lines = permissionLines(`${READ_SCOPES.join(" ")} offline_access openid`);
    expect(lines).toEqual(READ_SCOPES.map((scope) => READ_PERMISSION_LABELS[scope]));
    expect(lines.join(" ")).not.toContain("offline_access");
    expect(lines.join(" ")).not.toContain("openid");
  });

  it("keeps a catalog-only grant on the catalog permission", () => {
    expect(permissionLines("catalog:read")).toEqual([READ_PERMISSION_LABELS["catalog:read"]]);
  });
  it("shows employee write only when that scope was requested", () => {
    const lines = permissionLines("employees:read employees:write offline_access");
    expect(lines).toEqual([
      "Read employees (employees:read)",
      "Manage employees (employees:write)",
    ]);
    expect(permissionLines(READ_SCOPES.join(" ")).join(" ")).not.toContain("employees:write");
  });
  it("shows campaign drafts only when that scope was requested", () => {
    const lines = permissionLines("campaigns:read campaigns:draft offline_access");
    expect(lines).toEqual([
      "Read campaigns (campaigns:read)",
      "Create campaign drafts (campaigns:draft)",
    ]);
    expect(permissionLines(READ_SCOPES.join(" ")).join(" ")).not.toContain("campaigns:draft");
  });

  it("shows store write only when that scope was requested", () => {
    const lines = permissionLines("catalog:read shops:write offline_access");
    expect(lines).toEqual([
      "Read the product catalog (catalog:read)",
      "Manage company stores (shops:write)",
    ]);
    expect(permissionLines(READ_SCOPES.join(" ")).join(" ")).not.toContain("shops:write");
  });

  it("shows store catalog only when that scope was requested", () => {
    const lines = permissionLines("catalog:read shops:catalog offline_access");
    expect(lines).toEqual([
      "Read the product catalog (catalog:read)",
      "Choose store products (shops:catalog)",
    ]);
    expect(permissionLines(READ_SCOPES.join(" ")).join(" ")).not.toContain("shops:catalog");
  });

  it("shows budget allocation only when that scope was requested", () => {
    const lines = permissionLines("catalog:read wallets:allocate offline_access");
    expect(lines).toEqual([
      "Read the product catalog (catalog:read)",
      "Allocate department budgets (wallets:allocate)",
    ]);
    expect(permissionLines(READ_SCOPES.join(" ")).join(" ")).not.toContain("wallets:allocate");
  });

  it("shows campaign send only when that scope was requested", () => {
    const lines = permissionLines("catalog:read campaigns:send offline_access");
    expect(lines).toEqual([
      "Read the product catalog (catalog:read)",
      "Send campaign rewards (campaigns:send)",
    ]);
    expect(permissionLines(READ_SCOPES.join(" ")).join(" ")).not.toContain("campaigns:send");
  });

  it("shows kit campaigns and collection publishing only when those scopes were requested", () => {
    expect(permissionLines("catalog:read campaigns:merchandise offline_access")).toEqual([
      "Read the product catalog (catalog:read)",
      "Send kit campaigns (campaigns:merchandise)",
    ]);
    expect(permissionLines("catalog:read shops:publish offline_access")).toEqual([
      "Read the product catalog (catalog:read)",
      "Publish store collections (shops:publish)",
    ]);
    const reads = permissionLines(READ_SCOPES.join(" ")).join(" ");
    expect(reads).not.toContain("campaigns:merchandise");
    expect(reads).not.toContain("shops:publish");
  });

});
