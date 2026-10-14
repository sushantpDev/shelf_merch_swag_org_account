import { ArrowUpRight, CheckCircle2, PackageCheck, Truck } from "lucide-react";

const highlights = [
  {
    title: "No payment or commitment",
    description: "Share your requirement first. We shape the plan before anything is locked.",
    icon: CheckCircle2,
  },
  {
    title: "One team from design to delivery",
    description: "Products, packaging, budgets and fulfilment stay in one clear workflow.",
    icon: PackageCheck,
  },
  {
    title: "Pan-India delivery support",
    description: "Ship employee kits, event merch and partner gifts across locations with ease.",
    icon: Truck,
  },
];

export function MerchPlan() {
  return (
    <section className="landing-plan" id="contact" aria-labelledby="landing-plan-title">
      <div className="landing-plan__heading">
        <span className="landing-plan__eyebrow">MERCH PLANNING</span>
        <h2 id="landing-plan-title">
          Tell us what you need.
          <em>We&apos;ll build the merch plan.</em>
        </h2>
      </div>

      <div className="landing-plan__copy">
        <ul className="landing-plan__highlights">
          {highlights.map(({ title, description, icon: Icon }) => (
            <li key={title}>
              <span aria-hidden="true">
                <Icon size={19} strokeWidth={2.4} />
              </span>
              <div>
                <b>{title}</b>
                <small>{description}</small>
              </div>
            </li>
          ))}
        </ul>

        <a className="landing-plan__cta" href="/request-demo">
          Book a Demo
          <span aria-hidden="true">
            <ArrowUpRight size={23} strokeWidth={2.2} />
          </span>
        </a>
      </div>

      <figure className="landing-plan__image-card" aria-label="Branded merchandise kit preview">
        <img
          src="/images/landing/merch-plan/merch-flatlay-transparent.png"
          alt="Blue and pink branded merchandise flat lay with tote bag, cap, notebook, mug and pen"
        />
      </figure>
    </section>
  );
}
