// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { CopilotPage } from "./CopilotPage";
import * as api from "./api";
import { useCopilotStatus } from "./useCopilotStatus";
import { discoveryCategories } from "./discovery.testFixtures";

vi.mock("./api", () => ({
  createCopilotConversation: vi.fn(),
  deleteCopilotConversation: vi.fn(),
  getCopilotConversation: vi.fn(),
  listCopilotConversations: vi.fn(),
  streamCopilotMessage: vi.fn(),
}));
vi.mock("./useCopilotStatus", () => ({ useCopilotStatus: vi.fn() }));
const status = {
  enabled: true,
  provider: "openai",
  model: null,
  role: "company_admin",
  writeToolsEnabled: false,
  discovery: { categories: discoveryCategories },
  capabilities: [
    { id: "explore_catalog", group: "Discover", title: "Catalog", prompt: "Show apparel" },
  ],
};
const conversation = {
  id: "c1",
  title: "Welcome kits",
  createdAt: "2026-11-09T00:00:00Z",
  updatedAt: "2026-11-09T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCopilotStatus).mockReturnValue({
    data: status,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCopilotStatus>);
  vi.mocked(api.listCopilotConversations).mockResolvedValue({ items: [conversation] });
  vi.mocked(api.createCopilotConversation).mockResolvedValue({
    id: "c2",
    title: "New conversation",
  });
  vi.mocked(api.getCopilotConversation).mockResolvedValue({
    id: "c1",
    title: "Welcome kits",
    messages: [
      { role: "user", content: "A previous question" },
      { role: "assistant", content: "A previous reply" },
    ],
  });
  vi.mocked(api.streamCopilotMessage).mockImplementation(async (id, _content, handlers) => {
    handlers.onDelta?.("Here is a reply");
    handlers.onDone?.({ conversationId: id, title: "Gifting ideas" });
  });
});
afterEach(cleanup);
const setup = () =>
  render(
    <MemoryRouter initialEntries={["/husain/copilot"]}>
      <CopilotPage />
    </MemoryRouter>,
  );

function draftProductRequest() {
  fireEvent.click(screen.getByRole("button", { name: "Products & Kits" }));
  fireEvent.click(screen.getByRole("button", { name: "Explore products" }));
}
function sendProductRequest() {
  draftProductRequest();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
}

describe("Copilot workspace", () => {
  it("closes back to the page that launched Copilot", () => {
    localStorage.setItem("sm_workspace_slug", "husain");
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/husain/copilot",
            state: { copilotReturnTo: "/husain/orders?status=active" },
          },
        ]}
      >
        <Routes>
          <Route path="/husain/copilot" element={<CopilotPage />} />
          <Route path="/husain/orders" element={<p>Orders page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Copilot" }));
    expect(screen.getByText("Orders page")).toBeTruthy();
    localStorage.removeItem("sm_workspace_slug");
  });
  it("enters Curate Gifts without creating a conversation and returns to normal chat", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Curate Gifts/ }));
    expect(screen.getByRole("heading", { name: "Great gifts start with your team." })).toBeTruthy();
    expect(api.createCopilotConversation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Welcome kits for new employees" }));
    expect(screen.getByRole("textbox")).toHaveValue("Welcome kits for new employees");
    fireEvent.click(screen.getByRole("button", { name: /Normal Copilot/ }));
    expect(screen.getByRole("heading", { name: "How can I help you today?" })).toBeTruthy();
  });
  it("drafts the selected request and creates no conversation until the user sends", async () => {
    setup();
    draftProductRequest();
    expect(screen.getByRole("textbox")).toHaveValue("Show apparel");
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(api.createCopilotConversation).not.toHaveBeenCalled();
    expect(api.streamCopilotMessage).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(await screen.findByText("Here is a reply")).toBeTruthy();
    expect(api.createCopilotConversation).toHaveBeenCalledOnce();
    expect(api.streamCopilotMessage).toHaveBeenCalledWith(
      "c2",
      "Show apparel",
      expect.any(Object),
      expect.any(AbortSignal),
      [],
      "chat",
    );
  });
  it("opens a saved conversation and returns to an empty new chat without creating a server record", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("A previous reply")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "New chat" })[0]);
    expect(screen.getByRole("heading", { name: "How can I help you today?" })).toBeTruthy();
    expect(api.createCopilotConversation).not.toHaveBeenCalled();
  });
  it("handles failed conversation loads and lets the user select it again", async () => {
    vi.mocked(api.getCopilotConversation).mockRejectedValueOnce(
      new Error("Could not load conversation"),
    );
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load conversation");
    fireEvent.click(screen.getByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("A previous reply")).toBeTruthy();
  });
  it("recovers the draft after a stream error and clears the loading state", async () => {
    vi.mocked(api.streamCopilotMessage).mockImplementationOnce(async (_id, _content, handlers) => {
      handlers.onError?.({ message: "Connection interrupted" });
    });
    setup();
    sendProductRequest();
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection interrupted");
    fireEvent.click(screen.getByRole("button", { name: "Edit & retry" }));
    expect(screen.getByRole("textbox")).toHaveValue("Show apparel");
    expect(screen.getByRole("button", { name: "Send message" })).not.toBeDisabled();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("locks conversation changes while a reply streams and aborts on unmount", async () => {
    let finish: (() => void) | undefined;
    let signal: AbortSignal | undefined;
    vi.mocked(api.streamCopilotMessage).mockImplementationOnce(
      (_id, _content, _handlers, incomingSignal) => {
        signal = incomingSignal;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    );
    const view = setup();
    sendProductRequest();
    await waitFor(() => expect(api.streamCopilotMessage).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: /Welcome kits/ })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "New chat" })[0]).toBeDisabled();
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => finish?.());
  });
  it("keeps history readable but disables sends when the provider is unavailable", async () => {
    vi.mocked(useCopilotStatus).mockReturnValue({
      data: { ...status, provider: "disabled" },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCopilotStatus>);
    setup();
    expect(screen.getByRole("textbox")).not.toBeDisabled();
    draftProductRequest();
    expect(screen.getByRole("textbox")).toHaveValue("Show apparel");
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("A previous reply")).toBeTruthy();
    expect(api.streamCopilotMessage).not.toHaveBeenCalled();
  });
  it("resets selected capabilities on new chat without deleting stored conversations", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Budgets & Wallet" }));
    expect(screen.getByRole("heading", { name: "How can I help with your budget?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.getByRole("button", { name: "Products & Kits" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Welcome kits/ })).toBeTruthy();
    expect(api.deleteCopilotConversation).not.toHaveBeenCalled();
  });
});
