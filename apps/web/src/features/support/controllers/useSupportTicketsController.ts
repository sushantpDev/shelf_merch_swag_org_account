import { useState } from "react";
import { toast } from "sonner";
import {
  useConfirmTicket,
  useCreateTicket,
  useMyTickets,
  useReplyTicket,
  useTicket,
  type SupportTicket,
  type SupportTicketType,
} from "../model";

// Mirrors the API allowlist (upload.middleware DOCUMENT_TYPES): images + PDF,
// no SVG/HTML. The server re-validates — this is just a friendly early check.
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const ATTACHMENT_EXT_RE = /\.(png|jpe?g|webp|gif|pdf)$/i;

function attachmentProblem(file: File): string | null {
  const typeOk = ATTACHMENT_MIMES.has(file.type.toLowerCase()) || ATTACHMENT_EXT_RE.test(file.name);
  if (!typeOk) return "Only images (PNG, JPG, WEBP, GIF) or PDF files are allowed";
  if (file.size > ATTACHMENT_MAX_BYTES) return "File is too large. 10 MB max";
  return null;
}

export type SupportTicketsVm = {
  isLoading: boolean;
  errorMessage: string | null;
  tickets: SupportTicket[];
  // New-ticket dialog
  creating: boolean;
  subject: string;
  type: SupportTicketType;
  description: string;
  file: File | null;
  submitting: boolean;
  onOpenCreate: () => void;
  onCreateOpenChange: (open: boolean) => void;
  onSubject: (v: string) => void;
  onType: (v: SupportTicketType) => void;
  onDescription: (v: string) => void;
  onFile: (file: File | null) => void;
  onSubmit: () => void;
  // Detail dialog
  selected: SupportTicket | null;
  detailLoading: boolean;
  reply: string;
  replying: boolean;
  canReply: boolean;
  confirming: boolean;
  onSelect: (ticket: SupportTicket) => void;
  onDetailOpenChange: (open: boolean) => void;
  onReply: (v: string) => void;
  onSendReply: () => void;
  onConfirmResolved: () => void;
};

/** Controller for the tenant help center: my tickets, raise, thread + reply. */
export function useSupportTicketsController(): SupportTicketsVm {
  const list = useMyTickets();
  const createTicket = useCreateTicket();
  const replyTicket = useReplyTicket();
  const confirmTicket = useConfirmTicket();

  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<SupportTicketType>("other");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useTicket(selectedId);
  const selected =
    detail.data ?? list.data?.items.find((t) => t._id === selectedId) ?? null;

  const [reply, setReply] = useState("");

  function onFile(next: File | null) {
    if (next) {
      const problem = attachmentProblem(next);
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    setFile(next);
  }

  async function onSubmit() {
    if (!subject.trim()) {
      toast.error("Add a subject");
      return;
    }
    try {
      await createTicket.mutateAsync({
        subject: subject.trim(),
        description: description.trim(),
        type,
        file,
      });
      setCreating(false);
      setSubject("");
      setDescription("");
      setType("other");
      setFile(null);
      toast.success("Support ticket created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not raise the ticket");
    }
  }

  async function onSendReply() {
    if (!selectedId || !reply.trim()) return;
    try {
      await replyTicket.mutateAsync({ ticketId: selectedId, body: reply.trim() });
      setReply("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the reply");
    }
  }

  async function onConfirmResolved() {
    if (!selectedId) return;
    try {
      await confirmTicket.mutateAsync(selectedId);
      toast.success("Ticket closed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not confirm the ticket");
    }
  }

  return {
    isLoading: list.isLoading && !list.data,
    errorMessage: list.isError
      ? list.error instanceof Error
        ? list.error.message
        : "Could not load tickets"
      : null,
    tickets: list.data?.items ?? [],
    creating,
    subject,
    type,
    description,
    file,
    submitting: createTicket.isPending,
    onOpenCreate: () => setCreating(true),
    onCreateOpenChange: (open: boolean) => {
      setCreating(open);
      if (!open) setFile(null);
    },
    onSubject: setSubject,
    onType: setType,
    onDescription: setDescription,
    onFile,
    onSubmit,
    selected: selectedId ? selected : null,
    detailLoading: detail.isLoading,
    reply,
    replying: replyTicket.isPending,
    canReply: selected !== null && selected.status !== "closed",
    onSelect: (t) => setSelectedId(t._id),
    onDetailOpenChange: (open) => {
      if (!open) {
        setSelectedId(null);
        setReply("");
      }
    },
    confirming: confirmTicket.isPending,
    onReply: setReply,
    onSendReply,
    onConfirmResolved,
  };
}
