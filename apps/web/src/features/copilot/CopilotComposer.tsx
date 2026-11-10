import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowUp,
  FileImage,
  FileText,
  LoaderCircle,
  Paperclip,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_LIMITS,
  REFERENCE_IMAGE_ACCEPT,
  createAttachmentDraft,
  formatAttachmentSize,
  isReferenceImageFile,
  revokeAttachmentPreview,
  validateAttachmentFile,
  type CopilotAttachmentDraft,
  type CopilotAttachmentKind,
} from "./attachments";

type MenuItem = {
  id: string;
  kind: CopilotAttachmentKind;
  label: string;
  hint: string;
  Icon: typeof FileText;
  accept: string;
  purpose?: "reference_image";
};

const MENU_ITEMS: MenuItem[] = [
  {
    id: "reference_image",
    kind: "file",
    label: "Reference product image",
    hint: "JPG, PNG, WebP, or GIF up to 25 MB",
    Icon: FileImage,
    // Empty accept: Windows All Files — WhatsApp timestamp names survive selection.
    accept: REFERENCE_IMAGE_ACCEPT,
    purpose: "reference_image",
  },
  {
    id: "purchase_order",
    kind: "purchase_order",
    label: "Upload Purchase Order",
    hint: ATTACHMENT_LIMITS.purchase_order.label,
    Icon: FileText,
    accept: ATTACHMENT_ACCEPT.purchase_order,
  },
  {
    id: "artwork",
    kind: "artwork",
    label: "Store logo artwork",
    hint: ATTACHMENT_LIMITS.artwork.label,
    Icon: FileImage,
    accept: ATTACHMENT_ACCEPT.artwork,
  },
  {
    id: "banner",
    kind: "banner",
    label: "Store banner image",
    hint: ATTACHMENT_LIMITS.banner.label,
    Icon: FileImage,
    accept: ATTACHMENT_ACCEPT.banner,
  },
  {
    id: "attach_file",
    kind: "file",
    label: "Attach File",
    hint: ATTACHMENT_LIMITS.file.label,
    Icon: Paperclip,
    accept: ATTACHMENT_ACCEPT.file,
  },
];

export function CopilotComposer({
  draft,
  onDraft,
  onSend,
  busy,
  disabled,
  unavailable = false,
  attachments,
  onAttachmentsChange,
  onUploadAttachment,
  onRetryAttachment,
  onRemoveAttachment,
}: {
  draft: string;
  onDraft: (value: string) => void;
  onSend: (value: string) => void;
  busy: boolean;
  disabled: boolean;
  unavailable?: boolean;
  attachments: CopilotAttachmentDraft[];
  onAttachmentsChange: (rows: CopilotAttachmentDraft[]) => void;
  onUploadAttachment: (row: CopilotAttachmentDraft) => void;
  onRetryAttachment: (localId: string) => void;
  onRemoveAttachment: (localId: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = `${Math.min(input.current.scrollHeight, 180)}px`;
  }, [draft]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || plusRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const uploading = attachments.some((row) => row.status === "uploading" || row.status === "selected");
  const hasFailed = attachments.some((row) => row.status === "failed");
  const readyIds = attachments.filter((row) => row.status === "uploaded" && row.serverId);
  const canSend =
    !disabled &&
    !busy &&
    !unavailable &&
    !uploading &&
    !hasFailed &&
    (Boolean(draft.trim()) || readyIds.length > 0);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSend(draft);
    }
  }

  function applyFiles(
    kind: CopilotAttachmentKind,
    fileList: FileList | File[],
    options?: { imagesOnly?: boolean },
  ) {
    const files = Array.from(fileList);
    if (!files.length) {
      setPickerError(
        "No file reached the composer. Try dragging the image onto the message box, or rename it to end with .jpg and pick again.",
      );
      return;
    }
    if (files.length > 1) {
      setPickerError("Only one file can be attached at a time for this upload type.");
      return;
    }
    const file = files[0];
    const imagesOnly = Boolean(options?.imagesOnly);
    const validationError = validateAttachmentFile(kind, file, { imagesOnly });
    if (validationError) {
      setPickerError(
        `${validationError} (received: ${file.name || "unnamed"}${file.type ? `, ${file.type}` : ""})`,
      );
      return;
    }
    setPickerError(null);
    const next = createAttachmentDraft(kind, file, { imagesOnly });
    // PO/logo/banner are single-slot; general files replace prior general files (max one pending).
    const replaced = attachments.filter((row) => row.kind === kind);
    replaced.forEach(revokeAttachmentPreview);
    const remaining = attachments.filter((row) => row.kind !== kind && row.status !== "removed");
    onAttachmentsChange([...remaining, next]);
    onUploadAttachment(next);
  }

  function onDedicatedFileChange(
    item: MenuItem,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const list = event.target.files;
    // Keep a copy before clearing — some browsers empty FileList after reset.
    const snapshot = list?.length ? Array.from(list) : [];
    event.target.value = "";
    setMenuOpen(false);
    if (!snapshot.length) {
      // Cancel is common; do not alarm. Only tip if they had an error already.
      return;
    }
    applyFiles(item.kind, snapshot, { imagesOnly: item.purpose === "reference_image" });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (disabled || busy) return;
    const files = event.dataTransfer.files;
    if (!files?.length) return;
    const file = files[0];
    const lower = file.name.toLowerCase();
    let kind: CopilotAttachmentKind = "file";
    let imagesOnly = false;
    // Product photos must use kind=file. Artwork is store-logo only (PNG + 300 DPI).
    if (lower.endsWith(".pdf")) kind = "purchase_order";
    else if (isReferenceImageFile(file)) {
      kind = "file";
      imagesOnly = true;
    }
    if (files.length > 1) {
      setPickerError("Only one file can be attached at a time.");
      return;
    }
    applyFiles(kind, files, { imagesOnly });
  }

  return (
    <div className="sm-copilot-composer-wrap">
      {attachments.length || pickerError ? (
        <div className="sm-copilot-attach-rail" aria-live="polite">
          {pickerError ? (
            <p className="sm-copilot-attach-error" role="alert">
              {pickerError}
            </p>
          ) : null}
          <ul className="sm-copilot-attach-list">
            {attachments.map((row) => (
              <li key={row.localId} className={`sm-copilot-attach-chip sm-copilot-attach-chip--${row.status}`}>
                {row.previewUrl ? (
                  <img src={row.previewUrl} alt="" className="sm-copilot-attach-thumb" />
                ) : (
                  <span className="sm-copilot-attach-glyph" aria-hidden="true">
                    {row.kind === "artwork" || row.kind === "banner" || row.mimeType.startsWith("image/") ? (
                      <FileImage size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                  </span>
                )}
                <span className="sm-copilot-attach-meta">
                  <span className="sm-copilot-attach-name">{row.originalName}</span>
                  <span className="sm-copilot-attach-sub">
                    {row.status === "uploading" || row.status === "selected"
                      ? "Uploading…"
                      : row.status === "failed"
                        ? row.error || "Upload failed"
                        : row.status === "uploaded"
                          ? `Uploaded · ${formatAttachmentSize(row.sizeBytes)}`
                          : formatAttachmentSize(row.sizeBytes)}
                  </span>
                </span>
                {row.status === "uploading" || row.status === "selected" ? (
                  <LoaderCircle size={14} className="sm-copilot-spin" aria-label="Uploading" />
                ) : null}
                {row.status === "failed" ? (
                  <button
                    type="button"
                    className="sm-copilot-attach-action"
                    aria-label={`Retry ${row.originalName}`}
                    onClick={() => onRetryAttachment(row.localId)}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="sm-copilot-attach-action"
                  aria-label={`Remove ${row.originalName}`}
                  onClick={() => onRemoveAttachment(row.localId)}
                  disabled={busy}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        className={`sm-copilot-composer-shell${dragOver ? " is-dragover" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled && !busy) setDragOver(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <form
          className="sm-copilot-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) onSend(draft);
          }}
        >
          <div className="sm-copilot-attach-anchor">
            <button
              ref={plusRef}
              type="button"
              className="sm-copilot-plus"
              aria-label="Add attachment"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={disabled || busy}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div
                ref={menuRef}
                className="sm-copilot-attach-menu"
                role="menu"
                aria-label="Attachment options"
              >
                {MENU_ITEMS.map((item) => {
                  const Icon = item.Icon;
                  const inputId = `copilot-attach-${item.id}`;
                  return (
                    <label
                      key={item.id}
                      htmlFor={inputId}
                      role="menuitem"
                      tabIndex={0}
                      className="sm-copilot-attach-menu__item"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          document.getElementById(inputId)?.click();
                        }
                      }}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>

          <label className="sr-only" htmlFor="copilot-input">
            Message ShelfMerch AI Copilot
          </label>
          <textarea
            ref={input}
            id="copilot-input"
            rows={1}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              if (disabled || busy) return;
              const items = event.clipboardData?.files;
              if (!items?.length) return;
              const file = items[0];
              if (!isReferenceImageFile(file) && !file.type.startsWith("image/")) return;
              event.preventDefault();
              applyFiles("file", items, { imagesOnly: true });
            }}
            placeholder={disabled ? "Chat is currently unavailable" : "Ask ShelfMerch Copilot…"}
            disabled={disabled}
            readOnly={busy}
            aria-describedby="copilot-input-hint"
          />
          <button
            type="submit"
            className="sm-copilot-send"
            aria-label={busy ? "Sending message" : "Send message"}
            disabled={!canSend}
          >
            {busy ? (
              <LoaderCircle size={18} className="sm-copilot-spin" aria-hidden="true" />
            ) : (
              <ArrowUp size={19} aria-hidden="true" />
            )}
          </button>
        </form>
      </div>

      {/* Always mounted outside the menu so closing the menu cannot drop the change event. */}
      {MENU_ITEMS.map((item) => (
        <input
          key={item.id}
          id={`copilot-attach-${item.id}`}
          type="file"
          tabIndex={-1}
          accept={item.accept || undefined}
          data-copilot-attach={item.id}
          aria-label={item.label}
          onChange={(event) => onDedicatedFileChange(item, event)}
        />
      ))}
      <p className="sr-only" id="copilot-input-hint">
        Enter to send. Shift + Enter for a new line. Use Add attachment for a reference product image,
        purchase order, store logo, or file. You can also drag or paste an image.
      </p>
      <p className="sm-copilot-footnote">
        AI can make mistakes. Review important details before taking action.
      </p>
    </div>
  );
}
