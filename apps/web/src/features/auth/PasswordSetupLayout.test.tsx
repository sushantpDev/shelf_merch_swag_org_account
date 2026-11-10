// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AcceptInviteView } from "@/components/public/views/AcceptInviteView";
import type { AcceptInviteVm } from "@/components/public/controllers/useAcceptInviteController";
import { StoreAuthPanel } from "@/features/store-auth/StoreAuthPanel";
import { ResetPasswordPage } from "./ResetPasswordPage";
import type { StorefrontData } from "@/services/api-bridge";

const { claim, validate } = vi.hoisted(() => ({ claim: vi.fn(), validate: vi.fn() }));
vi.mock("@/services/api-bridge", async (original) => ({
  ...(await original<typeof import("@/services/api-bridge")>()),
  claimRedeemShopAccount: claim,
  validatePasswordResetToken: validate,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function expectSharedBrand() {
  expect(document.querySelector(".auth-login-reference.auth-welcome-redesign")).not.toBeNull();
  expect(document.querySelector(".auth-reference-kit")?.getAttribute("src")).toBe("/images/landing/auth-people-gifting-v4.webp");
  expect(document.querySelector(".auth-corner-logo-image")?.getAttribute("src")).toBe("/images/logo/shelfmerch-wordmark.png");
  expect(document.querySelector(".auth-reference-divider")).toBeNull();
}
const invite: AcceptInviteVm = {
  token: "test-invitation", password: "", confirm: "", loading: false,
  error: "", done: false, showLoginHint: false, canSubmit: false,
  onPassword: vi.fn(), onConfirm: vi.fn(), onSubmit: vi.fn(),
};

describe("Password setup branding", () => {
  it("uses the login branding and neutral copy for invited accounts", () => {
    render(<MemoryRouter><AcceptInviteView {...invite} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Create your password" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("department manager");
    expectSharedBrand();
    expect(screen.getByRole("button", { name: "Accept invitation" }).hasAttribute("disabled")).toBe(true);
  });
  it("keeps the same branding for invalid invitation links", () => {
    render(<MemoryRouter><AcceptInviteView {...invite} token="" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Invitation link invalid" })).toBeTruthy();
    expectSharedBrand();
  });
  it("uses the shared layout when an employee creates a password from a store invite", async () => {
    claim.mockResolvedValue({ needsPassword: true, email: "person@example.test", emailMasked: "p***@example.test", name: "Test colleague" });
    const shop = { id: "test-shop", name: "Team store" } as StorefrontData["shop"];
    const authenticated = vi.fn();
    render(<MemoryRouter><StoreAuthPanel shop={shop} redeemToken="test-redemption" onAuthenticated={authenticated} /></MemoryRouter>);
    expect(await screen.findByLabelText("Create password")).toBeTruthy();
    expectSharedBrand();
    expect(claim).toHaveBeenCalledWith("test-redemption");
    expect(authenticated).not.toHaveBeenCalled();
  });
  it("uses the same layout for validated password reset links", async () => {
    validate.mockResolvedValue({ valid: true, email: "person@example.test" });
    render(<MemoryRouter initialEntries={["/reset-password?token=test-reset"]}><ResetPasswordPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Create a new password" })).toBeTruthy();
    expectSharedBrand();
    expect(screen.getByLabelText("Email Address").getAttribute("readonly")).not.toBeNull();
  });
});
