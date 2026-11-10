import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ContactRound,
  Gift,
  RefreshCw,
  ShieldCheck,
  Truck,
  UserPlus,
} from "lucide-react";
import { Link } from "react-router";
import { ResourcesShell } from "../../../components/resources/ResourcesShell";
import zohoPeopleLogo from "../../../../assets/integrations/zoho-people.png";
import { ShelfMerchLogo } from "../../../components/brand/ShelfMerchLogo";
import { useDocsMeta } from "../useDocsMeta";
import "./zoho-workflow.css";

const TITLE = "Example Employee Onboarding Workflow · ShelfMerch for Zoho People";
const steps = [
  {
    title: "Start with your people",
    system: "ZOHO PEOPLE",
    icon: UserPlus,
    body: "HR adds the new employee in Zoho People. The employee record is the starting point for preparing their welcome experience.",
  },
  {
    title: "Sync when you’re ready",
    system: "ADMINISTRATOR ACTION",
    icon: RefreshCw,
    body: "An administrator connects Zoho People and runs an employee sync in Shelf Merch. Review the sync summary before moving on.",
  },
  {
    title: "Keep recipient records together",
    system: "SHELF MERCH CONTACTS",
    icon: ContactRound,
    body: "Shelf Merch creates or updates the employee contact. Matching Zoho record IDs, or work email where needed, helps avoid duplicate contacts.",
  },
  {
    title: "Choose the welcome experience",
    system: "HR SELECTS THE RECIPIENT",
    icon: Gift,
    body: "HR selects the employee as an onboarding recipient and prepares a welcome kit or corporate gift that reflects the company’s brand.",
  },
  {
    title: "Prepare the personal details",
    system: "KIT PREPARATION",
    icon: Check,
    body: "Confirm the recipient and the details needed for the chosen gift before preparing the welcome kit for delivery.",
  },
  {
    title: "Follow the welcome to their door",
    system: "DELIVERY TRACKING",
    icon: Truck,
    body: "Track delivery in Shelf Merch, keeping the gifting workflow together from the employee contact to the final welcome moment.",
  },
] as const;
const benefits = [
  {
    title: "Less repeated data entry",
    body: "Use synced employee contacts as the starting point for onboarding recipients, rather than recreating the same information.",
  },
  {
    title: "More consistent records",
    body: "Update matching contacts and reduce duplicate records, helping HR work from a clearer recipient list.",
  },
  {
    title: "A more connected welcome",
    body: "Bring employee contacts, gift preparation and delivery tracking into a central place for your HR team.",
  },
];

export function ZohoPeopleExampleWorkflowPage() {
  useDocsMeta({
    title: TITLE,
    description:
      "An illustrative onboarding workflow with Zoho People and Shelf Merch. Explore employee syncing, welcome kit preparation and delivery tracking. Not a verified customer case study.",
    canonicalPath: "/case-studies/zoho-people",
    ogTitle: "A connected employee welcome with Zoho People and Shelf Merch",
    ogDescription:
      "An example workflow from employee record to onboarding gift, with setup guides for administrators.",
  });
  return (
    <ResourcesShell title={TITLE} variant="case-study">
      <main className="zw-main">
        <section className="zw-hero" aria-labelledby="zw-title">
          <div className="zw-wrap">
            <div className="zw-hero-grid">
              <div className="zw-hero-copy">
                <h1 id="zw-title">
                  From a new hire<em>to a warm welcome.</em>
                </h1>
                <p>
                  See how employee information in Zoho People can support a more connected
                  onboarding and gifting workflow in Shelf Merch.
                </p>
                <div className="zw-actions">
                  <a className="zw-button" href="#workflow">
                    Explore the workflow <ArrowDown size={18} aria-hidden="true" />
                  </a>
                  <Link className="zw-text-link" to="/docs/zoho-people/user-guide">
                    Read the setup guide <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                </div>
              </div>
              <div className="zw-welcome-visual">
                <div className="zw-brand-connection" aria-label="Zoho People and Shelf Merch">
                  <img className="zw-zoho-logo" src={zohoPeopleLogo} alt="Zoho People" />
                  <span className="zw-brand-plus" aria-hidden="true">
                    +
                  </span>
                  <ShelfMerchLogo height={30} />
                </div>
                <img
                  className="zw-welcome-art"
                  src="/images/resources/zoho/zoho-case-study-hero-v1.png"
            alt="HR and operations colleagues preparing a welcome kit for a new employee"
                  width="1536"
                  height="1024"
                  fetchPriority="high"
                />
              </div>
            </div>
            <div className="zw-note">
              <span className="zw-note-badge">EXAMPLE WORKFLOW</span>
              <p>
                This is an illustrative workflow, not a verified customer case study or a specific
                customer result.
              </p>
            </div>
          </div>
        </section>
        <div className="zw-overview zw-wrap">
          <div>
            <span>THE CONNECTION</span>
            <strong>Zoho People × Shelf Merch</strong>
          </div>
          <div>
            <span>THE TEAM</span>
            <strong>HR and company administrators</strong>
          </div>
          <div>
            <span>THE MOMENT</span>
            <strong>Employee onboarding</strong>
          </div>
        </div>
        <section className="zw-wrap zw-story" id="workflow" aria-labelledby="zw-workflow-title">
          <aside className="zw-story-intro">
            <span className="zw-label">THE WORKFLOW, STEP BY STEP</span>
            <h2 id="zw-workflow-title">
              One employee journey.<em>A considered first impression.</em>
            </h2>
            <p>
              Connect the information HR already manages with the welcome experience you want to
              create.
            </p>
            <a className="zw-text-link" href="#benefits">
              See the benefits <ArrowRight size={18} aria-hidden="true" />
            </a>
            <div className="zw-admin-note">
              <ShieldCheck size={25} aria-hidden="true" />
              <strong>HR stays in control</strong>
              <p>
                Employee sync is started manually by an administrator. ShelfMerch does not sync Zoho
                People on a schedule. HR then selects recipients and prepares gifts. This example is
                illustrative, not a measured customer result.
              </p>
            </div>
          </aside>
          <ol className="zw-timeline">
            {steps.map(({ title, system, icon: Icon, body }, index) => (
              <li key={title}>
                <span className="zw-step-number">{String(index + 1).padStart(2, "0")}</span>
                <article>
                  <div className="zw-step-meta">
                    <span>{system}</span>
                    <Icon size={22} aria-hidden="true" />
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              </li>
            ))}
          </ol>
        </section>
        <section className="zw-benefits" id="benefits" aria-labelledby="zw-benefits-title">
          <div className="zw-wrap">
            <div className="zw-heading">
              <span className="zw-label">WHY CONNECT THE WORKFLOW?</span>
              <h2 id="zw-benefits-title">
                Less coordination.<em>More room for the welcome.</em>
              </h2>
              <p>
                A practical approach to keeping employee information and gifting preparation
                connected.
              </p>
            </div>
            <div className="zw-benefit-grid">
              {benefits.map((item, index) => (
                <article key={item.title}>
                  <span className="zw-benefit-number">0{index + 1}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="zw-wrap zw-guides" aria-labelledby="zw-guides-title">
          <div>
            <span className="zw-label">TAKE THE NEXT STEP</span>
            <h2 id="zw-guides-title">
              Bring the workflow<em>to your team.</em>
            </h2>
            <p>
              Find the connection steps, sync details and administrator guidance in the Zoho People
              documentation.
            </p>
            <Link className="zw-button" to="/request-demo">
              Talk to our team <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="zw-guide-links">
            <Link to="/docs/zoho-people/user-guide">
              <span>
                <strong>User guide</strong>
                <small>Connect, sync and manage employee contacts.</small>
              </span>
              <ArrowUpRight size={23} aria-hidden="true" />
            </Link>
            <Link to="/docs/zoho-people/admin-guide">
              <span>
                <strong>Administrator guide</strong>
                <small>Review permissions and integration management.</small>
              </span>
              <ArrowUpRight size={23} aria-hidden="true" />
            </Link>
            <Link to="/docs/zoho-people">
              <span>
                <strong>Documentation overview</strong>
                <small>Explore the Zoho People integration.</small>
              </span>
              <ArrowUpRight size={23} aria-hidden="true" />
            </Link>
          </div>
        </section>
        <div className="zw-wrap zw-bottom">
          <Link to="/resources">← All resources</Link>
          <a href="mailto:support@shelfmerch.com">
            Contact support <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </div>
      </main>
    </ResourcesShell>
  );
}
