import {
  Box,
  ChevronLeft,
  ChevronRight,
  FilePenLine,
  Gift,
  ListFilter,
  Megaphone,
  PackagePlus,
  Radio,
  Search,
  Send,
  Users,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMPLETE_STATUSES, isIncompleteCampaign, isLiveCampaign, isPointsCampaign, isSentKitCampaign } from "../model";
import type { UiCampaign } from "../model";
import type {
  CampaignFilter,
  CampaignStats,
  CampaignTypeCounts,
  CampaignTypeTab,
} from "../controllers/useCampaignsController";
import { CAMPAIGN_FILTERS } from "../controllers/useCampaignsController";
import { CampaignsEmptyStateView } from "./CampaignsEmptyStateView";
import "../campaigns-page.css";

const TAB_LABELS: Record<CampaignFilter, string> = {
  all: "All",
  live: "Live",
  draft: "Draft",
  completed: "Completed",
};

const TYPE_TABS: { id: CampaignTypeTab; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "kits", label: "Kit sends" },
  { id: "points", label: "Points" },
];

function campaignInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return (words[0] || "CP").slice(0, 2).toUpperCase();
}

const CAMPAIGN_AVATAR_TONES = ["blue", "lavender", "rose", "amber", "mint"] as const;

function campaignAvatarTone(campaign: UiCampaign) {
  const key = `${campaign.id}:${campaign.name}`;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return CAMPAIGN_AVATAR_TONES[hash % CAMPAIGN_AVATAR_TONES.length];
}

function statusChip(c: UiCampaign) {
  if (isSentKitCampaign(c))
    return (
      <span className="camp-chip camp-chip--sent">
        <span className="camp-chip__dot" />
        Sent
      </span>
    );
  if (isLiveCampaign(c))
    return (
      <span className="camp-chip camp-chip--live">
        <span className="camp-chip__dot" />
        Live
      </span>
    );
  if (c.status === "scheduled")
    return (
      <span className="camp-chip camp-chip--sched">
        <span className="camp-chip__dot" />
        Scheduled
      </span>
    );
  if (isIncompleteCampaign(c))
    return (
      <span className="camp-chip camp-chip--draft">
        <span className="camp-chip__dot" />
        Draft
      </span>
    );
  if (COMPLETE_STATUSES.includes(c.status))
    return (
      <span className="camp-chip camp-chip--done">
        <span className="camp-chip__dot" />
        Completed
      </span>
    );
  return <span className="camp-chip">{c.status}</span>;
}

function campaignTitle(c: UiCampaign) {
  if (isPointsCampaign(c)) return c.name;
  return `Kit send: ${c.name}`;
}

function campaignSubtext(c: UiCampaign) {
  if (isPointsCampaign(c)) return null;
  return `From kit: ${c.name}`;
}

function typeLabel(c: UiCampaign) {
  return isPointsCampaign(c) ? "Points" : "Kit";
}

/** Campaigns list: hero, KPI strip, unified panel with filters and dense rows. */
export function CampaignsTableView({
  stats,
  typeTab,
  typeCounts,
  typeTabEmpty,
  filter,
  search,
  pageItems,
  page,
  totalPages,
  totalFiltered,
  showingStart,
  showingEnd,
  canSend,
  onTypeTab,
  onFilter,
  onSearch,
  onPage,
  onSendGift,
  onSendPointsCampaign,
  onSendKitCampaign,
  onResumeCampaign,
}: {
  stats: CampaignStats;
  typeTab: CampaignTypeTab;
  typeCounts: CampaignTypeCounts;
  typeTabEmpty: boolean;
  filter: CampaignFilter;
  search: string;
  pageItems: UiCampaign[];
  page: number;
  totalPages: number;
  totalFiltered: number;
  showingStart: number;
  showingEnd: number;
  canSend: boolean;
  onTypeTab: (tab: CampaignTypeTab) => void;
  onFilter: (filter: CampaignFilter) => void;
  onSearch: (search: string) => void;
  onPage: (page: number) => void;
  onSendGift: () => void;
  onSendPointsCampaign: () => void;
  onSendKitCampaign: () => void;
  onResumeCampaign: (campaign: UiCampaign) => void;
}) {
  const kpis = [
    {
      label: "Total campaigns",
      value: stats.total.toLocaleString("en-IN"),
      hint: "Across points and kits",
      tone: "slate",
      Icon: Megaphone,
    },
    {
      label: "Live",
      value: stats.live.toLocaleString("en-IN"),
      hint: "Currently running",
      tone: "blue",
      Icon: Radio,
    },
    {
      label: "Draft",
      value: stats.draft.toLocaleString("en-IN"),
      hint: "Ready to finish",
      tone: "amber",
      Icon: FilePenLine,
    },
    {
      label: "Recipients",
      value: stats.recipients.toLocaleString("en-IN"),
      hint: "People reached",
      tone: "green",
      Icon: Users,
    },
  ] as const;

  return (
    <div className="campaigns-page">
      <header className="camp-hero">
        <div className="camp-hero__copy">
          <h1>Campaigns</h1>
          <p className="camp-hero__sub">Track points campaigns and kit-send history.</p>
        </div>
        {canSend ? (
          <div className="camp-hero__actions">
            <button type="button" className="camp-hero__ghost" onClick={onSendPointsCampaign}>
              <Send size={16} aria-hidden="true" />
              Send points
            </button>
            <button type="button" className="camp-hero__ghost" onClick={onSendKitCampaign}>
              <PackagePlus size={16} aria-hidden="true" />
              Send kit
            </button>
            <button type="button" className="camp-hero__cta" onClick={onSendGift}>
              <Gift size={16} aria-hidden="true" />
              Send gift
            </button>
          </div>
        ) : null}
      </header>

      <div className="camp-kpi" aria-label="Campaign metrics">
        {kpis.map((item) => (
          <div key={item.label} className={`camp-kpi__item camp-kpi__item--${item.tone}`}>
            <span className="camp-kpi__icon" aria-hidden="true">
              <item.Icon size={18} strokeWidth={2} />
            </span>
            <span className="camp-kpi__content">
              <span className="camp-kpi__label">{item.label}</span>
              <span className="camp-kpi__line">
                <span className="camp-kpi__value">{item.value}</span>
              </span>
              <span className="camp-kpi__hint">{item.hint}</span>
            </span>
          </div>
        ))}
      </div>

      <section className="camp-panel">
        <div className="camp-panel__toolbar">
          <div className="camp-seg" role="tablist" aria-label="Campaign type">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={typeTab === tab.id}
                className={`camp-seg__btn${typeTab === tab.id ? " is-active" : ""}`}
                onClick={() => onTypeTab(tab.id)}
              >
                {tab.label}
                <span className="camp-seg__count">{typeCounts[tab.id]}</span>
              </button>
            ))}
          </div>

          {!typeTabEmpty ? (
            <>
              <label className="camp-panel__search">
                <Search size={15} aria-hidden="true" />
                <input
                  placeholder="Search campaigns"
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                  aria-label="Search campaigns"
                />
              </label>

              <Select
                value={filter}
                onValueChange={(value) => onFilter(value as CampaignFilter)}
              >
                <SelectTrigger className="camp-status-select" aria-label="Filter campaigns by status">
                  <span className="camp-status-select__value">
                    <ListFilter size={14} aria-hidden="true" />
                    <span className="camp-status-select__label">Status</span>
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent className="camp-status-select__content" align="end">
                  {CAMPAIGN_FILTERS.map((status) => (
                    <SelectItem
                      key={status}
                      value={status}
                      className="camp-status-select__option"
                    >
                      {TAB_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : null}
        </div>

        {typeTabEmpty ? (
          <CampaignsEmptyStateView
            embedded
            canSend={canSend}
            onSendGift={onSendGift}
          />
        ) : (
          <>
            <div className="camp-list-head" aria-hidden="true">
              <span>Campaign</span>
              <span className="camp-list-head__type">Type</span>
              <span className="camp-list-head__status">Status</span>
              <span className="camp-list-head__num">Recipients</span>
            </div>

            <div className="camp-list-body" role="list">
              {pageItems.length ? (
                pageItems.map((c) => {
                  const pointsCampaign = isPointsCampaign(c);
                  const avatarTone = campaignAvatarTone(c);
                  const resumable =
                    canSend &&
                    isIncompleteCampaign(c) &&
                    (isPointsCampaign(c) ? Boolean(c.shopId) : Boolean(c.kitId));
                  return (
                    <div
                      key={c.id}
                      className={`camp-row${resumable ? " camp-row--resumable" : ""}`}
                      role="listitem"
                      tabIndex={resumable ? 0 : undefined}
                      aria-label={resumable ? `Continue draft ${campaignTitle(c)}` : undefined}
                      onClick={resumable ? () => onResumeCampaign(c) : undefined}
                      onKeyDown={
                        resumable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onResumeCampaign(c);
                              }
                            }
                          : undefined
                      }
                    >
                      <div className="camp-row__main">
                        <div
                          className={`camp-row__icon camp-row__icon--${pointsCampaign ? "points" : "kit"}`}
                          aria-hidden="true"
                        >
                          {pointsCampaign ? (
                            <span className={`camp-row__initials camp-row__initials--${avatarTone}`}>
                              {campaignInitials(c.name)}
                            </span>
                          ) : (
                            <Box size={16} strokeWidth={2} />
                          )}
                        </div>
                        <div className="camp-row__text">
                          <span className="camp-row__title">{campaignTitle(c)}</span>
                          {campaignSubtext(c) ? (
                            <span className="camp-row__sub">{campaignSubtext(c)}</span>
                          ) : null}
                          {resumable ? (
                            <span className="camp-row__resume">Continue sending</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="camp-row__type">
                        <span
                          className={`camp-chip camp-chip--type camp-chip--type-${pointsCampaign ? "points" : "kit"}`}
                        >
                          {pointsCampaign ? (
                            <Send size={12} strokeWidth={2} aria-hidden="true" />
                          ) : (
                            <Box size={12} strokeWidth={2} aria-hidden="true" />
                          )}
                          {typeLabel(c)}
                        </span>
                      </div>
                      <div className="camp-row__status">{statusChip(c)}</div>
                      <div className="camp-row__num">{c.recipientCount.toLocaleString("en-IN")}</div>
                    </div>
                  );
                })
              ) : (
                <div className="camp-list-empty">No campaigns match your filters.</div>
              )}
            </div>

            <div className="camp-panel__footer">
              <span className="camp-panel__meta">
                Showing {showingStart} to {showingEnd} of {totalFiltered} campaigns
              </span>
              {totalPages > 1 ? (
                <div className="camp-pager">
                  <button
                    type="button"
                    className="camp-pager__btn"
                    disabled={page <= 1}
                    onClick={() => onPage(page - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`camp-pager__btn${n === page ? " is-active" : ""}`}
                      onClick={() => onPage(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="camp-pager__btn"
                    disabled={page >= totalPages}
                    onClick={() => onPage(page + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
