import { useEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  MessageSquare,
  PanelLeftClose,
  RotateCcw,
  Search,
  SquarePen,
  X,
} from "lucide-react";
import { CopilotIcon } from "./CopilotIcon";
import type { CopilotConversationSummary } from "./api";

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Saved conversation"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CopilotHistory({
  conversations,
  activeId,
  loading,
  error,
  locked,
  onSelect,
  onNew,
  onCollapse,
  onExpand,
  onReload,
  collapsed = false,
}: {
  conversations: CopilotConversationSummary[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  locked: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onCollapse?: () => void;
  onExpand?: () => void;
  onReload: () => void;
  collapsed?: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = conversations.filter((row) =>
    row.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  useEffect(() => {
    if (searchOpen && !collapsed) searchRef.current?.focus();
  }, [searchOpen, collapsed]);

  return (
    <div className={`sm-copilot-history${collapsed ? " sm-copilot-history--rail" : ""}`}>
      <div className="sm-copilot-history__heading">
        {!collapsed ? (
          <span className="sm-copilot-history__brand">
            <CopilotIcon size={27} />
            <strong>ShelfMerch Copilot</strong>
          </span>
        ) : null}
        {collapsed ? (
          <button
            type="button"
            className="sm-copilot-icon-button sm-copilot-rail-button"
            onClick={onExpand}
            aria-label="Expand conversation history"
            aria-expanded={false}
            title="Expand conversation history"
          >
            <CopilotIcon size={28} />
          </button>
        ) : onCollapse ? (
          <button
            type="button"
            className="sm-copilot-icon-button"
            onClick={onCollapse}
            aria-label="Collapse conversation history"
            aria-expanded={true}
            title="Collapse conversation history"
          >
            <PanelLeftClose size={19} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <nav className="sm-copilot-history__nav" aria-label="Copilot navigation">
        <button
          type="button"
          className="sm-copilot-new"
          data-action="new-chat"
          onClick={onNew}
          disabled={locked}
          aria-label="New chat"
          title={collapsed ? "New chat" : undefined}
        >
          <SquarePen size={20} strokeWidth={1.6} aria-hidden="true" />
          {!collapsed ? <span>New chat</span> : null}
        </button>
        <button
          type="button"
          className="sm-copilot-history__nav-button"
          onClick={() => {
            if (collapsed) onExpand?.();
            setSearchOpen(true);
          }}
          aria-label="Search saved conversations"
          title={collapsed ? "Search saved conversations" : undefined}
        >
          <Search size={20} strokeWidth={1.6} aria-hidden="true" />
          {!collapsed ? <span>Search chats</span> : null}
        </button>
        {collapsed ? (
          <button
            type="button"
            className="sm-copilot-history__nav-button"
            onClick={onExpand}
            aria-label="Show recent conversations"
            title="Recent conversations"
          >
            <MessageSquare size={20} strokeWidth={1.6} aria-hidden="true" />
          </button>
        ) : null}
      </nav>
      {searchOpen && !collapsed ? (
        <div className="sm-copilot-history__search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved chats"
            aria-label="Search saved chats"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
                setSearchOpen(false);
              }
            }}
          />
          <button
            type="button"
            className="sm-copilot-icon-button"
            aria-label="Close conversation search"
            onClick={() => {
              setQuery("");
              setSearchOpen(false);
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="sm-copilot-history__list" aria-busy={loading} hidden={collapsed}>
        <p className="sm-copilot-eyebrow">Your conversations</p>
        {loading ? (
          <p className="sm-copilot-history__status" role="status">
            <LoaderCircle size={16} className="sm-copilot-spin" aria-hidden="true" />
            Loading conversations…
          </p>
        ) : error ? (
          <div className="sm-copilot-history__empty">
            <p>{error}</p>
            <button type="button" className="sm-copilot-text-button" onClick={onReload}>
              <RotateCcw size={14} aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : filtered.length ? (
          filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              data-conversation-id={row.id}
              className={`sm-copilot-history__item${row.id === activeId ? " is-active" : ""}`}
              aria-current={row.id === activeId ? "true" : undefined}
              onClick={() => onSelect(row.id)}
              disabled={locked}
              title={row.title}
            >
              <MessageSquare size={17} strokeWidth={1.5} aria-hidden="true" />
              <span>
                <strong>{row.title || "Untitled conversation"}</strong>
                <time dateTime={row.updatedAt}>{dateLabel(row.updatedAt)}</time>
              </span>
            </button>
          ))
        ) : (
          <div className="sm-copilot-history__empty">
            <MessageSquare size={22} strokeWidth={1.4} aria-hidden="true" />
            <strong>{query.trim() ? "No matching conversations" : "A fresh start"}</strong>
            <p>
              {query.trim()
                ? "Try another title to find a saved chat."
                : "Your conversations will appear here after your first message."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
