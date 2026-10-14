import { ArrowIcon } from "./icons";

const EVENTS = [
  {
    image: "/images/landing/events/event-merch-bar.png?v=8",
    alt: "Event merch bars",
    title: "Event merch bars",
    copy: "Curated, pick-your-own swag stations.",
  },
  {
    image: "/images/landing/events/bulk-kitting.png?v=8",
    alt: "Bulk kitting",
    title: "Bulk kitting",
    copy: "Thousands packed, labelled and delivered.",
  },
  {
    image: "/images/landing/events/accessories.png?v=8",
    alt: "Accessories",
    title: "Accessories",
    copy: "Premium, low-volume and memorable.",
  },
  {
    image: "/images/landing/events/goodie-bags.png?v=8",
    alt: "Goodie bags",
    title: "Goodie bags",
    copy: "Event and festive hampers, pan-India.",
  },
] as const;

export function Events() {
  return (
    <section className="events-section">
      <div className="events-copy">
        <span className="kicker">IN-PERSON, ELEVATED</span>
        <h2>
          Make every moment <em>worth showing up for.</em>
        </h2>
        <p>
          From conference floors to leadership offsites, we bring your brand into the room, and make
          the logistics disappear.
        </p>
      </div>
      <div className="event-grid">
        {EVENTS.map((event, idx) => (
          <article key={idx} className="event-image-card">
            <div className="event-card-media">
              <img src={event.image} alt={event.alt} loading="lazy" />
            </div>
            <h3>{event.title}</h3>
            <p>{event.copy}</p>
          </article>
        ))}
      </div>
      <a className="button button-dark events-cta" href="#contact">
        Plan an event <ArrowIcon />
      </a>
    </section>
  );
}
