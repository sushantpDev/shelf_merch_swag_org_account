// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { OauthConsentPage } from "./OauthConsentPage";

vi.mock("@/services/auth-store", () => ({
  isAuthenticated: () => true,
  getAccessToken: () => "test-token",
  clearSession: vi.fn(),
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const session = {
  client: { name: "Test application" },
  account: { name: "Test user", email: "user@example.test" },
  workspaces: [{ id: "workspace-a", name: "Team A" }, { id: "workspace-b", name: "Team B" }],
  scope: "catalog:read employees:write",
};
function setup(workspaces = session.workspaces) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...session, workspaces })))
    .mockResolvedValue(new Response(JSON.stringify({ error: { message: "Test decision failure" } }), { status: 400 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><OauthConsentPage /></MemoryRouter>);
  return fetchMock;
}
describe("OAuth consent", () => {
  it("shows current auth branding, all permissions and requires a workspace before allowing", async () => {
    const fetchMock = setup();
    expect(await screen.findByText("Test application")).toBeTruthy();
    expect(document.querySelector(".oauth-consent.auth-login-reference")).not.toBeNull();
    expect(document.querySelector(".auth-reference-kit")?.getAttribute("src")).toBe("/images/landing/auth-people-gifting-v4.webp");
    expect(screen.getByText("Read the product catalog (catalog:read)")).toBeTruthy();
    expect(screen.getByText("Manage employees (employees:write)")).toBeTruthy();
    const allow = screen.getByRole("button", { name: "Allow access" }) as HTMLButtonElement;
    expect(allow.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Team B" }));
    expect(allow.disabled).toBe(false);
    fireEvent.click(allow);
    await screen.findByRole("alert");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ decision: "allow", tenantId: "workspace-b" });
  });
  it("can deny without selecting a workspace and sends no tenant grant", async () => {
    const fetchMock = setup();
    await screen.findByText("Test application");
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ decision: "deny" });
    await screen.findByRole("alert");
  });
  it("keeps allow disabled for accounts without an eligible workspace", async () => {
    setup([]);
    await screen.findByText("Test application");
    expect((screen.getByRole("button", { name: "Allow access" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("no company workspace");
  });
});
