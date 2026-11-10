import { useEffect, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { Link } from "react-router";
import "./home-demo-banner.css";

export function HomeDemoBanner({ pageRef }: { pageRef: RefObject<HTMLDivElement | null> }) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const page = pageRef.current;
    const hero = page?.querySelector(".lh-hero");
    if (!page || !hero || !("IntersectionObserver" in window)) return;

    let passedHero = hero.getBoundingClientRect().bottom <= 0;
    const endSections = [...page.querySelectorAll(".lh-final, footer")];
    const visibleEndSections = new Set<Element>();
    for (const section of endSections) {
      const bounds = section.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) visibleEndSections.add(section);
    }
    const update = () => setVisible(passedHero && visibleEndSections.size === 0);
    update();

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) passedHero = entry.boundingClientRect.bottom <= 0;
        else if (entry.isIntersecting) visibleEndSections.add(entry.target);
        else visibleEndSections.delete(entry.target);
      }
      update();
    });
    observer.observe(hero);
    endSections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [pageRef]);

  if (!visible || dismissed) return null;

  return (
    <aside className="home-demo-banner" aria-label="Plan your merchandise program">
      <img
        src="/images/landing/demo-woman-portrait.png"
        alt=""
        width="48"
        height="48"
        className="home-demo-banner__artwork"
      />
      <p>Great merch starts here.</p>
      <Link className="home-demo-banner__cta" to="/request-demo">
        Book a demo
      </Link>
      <button
        className="home-demo-banner__close"
        type="button"
        aria-label="Dismiss demo banner"
        onClick={() => setDismissed(true)}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}
