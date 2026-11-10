import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ArrowDown,
  ArrowLeft,
  CircleAlert,
  LoaderCircle,
  PanelLeftOpen,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { tenantPath } from "@/lib/workspaceSlug";
import {
  createCopilotConversation,
  deleteCopilotConversation,
  getCopilotConversation,
  listCopilotConversations,
  removeCopilotAttachmentApi,
  streamCopilotMessage,
  uploadCopilotAttachmentApi,
  type CopilotConversationSummary,
  type CopilotMessage,
} from "./api";
import {
  revokeAttachmentPreview,
  type CopilotAttachmentDraft,
} from "./attachments";
import { CopilotArtifacts } from "./CopilotProductCards";
import { CopilotMarkdown } from "./CopilotMarkdown";
import { CopilotIcon } from "./CopilotIcon";
import { CopilotWelcome } from "./CopilotWelcome";
import { CopilotComposer } from "./CopilotComposer";
import { CopilotHistory } from "./CopilotHistory";
import { CopilotStoreCreateForm } from "./CopilotStoreCreateConfirm";
import { useCopilotStatus } from "./useCopilotStatus";
import type { CopilotArtifact, CopilotAction } from "./api";
import { CuratorIntro, CuratorRecommendations, CuratorToolbar } from "./CopilotCurator";
import "./copilot.css";
import "./curator.css";

type UiMessage = CopilotMessage & { streaming?: boolean; toolStatus?: string };
type UiError = { message: string; prompt?: string };

export function CopilotPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    data: status,
    isLoading: statusLoading,
    error: statusError,
    refetch,
  } = useCopilotStatus();
  const [conversations, setConversations] = useState<CopilotConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<CopilotAttachmentDraft[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [curatorMode, setCuratorMode] = useState(false);
  const [curatorTab, setCuratorTab] = useState<"conversation" | "recommendations">("conversation");
  const [storeCreateOpen, setStoreCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lockRef = useRef(false);
  const mounted = useRef(true);
  const nearBottom = useRef(true);
  const locked = busy || opening || deleting;
  const providerDisabled = status?.provider === "disabled";
  const activeTitle = conversations.find((row) => row.id === activeId)?.title;
  const latestCuration = [...messages].reverse().flatMap(message => message.artifacts || []).find((artifact): artifact is Extract<CopilotArtifact, { kind: "curation" }> => artifact.kind === "curation")?.curation;
  function prepareCuratorDraft(text: string) {
    setDraft(text);
    setCuratorTab("conversation");
    requestAnimationFrame(() => document.getElementById("copilot-input")?.focus());
  }
  const showWelcome = !messages.length && !busy && !opening;

  function closeCopilot() {
    const destination: unknown = location.state?.copilotReturnTo;
    const base = tenantPath();
    const isWorkspacePage =
      typeof destination === "string" &&
      (destination === base ||
        destination.startsWith(`${base}/`) ||
        destination.startsWith(`${base}?`)) &&
      !destination.split(/[?#]/)[0].endsWith("/copilot");
    navigate(isWorkspacePage ? destination : base, { replace: true });
  }

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await listCopilotConversations();
      if (mounted.current) setConversations(res.items);
    } catch {
      if (mounted.current) setHistoryError("Couldn’t load your conversations.");
    } finally {
      if (mounted.current) setHistoryLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
      setAttachments((prev) => {
        prev.forEach(revokeAttachmentPreview);
        return [];
      });
    };
  }, []);

  function clearAttachments() {
    setAttachments((prev) => {
      prev.forEach(revokeAttachmentPreview);
      return [];
    });
  }

  function patchAttachment(localId: string, patch: Partial<CopilotAttachmentDraft>) {
    setAttachments((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)),
    );
  }

  async function uploadAttachmentRow(row: CopilotAttachmentDraft) {
    patchAttachment(row.localId, { status: "uploading", error: undefined });
    try {
      const uploaded = await uploadCopilotAttachmentApi(row.kind, row.file, activeId);
      if (!mounted.current) return;
      patchAttachment(row.localId, {
        status: "uploaded",
        serverId: uploaded.id,
        ticketId: uploaded.ticketId,
        originalName: uploaded.originalName || row.originalName,
        mimeType: uploaded.mimeType || row.mimeType,
        sizeBytes: uploaded.sizeBytes || row.sizeBytes,
      });
    } catch (err) {
      if (!mounted.current) return;
      patchAttachment(row.localId, {
        status: "failed",
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  async function removeAttachmentRow(localId: string) {
    const row = attachments.find((item) => item.localId === localId);
    if (!row) return;
    revokeAttachmentPreview(row);
    setAttachments((prev) => prev.filter((item) => item.localId !== localId));
    if (row.serverId) {
      try {
        await removeCopilotAttachmentApi(row.serverId);
      } catch {
        /* best-effort server cleanup */
      }
    }
  }

  function retryAttachmentRow(localId: string) {
    const row = attachments.find((item) => item.localId === localId);
    if (!row) return;
    void uploadAttachmentRow(row);
  }
  useEffect(() => {
    if (status?.enabled) void loadHistory();
  }, [status?.enabled, loadHistory]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (showWelcome) el.scrollTop = 0;
    else if (nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, busy, opening, showWelcome, selectedCategoryId]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (showWelcome) el.scrollTop = 0;
      else if (nearBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [status?.enabled, showWelcome]);

  function startNew() {
    setCuratorMode(false);
    setCuratorTab("conversation");
    if (lockRef.current) return;
    setError(null);
    setActiveId(null);
    setMessages([]);
    setDraft("");
    clearAttachments();
    setSelectedCategoryId(null);
    setStoreCreateOpen(false);
    setDrawerOpen(false);
    nearBottom.current = true;
    setScrolledUp(false);
  }

  function patchMessageArtifact(messageIndex: number, artifactIndex: number, next: CopilotArtifact) {
    setMessages((prev) =>
      prev.map((message, index) => {
        if (index !== messageIndex) return message;
        const artifacts = [...(message.artifacts || [])];
        artifacts[artifactIndex] = next;
        return { ...message, artifacts };
      }),
    );
  }

  function handleDiscoveryAction(action: CopilotAction) {
    if (action.id === "stores_create" && status?.writeToolsEnabled) {
      setStoreCreateOpen(true);
      setMessages([]);
      setActiveId(null);
      return;
    }
    if (action.availability === "available" && "prompt" in action) {
      setStoreCreateOpen(false);
      setDraft(action.prompt);
      document.getElementById("copilot-input")?.focus();
    }
  }
  async function openConversation(id: string) {
    if (lockRef.current) return;
    lockRef.current = true;
    setOpening(true);
    setError(null);
    setDrawerOpen(false);
    try {
      const detail = await getCopilotConversation(id);
      if (!mounted.current) return;
      nearBottom.current = true;
      setScrolledUp(false);
      setActiveId(id);
      setCuratorMode(Boolean(detail.curator?.enabled));
      setCuratorTab("conversation");
      setSelectedCategoryId(null);
      setMessages(
        detail.messages.filter(
          (message) => message.role === "user" || message.content || message.artifacts?.length,
        ),
      );
      setDraft("");
      clearAttachments();
    } catch (err) {
      if (mounted.current)
        setError({
          message:
            err instanceof Error
              ? err.message
              : "Couldn’t open this conversation. Please select it again.",
        });
    } finally {
      lockRef.current = false;
      if (mounted.current) setOpening(false);
    }
  }
  async function removeConversation() {
    if (!activeId || lockRef.current) return;
    lockRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      await deleteCopilotConversation(activeId);
      if (!mounted.current) return;
      setConversations((prev) => prev.filter((row) => row.id !== activeId));
      setActiveId(null);
      setSelectedCategoryId(null);
      setMessages([]);
      setDraft("");
      clearAttachments();
    } catch (err) {
      if (mounted.current)
        setError({
          message:
            err instanceof Error
              ? err.message
              : "Couldn’t delete this conversation. Please try again.",
        });
    } finally {
      lockRef.current = false;
      if (mounted.current) {
        setDeleting(false);
        setDeleteOpen(false);
      }
    }
  }
  async function sendPrompt(raw: string) {
    const content = raw.trim();
    const readyAttachments = attachments.filter(
      (row) => row.status === "uploaded" && row.serverId,
    );
    const attachmentIds = readyAttachments.map((row) => row.serverId!).filter(Boolean);
    if (
      (!content && !attachmentIds.length) ||
      lockRef.current ||
      !status?.enabled ||
      providerDisabled ||
      attachments.some((row) => row.status === "uploading" || row.status === "selected" || row.status === "failed")
    ) {
      return;
    }
    lockRef.current = true;
    setBusy(true);
    setError(null);
    setDraft("");
    const pendingAttachments = readyAttachments.map((row) => ({
      id: row.serverId!,
      kind: row.kind,
      ticketId: row.ticketId,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    }));
    clearAttachments();
    nearBottom.current = true;
    setScrolledUp(false);
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: content || `Attached ${pendingAttachments.length} file(s)`,
        attachments: pendingAttachments,
      },
      { role: "assistant", content: "", streaming: true },
    ]);
    const updateAssistant = (update: (message: UiMessage) => UiMessage) => {
      if (!mounted.current) return;
      setMessages((prev) =>
        prev.map((message, index) =>
          index === prev.length - 1 && message.role === "assistant" ? update(message) : message,
        ),
      );
    };
    let failed = false;
    let completed = false;
    try {
      let id = activeId;
      if (!id) {
        const created = await createCopilotConversation();
        if (!mounted.current) return;
        id = created.id;
        setActiveId(id);
        const now = new Date().toISOString();
        setConversations((prev) => [{ ...created, createdAt: now, updatedAt: now }, ...prev]);
      }
      if (!mounted.current) return;
      abortRef.current = new AbortController();
      await streamCopilotMessage(
        id,
        content,
        {
          onDelta: (text) =>
            updateAssistant((message) => ({ ...message, content: message.content + text })),
          onArtifacts: (rows) =>
            updateAssistant((message) => ({
              ...message,
              artifacts: [...(message.artifacts || []), ...rows],
            })),
          onTool: (_name, toolStatus) => updateAssistant((message) => ({ ...message, toolStatus })),
          onDone: ({ title }) => {
            completed = true;
            if (!mounted.current) return;
            setConversations((prev) => {
              const row = prev.find((item) => item.id === id);
              return row
                ? [
                    { ...row, title, updatedAt: new Date().toISOString() },
                    ...prev.filter((item) => item.id !== id),
                  ]
                : prev;
            });
          },
          onError: ({ message, code }) => {
            failed = true;
            if (!mounted.current) return;
            let nextMessage = message;
            if (code === "COPILOT_USER_QUOTA" || code === "COPILOT_TENANT_QUOTA") {
              nextMessage = message.includes("ShelfMerch Copilot daily token limit")
                ? message
                : `ShelfMerch Copilot daily token quota reached (not an Anthropic/OpenAI rate limit). ${message}`;
            } else if (code === "PROVIDER_RATE_LIMIT") {
              nextMessage = message.includes("provider-side throttle")
                ? message
                : `AI provider rate limit (not ShelfMerch daily quota). ${message}`;
            }
            setError({ message: nextMessage, prompt: content });
          },
        },
        abortRef.current.signal,
        attachmentIds,
        curatorMode ? "curator" : "chat",
      );
      if (!completed && !failed) throw new Error("The reply was interrupted. Please try again.");
    } catch (err) {
      failed = true;
      if (mounted.current)
        setError({
          message:
            err instanceof Error ? err.message : "We couldn’t send your message. Please try again.",
          prompt: content,
        });
    } finally {
      lockRef.current = false;
      if (mounted.current) {
        setMessages((prev) =>
          prev.flatMap((message, index) => {
            if (index !== prev.length - 1 || message.role !== "assistant") return [message];
            if (failed && !message.content && !message.artifacts?.length) return [];
            return [{ ...message, streaming: false, toolStatus: undefined }];
          }),
        );
        setBusy(false);
      }
    }
  }

  const historyProps = {
    conversations,
    activeId,
    loading: historyLoading,
    error: historyError,
    locked,
    onSelect: (id: string) => void openConversation(id),
    onNew: startNew,
    onReload: () => void loadHistory(),
  };
  if (statusLoading || !status?.enabled) {
    return (
      <section className="sm-copilot-unavailable">
        <CopilotIcon size={36} />
        <h1>ShelfMerch Copilot</h1>
        <p role="status">
          {statusLoading
            ? "Getting your workspace ready…"
            : statusError
              ? "We couldn’t connect to Copilot. Please try again."
              : "Copilot isn’t available for this workspace yet."}
        </p>
        <div>
          {statusError ? (
            <button type="button" className="sm-copilot-new" onClick={() => void refetch()}>
              <RotateCcw size={16} aria-hidden="true" />
              Try again
            </button>
          ) : null}
          <button
            type="button"
            className="sm-copilot-text-button"
            onClick={() => navigate(tenantPath())}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to dashboard
          </button>
        </div>
      </section>
    );
  }
  return (
    <div
      className={`sm-copilot-page${curatorMode ? " sm-copilot-page--curator" : ""}${collapsed ? " sm-copilot-page--collapsed" : ""}${showWelcome ? " sm-copilot-page--welcome" : ""}`}
      onKeyDown={(event) => {
        const inDialog =
          event.target instanceof Element &&
          event.target.closest('[role="dialog"], [role="alertdialog"]');
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !inDialog &&
          !drawerOpen &&
          !deleteOpen &&
          !event.nativeEvent.isComposing
        ) {
          event.stopPropagation();
          closeCopilot();
        }
      }}
    >
      <header className="sm-copilot-header">
        <div className="sm-copilot-header__identity">
          <div className="sm-copilot-mobile-only">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="sm-copilot-icon-button"
                  aria-label="Open conversation history"
                >
                  <PanelLeftOpen size={19} aria-hidden="true" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="sm-copilot-drawer">
                <SheetTitle className="sr-only">Conversation history</SheetTitle>
                <SheetDescription className="sr-only">
                  Choose a saved conversation or start a new chat.
                </SheetDescription>
                <CopilotHistory {...historyProps} />
              </SheetContent>
            </Sheet>
          </div>
          <span className="sm-copilot-mobile-brand">
            <CopilotIcon size={24} />
            <strong>ShelfMerch Copilot</strong>
          </span>
        </div>
        <div className="sm-copilot-header__actions">
          {!curatorMode && messages.length ? <button type="button" className="sm-copilot-text-button" disabled={locked} onClick={() => setCuratorMode(true)}>Curate Gifts</button> : null}
          {activeId ? (
            <button
              type="button"
              className="sm-copilot-icon-button"
              onClick={() => setDeleteOpen(true)}
              disabled={locked}
              aria-label="Delete conversation"
              title="Delete conversation"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="sm-copilot-icon-button sm-copilot-header__close"
            onClick={closeCopilot}
            aria-label="Close Copilot"
            title="Close Copilot (Esc)"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
      </header>
      <aside className="sm-copilot-sidebar" aria-label="Conversation history">
        <CopilotHistory
          {...historyProps}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(true)}
          onExpand={() => setCollapsed(false)}
        />
      </aside>
      <section className={`sm-copilot-chat${curatorMode ? " sm-curator-active" : ""}`} data-curator-tab={curatorTab} aria-label="AI conversation" aria-busy={locked}>
        {curatorMode ? <>
          <CuratorToolbar busy={locked} onExit={() => { setCuratorMode(false); setCuratorTab("conversation"); }} />
          <div className="sm-curator-tabs" role="tablist" aria-label="Gifting workspace">
            <button type="button" role="tab" id="curator-chat-tab" aria-controls="curator-conversation" aria-selected={curatorTab === "conversation"} onClick={() => setCuratorTab("conversation")}>Conversation</button>
            <button type="button" role="tab" id="curator-results-tab" aria-controls="curator-recommendations" aria-selected={curatorTab === "recommendations"} onClick={() => setCuratorTab("recommendations")}>Recommendations</button>
          </div>
        </> : null}
        <div className={curatorMode ? "sm-curator-layout" : "sm-copilot-chat-content"}>
        <div className={curatorMode ? "sm-curator-conversation" : "sm-copilot-chat-content"} id={curatorMode ? "curator-conversation" : undefined}>

        {providerDisabled ? (
          <div className="sm-copilot-notice" role="status">
            <CircleAlert size={17} aria-hidden="true" />
            <span>
              <strong>Chat is currently unavailable.</strong> Explore capabilities and prepare a
              message. Contact your workspace administrator to enable replies.
            </span>
          </div>
        ) : null}
        <div
          className={`sm-copilot-messages${showWelcome ? " sm-copilot-messages--welcome" : ""}`}
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
            setScrolledUp(!nearBottom.current);
          }}
        >
          {opening ? (
            <div className="sm-copilot-loading" role="status">
              <LoaderCircle size={21} className="sm-copilot-spin" aria-hidden="true" />
              Opening conversation…
            </div>
          ) : !messages.length && curatorMode ? (
            <CuratorIntro onDraft={prepareCuratorDraft} />
          ) : !messages.length ? (
            <>
              <CopilotWelcome
                onCurate={() => { setCuratorMode(true); setCuratorTab("conversation"); setStoreCreateOpen(false); }}
                categories={status.discovery?.categories || []}
                selectedCategoryId={selectedCategoryId}
                onCategory={setSelectedCategoryId}
                onReload={() => void refetch()}
                onPrompt={(prompt) => {
                  setDraft(prompt);
                  document.getElementById("copilot-input")?.focus();
                }}
                onAction={handleDiscoveryAction}
              />
              {storeCreateOpen && status.writeToolsEnabled ? (
                <div className="sm-copilot-store-panel">
                  <CopilotStoreCreateForm
                    disabled={locked}
                    onPrepared={(artifact) => {
                      setStoreCreateOpen(false);
                      setMessages([
                        {
                          role: "assistant",
                          content: "Review the store details, then confirm to create and publish it.",
                          artifacts: [artifact],
                        },
                      ]);
                    }}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div
              className="sm-copilot-transcript"
              role="log"
              aria-label="Messages"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {messages.map((message, index) => (
                <article
                  key={`${message.role}-${index}`}
                  className={`sm-copilot-message sm-copilot-message--${message.role}`}
                  aria-label={message.role === "user" ? "You" : "ShelfMerch Copilot"}
                >
                  {message.role === "assistant" ? (
                    <span className="sm-copilot-message__avatar">
                      <CopilotIcon size={30} />
                    </span>
                  ) : null}
                  <div className="sm-copilot-message__body">
                    {message.role === "assistant" ? (
                      <span className="sm-copilot-message__author">ShelfMerch Copilot</span>
                    ) : null}
                    <div className="sm-copilot-bubble">
                      {message.role === "assistant" ? (
                        <CopilotMarkdown content={message.content || ""} artifacts={message.artifacts} />
                      ) : (
                        message.content || ""
                      )}
                    </div>
                    {message.streaming ? (
                      <div className="sm-copilot-thinking" role="status">
                        <span className="sm-copilot-thinking__dots" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        {message.toolStatus === "running"
                          ? "Checking your workspace…"
                          : message.toolStatus === "error"
                            ? "Couldn’t complete a workspace lookup"
                            : message.content
                              ? "Writing…"
                              : "Thinking…"}
                      </div>
                    ) : null}
                    <CopilotArtifacts
                      artifacts={message.artifacts}
                      conversationId={activeId}
                      onArtifactChange={(artifactIndex, next) =>
                        patchMessageArtifact(index, artifactIndex, next)
                      }
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        {scrolledUp ? (
          <button
            type="button"
            className="sm-copilot-jump"
            onClick={() => {
              nearBottom.current = true;
              setScrolledUp(false);
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
              });
            }}
          >
            <ArrowDown size={14} aria-hidden="true" />
            Latest message
          </button>
        ) : null}
        <div className="sm-copilot-compose-area">
          {error ? (
            <div className="sm-copilot-error" role="alert">
              <CircleAlert size={17} aria-hidden="true" />
              <span>{error.message}</span>
              {error.prompt ? (
                <button
                  type="button"
                  className="sm-copilot-text-button"
                  data-action="retry"
                  disabled={locked}
                  onClick={() => {
                    setDraft(error.prompt || "");
                    setError(null);
                    document.getElementById("copilot-input")?.focus();
                  }}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Edit & retry
                </button>
              ) : null}
              <button
                type="button"
                className="sm-copilot-icon-button"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <CopilotComposer
            draft={draft}
            onDraft={setDraft}
            onSend={(prompt) => void sendPrompt(prompt)}
            busy={busy}
            disabled={opening || deleting}
            unavailable={providerDisabled}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onUploadAttachment={(row) => void uploadAttachmentRow(row)}
            onRetryAttachment={retryAttachmentRow}
            onRemoveAttachment={(localId) => void removeAttachmentRow(localId)}
          />
        </div>
        </div>
        {curatorMode ? <div id="curator-recommendations" className="sm-curator-results-wrap"><CuratorRecommendations key={activeId || "new-curation"} busy={busy} curation={latestCuration} onDraft={prepareCuratorDraft} /></div> : null}
        </div>
      </section>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="sm-copilot-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              “{activeTitle || "This conversation"}” will be permanently deleted. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep conversation</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeConversation()}>
              Delete conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
export default CopilotPage;
