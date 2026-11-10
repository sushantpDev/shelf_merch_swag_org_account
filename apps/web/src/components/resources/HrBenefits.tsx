import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router";
import "./hr-benefits.css";

const benefits = [
  {
    id: "hr-rewards",
    label: "EMPLOYEE REWARDS",
    title: "Make rewarding your people feel effortless.",
    body: "Bring approved merchandise into a branded employee store. Give people the freedom to choose a reward they will enjoy, while your team keeps the program simple to run.",
    points: ["Curated products with your branding", "Recipient choice within your program budget"],
    image: "hr-rewards-illustration-v2.webp",
    alt: "An original illustration of an employee choosing branded merchandise from a company store",
  },
  {
    id: "hr-milestones",
    label: "EMPLOYEE ENGAGEMENT",
    title: "Keep the connection going, all year.",
    body: "Build thoughtful gifting into the employee journey. Plan birthdays, work anniversaries and other milestones in advance, with a personal touch for each occasion.",
    points: ["Date-based gifting rules", "Thoughtful moments across teams and locations"],
    image: "hr-engagement-illustration-v2.webp",
    alt: "Colleagues celebrating an employee milestone with a thoughtful gift and a year-round planner",
  },
  {
    id: "hr-recognition",
    label: "PEER RECOGNITION",
    title: "Make a thank you part of every day.",
    body: "Give peers and managers a simple way to recognise contributions. Connect appreciation with points, meaningful rewards and the values your team shares.",
    points: ["Peer and manager appreciation", "Points, badges and redemption reporting"],
    image: "hr-recognition-illustration-v2.webp",
    alt: "Two colleagues exchanging an appreciation message and a recognition badge",
  },
  {
    id: "hr-connected",
    label: "CONNECTED HR OPERATIONS",
    title: "Bring your people programs together.",
    body: "Connect employee information with your gifting programs. Keep approved collections, department budgets and redemption reporting together, so HR and finance can work from the same picture.",
    points: ["HRMS integrations and program rules", "Clear budgets and consolidated reporting"],
    diagram: "connections",
  },
  {
    id: "hr-onboarding",
    label: "EMPLOYEE ONBOARDING",
    title: "A first day that feels like belonging.",
    body: "Welcome every new joiner with a considered kit or an onboarding store. Collect sizes and delivery details directly, then keep track of their welcome from order to doorstep.",
    points: ["Welcome kits or a branded onboarding store", "Delivery tracking across India"],
    image: "hr-onboarding-illustration-v2.webp",
    alt: "An HR colleague handing a new employee a welcome package beside a desk with branded essentials",
  },
] as const;

function ConnectionsGraphic() {
  return (
    <img
      className="hb-connections-illustration"
      src="/images/resources/hr/hr-connected-illustration-v2.webp"
      alt="An HR professional using connected employee information, milestone and reporting tools at her desk"
      width="1536"
      height="1024"
      loading="lazy"
    />
  );
}

const tools = [
  {
    label: "Employee data",
    title: "Start with people. Connect the details.",
    body: "Add employees or connect your HRMS. Use joining dates and milestones to shape gifting programs around the people they are for.",
    points: ["Keep employee information together", "Build repeatable programs around key dates"],
    kind: "data",
  },
  {
    label: "Company stores",
    title: "Their choice. Your brand, throughout.",
    body: "Create an approved collection that reflects your company. Let employees find something that suits them, within the products and budgets you choose.",
    points: [
      "A collection that feels like your company",
      "Flexible choices for different employee moments",
    ],
    kind: "store",
  },
  {
    label: "Team programs",
    title: "Shared ownership. A thoughtful experience.",
    body: "Give teams room to celebrate their people with the structure HR needs. Bring department budgets, approved collections and redemption reporting into the same program.",
    points: [
      "Allocate budgets by team or cost centre",
      "Keep recognition and gifting easy to follow",
    ],
    kind: "teams",
  },
] as const;

function ToolGraphic({ kind }: { kind: (typeof tools)[number]["kind"] }) {
  if (kind === "data") return <ConnectionsGraphic />;
  if (kind === "store")
    return (
      <img
        className="hb-company-store-illustration"
        src="/images/resources/hr/hr-company-store-illustration-v2.webp"
        alt="An employee holding a branded gift beside a company storefront with apparel, bags and headphones"
        width="1536"
        height="1024"
        loading="lazy"
      />
    );
  return (
    <img
      className="hb-team-programs-illustration"
      src="/images/resources/hr/hr-team-programs-illustration-v2.webp"
      alt="Three colleagues coordinating a shared employee gifting program with budget, collection and reporting tools"
      width="1536"
      height="1024"
      loading="lazy"
    />
  );
}

function HrTools() {
  const [active, setActive] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = tools[active];
  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tools.length;
    else if (event.key === "ArrowLeft") next = (index + tools.length - 1) % tools.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tools.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  }
  return (
    <section className="hb-tools hr-wrap" aria-labelledby="hb-tools-title">
      <div className="hb-heading">
        <p className="hr-eyebrow">YOUR HR TOOLKIT</p>
        <h2 id="hb-tools-title">
          Built around the way<em>your people team works.</em>
        </h2>
      </div>
      <div className="hb-tabs" role="tablist" aria-label="HR tools">
        {tools.map((tool, index) => (
          <button
            type="button"
            key={tool.kind}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            role="tab"
            id={`hb-tab-${tool.kind}`}
            aria-controls="hb-tool-panel"
            aria-selected={active === index}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => handleKey(event, index)}
          >
            {tool.label}
          </button>
        ))}
      </div>
      <div
        className="hb-tool-panel"
        role="tabpanel"
        id="hb-tool-panel"
        aria-labelledby={`hb-tab-${selected.kind}`}
        tabIndex={0}
      >
        <div>
          <h3>{selected.title}</h3>
          <p>{selected.body}</p>
          <ul>
            {selected.points.map((point) => (
              <li key={point}>
                <Check size={16} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
          <Link to="/request-demo" className="hr-inline-link">
            Explore a program for your team <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <div className="hb-tool-visual">
          <ToolGraphic kind={selected.kind} />
        </div>
      </div>
    </section>
  );
}

export function HrBenefits() {
  return (
    <>
      <section className="hb-benefits" id="hr-programs" aria-labelledby="hr-programs-title">
        <div className="hr-wrap hb-heading">
          <p className="hr-eyebrow">MORE POSSIBILITY FOR YOUR PEOPLE TEAM</p>
          <h2 id="hr-programs-title">
            Less admin.<em>More employee connection.</em>
          </h2>
          <p>
            Practical tools to welcome, reward and recognise your people, with the structure to make
            it work.
          </p>
        </div>
        <div className="hr-wrap">
          {benefits.map((benefit, index) => (
            <article
              className={`hb-benefit${index % 2 === 1 ? " hb-benefit--reverse" : ""}`}
              id={benefit.id}
              key={benefit.id}
            >
              <div className="hb-benefit__copy">
                <span className="hr-label">
                  0{index + 1} / {benefit.label}
                </span>
                <h3>{benefit.title}</h3>
                <p>{benefit.body}</p>
                <ul>
                  {benefit.points.map((point) => (
                    <li key={point}>
                      <Check size={16} aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="hb-benefit__art">
                {"image" in benefit ? (
                  <img
                    src={`/images/resources/hr/${benefit.image}`}
                    alt={benefit.alt}
                    width="1536"
                    height="1024"
                    loading="lazy"
                  />
                ) : (
                  <ConnectionsGraphic />
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <HrTools />
    </>
  );
}
