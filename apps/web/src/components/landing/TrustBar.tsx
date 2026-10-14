const trustLogos = [
  {
    alt: "J.P. Morgan",
    src: "/images/logos/trust-carousel/jp-morgan.png",
  },
  {
    alt: "Datadog",
    src: "/images/logos/trust-carousel/datadog.png",
  },
  {
    alt: "Google",
    src: "/images/logos/trust-carousel/google.png",
    className: "trust-logo--google",
  },
  {
    alt: "Informatica",
    src: "/images/logos/trust-carousel/informatica.png",
  },
  {
    alt: "Odoo",
    src: "/images/logos/trust-carousel/odoo.png",
  },
  {
    alt: "Brio",
    src: "/images/logos/trust-carousel/brio.png",
  },
  {
    alt: "German Doner Kebab",
    src: "/images/logos/trust-carousel/gdk.png",
  },
];

export function TrustBar() {
  const logoGroups = [trustLogos, trustLogos];

  return (
    <section className="trust-bar" aria-label="Trusted customers">
      <span>TRUSTED BY TEAMS AT</span>
      <div className="trust-marquee">
        <div className="trust-marquee-track">
          {logoGroups.map((group, groupIndex) => (
            <div className="trust-marquee-group" aria-hidden={groupIndex === 1} key={groupIndex}>
              {group.map((logo) => (
                <span
                  className={`trust-logo ${logo.className ?? ""}`}
                  key={`${groupIndex}-${logo.alt}`}
                >
                  <img alt={groupIndex === 0 ? logo.alt : ""} src={logo.src} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
