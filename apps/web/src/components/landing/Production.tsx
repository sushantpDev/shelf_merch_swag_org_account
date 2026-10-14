import { ArrowIcon } from "./icons";

const PRODUCTION_IMAGE = "/images/landing/production.png";

export function Production() {
  return (
    <section className="production" id="production">
      <div className="production-image">
        <img
          src={PRODUCTION_IMAGE}
          alt="Premium embroidery and apparel production in the Shelf Merch studio"
          loading="lazy"
        />
        <div className="image-tag">
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
          </svg>{" "}
          MADE BY US
        </div>
      </div>
      <div className="production-copy">
        <span className="kicker light desktop-only">THE ONLY MERCH PARTNER YOU NEED</span>
        <h2 className="desktop-only">
          From design file
          <br />
          to doorstep
          <br />
          <em>we make it ourselves.</em>
        </h2>
        <h2 className="mobile-only">
          From design file to
          <br />
          doorstep we make
          <br />
          <em>it effortless.</em>
        </h2>
        <p className="desktop-only">
          Most platforms resell someone else&apos;s catalog. We print, embroider and pack in-house,
          so quality, timelines and pricing stay in our control.
        </p>
        <ul className="production-checks mobile-only">
          <li>
            <span aria-hidden="true">✓</span> Premium quality
          </li>
          <li>
            <span aria-hidden="true">✓</span> Fast turnaround
          </li>
          <li>
            <span aria-hidden="true">✓</span> Global shipping
          </li>
          <li>
            <span aria-hidden="true">✓</span> Sustainable options
          </li>
        </ul>
        <div className="capability-list desktop-only">
          <span>
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 4l4 2 4-2 5 3-3 5-2-1v10H8V11l-2 1-3-5 5-3z" />
            </svg>{" "}
            In-house DTF printing
          </span>
          <span>
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
              <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
            </svg>{" "}
            Tajima embroidery
          </span>
          <span>
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7l8-4 8 4-8 4-8-4z" />
              <path d="M4 7v10l8 4 8-4V7" />
              <path d="M12 11v10" />
            </svg>{" "}
            ANT blank apparel
          </span>
          <span>
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 5h12v11H3z" />
              <path d="M15 9h4l3 4v3h-7z" />
              <circle cx="7" cy="18" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>{" "}
            Pan-India fulfillment
          </span>
          <span>
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 4C10 4 4 9 4 16c5 2 11 0 16-12z" />
              <path d="M4 20c2-5 6-9 12-12" />
            </svg>{" "}
            Sustainable materials
          </span>
          <span>
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 10v10h16V10" />
              <path d="M3 10l2-6h14l2 6" />
              <path d="M8 20v-6h8v6" />
              <path d="M3 10c0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0" />
            </svg>{" "}
            500+ catalog items
          </span>
        </div>
        <a className="button button-light" href="#contact">
          <span className="desktop-only">Meet your merch partner</span>
          <span className="mobile-only">See how it works</span> <ArrowIcon />
        </a>
      </div>
    </section>
  );
}
