const IMAGES = [
  {
    src: "/images/resources/ribbon-welcome.webp",
    label: "Welcome kits",
    alt: "An employee opening a premium branded welcome kit at her desk",
  },
  {
    src: "/images/resources/ribbon-embroidery.webp",
    label: "Made for your brand",
    alt: "An embroidery machine personalizing a black cap",
  },
  {
    src: "/images/resources/ribbon-fulfillment.webp",
    label: "Packed with care",
    alt: "A fulfillment specialist preparing branded boxes for delivery",
  },
  {
    src: "/images/resources/ribbon-events.webp",
    label: "Event essentials",
    alt: "Branded canvas tote, conference badge and navy bottle",
  },
  {
    src: "/images/resources/ribbon-clients.webp",
    label: "Gifting with personality",
    alt: "Premium client appreciation box with a ceramic mug and navy journal",
  },
  {
    src: "/images/resources/ribbon-design.webp",
    label: "Ideas into reality",
    alt: "A designer arranging branded apparel, fabric swatches and artwork",
  },
];

export function ResourcesImageMarquee() {
  return (
    <section className="rh-inspiration" aria-labelledby="inspiration-title">
      <div className="rh-inspiration__heading rh-container">
        <h2 id="inspiration-title">
          <span>One platform.</span>
          <span>Every branded moment.</span>
        </h2>
        <p>
          From welcome kits to client gifting and events, see how thoughtful merchandise brings your
          brand to life.
        </p>
      </div>
      <div className="rh-inspiration__viewport" id="resources-image-ribbon">
        <div className="rh-inspiration__track">
          {[0, 1].map((copy) => (
            <div
              className="rh-inspiration__group"
              key={copy}
              aria-hidden={copy === 1 ? true : undefined}
            >
              {IMAGES.map(({ src, label, alt }) => (
                <figure className="rh-inspiration__item" key={src}>
                  <img
                    src={src}
                    alt={copy === 0 ? alt : ""}
                    width={640}
                    height={640}
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption>{label}</figcaption>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
