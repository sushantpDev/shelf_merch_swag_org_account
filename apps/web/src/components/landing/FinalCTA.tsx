import { ArrowIcon } from "./icons";
import { Link } from "react-router";

export function FinalCTA() {
  return (
    <section className="final-cta" id="final-cta">
      <div className="cta-shape cta-shape-one" />
      <div className="cta-shape cta-shape-two" />
      <span className="kicker light">READY WHEN YOU ARE</span>
      <h2>
        Put your brand
        <br />
        <em>on the shelf.</em>
      </h2>
      <p className="desktop-only">One partner for every shop, kit, gift and moment of recognition.</p>
      <p className="mobile-only">
        Everything you need to create, send and manage custom swag.
      </p>
      <div className="final-cta__actions">
        <Link className="button button-light" to="/request-demo">
          <span className="desktop-only">Start with Shelf Merch</span>
          <span className="mobile-only">Get started</span> <ArrowIcon />
        </Link>
      </div>
    </section>
  );
}
