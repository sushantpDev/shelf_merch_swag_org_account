import { useEffect } from "react";
import { Link } from "react-router";
import {
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Handshake,
  Hash,
  LockKeyhole,
  Megaphone,
  MessagesSquare,
  PackageCheck,
  Search,
  Send,
  ShieldCheck,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import "@/components/landing-page.css";
import "./slack-integration-landing.css";
import "./slack-integration-typography.css";

const CONNECT_HREF = "/app/integrations";
const TEAM_IMG = "/images/integrations/slack-team-collaboration.png";

const STATS = [
  { value: "5 min", label: "to connect Slack and send your first ShelfMerch update" },
  { value: "1 channel", label: "keeps kit requests, orders, budgets, approvals, and deliveries together" },
  { value: "0 DMs", label: "ShelfMerch does not read private messages or team conversations" },
] as const;

const STEPS = [
  {
    icon: Hash,
    boxed: true,
    title: "Choose a channel.",
    body: "Create or select the Slack channel where merch operations should stay visible.",
  },
  {
    icon: Send,
    title: "Connect ShelfMerch.",
    body: "Authorize the app with Slack OAuth and keep workspace access under admin control.",
  },
  {
    icon: Handshake,
    title: "Pick the updates.",
    body: "Enable kit, order, budget, delivery, and request notifications for the team.",
  },
  {
    icon: MessagesSquare,
    title: "Work from Slack.",
    body: "Every important update lands in the channel, ready for quick decisions.",
  },
] as const;

const ROLES = [
  {
    icon: Users,
    title: "HR",
    body: "Track onboarding kits from creation to delivery.",
  },
  {
    icon: Megaphone,
    title: "Marketing",
    body: "Keep campaign merch launches coordinated.",
  },
  {
    icon: Truck,
    title: "Operations",
    body: "Catch fulfillment and dispatch updates instantly.",
  },
  {
    icon: WalletCards,
    title: "Finance",
    body: "See budget movement and approval signals sooner.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Sales",
    body: "Know when prospect kits are packed and shipped.",
  },
  {
    icon: Handshake,
    title: "Leadership",
    body: "Stay aligned on status without asking for reports.",
  },
] as const;

const SECURITY = [
  {
    icon: ShieldCheck,
    title: "OAuth install",
    body: "Slack access is granted through OAuth. ShelfMerch never asks for workspace passwords.",
  },
  {
    icon: LockKeyhole,
    title: "Encrypted tokens",
    body: "Bot credentials are encrypted at rest before they are stored.",
  },
  {
    icon: CheckCircle2,
    title: "Least privilege",
    body: "Only the scopes needed to post configured notifications are requested.",
  },
  {
    icon: Bell,
    title: "No message reading",
    body: "ShelfMerch posts updates. It does not read private DMs or channel history.",
  },
] as const;

const FAQS = [
  {
    q: "What Slack permissions does ShelfMerch request?",
    a: "Only the permissions required to post notifications to the Slack channels you select.",
  },
  {
    q: "How does ShelfMerch use Slack data?",
    a: "We store workspace identifiers, the installer user ID, selected channels, and an encrypted bot token so updates can be posted.",
  },
  {
    q: "Can I disconnect Slack anytime?",
    a: "Yes. Company admins can disconnect Slack from ShelfMerch Integrations at any time.",
  },
  {
    q: "Does ShelfMerch read Slack conversations?",
    a: "No. ShelfMerch does not read or store private Slack conversations or message history.",
  },
] as const;

/**
 * Public Slack Marketplace installation landing page.
 * Route: /integrations/slack
 */
export function SlackIntegrationLandingPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Connect ShelfMerch with Slack | ShelfMerch";
    window.scrollTo(0, 0);
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="slack-landing shelf-landing">
      <Header />

      <main>
        <section className="slk-hero" aria-labelledby="slack-landing-title">
          <div className="slk-wrap slk-hero__grid">
            <div className="slk-hero__copy">
              <p className="slk-kicker">Slack integration for ShelfMerch</p>
              <h1 id="slack-landing-title">Bring merch operations <em>into Slack.</em></h1>
              <p className="slk-lead">
                Push kit requests, order dispatches, delivery updates, and budget signals into the
                channel where your team already makes decisions.
              </p>
              <div className="slk-hero__actions">
                <Link className="slk-btn slk-btn--primary" to={CONNECT_HREF}>
                  Connect Slack <ChevronRight aria-hidden="true" size={18} />
                </Link>
                <a className="slk-btn slk-btn--secondary" href="#how-it-works">
                  See setup steps
                </a>
              </div>
            </div>

            <div className="slk-hero__visual" aria-label="ShelfMerch Slack workflow preview">
              <div
                className="slk-product-window"
                role="img"
                aria-label="Slack channel receiving ShelfMerch order and kit updates"
              >
                <div className="slk-window-chrome">
                  <span />
                  <span />
                  <span />
                  <strong>ShelfMerch in Slack</strong>
                </div>
                <div className="slk-window-body">
                  <aside className="slk-window-sidebar" aria-hidden="true">
                    <div className="slk-sidebar-logo">S</div>
                    <span>Home</span>
                    <span>Threads</span>
                    <span>Mentions</span>
                    <div className="slk-sidebar-title">Channels</div>
                    <strong># merch-ops</strong>
                    <span># order-updates</span>
                    <span># team-kits</span>
                  </aside>
                  <div className="slk-window-main">
                    <div className="slk-channel-bar">
                      <strong># merch-ops</strong>
                      <span>Merch requests, orders, budgets</span>
                    </div>
                    <div className="slk-message slk-message--active">
                      <div className="slk-app-avatar">S</div>
                      <div>
                        <div className="slk-message-meta">
                          <strong>ShelfMerch APP</strong>
                          <span>9:14 AM</span>
                        </div>
                        <h3>New onboarding kit created</h3>
                        <div className="slk-update-card">
                          <PackageCheck aria-hidden="true" size={22} />
                          <div>
                            <strong>Google onboarding kit</strong>
                            <span>25 units · Delivery Sep 18</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="slk-message">
                      <div className="slk-app-avatar slk-app-avatar--blue">S</div>
                      <div>
                        <div className="slk-message-meta">
                          <strong>ShelfMerch APP</strong>
                          <span>11:27 AM</span>
                        </div>
                        <h3>Order dispatched</h3>
                        <p>Welcome kits shipped successfully.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="slk-hero-badge">
                <span className="slk-status-dot" aria-hidden="true" />
                Posting live to <strong>#merch-ops</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="slk-stats" aria-label="Slack integration highlights">
          <div className="slk-wrap">
            <ul className="slk-stats__grid">
              {STATS.map((stat) => (
                <li key={stat.value}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="slk-feature slk-feature--collab" aria-labelledby="fast-heading">
          <div className="slk-wrap slk-feature__grid">
            <figure className="slk-feature__media slk-feature__media--photo">
              <img
                src={TEAM_IMG}
                alt="Team members collaborating around a laptop after receiving a ShelfMerch update"
                width={1680}
                height={945}
                loading="lazy"
              />
            </figure>
            <div className="slk-feature__copy">
              <p className="slk-kicker">Faster decision-making</p>
              <h2 id="fast-heading">Move work forward <em>without email follow-ups.</em></h2>
              <p>
                ShelfMerch posts clear operational updates in Slack, so teams can see what changed,
                who needs to act, and what comes next without waiting for another status thread.
              </p>
              <Link className="slk-text-link" to={CONNECT_HREF}>
                Get started with Slack <ChevronRight aria-hidden="true" size={18} />
              </Link>
            </div>
          </div>
        </section>

        <section className="slk-feature slk-feature--setup" aria-labelledby="control-heading">
          <div className="slk-wrap slk-feature__grid">
            <figure
              className="slk-feature__media slk-feature__media--setup"
              aria-label="ShelfMerch Slack setup showing workspace, channel, and notification settings"
            >
              <div className="slk-setup-window">
                <div className="slk-setup-chrome">
                  <span />
                  <span />
                  <span />
                  <div className="slk-setup-search" />
                </div>
                <div className="slk-setup-body">
                  <aside className="slk-setup-sidebar" aria-hidden="true">
                    <div className="slk-sidebar-logo">S</div>
                    <span>Home</span>
                    <span>DMs</span>
                    <span>Activity</span>
                    <div className="slk-sidebar-title">Channels</div>
                    <strong># merch-ops</strong>
                  </aside>
                  <div className="slk-setup-panel">
                    <div className="slk-setup-header">
                      <div>
                        <strong># merch-ops</strong>
                        <span>Notification channel</span>
                      </div>
                    </div>
                    <div className="slk-channel-select">
                      <Hash aria-hidden="true" size={22} />
                      <div>
                        <strong>ShelfMerch connected</strong>
                        <span>Workspace updates will post here.</span>
                      </div>
                    </div>
                    <div className="slk-toggle-list" aria-hidden="true">
                      <div className="slk-toggle-row">
                        <span>Kit requests</span>
                        <strong />
                      </div>
                      <div className="slk-toggle-row">
                        <span>Order dispatched</span>
                        <strong />
                      </div>
                      <div className="slk-toggle-row">
                        <span>Budget approvals</span>
                        <strong />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="slk-setup-note">
                <span className="slk-status-dot" aria-hidden="true" />
                Updates routed to <strong>#merch-ops</strong>
              </div>
            </figure>
            <div className="slk-feature__copy">
              <p className="slk-kicker">Control and setup</p>
              <h2 id="control-heading">Configure once, <em>stay in sync.</em></h2>
              <p>
                Choose the workspace, pick the channel, and decide which ShelfMerch events should
                post to Slack. Once it is set, updates keep running automatically.
              </p>
              <a className="slk-text-link" href="#security">
                Review security <ChevronRight aria-hidden="true" size={18} />
              </a>
            </div>
          </div>
        </section>

        <section className="slk-steps-section" id="how-it-works" aria-labelledby="how-heading">
          <div className="slk-steps-wrap">
            <div className="slk-section-head">
              <h2 id="how-heading">How to <em>get started</em></h2>
              <p>It only takes a few clicks to connect Slack and begin receiving updates.</p>
            </div>
            <ol className="slk-steps">
              {STEPS.map((step, index) => (
                <li className="slk-step" key={step.title}>
                  {"boxed" in step && step.boxed ? (
                    <span className="slk-step__icon-box" aria-hidden="true">
                      <step.icon className="slk-step__icon" size={22} strokeWidth={1.75} />
                    </span>
                  ) : (
                    <step.icon className="slk-step__icon" aria-hidden="true" size={40} strokeWidth={1.5} />
                  )}
                  <h3>
                    Step {index + 1}: {step.title}
                  </h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="slk-roles" aria-labelledby="roles-heading">
          <div className="slk-wrap">
            <div className="slk-section-head slk-section-head--left">
              <h2 id="roles-heading">Built for roles <em>of all types</em></h2>
              <p>
                No matter who owns merch, Slack gives every stakeholder a shared operational view.
              </p>
            </div>
            <div className="slk-roles__grid">
              {ROLES.map((role) => (
                <article className="slk-role" key={role.title}>
                  <role.icon aria-hidden="true" size={34} />
                  <h3>{role.title}</h3>
                  <p>{role.body}</p>
                  <span className="slk-role__arrow" aria-hidden="true">
                    <ChevronRight size={20} />
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="slk-security" id="security" aria-labelledby="security-heading">
          <div className="slk-wrap slk-security__grid">
            <div className="slk-feature__copy">
              <p className="slk-kicker">Security</p>
              <h2 id="security-heading">Built to connect <em>securely.</em></h2>
              <p>
                ShelfMerch keeps Slack access narrow, admin-controlled, and focused on posting the
                notifications your team enables.
              </p>
              <div className="slk-security__summary" aria-label="Security summary">
                <span>Admin controlled</span>
                <span>Encrypted tokens</span>
                <span>No message history</span>
              </div>
            </div>
            <div className="slk-security__list">
              {SECURITY.map((item) => (
                <article className="slk-security__item" key={item.title}>
                  <item.icon aria-hidden="true" size={24} />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="slk-faq-section" aria-labelledby="faq-heading">
          <div className="slk-wrap slk-faq-wrap">
            <h2 id="faq-heading">Frequently asked questions</h2>
            <div className="slk-faq">
              {FAQS.map((item) => (
                <details className="slk-faq__item" key={item.q}>
                  <summary>
                    <span>{item.q}</span>
                    <ChevronRight className="slk-faq__chev" aria-hidden="true" size={22} />
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="slk-final" aria-labelledby="final-cta-heading">
          <div className="slk-final__inner">
            <Search aria-hidden="true" size={26} />
            <h2 id="final-cta-heading">Interested in ShelfMerch <em>for Slack?</em></h2>
            <div className="slk-final__actions">
              <Link className="slk-btn slk-btn--light" to={CONNECT_HREF}>
                Connect Slack
              </Link>
              <a className="slk-btn slk-btn--outline-light" href="#how-it-works">
                View setup
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
