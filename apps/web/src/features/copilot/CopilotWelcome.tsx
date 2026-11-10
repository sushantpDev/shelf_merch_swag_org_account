import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Clock3,
  Gift,
  Package,
  RotateCcw,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { CopilotAction, CopilotCategory } from "./api";

const icons: Record<string, LucideIcon> = {
  products_kits: Package,
  budgets_wallet: Wallet,
  stores_collections: Store,
  gifting_rewards: Gift,
  employees_teams: Users,
  campaigns_orders: ClipboardList,
};

export function CopilotWelcome({
  categories,
  selectedCategoryId,
  onCategory,
  onPrompt,
  onAction,
  onReload,
  onCurate,
}: {
  categories: CopilotCategory[];
  selectedCategoryId: string | null;
  onCategory: (id: string | null) => void;
  onPrompt: (prompt: string) => void;
  onAction?: (action: CopilotAction) => void;
  onReload?: () => void;
  onCurate?: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const initial = useRef(true);
  const selected = categories.find((category) => category.id === selectedCategoryId);
  const Icon = selected ? icons[selected.id] || Package : Package;
  const hasPending = selected?.actions.some(
    (action) => action.availability === "integration_pending",
  );
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [selectedCategoryId]);

  return (
    <section
      className={`sm-copilot-welcome sm-copilot-discovery${selected ? " sm-copilot-discovery--selected" : ""}`}
      aria-labelledby="copilot-title"
    >
      {selected ? (
        <div className="sm-copilot-discovery__navigation">
          <button
            type="button"
            className="sm-copilot-discovery__back"
            onClick={() => onCategory(null)}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            All capabilities
          </button>
          <span className="sm-copilot-discovery__category">
            <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
            {selected.title}
          </span>
        </div>
      ) : null}
      <h1 id="copilot-title" ref={heading} tabIndex={-1}>
        {selected?.heading || "How can I help you today?"}
      </h1>
      <p className="sm-copilot-welcome__sub">
        {selected
          ? "Choose a task to draft a message. You can edit it before sending."
          : "Discover merchandise, manage gifting and explore your ShelfMerch workspace."}
      </p>
      {!selected && onCurate ? (
        <button type="button" className="sm-curator-entry" onClick={onCurate}>
          <Gift size={19} aria-hidden="true" />
          <span><strong>Curate Gifts</strong><small>Discover thoughtful gifts for your team.</small></span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      ) : null}
      {!categories.length ? (
        <div className="sm-copilot-discovery__empty" role="status">
          <p>Your capabilities couldn’t be loaded. You can still write a message below.</p>
          {onReload ? (
            <button type="button" className="sm-copilot-text-button" onClick={onReload}>
              <RotateCcw size={15} aria-hidden="true" />
              Reload capabilities
            </button>
          ) : null}
        </div>
      ) : selected ? (
        <>
          <div className="sm-copilot-action-grid" aria-label={`${selected.title} actions`}>
            {[...selected.actions]
              .sort(
                (a, b) =>
                  Number(a.availability !== "available") - Number(b.availability !== "available"),
              )
              .slice(0, 6)
              .map((action) => {
                const available = action.availability === "available";
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={`sm-copilot-action${available ? "" : " sm-copilot-action--pending"}`}
                    disabled={!available}
                    aria-label={action.title}
                    title={available ? "Draft this request" : action.explanation}
                    onClick={() => {
                      if (action.availability !== "available") return;
                      if (onAction) onAction(action);
                      else if (action.availability === "available" && "prompt" in action) {
                        onPrompt(action.prompt);
                      }
                    }}
                  >
                    <span className="sm-copilot-action__content">
                      <strong>{action.title}</strong>
                      {action.description ? <small>{action.description}</small> : null}
                      {!available ? (
                        <span className="sm-copilot-action__pending">
                          <Clock3 size={12} aria-hidden="true" />
                          Coming to Copilot
                        </span>
                      ) : null}
                    </span>
                    {available ? (
                      <ArrowRight
                        size={16}
                        className="sm-copilot-action__arrow"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                );
              })}
          </div>
          <p className="sm-copilot-discovery__note">
            {hasPending
              ? "Actions marked “Coming to Copilot” cannot run here yet. Other tasks prepare an editable message; nothing is sent automatically."
              : "Selecting a task prepares a message. You decide when to send it."}
          </p>
        </>
      ) : (
        <div className="sm-copilot-capability-grid" aria-label="Copilot capabilities">
          {categories.map((category) => {
            const CategoryIcon = icons[category.id] || Package;
            return (
              <button
                key={category.id}
                type="button"
                className="sm-copilot-capability"
                data-category-id={category.id}
                onClick={() => onCategory(category.id)}
                aria-label={category.title}
              >
                <CategoryIcon size={21} strokeWidth={1.6} aria-hidden="true" />
                <span>
                  <strong>{category.title}</strong>
                  <small>{category.description}</small>
                </span>
                <ArrowRight size={15} className="sm-copilot-capability__arrow" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
