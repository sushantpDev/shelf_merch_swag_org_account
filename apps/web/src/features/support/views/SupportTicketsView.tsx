import { useMemo, useRef, useState } from "react";
import {
  CircleHelp,
  CreditCard,
  Gift,
  MapPin,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Truck,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState } from "@/components/LoadingState";
import { PlatformSelect } from "@/components/platform/platform-ui";
import {
  SUPPORT_TICKET_TYPES,
  TYPE_LABELS,
  type SupportAttachment,
  type SupportMessage,
  type SupportTicket,
} from "../model";
import type { SupportTicketsVm } from "../controllers/useSupportTicketsController";
import "../support-page.css";

const SUBTITLE = "Raise an issue with the ShelfMerch team and track replies here.";

const STATUS_FILTERS = ["all", "open", "in_progress", "closed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All",
  open: "Open",
  in_progress: "In progress",
  closed: "Closed",
};

function ticketTypeVisual(type: string) {
  switch (type) {
    case "delivery_issue":
      return { Icon: Truck, tone: "delivery" as const };
    case "address_change":
      return { Icon: MapPin, tone: "address" as const };
    case "replacement":
      return { Icon: RefreshCw, tone: "replace" as const };
    case "redemption_issue":
      return { Icon: Gift, tone: "redeem" as const };
    case "billing":
      return { Icon: CreditCard, tone: "billing" as const };
    default:
      return { Icon: CircleHelp, tone: "other" as const };
  }
}

function statusKey(status: string) {
  const s = status.replace(/-/g, "_");
  if (s === "resolved") return "closed";
  return s;
}

function statusLabel(status: string) {
  return statusKey(status)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function matchesStatus(ticket: SupportTicket, filter: StatusFilter) {
  if (filter === "all") return true;
  const s = statusKey(ticket.status);
  if (filter === "closed") return s === "closed" || s === "resolved";
  if (filter === "open") return s === "open";
  return s === "in_progress";
}

function fmtBytes(size = 0) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatMsgTime(at: string) {
  return new Date(at).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function AttachmentLinks({ attachments }: { attachments?: SupportAttachment[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="sm-support-detail__attachments">
      {attachments.map((a, i) => (
        <a
          key={a._id ?? i}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="sm-support-detail__attach"
        >
          <Paperclip size={14} strokeWidth={2.25} aria-hidden="true" />
          <span>{a.name || "Attachment"}</span>
          {a.size ? <em>({fmtBytes(a.size)})</em> : null}
        </a>
      ))}
    </div>
  );
}

/** Tenant conversation: Support on the left, you on the right. */
function MessageBubble({ message }: { message: SupportMessage }) {
  const fromSupport = message.fromPlatform !== false;
  const author = fromSupport
    ? message.authorName || "Support team"
    : message.authorName || "You";
  // Reuse platform chat styles: customer = left, agent = right (your messages).
  const kind = fromSupport ? "customer" : "agent";

  return (
    <div className={`st-msg st-msg--${kind}`}>
      <div className="st-msg-avatar" aria-hidden="true">
        {initials(author)}
      </div>
      <div className="st-msg-bubble">
        <div className="st-msg-meta">
          <span className="st-msg-author">{author}</span>
          <time className="st-msg-time" dateTime={message.at}>
            {formatMsgTime(message.at)}
          </time>
        </div>
        <div className="st-msg-body">{message.body}</div>
      </div>
    </div>
  );
}

/** Tenant help center: my tickets + raise-ticket dialog + conversation thread. */
export function SupportTicketsView(vm: SupportTicketsVm) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    const tickets = vm.tickets;
    const open = tickets.filter((t) => statusKey(t.status) === "open").length;
    const progress = tickets.filter((t) => statusKey(t.status) === "in_progress").length;
    const closed = tickets.filter((t) => {
      const s = statusKey(t.status);
      return s === "closed" || s === "resolved";
    }).length;
    const replies = tickets.reduce((n, t) => n + (t.messages?.length ?? 0), 0);
    return { total: tickets.length, open, progress, closed, replies };
  }, [vm.tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vm.tickets.filter((t) => {
      if (!matchesStatus(t, filter)) return false;
      if (!q) return true;
      return (
        t.subject.toLowerCase().includes(q) ||
        (TYPE_LABELS[t.type] ?? t.type).toLowerCase().includes(q)
      );
    });
  }, [vm.tickets, filter, search]);

  if (vm.isLoading) {
    return <LoadingState message="Loading support tickets…" fullScreen={false} variant="list" />;
  }
  if (vm.errorMessage) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {vm.errorMessage}
      </div>
    );
  }

  return (
    <div className="support-page">
      <header className="sup-hero">
        <div className="sup-hero__copy">
          <h1>Support</h1>
          <p className="sup-hero__sub">{SUBTITLE}</p>
        </div>
        <button type="button" className="sup-hero__cta" onClick={vm.onOpenCreate}>
          <Plus size={16} aria-hidden="true" />
          Raise a ticket
        </button>
      </header>

      <div className="sup-kpi" aria-label="Ticket metrics">
        <div className="sup-kpi__item sup-kpi__item--slate">
          <div>
            <span className="sup-kpi__label">Total tickets</span>
            <span className="sup-kpi__value">{stats.total}</span>
            <span className="sup-kpi__hint">All conversations</span>
          </div>
        </div>
        <div className="sup-kpi__item sup-kpi__item--blue">
          <div>
            <span className="sup-kpi__label">Open</span>
            <span className="sup-kpi__value">{stats.open + stats.progress}</span>
            <span className="sup-kpi__hint">{stats.progress} in progress</span>
          </div>
        </div>
        <div className="sup-kpi__item sup-kpi__item--amber">
          <div>
            <span className="sup-kpi__label">Closed</span>
            <span className="sup-kpi__value">{stats.closed}</span>
            <span className="sup-kpi__hint">Resolved or closed</span>
          </div>
        </div>
        <div className="sup-kpi__item sup-kpi__item--green">
          <div>
            <span className="sup-kpi__label">Replies</span>
            <span className="sup-kpi__value">{stats.replies}</span>
            <span className="sup-kpi__hint">Across all tickets</span>
          </div>
        </div>
      </div>

      {vm.tickets.length === 0 ? (
        <div className="sup-panel">
          <div className="sup-empty">
            <h3>No tickets yet</h3>
            <p>Stuck on an order, delivery or redemption? Raise a ticket and we&apos;ll help.</p>
            <button type="button" className="sup-empty__cta" onClick={vm.onOpenCreate}>
              Raise a ticket
            </button>
          </div>
        </div>
      ) : (
        <section className="sup-panel">
          <div className="sup-panel__toolbar">
            <div className="sup-seg" role="group" aria-label="Status filter">
              {STATUS_FILTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`sup-seg__btn${filter === key ? " is-active" : ""}`}
                  onClick={() => setFilter(key)}
                >
                  {STATUS_LABELS[key]}
                </button>
              ))}
            </div>
            <label className="sup-search">
              <Search size={15} aria-hidden="true" />
              <input
                placeholder="Search tickets"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search tickets"
              />
            </label>
          </div>

          <div className="sup-list-head" aria-hidden="true">
            <span className="sup-list-head__opened">Opened</span>
            <span>Subject</span>
            <span className="sup-list-head__type">Type</span>
            <span>Status</span>
            <span className="sup-list-head__num">Replies</span>
          </div>

          {filtered.length ? (
            filtered.map((t) => {
              const { Icon, tone } = ticketTypeVisual(t.type);
              const s = statusKey(t.status);
              return (
                <button
                  key={t._id}
                  type="button"
                  className="sup-row"
                  onClick={() => vm.onSelect(t)}
                  aria-label={`Open ticket ${t.subject}`}
                >
                  <span className="sup-row__opened muted">{new Date(t.createdAt).toLocaleDateString("en-IN")}</span>
                  <span className="sup-row__main">
                    <span className={`sup-row__icon sup-row__icon--${tone}`} aria-hidden="true">
                      <Icon size={17} />
                    </span>
                    <span>
                      <span className="sup-row__title">{t.subject}</span>
                      <span className="sup-row__sub">{TYPE_LABELS[t.type] ?? t.type}</span>
                    </span>
                  </span>
                  <span className="sup-row__type">
                    <span className="sup-chip">{TYPE_LABELS[t.type] ?? t.type}</span>
                  </span>
                  <span>
                    <span className={`sup-chip sup-chip--${s}`}>
                      <span className="sup-chip__dot" />
                      {statusLabel(t.status)}
                    </span>
                  </span>
                  <span className="sup-row__num">{t.messages?.length ?? 0}</span>
                </button>
              );
            })
          ) : (
            <div className="sup-list-empty">No tickets match your filters.</div>
          )}
        </section>
      )}

      {/* Raise-ticket dialog */}
      <Dialog open={vm.creating} onOpenChange={vm.onCreateOpenChange}>
        <DialogContent className="sm-modal">
          <div className="modal-pad">
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18 }}>Raise a support ticket</DialogTitle>
              <DialogDescription>
                Tell us what went wrong. The team replies right here.
              </DialogDescription>
            </DialogHeader>
            <div style={{ marginTop: 14 }}>
              <div className="field">
                <label className="lbl" htmlFor="support-subject">
                  Subject
                </label>
                <input
                  id="support-subject"
                  className="inp"
                  placeholder="e.g. Order SM-1042 not delivered"
                  value={vm.subject}
                  onChange={(e) => vm.onSubject(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="lbl">Category</label>
                <PlatformSelect
                  className="platform-select"
                  value={vm.type}
                  onChange={(v) => vm.onType(v as typeof vm.type)}
                  options={SUPPORT_TICKET_TYPES.map((t) => ({
                    value: t,
                    label: TYPE_LABELS[t],
                  }))}
                  placeholder="Select a category…"
                />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="support-description">
                  Details
                </label>
                <textarea
                  id="support-description"
                  className="inp"
                  rows={4}
                  placeholder="Share order numbers, recipient emails or anything that helps us dig in."
                  value={vm.description}
                  onChange={(e) => vm.onDescription(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="support-attachment">
                  Attachment <span className="muted">(optional: image or PDF, 10 MB max)</span>
                </label>
                <input
                  ref={fileInputRef}
                  id="support-attachment"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.gif,.pdf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    vm.onFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                {vm.file ? (
                  <div
                    className="row"
                    style={{ alignItems: "center", gap: 8, fontSize: 13, marginTop: 2 }}
                  >
                    <Paperclip size={14} aria-hidden="true" />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {vm.file.name}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      ({fmtBytes(vm.file.size)})
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label="Remove attachment"
                      onClick={() => vm.onFile(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip size={14} /> Add a file
                  </button>
                )}
              </div>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => vm.onCreateOpenChange(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-brand"
                  disabled={vm.submitting || !vm.subject.trim()}
                  onClick={vm.onSubmit}
                >
                  {vm.submitting ? "Raising…" : "Raise ticket"}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ticket detail / conversation dialog */}
      <Dialog open={vm.selected !== null} onOpenChange={vm.onDetailOpenChange}>
        <DialogContent className="sm-modal sm-support-detail-modal">
          {vm.selected && (
            <div className="modal-pad sm-support-detail">
              <header className="sm-support-detail__head">
                <DialogHeader className="sm-support-detail__titles">
                  <div className="sm-support-detail__eyebrow">
                    <span>{TYPE_LABELS[vm.selected.type] ?? vm.selected.type}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={vm.selected.createdAt}>
                      {new Date(vm.selected.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  </div>
                  <DialogTitle className="sm-support-detail__title">
                    {vm.selected.subject}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Conversation for ticket {vm.selected.subject}
                  </DialogDescription>
                </DialogHeader>
                <span className={`sup-chip sup-chip--${statusKey(vm.selected.status)}`}>
                  <span className="sup-chip__dot" />
                  {statusLabel(vm.selected.status)}
                </span>
              </header>

              {vm.selected.description ? (
                <p className="sm-support-detail__desc">{vm.selected.description}</p>
              ) : null}

              <AttachmentLinks attachments={vm.selected.attachments} />

              <div className="support-ticket-thread sm-support-detail-thread">
                <div className="sm-support-detail-thread__label">Conversation</div>
                <div className="support-ticket-thread-scroll">
                  {(vm.selected.messages ?? []).length === 0 ? (
                    <p className="support-ticket-thread-empty">
                      No replies yet. The team has been notified.
                    </p>
                  ) : (
                    vm.selected.messages.map((m, i) => (
                      <MessageBubble key={m._id ?? i} message={m} />
                    ))
                  )}
                </div>
              </div>

              {vm.selected.status === "resolved" ? (
                <div className="sm-support-detail__resolve">
                  <div className="sm-support-detail__resolve-copy">
                    <strong>Did we solve your issue?</strong>
                    <p>
                      Confirming closes this ticket. If you still need help, reply below and it
                      reopens.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-brand btn-sm"
                    disabled={vm.confirming}
                    onClick={vm.onConfirmResolved}
                  >
                    {vm.confirming ? "Closing…" : "Yes, close my ticket"}
                  </button>
                </div>
              ) : null}

              {vm.canReply ? (
                <div className="sm-support-detail-composer">
                  <textarea
                    className="sm-support-detail-composer__input"
                    rows={2}
                    placeholder="Write a reply…"
                    value={vm.reply}
                    onChange={(e) => vm.onReply(e.target.value)}
                  />
                  <button
                    type="button"
                    className="sm-support-detail-composer__send"
                    disabled={vm.replying || !vm.reply.trim()}
                    onClick={vm.onSendReply}
                  >
                    {vm.replying ? "Sending…" : "Send reply"}
                  </button>
                </div>
              ) : (
                <p className="sm-support-detail__closed">
                  This ticket is closed. Raise a new ticket if you need more help.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
