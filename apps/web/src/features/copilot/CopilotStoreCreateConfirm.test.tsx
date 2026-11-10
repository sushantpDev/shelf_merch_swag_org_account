// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotStoreCreateConfirm, CopilotStoreCreateForm } from "./CopilotStoreCreateConfirm";
import * as api from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    prepareCopilotStoreCreateApi: vi.fn(),
    executeCopilotWriteApi: vi.fn(),
    cancelCopilotWriteApi: vi.fn(),
    resolveCopilotWriteApi: vi.fn(),
    persistCopilotWriteArtifactApi: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Copilot store create confirmation UI", () => {
  it("prepares a store create and hands off a confirmation artifact", async () => {
    vi.mocked(api.prepareCopilotStoreCreateApi).mockResolvedValue({
      confirmationId: "confirm-abcdefghijklmnopqrstuvwxyz",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      preview: {
        action: "create",
        name: "Demo Store",
        status: "live",
        currencyMode: "points",
      },
      request: { name: "Demo Store", currencyMode: "points" },
    });
    const onPrepared = vi.fn();
    render(<CopilotStoreCreateForm onPrepared={onPrepared} />);
    fireEvent.change(screen.getByLabelText("Store name"), { target: { value: "Demo Store" } });
    fireEvent.click(screen.getByRole("button", { name: /Preview store create/i }));
    await waitFor(() => expect(onPrepared).toHaveBeenCalledOnce());
    expect(onPrepared.mock.calls[0][0]).toMatchObject({
      kind: "confirmation",
      confirmationId: "confirm-abcdefghijklmnopqrstuvwxyz",
      status: "pending",
    });
  });

  it("confirms execute and supports cancel without creating", async () => {
    const onChange = vi.fn();
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({
      status: "pending",
      confirmationId: "confirm-abcdefghijklmnopqrstuvwxyz",
    });
    vi.mocked(api.persistCopilotWriteArtifactApi).mockResolvedValue({
      ok: true,
      conversationId: "507f1f77bcf86cd799439099",
      confirmationId: "confirm-abcdefghijklmnopqrstuvwxyz",
    });
    vi.mocked(api.executeCopilotWriteApi).mockResolvedValue({
      id: "507f1f77bcf86cd799439011",
      name: "Demo Store",
      status: "live",
      slug: "demo-store",
      currencyMode: "points",
      pointsConversionEnabled: true,
      companyEmailDomain: "",
      categories: [],
      logoUrl: "",
      bannerConfig: {},
    });
    vi.mocked(api.cancelCopilotWriteApi).mockResolvedValue({
      status: "cancelled",
      confirmationId: "confirm-abcdefghijklmnopqrstuvwxyz",
    });

    const artifact = {
      kind: "confirmation" as const,
      operation: "shops.create" as const,
      confirmationId: "confirm-abcdefghijklmnopqrstuvwxyz",
      preview: { name: "Demo Store", currencyMode: "points", status: "live" },
      request: { name: "Demo Store", currencyMode: "points" as const },
      status: "pending" as const,
    };

    const { rerender } = render(
      <CopilotStoreCreateConfirm
        artifact={artifact}
        conversationId="507f1f77bcf86cd799439099"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    await waitFor(() => expect(api.executeCopilotWriteApi).toHaveBeenCalledOnce());
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "success",
      operation: "shops.create",
    });
    await waitFor(() => expect(api.persistCopilotWriteArtifactApi).toHaveBeenCalled());

    onChange.mockClear();
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({
      status: "pending",
      confirmationId: "confirm-abcdefghijklmnopqrstuvwxyz",
    });
    rerender(
      <CopilotStoreCreateConfirm
        artifact={artifact}
        conversationId="507f1f77bcf86cd799439099"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    await waitFor(() => expect(api.cancelCopilotWriteApi).toHaveBeenCalledOnce());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
  });

  it("recovers a completed confirmation card without offering Confirm again", async () => {
    const onChange = vi.fn();
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({
      status: "completed",
      confirmationId: "confirm-abcdefghijklmnopqrstuvwxyz",
      result: {
        id: "507f1f77bcf86cd799439011",
        name: "Demo Store",
        status: "live",
      },
    });
    vi.mocked(api.persistCopilotWriteArtifactApi).mockResolvedValue({
      ok: true,
      conversationId: "507f1f77bcf86cd799439099",
      confirmationId: "confirm-abcdefghijklmnopqrstuvwxyz",
    });

    const artifact = {
      kind: "confirmation" as const,
      operation: "shops.create" as const,
      confirmationId: "confirm-abcdefghijklmnopqrstuvwxyz",
      preview: { name: "Demo Store", currencyMode: "points", status: "live" },
      request: { name: "Demo Store", currencyMode: "points" as const },
      status: "pending" as const,
    };

    render(
      <CopilotStoreCreateConfirm
        artifact={artifact}
        conversationId="507f1f77bcf86cd799439099"
        onChange={onChange}
      />,
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "success",
          operation: "shops.create",
        }),
      ),
    );
    expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
    expect(api.resolveCopilotWriteApi).toHaveBeenCalled();
  });
});
