import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowRight,
  Box,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  GlassWater,
  Globe2,
  Gift,
  Headphones,
  Lightbulb,
  LockKeyhole,
  Megaphone,
  Play,
  Plus,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  Wallet,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import shelfmerchVideoBanner from "@/assets/shelfmerch-video-banner-16x9.jpg";
import { ShopBanner } from "@/features/shops/banner";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { getStoredUser } from "@/services/api-bridge";
import { entityManagerBudgetRemaining } from "@/services/workspace-api";
import { walletUnallocated } from "@/lib/walletFormat";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { tenantPath } from "@/lib/workspaceSlug";
import type { UiOrgDept, UiProduct } from "@/services/mappers";
import { EntityManagerKitsSection } from "./EntityManagerKitsSection";
import { NewUserWelcomeDialog } from "./NewUserWelcomeDialog";
import "./dashboard.css";
import "./dashboard-shortcuts.css";
import { DashboardQuickActionCard } from "./DashboardQuickActionCard";

/** Cleared on logout in auth-store so the popup returns on the next login. */
const NEW_USER_WELCOME_DISMISS_KEY = "sm-new-user-welcome-dismissed";

function wasNewUserWelcomeDismissed() {
  try {
    return sessionStorage.getItem(NEW_USER_WELCOME_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissNewUserWelcome() {
  try {
    sessionStorage.setItem(NEW_USER_WELCOME_DISMISS_KEY, "1");
  } catch {
    /* ignore storage failures */
  }
}

function formatInr(amount: number) {
  return `₹ ${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatRole(role: string) {
  const map: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    company_admin: "Admin",
    entity_manager: "Manager",
    member: "Member",
  };
  return map[role] ?? role.replace(/_/g, " ");
}



function onboardingHelpLinks() {
  return [
    { label: "Welcome to Shelf Merch", icon: Play, href: tenantPath() },
    { label: "Create your first shop", icon: Store, href: tenantPath("/shops") },
    { label: "Browse the swag catalog", icon: ShoppingBag, href: tenantPath("/catalog") },
  ];
}

function helpLinks() {
  return [
    { label: "Setup Guide", icon: Box, href: tenantPath() },
    { label: "Watch Demo", icon: Play, href: tenantPath() },
    { label: "Contact Support", icon: Headphones, href: "/request-demo" },
    { label: "Book Demo", icon: CalendarDays, href: "/request-demo" },
  ];
}

const WHY_CARDS = [
  { label: "Gift Employees", body: "Reward your team", icon: Gift },
  { label: "Create Shops", body: "Shops for your team", icon: Store },
  { label: "Track & Manage", body: "Manage orders & budgets", icon: ChartNoAxesCombined },
] as const;

function shortcuts() {
  return [
    {
      label: "Kits",
      body: "Bundle apparel, drinkware and stationery into ready-to-ship kits.",
      feature: "Curated combos. Zero hassle.",
      href: tenantPath("/kits"),
      icon: Gift,
      tone: "blue",
    },
    {
      label: "Wallet",
      body: "Let teams spend an approved budget, fully tracked and controlled.",
      feature: "Real-time balance. Total visibility.",
      href: tenantPath("/wallets"),
      icon: Wallet,
      tone: "purple",
    },
    {
      label: "Spot gifting",
      body: "Send a gift the moment it matters. No operational back-and-forth.",
      feature: "Quick, thoughtful & on-brand.",
      href: tenantPath("/campaigns"),
      icon: Sparkles,
      tone: "blue",
    },
    {
      label: "Automated gifting",
      body: "Set the rule once. Birthdays and milestones run automatically.",
      feature: "Always on. Always personal.",
      href: tenantPath("/integrations"),
      icon: CalendarDays,
      tone: "purple",
    },
  ];
}

function quickActions() {
  return [
    { label: "Quick tip", icon: Lightbulb, tone: "blue", href: tenantPath() },
    { label: "Budget controls", icon: Landmark, tone: "amber", href: tenantPath("/wallets") },
    { label: "Order tracking", icon: ShoppingBag, tone: "green", href: tenantPath("/orders") },
  ];
}

function productThumb(p: UiProduct): string | undefined {
  return resolveMediaUrl(p.mockupUrl) || resolveMediaUrl(p.photoUrl) || resolveMediaUrl(p.imgUrl);
}

function pickCatalogPreviewProducts(products: UiProduct[]) {
  const featured = [
    { id: "6a69a28328d51c137c8e9530", name: "ActiveDry Polo" },
    { id: "6a69a2a328d51c137c8e962e", name: "Desk Organizer with Clock & Date Blocks" },
    { name: "Premium Business Blend Mug" },
    { id: "6abb6a21d602f72fd2df9100", name: "Neck & Shoulder Massager" },
    { name: "Customized Cap" },
  ];

  return featured
    .map((item) => products.find((product) =>
      (item.id && product.id === item.id) ||
      product.nm.trim().toLowerCase() === item.name.toLowerCase(),
    ))
    .filter((product): product is UiProduct => Boolean(product));
}
function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="dash-section-head">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

function VideoCard({ wide = false, centered = false }: { wide?: boolean; centered?: boolean }) {
  const [open, setOpen] = useState(false);
  const embedUrl = "https://www.youtube.com/embed/NfoBjC8R7MM?autoplay=1&rel=0&modestbranding=1";
  const className = [
    "dash-video",
    wide ? "dash-video--wide" : "",
    centered ? "dash-video--centered" : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <section className="dash-video-card card">
        <div className="dash-video-card__head">
          <h2>Watch a Quick Shelfmerch Overview</h2>
          <span aria-hidden="true">-</span>
        </div>
        <button
          type="button"
          className={className}
          aria-label="Watch Shelf Merch overview video"
          onClick={() => setOpen(true)}
        >
          <img className="dash-video__poster" src={shelfmerchVideoBanner} alt="" />
          <span className="dash-video__overlay" aria-hidden="true" />
          <span className="dash-video__play" aria-hidden="true">
            <Play size={22} fill="currentColor" strokeWidth={0} />
          </span>
          <span className="dash-video__hover-copy" aria-hidden="true">
            Watch a quick Shelf Merch overview
          </span>
        </button>
        <div className="dash-video-card__meta">
          <span>Welcome to Shelfmerch</span>
          <i aria-hidden="true" />
          <span>2:26 Min</span>
        </div>
      </section>
      {open ? (
        <div className="dash-video-modal-backdrop" role="presentation">
          <div
            className="dash-video-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Shelf Merch overview video"
          >
            <div className="dash-video-modal__frame">
              <iframe
                src={embedUrl}
                title="Shelf Merch overview video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <button type="button" className="dash-video-modal__done" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function HelpCenter({ onboarding = false }: { onboarding?: boolean }) {
  const links = onboarding ? onboardingHelpLinks() : helpLinks();
  return (
    <section className="dash-card card">
      <SectionHead title={onboarding ? "Help center" : "Need help?"} />
      <ul className="dash-help-list">
        {links.map((item) => {
          const Icon = item.icon;
          const content = (
            <>
              <span className="dash-help-list__icon"><Icon size={15} aria-hidden="true" /></span>
              <span>{item.label}</span>
              <ChevronRight size={16} className="dash-help-list__arrow" aria-hidden="true" />
            </>
          );
          return (
            <li key={item.label}>
              {item.href.startsWith("mailto:") ? (
                <a href={item.href} className="dash-help-list__item">{content}</a>
              ) : (
                <Link to={item.href} className="dash-help-list__item">{content}</Link>
              )}
            </li>
          );
        })}
      </ul>
      {!onboarding ? <p className="dash-help-foot">We're here to help you succeed.</p> : null}
    </section>
  );
}

function ShortcutGrid() {
  return (
    <section className="dash-services">
      <SectionHead title="Everything you can do" />
      <div className="dash-services__grid">
        {shortcuts().map(({ icon: Icon, ...item }) => (
          <Link
            key={item.label}
            to={item.href}
            className={`dash-service dash-service--${item.tone}`}
          >
            <span className="dash-service__banner" aria-hidden="true">
              <span className="dash-service__icon"><Icon size={38} strokeWidth={2.2} /></span>
            </span>
            <span className="dash-service__content">
              <strong className="dash-service__title">{item.label}</strong>
              <span className="dash-service__description">{item.body}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SetupVisual() {
  return (
    <div className="dash-setup-visual" aria-hidden="true">
      <img className="dash-setup-visual__img" src="/images/dashboard-setup-3d.png" alt="" />
    </div>
  );
}

function QuickTipsCard() {
  return (
    <section className="dash-tip-card" aria-label="Quick actions and tips">
      <header className="dash-tip-card__title">
        <span className="dash-tip-card__title-icon" aria-hidden="true">
          <Lightbulb size={16} />
        </span>
        <h2>Quick actions & tips</h2>
        {/* <Sparkles className="dash-tip-card__spark" size={18} aria-hidden="true" /> */}
      </header>
      <ul className="dash-tip-card__list">
        {quickActions().map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.label}>
              <Link to={item.href} className="dash-tip-card__row">
                <span className={`dash-tip-card__row-icon dash-tip-card__row-icon--${item.tone}`} aria-hidden="true">
                  <Icon size={15} />
                </span>
                <span>{item.label}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CatalogSendCard({ products }: { products: UiProduct[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const items = pickCatalogPreviewProducts(products)
    .map((p) => {
      const image = productThumb(p);
      if (!image) return null;
      return {
        id: p.id || p.nm,
        name: p.nm,
        price: p.price || p.brand || "Catalog item",
        image,
        href: p.id ? `${tenantPath("/catalog")}/${p.id}` : tenantPath("/catalog"),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 10);

  const sendItems = items;

  const scrollBy = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" });
  };

  return (
    <section className="dash-send-card card">
      <SectionHead
        title="What can you send?"
        action={<Link to={tenantPath("/catalog")} className="dash-inline-action">Browse catalog <ArrowRight size={14} /></Link>}
      />
      <div className="dash-send-rail">
        <button type="button" className="dash-send-nav" aria-label="Previous products" onClick={() => scrollBy(-1)}>
          <ChevronLeft size={18} />
        </button>
        <div className="dash-send-track" ref={scrollerRef}>
          {sendItems.map((item) => (
            <Link key={item.id} to={item.href} className="dash-send-item">
              <span className="dash-send-item__media">
                <img src={item.image} alt="" />
              </span>
              <strong>{item.name}</strong>
              <small>{item.price}</small>
            </Link>
          ))}
        </div>
        <button type="button" className="dash-send-nav" aria-label="Next products" onClick={() => scrollBy(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}

function OnboardingDashboard({
  catalogProducts,
}: {
  catalogProducts: UiProduct[];
}) {
  return (
    <div className="dash-onboard">
      <section className="dash-setup card">
        <div className="dash-setup__glow" aria-hidden="true" />
        <div className="dash-setup__copy">
          <span className="dash-setup__eyebrow"><Sparkles size={14} /> Let's get started</span>
          <h1>Set up your gifting workspace</h1>
          <p>Set up your organization budget to unlock your gifting journey.</p>
          <Link to={tenantPath("/wallets")} state={{ startCreateWallet: true }} className="dash-setup__cta">
            <span className="dash-setup__cta-shine" aria-hidden="true" />
            <Landmark size={20} aria-hidden="true" />
            Setup budget
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
          <div className="dash-setup__trust">
            <span><ShieldCheck size={15} /> No credit card required</span>
            <span><Users size={15} /> Admin only</span>
            <span><LockKeyhole size={15} /> Secure approval flow</span>
          </div>
        </div>
        <SetupVisual />
      </section>

      <section className="dash-onboard-mid">
        <section className="dash-why-panel card">
          <SectionHead title="Why Shelf Merch?" />
          <ul className="dash-why-list">
            {WHY_CARDS.map(({ icon: Icon, ...item }) => (
              <li key={item.label}>
                <span className="dash-why-list__icon" aria-hidden="true">
                  <Icon size={26} strokeWidth={1.5} />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <p>{item.body}</p>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="dash-onboard-video">
          <VideoCard centered />
        </div>

        <div className="dash-onboard-side">
          <HelpCenter onboarding />
        </div>
      </section>

      <section className="dash-onboard-lower">
        <QuickTipsCard />
        <CatalogSendCard products={catalogProducts} />
      </section>

      <ShortcutGrid />
    </div>
  );
}

function MetricSummaryPanel({ items }: {
  items: {
    label: string;
    value: string | number;
    subcopy: string;
    href: string;
    cta: string;
    tone: "violet" | "blue" | "green" | "amber";
    icon: LucideIcon;
  }[];
}) {
  return (
    <section className="dash-metrics-panel card">
      <div className="dash-metrics-panel__head">
        <h2>Overview ({items.length})</h2>
        <button type="button" aria-label="More overview options">...</button>
      </div>
      <div className="dash-metrics-panel__grid">
        {items.map((item) => (
          <article key={item.label} className={`dash-metric-summary dash-metric-summary--${item.tone}`}>
            <span className="dash-metric-summary__icon" aria-hidden="true">
              <item.icon size={22} strokeWidth={2.2} />
            </span>
            <div className="dash-metric-summary__top">
              <span>{item.label}</span>
            </div>
            <div className="dash-metric-summary__body">
              <strong>{item.value}</strong>
              <span>{item.subcopy}</span>
            </div>
            <div className="dash-metric-summary__rule" />
            <Link to={item.href} className="dash-metric-summary__cta">
              {item.cta}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function CampaignPromoCard() {
  return (
    <DashboardQuickActionCard
      title="Campaigns"
      description="Create and track sends"
      icon={Megaphone}
      image="/images/dashboard-campaigns-corner.png"
      tone="campaigns"
      items={[
        { label: "Points campaigns", href: tenantPath("/campaigns"), icon: Sparkles },
        { label: "Kits for teams", href: tenantPath("/kits"), icon: Box },
        { label: "Delivery visibility", href: tenantPath("/orders"), icon: Globe2 },
      ]}
      browse={{ label: "View campaigns", href: tenantPath("/campaigns") }}
      action={{ label: "New campaign", href: tenantPath("/campaigns") }}
    />
  );
}

function SwagPromoCard() {
  return (
    <DashboardQuickActionCard
      title="Swag"
      description="Explore team merch"
      icon={Shirt}
      image="/images/dashboard-swag-corner.png"
      tone="swag"
      items={[
        { label: "Apparel and bags", href: tenantPath("/swag"), icon: Shirt },
        { label: "Bottles and notebooks", href: tenantPath("/swag"), icon: GlassWater },
        { label: "Ready-to-send gifts", href: tenantPath("/kits"), icon: Gift },
      ]}
      browse={{ label: "Browse swag", href: tenantPath("/swag") }}
      action={{ label: "Build a kit", href: tenantPath("/kits/new") }}
    />
  );
}

function BudgetSection({
  mainBalance,
  departments,
}: {
  mainBalance: number;
  departments: UiOrgDept[];
}) {
  const colors = ["#35b5e5", "#df4545", "#ffc329", "#30b87a", "#7657d6"];
  const allocatedDepartments = departments.filter((dept) => (dept.allocated ?? 0) > 0);
  const departmentSegments = allocatedDepartments.map((dept, index) => ({
    name: dept.name,
    value: Math.max(0, dept.allocated ?? 0),
    color: colors[index % colors.length],
  }));
  const allocatedToDepartments = departmentSegments.reduce((sum, item) => sum + item.value, 0);
  const visibleDepartments = departmentSegments.slice(0, 3);
  const distributionItems = visibleDepartments.length
    ? visibleDepartments
    : [
        {
          name: "No department allocations",
          value: 0,
          color: colors[0],
        },
      ];
  const chartBase = allocatedToDepartments + Math.max(0, mainBalance);
  const chartPercent = chartBase > 0
    ? Math.max(0, Math.min(100, (allocatedToDepartments / chartBase) * 100))
    : 0;
  const chartPercentLabel = chartPercent > 0 && chartPercent < 0.1
    ? "<0.1%"
    : `${chartPercent < 10 ? Number(chartPercent.toFixed(1)) : Math.round(chartPercent)}%`;
  let segmentStart = 0;
  const allocatedStops = departmentSegments.map((item) => {
    const segmentEnd = segmentStart + (chartBase > 0 ? (item.value / chartBase) * 100 : 0);
    const stop = `${item.color} ${segmentStart}% ${segmentEnd}%`;
    segmentStart = segmentEnd;
    return stop;
  });
  const gaugeGradient = [
    ...allocatedStops,
    `#edf1f7 ${segmentStart}% 100%`,
  ].join(", ");

  return (
    <section className="dash-card card dash-wallets-card">
      <SectionHead
        title="Budget distribution"
        action={
          <Link to={tenantPath("/wallets")} className="dash-inline-action">
            View budget <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="dash-budget-distribution">
        <div className="dash-budget-distribution__chart" aria-hidden="true">
          <span style={{ background: `conic-gradient(from -130deg, ${gaugeGradient})` }}>
            <b>{chartPercentLabel}</b>
            <small>Allocated</small>
          </span>
        </div>
        <div className="dash-budget-distribution__details">
          <div className="dash-budget-distribution__summary">
            <span>Department budgets</span>
            <strong>{formatInr(allocatedToDepartments)}</strong>
          </div>
          <div className="dash-budget-distribution__list">
            {distributionItems.map((item) => {
              const percent = allocatedToDepartments > 0
                ? Math.round((item.value / allocatedToDepartments) * 100)
                : 0;
              return (
                <Link to={tenantPath("/wallets")} key={item.name} className="dash-budget-distribution__row">
                  <span>
                    <i style={{ background: item.color }} />
                    {item.name}
                  </span>
                  <b>{percent}%</b>
                </Link>
              );
            })}
          </div>
          {departmentSegments.length > 3 && (
            <Link to={`${tenantPath("/wallets")}#budget-distribution`} className="dash-metric-summary__cta">
              See More
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

type DashboardShop = {
  id: string;
  name: string;
  slug?: string;
  live: boolean;
  logoUrl?: string;
  bannerConfig?: Record<string, unknown>;
};

function PinnedShopCard({ pinnedShop, canCreateShop }: { pinnedShop: DashboardShop | null; canCreateShop: boolean }) {
  return (
    <section className="dash-card card dash-pinned-shop">
      <SectionHead title="Pinned shop" action={<Link to={tenantPath("/shops")} className="dash-inline-action">Manage shop <ArrowRight size={14} /></Link>} />
      {pinnedShop ? (
        <>
          <Link to={`${tenantPath("/shops")}/${pinnedShop.id}`} className="dash-shop-banner-link">
            <ShopBanner source={pinnedShop} height={126} layout="center" logoSize={58} radius={10} />
          </Link>
          <div className="dash-shop-meta">
            <span className={`dash-shop-status${pinnedShop.live ? " is-live" : ""}`}>
              {pinnedShop.live ? "Active" : "Draft"}
            </span>
            <strong className="dash-shop-name">{pinnedShop.name}</strong>
            <small className="dash-shop-url">
              {pinnedShop.slug ? `shelfmerch.com/${pinnedShop.slug}` : "Shelf Merch shop"}
            </small>
          </div>
          <Link to={`${tenantPath("/shops")}/${pinnedShop.id}`} className="dash-open-shop">Open Shop <ArrowRight size={15} /></Link>
        </>
      ) : (
        <>
          <p className="dash-empty-note">Launch a branded shop so recipients can redeem swag on their own schedule.</p>
          <Link to={canCreateShop ? tenantPath("/shops/new") : tenantPath("/shops")} className="dash-open-shop">
            {canCreateShop ? "Create a shop" : "Browse shops"} <ArrowRight size={15} />
          </Link>
        </>
      )}
    </section>
  );
}

function ExistingDashboard({
  peopleReachedCount,
  senderCount,
  activeShopCount,
  mainBalance,
  departments,
  pinnedShop,
  canCreateShop,
}: {
  peopleReachedCount: number;
  senderCount: number;
  activeShopCount: number;
  mainBalance: number;
  departments: UiOrgDept[];
  pinnedShop: DashboardShop | null;
  canCreateShop: boolean;
}) {
  const overviewItems = [
    { label: "Gifts sent", value: senderCount, subcopy: "Total gifts sent", tone: "violet" as const, icon: Gift, href: tenantPath("/kits"), cta: "Go to kits" },
    { label: "People reached", value: peopleReachedCount, subcopy: "Recipients reached", tone: "blue" as const, icon: Users, href: tenantPath("/orders"), cta: "Go to orders" },
    { label: "Active shops", value: activeShopCount, subcopy: "Live shops", tone: "green" as const, icon: Store, href: tenantPath("/shops"), cta: "Go to shops" },
    { label: "Available budget", value: formatInr(mainBalance), subcopy: "Available to spend", tone: "amber" as const, icon: Landmark, href: tenantPath("/wallets"), cta: "Go to budget" },
  ];

  return (
    <>
      <section className="dash-existing-top">
        <MetricSummaryPanel items={overviewItems} />
      </section>

  

      <section className="dash-existing-main">
        <div className="dash-existing-main__wallets">
          <BudgetSection
            mainBalance={mainBalance}
            departments={departments}
          />
        </div>
        <div className="dash-existing-main__video"><div className="dash-promo-pair"><CampaignPromoCard /><SwagPromoCard /></div></div>
      </section>

      <section className="dash-existing-grid dash-existing-grid--balanced">
        <div className="dash-existing-grid__shop"><PinnedShopCard pinnedShop={pinnedShop} canCreateShop={canCreateShop} /></div>
        <div className="dash-existing-grid__settings"><VideoCard wide /></div>
        <div className="dash-existing-grid__help"><HelpCenter /></div>
      </section>
      <ShortcutGrid />
    </>
  );
}

export function DashboardPage() {
  const location = useLocation();
  const { data: workspace, isLoading, isError, error } = useWorkspace();
  const { canWrite } = useTenantAccess();
  const canCreateShop = canWrite("shops");
  const sessionUser = getStoredUser();
  const [welcomeOpen, setWelcomeOpen] = useState(true);

  useEffect(() => {
    document.title = "Dashboard | Shelf Merch";
  }, []);

  if (isLoading && !workspace) {
    return <LoadingState message="Loading dashboard..." fullScreen={false} />;
  }
  if (isError || !workspace) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {error instanceof Error ? error.message : "Could not load workspace"}
      </div>
    );
  }

  const userName = workspace.userPatch.name || sessionUser?.name || "User";
  const initials = workspace.userPatch.initials || "U";
  const account = workspace.account || "Workspace";
  const roleLabel = formatRole(workspace.userPatch.role);
  const campaigns = workspace.campaigns ?? [];
  const peopleReachedCount = campaigns.reduce(
    (total, campaign) => total + (campaign.recipientCount || 0),
    0,
  );
  const senderCount = workspace.orders?.length ?? 0;
  const wallets = workspace.wallets ?? [];
  const orgWallet = workspace.org?.wallet;
  // Match Wallets page: entity managers see remaining dept budget (allocated − spent);
  // company admins see unallocated wallet cash.
  const mainBalance =
    workspace.userPatch.role === "entity_manager"
      ? entityManagerBudgetRemaining(workspace)
      : workspace.org.active && orgWallet?.unallocated != null
        ? orgWallet.unallocated
        : wallets[0]
          ? walletUnallocated(wallets[0])
          : 0;
  const pinnedShop = workspace.shops.find((s) => s.live) ?? workspace.shops[0] ?? null;
  const activeShopCount = workspace.shops.filter((s) => s.live).length || workspace.shops.length;
  const showOnboarding = wallets.length === 0;
  const previewWelcome = new URLSearchParams(location.search).get("previewWelcome") === "1";
  const showWelcome =
    welcomeOpen && (previewWelcome || (showOnboarding && !wasNewUserWelcomeDismissed()));

  function closeWelcome() {
    if (!previewWelcome) dismissNewUserWelcome();
    setWelcomeOpen(false);
  }

  return (
    <div className="dash-page fade-in">
      {showWelcome ? (
        <NewUserWelcomeDialog
          open
          firstName={userName.trim().split(/\s+/)[0]}
          onClose={closeWelcome}
        />
      ) : null}

      <section className="dash-welcome card">
        <div className="dash-welcome__left">
          <div className="dash-welcome__avatar" aria-hidden="true">{initials}</div>
          <div>
            <div className="dash-welcome__name">Welcome, {userName} 👋</div>
            <div className="dash-welcome__meta">{account} | {roleLabel}</div>
          </div>
        </div>
        <div className="dash-welcome__actions">
          <Link to={tenantPath("/settings")} className="btn btn-ghost btn-sm">Set up my profile</Link>
          <Link to="/request-demo" className="btn btn-dark btn-sm">Book a demo</Link>
        </div>
      </section>

      {showOnboarding ? (
        <OnboardingDashboard
          catalogProducts={workspace.catalogProducts ?? []}
        />
      ) : (
        <ExistingDashboard
          peopleReachedCount={peopleReachedCount}
          activeShopCount={activeShopCount}
          senderCount={senderCount}
          mainBalance={mainBalance}
          departments={workspace.org.departments ?? []}
          pinnedShop={pinnedShop}
          canCreateShop={canCreateShop}
        />
      )}
    </div>
  );
}
