// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotConfirmationCard } from "./CopilotConfirmationCard";
import * as api from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
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

const baseArtifact = {
  kind: "confirmation" as const,
  operation: "shops.update",
  confirmationId: "confirm-update-abcdefghijklmnopqrstuv",
  preview: { shopId: "507f1f77bcf86cd799439011", changes: [{ field: "name", from: "Old", to: "New" }] },
  request: { shopId: "507f1f77bcf86cd799439011", name: "New" },
  status: "pending" as const,
};

describe("CopilotConfirmationCard store update recovery", () => {
  it("shows success for a successful update execute and persists the outcome", async () => {
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({
      status: "pending",
      confirmationId: baseArtifact.confirmationId,
    });
    vi.mocked(api.executeCopilotWriteApi).mockResolvedValue({
      id: "507f1f77bcf86cd799439011",
      name: "New",
      status: "draft",
    });
    vi.mocked(api.persistCopilotWriteArtifactApi).mockResolvedValue({
      ok: true,
      conversationId: "507f1f77bcf86cd799439099",
      confirmationId: baseArtifact.confirmationId,
    });
    const onChange = vi.fn();
    render(
      <CopilotConfirmationCard
        artifact={baseArtifact}
        conversationId="507f1f77bcf86cd799439099"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "success", operation: "shops.update" }),
      ),
    );
    expect(api.persistCopilotWriteArtifactApi).toHaveBeenCalled();
  });

  it("keeps genuine validation failures as failed without inventing success", async () => {
    vi.mocked(api.resolveCopilotWriteApi)
      .mockResolvedValueOnce({
        status: "pending",
        confirmationId: baseArtifact.confirmationId,
      })
      .mockResolvedValueOnce({
        status: "pending",
        confirmationId: baseArtifact.confirmationId,
      });
    vi.mocked(api.executeCopilotWriteApi).mockRejectedValue(new Error("Store details are not valid"));
    vi.mocked(api.persistCopilotWriteArtifactApi).mockResolvedValue({
      ok: true,
      conversationId: "507f1f77bcf86cd799439099",
      confirmationId: baseArtifact.confirmationId,
    });
    const onChange = vi.fn();
    const { rerender } = render(
      <CopilotConfirmationCard
        artifact={baseArtifact}
        conversationId="507f1f77bcf86cd799439099"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Store details are not valid");
    rerender(
      <CopilotConfirmationCard
        artifact={{ ...baseArtifact, status: "failed" }}
        conversationId="507f1f77bcf86cd799439099"
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole("button", { name: /Confirm/i })).not.toBeInTheDocument();
  });

  it("recovers success after a network interruption when backend already completed", async () => {
    vi.mocked(api.resolveCopilotWriteApi)
      .mockResolvedValueOnce({
        status: "pending",
        confirmationId: baseArtifact.confirmationId,
      })
      .mockResolvedValueOnce({
        status: "completed",
        confirmationId: baseArtifact.confirmationId,
        result: { id: "507f1f77bcf86cd799439011", name: "New", status: "draft" },
      });
    vi.mocked(api.executeCopilotWriteApi).mockRejectedValue(new Error("Network error"));
    vi.mocked(api.persistCopilotWriteArtifactApi).mockResolvedValue({
      ok: true,
      conversationId: "507f1f77bcf86cd799439099",
      confirmationId: baseArtifact.confirmationId,
    });
    const onChange = vi.fn();
    render(
      <CopilotConfirmationCard
        artifact={baseArtifact}
        conversationId="507f1f77bcf86cd799439099"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "success", operation: "shops.update" }),
      ),
    );
    expect(api.executeCopilotWriteApi).toHaveBeenCalledOnce();
  });
});