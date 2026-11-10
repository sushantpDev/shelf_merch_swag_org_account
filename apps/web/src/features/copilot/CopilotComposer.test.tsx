// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotComposer } from "./CopilotComposer";
import type { CopilotAttachmentDraft } from "./attachments";

function renderComposer(
  overrides: Partial<React.ComponentProps<typeof CopilotComposer>> = {},
) {
  const props: React.ComponentProps<typeof CopilotComposer> = {
    draft: "Find gifts",
    onDraft: vi.fn(),
    onSend: vi.fn(),
    busy: false,
    disabled: false,
    attachments: [],
    onAttachmentsChange: vi.fn(),
    onUploadAttachment: vi.fn(),
    onRetryAttachment: vi.fn(),
    onRemoveAttachment: vi.fn(),
    ...overrides,
  };
  return { ...render(<CopilotComposer {...props} />), props };
}

afterEach(cleanup);

describe("Copilot composer keyboard", () => {
  it("sends on Enter while preserving Shift+Enter and IME composition", () => {
    const onSend = vi.fn();
    renderComposer({ onSend });
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Find gifts");
  });

  it("prevents duplicate sends while a reply is in progress", () => {
    const onSend = vi.fn();
    renderComposer({ onSend, busy: true });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sending message" })).toBeDisabled();
  });

  it("keeps the composer usable without attachments", () => {
    renderComposer({ draft: "" });
    expect(screen.getByRole("button", { name: "Add attachment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("Copilot composer attachments", () => {
  it("shows the plus button and opens/closes the attachment menu", () => {
    renderComposer();
    const plus = screen.getByRole("button", { name: "Add attachment" });
    fireEvent.click(plus);
    const menu = screen.getByRole("menu", { name: "Attachment options" });
    expect(within(menu).getByRole("menuitem", { name: /Reference product image/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Upload Purchase Order/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Store logo artwork/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Attach File/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("uses supported accept types for purchase order and artwork pickers", () => {
    renderComposer();
    const po = document.querySelector('input[data-copilot-attach="purchase_order"]') as HTMLInputElement;
    const art = document.querySelector('input[data-copilot-attach="artwork"]') as HTMLInputElement;
    const ref = document.querySelector('input[data-copilot-attach="reference_image"]') as HTMLInputElement;
    expect(po.accept).toContain(".pdf");
    expect(art.accept).toContain(".png");
    // Reference images use empty accept so WhatsApp timestamp names are selectable.
    expect(ref.accept).toBe("");
  });

  it("renders image preview chips and supports removal", () => {
    const onRemoveAttachment = vi.fn();
    const attachment: CopilotAttachmentDraft = {
      localId: "a1",
      kind: "artwork",
      file: new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" }),
      status: "uploaded",
      previewUrl: "blob:http://localhost/preview",
      serverId: "507f1f77bcf86cd799439011",
      originalName: "logo.png",
      mimeType: "image/png",
      sizeBytes: 1200,
    };
    renderComposer({ attachments: [attachment], onRemoveAttachment, draft: "" });
    expect(screen.getByText("logo.png")).toBeInTheDocument();
    expect(document.querySelector(".sm-copilot-attach-thumb")).toHaveAttribute(
      "src",
      "blob:http://localhost/preview",
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove logo.png" }));
    expect(onRemoveAttachment).toHaveBeenCalledWith("a1");
  });

  it("shows uploading progress and allows retry after failure", () => {
    const onRetryAttachment = vi.fn();
    const uploading: CopilotAttachmentDraft = {
      localId: "u1",
      kind: "purchase_order",
      file: new File(["%PDF"], "po.pdf", { type: "application/pdf" }),
      status: "uploading",
      originalName: "po.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
    };
    const { rerender, props } = renderComposer({
      attachments: [uploading],
      onRetryAttachment,
      draft: "Here is the PO",
    });
    expect(screen.getByText("Uploading…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    const failed: CopilotAttachmentDraft = {
      ...uploading,
      status: "failed",
      error: "File is too large",
    };
    rerender(<CopilotComposer {...props} attachments={[failed]} />);
    expect(screen.getByText("File is too large")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry po.pdf" }));
    expect(onRetryAttachment).toHaveBeenCalledWith("u1");
  });

  it("rejects unsupported files without silently ignoring them", () => {
    const onUploadAttachment = vi.fn();
    const onAttachmentsChange = vi.fn();
    renderComposer({ onUploadAttachment, onAttachmentsChange });
    const input = document.querySelector(
      'input[data-copilot-attach="purchase_order"]',
    ) as HTMLInputElement;
    const bad = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [bad] } });
    expect(onUploadAttachment).not.toHaveBeenCalled();
    expect(onAttachmentsChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/must be PDF/i);
  });
  it("does not route dropped PNG photos to store-logo artwork", () => {
    const onUploadAttachment = vi.fn();
    const onAttachmentsChange = vi.fn();
    const { container } = renderComposer({ onUploadAttachment, onAttachmentsChange });
    const shell = container.querySelector(".sm-copilot-composer-shell") as HTMLElement;
    const file = new File([new Uint8Array([1, 2, 3])], "product.png", { type: "image/png" });
    fireEvent.drop(shell, { dataTransfer: { files: [file] } });
    expect(onAttachmentsChange).toHaveBeenCalled();
    const rows = onAttachmentsChange.mock.calls.at(-1)?.[0] as Array<{ kind: string }>;
    expect(rows.some((row) => row.kind === "file")).toBe(true);
    expect(rows.some((row) => row.kind === "artwork")).toBe(false);
    expect(onUploadAttachment).toHaveBeenCalled();
  });

  it("accepts WhatsApp-style JPEG files by MIME type", () => {
    const onUploadAttachment = vi.fn();
    const onAttachmentsChange = vi.fn();
    renderComposer({ onUploadAttachment, onAttachmentsChange });
    const input = document.querySelector(
      'input[data-copilot-attach="reference_image"]',
    ) as HTMLInputElement;
    const wa = new File([new Uint8Array([1, 2, 3, 4])], "WhatsApp Image 2024-11-05 at 12.38.07", {
      type: "image/jpeg",
    });
    fireEvent.change(input, { target: { files: [wa] } });
    expect(onAttachmentsChange).toHaveBeenCalled();
    const rows = onAttachmentsChange.mock.calls.at(-1)?.[0] as Array<{ originalName: string }>;
    expect(rows[0]?.originalName).toMatch(/\.jpe?g$/i);
    expect(onUploadAttachment).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("accepts WhatsApp-style names even when MIME is missing", () => {
    const onUploadAttachment = vi.fn();
    const onAttachmentsChange = vi.fn();
    renderComposer({ onUploadAttachment, onAttachmentsChange });
    const input = document.querySelector(
      'input[data-copilot-attach="reference_image"]',
    ) as HTMLInputElement;
    const wa = new File([new Uint8Array([1, 2, 3, 4])], "WhatsApp Image 2024-11-05 at 12.38.07", {
      type: "",
    });
    fireEvent.change(input, { target: { files: [wa] } });
    expect(onAttachmentsChange).toHaveBeenCalled();
    expect(onUploadAttachment).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not show an error when the picker returns no file", () => {
    renderComposer();
    const input = document.querySelector(
      'input[data-copilot-attach="reference_image"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
