export type CopilotAttachmentKind = "purchase_order" | "artwork" | "banner" | "file";

export type CopilotAttachmentStatus =
  | "selected"
  | "uploading"
  | "uploaded"
  | "failed"
  | "removed";

export type CopilotAttachmentDraft = {
  localId: string;
  kind: CopilotAttachmentKind;
  file: File;
  status: CopilotAttachmentStatus;
  error?: string;
  previewUrl?: string;
  serverId?: string;
  ticketId?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export const ATTACHMENT_ACCEPT: Record<CopilotAttachmentKind, string> = {
  purchase_order: ".pdf,application/pdf",
  artwork: ".png,image/png",
  banner: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/jpg,image/webp",
  file: ".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/gif",
};

/**
 * Empty accept = All Files in Windows. WhatsApp exports named
 * "… at 12.38.07" fail image/* / extension filters (Chrome returns empty FileList).
 * We validate image-ness in JS after the pick.
 */
export const REFERENCE_IMAGE_ACCEPT = "";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".jfif", ".webp", ".gif"] as const;
const IMAGE_MIME_RE = /^image\/(png|jpeg|jpg|webp|gif)$/i;
/** WhatsApp Desktop often saves as "WhatsApp Image … at 12.38.07" with no real extension. */
const WHATSAPP_IMAGE_NAME_RE = /whatsapp image/i;
const TIMESTAMP_TAIL_RE = /\d{1,2}\.\d{2}\.\d{2}$/;

export function isReferenceImageFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  const byExt = IMAGE_EXTS.some((ext) => lower.endsWith(ext));
  const byMime = IMAGE_MIME_RE.test(file.type || "");
  const byWhatsAppName =
    WHATSAPP_IMAGE_NAME_RE.test(file.name) || TIMESTAMP_TAIL_RE.test(lower);
  return byExt || byMime || byWhatsAppName;
}

export const ATTACHMENT_LIMITS: Record<
  CopilotAttachmentKind,
  { maxBytes: number; label: string; extensions: string[] }
> = {
  purchase_order: {
    maxBytes: 25 * 1024 * 1024,
    label: "PDF purchase orders up to 25 MB",
    extensions: [".pdf"],
  },
  artwork: {
    maxBytes: 5 * 1024 * 1024,
    label: "Store logo PNG up to 5 MB (300 DPI required)",
    extensions: [".png"],
  },
  banner: {
    maxBytes: 10 * 1024 * 1024,
    label: "Store banner PNG/JPG/WebP up to 10 MB",
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
  },
  file: {
    maxBytes: 25 * 1024 * 1024,
    label: "PDF or image up to 25 MB",
    extensions: [".pdf", ".png", ".jpg", ".jpeg", ".jfif", ".webp", ".gif"],
  },
};

export function formatAttachmentSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateAttachmentFile(
  kind: CopilotAttachmentKind,
  file: File,
  options?: { imagesOnly?: boolean },
): string | null {
  const limits = ATTACHMENT_LIMITS[kind];
  const lower = file.name.toLowerCase();
  const extOk = limits.extensions.some((ext) => lower.endsWith(ext));
  const imageMimeOk = IMAGE_MIME_RE.test(file.type || "");
  const pdfMimeOk = (file.type || "") === "application/pdf";

  let typeOk = extOk;
  if (kind === "file") {
    typeOk = options?.imagesOnly
      ? extOk || imageMimeOk || isReferenceImageFile(file)
      : extOk || imageMimeOk || pdfMimeOk;
  } else if (kind === "artwork") {
    typeOk = extOk || (file.type || "") === "image/png";
  } else if (kind === "banner") {
    typeOk = extOk || /image\/(png|jpeg|jpg|webp)/i.test(file.type || "");
  } else if (kind === "purchase_order") {
    typeOk = extOk || pdfMimeOk;
  }

  if (!typeOk) {
    if (kind === "purchase_order") return "Purchase orders must be PDF files.";
    if (kind === "artwork") {
      return "Store logo artwork must be a PNG with 300 DPI metadata — use Reference product image for JPG/PNG product photos.";
    }
    if (kind === "banner") {
      return "Store banner images must be PNG, JPG, or WebP — not a reference product photo attachment.";
    }
    if (options?.imagesOnly) {
      return "Choose a JPG, PNG, WebP, or GIF image.";
    }
    return "Unsupported file type. Use Reference product image for JPG/PNG photos, or Attach File for PDF/images.";
  }
  if (!file.size) {
    return "That file looks empty. Pick another image and try again.";
  }
  if (file.size > limits.maxBytes) {
    return `File exceeds the ${formatAttachmentSize(limits.maxBytes)} limit.`;
  }
  return null;
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".jfif")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  // WhatsApp timestamp tails ("12.38.07") — treat as JPEG for preview + upload.
  if (WHATSAPP_IMAGE_NAME_RE.test(name) || TIMESTAMP_TAIL_RE.test(lower)) return "image/jpeg";
  return "";
}

/** Give WhatsApp-style files a real .jpg name + image/jpeg type for upload/preview. */
export function normalizeReferenceImageFile(file: File): File {
  const mime = file.type || guessMimeFromName(file.name) || "image/jpeg";
  const lower = file.name.toLowerCase();
  const hasRealExt = IMAGE_EXTS.some((ext) => lower.endsWith(ext));
  if (hasRealExt && file.type) return file;
  const ext =
    mime === "image/png"
      ? ".png"
      : mime === "image/webp"
        ? ".webp"
        : mime === "image/gif"
          ? ".gif"
          : ".jpg";
  const base = hasRealExt
    ? file.name.slice(0, file.name.length - pathExtLength(file.name))
    : file.name.replace(/\.\d{1,2}$/, "");
  const name = `${base || "reference-image"}${ext}`;
  if (name === file.name && mime === file.type) return file;
  return new File([file], name, { type: mime, lastModified: file.lastModified });
}

function pathExtLength(name: string): number {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.length - i : 0;
}

export function createAttachmentDraft(
  kind: CopilotAttachmentKind,
  file: File,
  options?: { imagesOnly?: boolean },
): CopilotAttachmentDraft {
  const normalized =
    options?.imagesOnly || (kind === "file" && isReferenceImageFile(file) && !file.type)
      ? normalizeReferenceImageFile(file)
      : file;
  const mimeType = normalized.type || guessMimeFromName(normalized.name);
  const previewUrl = mimeType.startsWith("image/") ? URL.createObjectURL(normalized) : undefined;
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    file: normalized,
    status: "selected",
    previewUrl,
    originalName: normalized.name,
    mimeType,
    sizeBytes: normalized.size,
  };
}

export function revokeAttachmentPreview(row: CopilotAttachmentDraft) {
  if (row.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(row.previewUrl);
}
