export const TRUST_LOGOS = [
  {
    alt: "J.P. Morgan",
    src: "/images/logos/trust-carousel/jp-morgan.png",
    className: "trust-logo--jpmorgan",
  },
  {
    alt: "Datadog",
    src: "/images/logos/trust-carousel/datadog.png",
    className: "trust-logo--datadog",
  },
  {
    alt: "Google",
    src: "/images/logos/trust-carousel/google.png",
    className: "trust-logo--google",
  },
  {
    alt: "Informatica",
    src: "/images/logos/trust-carousel/informatica.png",
    className: "trust-logo--informatica",
  },
  {
    alt: "Odoo",
    src: "/images/logos/trust-carousel/odoo.png",
    className: "trust-logo--odoo",
  },
  {
    alt: "Brio",
    src: "/images/logos/trust-carousel/brio.png",
    className: "trust-logo--brio",
  },
  {
    alt: "German Doner Kebab",
    src: "/images/logos/trust-carousel/gdk.png",
    className: "trust-logo--gdk",
  },
];

export function TrustBar() {
  const logoGroups = [TRUST_LOGOS, TRUST_LOGOS];

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
