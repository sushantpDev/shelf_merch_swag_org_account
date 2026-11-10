import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router";
import { ArrowRight, ArrowUpRight, Globe2, Package, Palette, Shirt } from "lucide-react";
import { ALL_PRODUCTS } from "../types";
import type { CatalogVm } from "../controllers/useCatalogController";
import { ProductCard } from "./ProductCard";
import { FeaturedCatalogProducts } from "./FeaturedCatalogProducts";
import { CategoryCarousel, type CategoryTile } from "./CategoryCarousel";
import { CatalogMarketingFooter } from "./CatalogMarketingFooter";
import { catalogHomePath } from "./CatalogBrowseView";
import { buildCatalogOverviewTiles } from "./catalog-navigation";
import { TRUST_LOGOS } from "../../../components/landing/TrustBar";
import "./catalog-view.css";
import catalogHeroImg from "../../../../assets/catalog-hero-background.png";
import apparelImg from "../../../../assets/catalog/apparel-shelfmerch.png";
import overviewCorporateGiftsImg from "../../../../assets/catalog-overview/corporate-gifts.png";
import premiumUnbrandedMerchBannerImg from "../../../../assets/catalog-overview/premium-unbranded-merch-banner.png";
import overviewSustainableImg from "../../../../assets/catalog-overview/sustainability-new.png";
import overviewBuiltForImpactImg from "../../../../assets/catalog-overview/bag-generated.png";
import overviewGlobalReachImg from "../../../../assets/catalog-overview/global-reach.png";
import informaticaLogoImg from "../../../../assets/catalog-brands/informatica.svg";
import styleDrinkwareImg from "../../../../assets/catalog-style-spotlight/drinkware.png";
import styleToteImg from "../../../../assets/catalog-style-spotlight/tote.png";
import styleNotebookImg from "../../../../assets/catalog-style-spotlight/notebook.png";
import styleKitsImg from "../../../../assets/catalog-style-spotlight/kits.png";
import styleGiveawaysImg from "../../../../assets/catalog-style-spotlight/giveaways.png";
import styleSocksImg from "../../../../assets/catalog-style-spotlight/socks.png";
import dtfImg from "../../../../assets/catalog-print-methods/dtf.png";
import sublimationImg from "../../../../assets/catalog-print-methods/sublimation.png";
import laserEngravingImg from "../../../../assets/catalog-print-methods/laser-engraving.png";
import uvDtfStickerImg from "../../../../assets/catalog-print-methods/uv-dtf-sticker.png";
import worldDotsImg from "../../../../assets/catalog/world-dots.svg";
import australiaGourmetHamperImg from "../../../../assets/catalog/worldwide/australia-gourmet-hamper.jpg";
import mexicoCoffeeChocolateImg from "../../../../assets/catalog/worldwide/mexico-coffee-chocolate.jpg";
import canadaMapleTreatsImg from "../../../../assets/catalog/worldwide/canada-maple-treats.jpg";
import japanTeaSweetsImg from "../../../../assets/catalog/worldwide/japan-tea-sweets.jpg";
import singaporeGiftHamperImg from "../../../../assets/catalog/worldwide/singapore-gift-hamper.jpg";
import austriaConfectioneryImg from "../../../../assets/catalog/worldwide/austria-confectionery.jpg";
import brandsBannerImg from "../../../../assets/catalog/one-platform-brands-banner.jpg";
import impactPeopleImg from "../../../../assets/catalog/impact-people.jpg";
import priyaSharmaImg from "../../../../assets/catalog/priya-sharma-avatar.jpg";

const STYLE_SPOTLIGHT_TSHIRT = "/images/catalog/style-spotlight/tshirt.png";
const STYLE_SPOTLIGHT_NOTEBOOK = "/images/catalog/style-spotlight/notebook.png";
const STYLE_SPOTLIGHT_BOTTLE = "/images/catalog/style-spotlight/bottle.png";

const STYLE_SPOTLIGHT_WORDS = [
  { label: "Style", className: "sm-style-spotlight__copy--style" },
  { label: "Fit", className: "sm-style-spotlight__copy--fit" },
  { label: "Occasion", className: "sm-style-spotlight__copy--occasion" },
];

/** Spotlight collage: Apparel as category, other roots expand to subcategories. */
// function buildSpotlightTiles(
//   nodes: readonly CatalogCategoryNode[],
//   products: readonly UiProduct[],
// ): CategoryTile[] {
//   return buildStyleTaxonomyTiles(nodes).map((tile) => ({
//     label: tile.label,
//     category: tile.browseKey,
//     imageAlt: tile.label,
//     image: pickStyleTileImage(products, tile.browseKey, apparelImg, nodes),
//   }));
// }

const PRINT_TYPES = [
  {
    label: "DTF",
    description: "Full-color transfers on cotton and blends, with a soft hand-feel.",
    image: dtfImg,
    imageAlt: "DTF print transfer on apparel",
  },
  {
    label: "Sublimation",
    description: "Vibrant, all-over prints that dye into polyester and coated surfaces.",
    image: sublimationImg,
    imageAlt: "Sublimation printed bottle and mug",
  },
  {
    label: "Laser Engraving",
    description: "Permanent marks on metal, wood, and hard goods. No ink, no fade.",
    image: laserEngravingImg,
    imageAlt: "Laser engraving on wood and metal products",
  },
  {
    label: "UV DTF sticker",
    description: "Durable, high-detail stickers for bottles, tech, and hard surfaces.",
    image: uvDtfStickerImg,
    imageAlt: "UV DTF sticker application on bottle",
  },
] as const;

const INDUSTRY_CATEGORIES: CategoryTile[] = [
  {
    label: "Healthcare",
    image: "/images/landing/categories/wellness.png",
    imageAlt: "Healthcare merch",
  },
  {
    label: "Education",
    image: "/images/shops/products/jersey.jpg",
    imageAlt: "Campus apparel",
  },
  {
    label: "Food & Beverages",
    image: "/images/shops/products/bottle.jpg",
    imageAlt: "Food and beverage merch",
  },
  {
    label: "IT & Technology",
    image: "/images/shops/products/sleeve.jpg",
    imageAlt: "Tech accessories",
    category: "Technology",
  },
  {
    label: "Construction",
    image: "/images/shops/products/jacket.jpg",
    imageAlt: "Workwear merch",
    category: "Apparel",
  },
  {
    label: "Health & Wellness",
    image: "/images/landing/categories/luxury.png",
    imageAlt: "Wellness products",
  },
  {
    label: "Sales & Marketing",
    image: "/images/landing/catalog/bags-travel.png",
    imageAlt: "Sales team merch",
    category: "Bags",
  },
  {
    label: "Events",
    image: "/images/landing/categories/experiences.png",
    imageAlt: "Event merch",
  },
];

const GLOBAL_DESTINATIONS = [
  { country: "Australia", flag: "au", image: australiaGourmetHamperImg },
  { country: "Mexico", flag: "mx", image: mexicoCoffeeChocolateImg },
  { country: "Canada", flag: "ca", image: canadaMapleTreatsImg },
  { country: "Japan", flag: "jp", image: japanTeaSweetsImg },
  { country: "Singapore", flag: "sg", image: singaporeGiftHamperImg },
  { country: "Austria", flag: "at", image: austriaConfectioneryImg },
] as const;

const IMPACT_POINTS = [
  {
    title: "Curated for Every Occasion",
    body: "Explore useful merchandise and ready-to-send kits for onboarding, events, recognition, and celebrations.",
    tone: "green",
    area: "carbon",
  },
  {
    title: "Made for Your Brand",
    body: "Add your logo, colors, and artwork to create merchandise that feels unmistakably yours.",
    tone: "pink",
    area: "packaging",
  },
  {
    title: "Flexible Ways to Order",
    body: "Choose individual products, build custom kits, or send gifts to one recipient or an entire team.",
    tone: "yellow",
    area: "underserved",
  },
  {
    title: "Delivery You Can Count On",
    body: "Manage recipients and shipments in one place, with clear updates from checkout through delivery.",
    tone: "blue",
    area: "wasted",
  },
] as const;

function ImpactPointIcon({ tone }: { tone: (typeof IMPACT_POINTS)[number]["tone"] }) {
  if (tone === "green") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M3.5 20.5V10.2L12 4.2l8.5 6v10.3h-17zm2.1-1.8h2.6v-2.5H5.6v2.5zm0-4h2.6v-2.5H5.6V14.7zm4.5 4h2.8v-2.5h-2.8v2.5zm0-4h2.8v-2.5h-2.8V14.7zm4.6 4h2.7v-2.5h-2.7v2.5zm0-4h2.7v-2.5h-2.7V14.7z"
        />
      </svg>
    );
  }
  if (tone === "pink") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M13.1 2.6c2.2.7 3.5 2.8 3.2 5-1.5-.7-2.8-1.8-3.4-3.2-.1 1.7.7 3.1 2.1 3.9-1.5 1.3-3.5 1.6-5.2.7 1.1-.8 1.6-1.9 1.4-3.2-1.3.7-2.4 1.6-3 2.8.2-2.6 1.8-4.6 4.2-5.4-.6-1-.4-1.5.7-1.6z"
        />
        <path
          fill="currentColor"
          d="M8.2 12.4c.3-1.1 1.4-1.6 2.3-1 .3-1 1.4-1.4 2.3-.7.4-.8 1.4-1 2.2-.3.5-.5 1.4-.3 1.7.4.3.9.1 2-.4 2.8-.9 1.6-2.5 4-5.1 4.4-2.8.5-4.9-.9-5.4-3.3-.2-.9 0-1.6.2-2.3.3-.2.7-.1.9.2.2-.9 1.1-1.3 1.8-.8z"
        />
      </svg>
    );
  }
  if (tone === "yellow") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8.2 5.1 3.6 8.1l2.3 3.6 2.1-1.4v9.2h7.9V10.3l2.2 1.4 2.3-3.6-4.6-3c-.9 1.5-2.4 2.3-4 2.3s-3.1-.8-4-2.3z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        d="M8.2 5.1 3.6 8.1l2.3 3.6 2.1-1.4v9.2h7.9V10.3l2.2 1.4 2.3-3.6-4.6-3c-.9 1.5-2.4 2.3-4 2.3s-3.1-.8-4-2.3z"
      />
    </svg>
  );
}

function ReferenceCatalogContent({
  categories,
  onSelect,
  onViewAllCategories,
  catalog,
}: {
  categories: readonly CategoryTile[];
  onSelect: (category?: string) => void;
  onViewAllCategories: () => void;
  catalog: Pick<CatalogVm, "stylePreviewProducts" | "stylePreviewLoading" | "stylePreviewError">;
}) {
  return (
    <div className="sm-ref-catalog">
      <section className="sm-cat-section sm-ref-style-section" aria-labelledby="sm-cat-style-title">
        <CategoryCarousel
          title={<>Choose your style.{" "}<em className="sm-catalog-heading-accent">Make it yours.</em></>}
          titleId="sm-cat-style-title"
          viewAllLabel="View all categories"
          items={categories}
          onViewAll={onViewAllCategories}
          onSelect={(item) => onSelect(item.category ?? ALL_PRODUCTS)}
        />
      </section>

      <LovedTeamsSection />

      <section className="sm-ref-container sm-ref-story-wrap" aria-labelledby="sm-ref-story-title">
        <div className="sm-ref-story">
          <img src={premiumUnbrandedMerchBannerImg} alt="An assortment of premium unbranded desk and travel gifts" />
          <div className="sm-ref-story__shade" />
          <div className="sm-ref-story__copy">
            <p>Premium merch. Stronger connections.</p>
            <h2 id="sm-ref-story-title">
              Give branded merch<br />that people <span>actually love.</span>
            </h2>
            <div>From everyday essentials to premium gift kits, explore a collection that helps you build stronger teams, happier clients, and memorable brands.</div>
            <button type="button" onClick={onViewAllCategories}>
              Explore the catalog <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <section className="sm-ref-experts sm-ref-container" aria-labelledby="sm-ref-experts-title">
        <h2 id="sm-ref-experts-title">Experts in{" "}<em className="sm-catalog-heading-accent">corporate gifting</em></h2>
        <div className="sm-ref-bento">
          <article className="sm-ref-global-card">
            <img className="sm-ref-map" src={worldDotsImg} alt="" />
            <div className="sm-ref-global-card__copy">
              <h3>Global fulfillment in 170+ countries</h3>
              <p>Premium merch, delivered anywhere in the world.</p>
            </div>
            <div className="sm-ref-flags" aria-label="United States, India, and United Kingdom">
              <img src="/flags/us.svg" alt="" />
              <img src="/flags/in.svg" alt="" />
              <img src="/flags/gb.svg" alt="" />
            </div>
          </article>
          <article className="sm-ref-quote-card">
            <span className="sm-ref-quote-mark" aria-hidden="true">“</span>
            <blockquote>
              ShelfMerch made it easy for us to send high-quality branded kits to our global team. The product variety, customization options, and delivery experience have been exceptional.
            </blockquote>
            <div className="sm-ref-quote-card__footer">
              <img className="sm-ref-avatar" src={priyaSharmaImg} alt="" />
              <div className="sm-ref-quote-card__person">
                <strong>Priya Sharma</strong>
                <span>People Operations</span>
              </div>
            </div>
            <div className="sm-ref-quote-marquee" aria-hidden="true">
              <div>
                <span>Shelf Merch Swag</span>
                <span>Shelf Merch Swag</span>
                <span>Shelf Merch Swag</span>
                <span>Shelf Merch Swag</span>
              </div>
            </div>
          </article>
          <button type="button" className="sm-ref-feature sm-ref-feature--custom" onClick={() => onSelect("Drinkware")}>
            <img src={styleDrinkwareImg} alt="Custom ShelfMerch drinkware" />
            <span>Customizations<br />that stand out</span>
            <span className="sm-ref-round-arrow" aria-hidden="true"><ArrowRight /></span>
          </button>
          <button type="button" className="sm-ref-feature sm-ref-feature--products" onClick={() => onSelect(ALL_PRODUCTS)}>
            <img src={apparelImg} alt="ShelfMerch branded apparel" />
            <span className="sm-ref-feature__eyebrow">Your brand</span>
            <strong>21,000+</strong>
            <span className="sm-ref-feature__caption">Ways to show it</span>
            <span className="sm-ref-feature__actions">
              <span className="sm-ref-feature__cta">View catalog</span>
              <span className="sm-ref-round-arrow" aria-hidden="true"><ArrowRight /></span>
            </span>
          </button>
          <article className="sm-ref-feature sm-ref-feature--brands">
            <img src={brandsBannerImg} alt="A person in a custom yellow shirt against a clear sky" />
            <div className="sm-ref-feature__brand-copy">One platform. All your favorite brands.</div>
          </article>
        </div>
      </section>

      <FeaturedCatalogProducts products={catalog.stylePreviewProducts} loading={catalog.stylePreviewLoading} error={catalog.stylePreviewError} />

      <section className="sm-ref-worldwide" aria-labelledby="sm-ref-worldwide-title">
        <div className="sm-ref-worldwide__globe" aria-hidden="true">
          <img src={worldDotsImg} alt="" />
        </div>
        <div className="sm-ref-worldwide__intro sm-ref-container">
          <h2 id="sm-ref-worldwide-title">Thoughtful gifting,{" "}<em className="sm-catalog-heading-accent">delivered worldwide</em></h2>
          <p>
            Send curated merch and gift kits to teams around the world. ShelfMerch brings
            region-ready selections and fulfillment support together to simplify shipping,
            customs, and delivery.
          </p>
        </div>
        <div className="sm-ref-worldwide__rail" aria-label="Regional gifting destinations">
          <div className="sm-ref-worldwide__track">
            {[...GLOBAL_DESTINATIONS, ...GLOBAL_DESTINATIONS].map((destination, index) => (
              <article
                className="sm-ref-worldwide__card"
                key={`${destination.country}-${index}`}
                aria-hidden={index >= GLOBAL_DESTINATIONS.length}
              >
                <div className="sm-ref-worldwide__media">
                  <img src={destination.image} alt="" />
                </div>
                <div className="sm-ref-worldwide__country">
                  <img src={`/flags/${destination.flag}.svg`} alt="" />
                  <span>{destination.country}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
        <Link className="sm-ref-worldwide__cta" to="/request-demo">
          Get started
          <ArrowRight aria-hidden="true" />
        </Link>
      </section>

      <section className="sm-ref-impact" aria-labelledby="sm-ref-impact-title">
        <div className="sm-ref-impact__blob sm-ref-impact__blob--top" aria-hidden="true" />
        <div className="sm-ref-impact__blob sm-ref-impact__blob--left" aria-hidden="true" />
        <div className="sm-ref-impact__blob sm-ref-impact__blob--right" aria-hidden="true" />
        <div className="sm-ref-impact__card sm-ref-container">
          <div className="sm-ref-impact__copy">
            <h2 id="sm-ref-impact-title">Merch made for{" "}<em className="sm-catalog-heading-accent">meaningful moments</em></h2>
            <p>From first-day welcomes to client thank-yous, ShelfMerch helps you create gifts people are excited to receive.</p>
          </div>
          {IMPACT_POINTS.map((point) => (
            <article
              key={point.title}
              className={`sm-ref-impact__item sm-ref-impact__item--${point.area}`}
            >
              <span className={`sm-ref-impact__icon sm-ref-impact__icon--${point.tone}`}>
                <ImpactPointIcon tone={point.tone} />
              </span>
              <div>
                <h3>{point.title}</h3>
                <p>{point.body}</p>
              </div>
            </article>
          ))}
          <div className="sm-ref-impact__scene">
            <div className="sm-ref-impact__art">
              <img src={impactPeopleImg} alt="" />
            </div>
            <div className="sm-ref-impact__actions">
              <Link className="sm-ref-impact__cta" to="/request-demo">
                Get started
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="sm-skeleton-grid" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="sm-skeleton-card">
          <div className="sm-skeleton-img" />
          <div className="sm-skeleton-line" />
          <div className="sm-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

function scrollToProducts() {
  document.getElementById("catalog-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function StyleSpotlight({ onSelect }: { onSelect: (category: string) => void }) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const activeWord = STYLE_SPOTLIGHT_WORDS[activeWordIndex];

  useEffect(() => {
    function updateActiveWord() {
      const section = sectionRef.current;

      if (!section) {
        return;
      }

      const rect = section.getBoundingClientRect();
      const scrollableDistance = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / scrollableDistance));
      const nextIndex = Math.min(
        STYLE_SPOTLIGHT_WORDS.length - 1,
        Math.floor(progress * STYLE_SPOTLIGHT_WORDS.length),
      );

      setActiveWordIndex(nextIndex);
    }

    updateActiveWord();
    window.addEventListener("scroll", updateActiveWord, { passive: true });
    window.addEventListener("resize", updateActiveWord);

    return () => {
      window.removeEventListener("scroll", updateActiveWord);
      window.removeEventListener("resize", updateActiveWord);
    };
  }, []);

  return (
    <section ref={sectionRef} className="sm-style-spotlight" aria-labelledby="sm-style-spotlight-title">
      <div className="sm-cat-container sm-style-spotlight__inner">
        <div className="sm-style-spotlight__media">
          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--bottle"
            onClick={() => onSelect("Drinkware")}
            aria-label="Browse drinkware"
          >
            <img src={STYLE_SPOTLIGHT_BOTTLE} alt="" />
            <span className="sm-style-spotlight__pill">
              On-demand <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--tshirt"
            onClick={() => onSelect("Apparel")}
            aria-label="Browse t-shirts"
          >
            <img src={STYLE_SPOTLIGHT_TSHIRT} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Apparel <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--sustainable"
            onClick={() => onSelect("Office Supplies")}
            aria-label="Browse sustainable office supplies"
          >
            <img src={STYLE_SPOTLIGHT_NOTEBOOK} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Sustainable <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--drinkware"
            onClick={() => onSelect("Drinkware")}
            aria-label="Browse orange tumblers"
          >
            <img src={styleDrinkwareImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Drinkware <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--tote"
            onClick={() => onSelect("Bags")}
            aria-label="Browse tote bags"
          >
            <img src={styleToteImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Carry kits <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--kits"
            onClick={() => onSelect("Kits")}
            aria-label="Browse swag kits"
          >
            <img src={styleKitsImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Swag kits <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--notebook"
            onClick={() => onSelect("Office Supplies")}
            aria-label="Browse notebooks"
          >
            <img src={styleNotebookImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Desk goods <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--giveaways"
            onClick={() => onSelect("Accessories")}
            aria-label="Browse event giveaways"
          >
            <img src={styleGiveawaysImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Event giveaways <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--socks"
            onClick={() => onSelect("Apparel")}
            aria-label="Browse sock packs"
          >
            <img src={styleSocksImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Best under ₹100 <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>
        </div>

        <div className={`sm-style-spotlight__copy ${activeWord.className}`}>
          <p className="sm-style-spotlight__kicker">Swag for everyone</p>
          <h2 id="sm-style-spotlight-title">
            Choose your
            <span className="sm-style-spotlight__word">{activeWord.label}</span>
            <span className="sm-style-spotlight__heading-rest">from the biggest swag collection</span>
          </h2>
          <p>
            Let your swag speak volumes with premium products from the world's greatest catalog.
          </p>
          <button type="button" className="sm-style-spotlight__cta" onClick={() => onSelect(ALL_PRODUCTS)}>
            Browse swag
          </button>
        </div>
      </div>
    </section>
  );
}

function CatalogOverviewMosaic({ onSelect }: { onSelect: (category?: string) => void }) {
  return (
    <div className="sm-cat-container">
      <div className="sm-cat-overview">
        <article className="sm-cat-overview__intro">
          <p>
            We lead with sustainability, obsess over quality, curate bold collections, and deliver
            globally so your brand shows up at its best, everywhere.
          </p>
          <button type="button" className="sm-cat-overview__button" onClick={() => onSelect(ALL_PRODUCTS)}>
            About us <ArrowUpRight aria-hidden="true" />
          </button>
        </article>

        <button
          type="button"
          className="sm-cat-overview__card sm-cat-overview__card--wide"
          onClick={() => onSelect("Kits")}
        >
          <img src={overviewCorporateGiftsImg} alt="ShelfMerch corporate gifting products arranged as a branded kit" />
        </button>

        <button
          type="button"
          className="sm-cat-overview__card sm-cat-overview__card--large"
          onClick={() => onSelect("Wellness")}
        >
          <img src={overviewSustainableImg} alt="Sustainability centric candle and packaging" />
        </button>

        <button
          type="button"
          className="sm-cat-overview__card sm-cat-overview__card--medium"
          onClick={() => onSelect("Office Supplies")}
        >
          <img src={overviewBuiltForImpactImg} alt="Built for impact branded tote and pouch collection" />
        </button>

        <button
          type="button"
          className="sm-cat-overview__card sm-cat-overview__card--small"
          onClick={() => onSelect("Drinkware")}
        >
          <img src={overviewGlobalReachImg} alt="ShelfMerch global reach branded delivery box" />
        </button>
      </div>
    </div>
  );
}

function PrintingTypesSection() {
  return (
    <section className="sm-cat-print" aria-labelledby="sm-cat-print-title">
      <div className="sm-cat-container">
        <div className="sm-cat-head">
          <h2 className="sm-cat-title" id="sm-cat-print-title">
            Choose your print. Make it yours.
          </h2>
        </div>
        <div className="sm-cat-print-grid">
          {PRINT_TYPES.map((item) => (
            <article className="sm-cat-print-card" key={item.label}>
              <div className="sm-cat-print-card__media">
                <img src={item.image} alt={item.imageAlt} loading="lazy" />
              </div>
              <div className="sm-cat-print-card__body">
                <h3 className="sm-cat-print-card__title">{item.label}</h3>
                <p className="sm-cat-print-card__copy">{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function LovedTeamsSection() {
  return (
    <section className="sm-cat-teams" aria-labelledby="sm-cat-teams-title">
      <div className="sm-cat-container">
        <div className="sm-cat-teams__inner">
          <div className="sm-cat-teams__copy">
            <p>Trusted by teams at</p>
            <h2 id="sm-cat-teams-title">Built for{" "}<em className="sm-catalog-heading-accent">teams everywhere</em></h2>
          </div>
          <div className="sm-cat-teams__logos" aria-label="Teams using Shelf Merch">
            {TRUST_LOGOS.map((logo) => (
              <span className={`sm-cat-team-logo ${logo.className ?? ""}`} key={logo.alt}>
                {logo.alt === "J.P. Morgan" ? (
                  <span className="sm-cat-team-logo__jpmorgan" aria-label={logo.alt}>J.P. Morgan</span>
                ) : logo.alt === "Informatica" ? (
                  <img className="sm-cat-team-logo__informatica" src={informaticaLogoImg} alt={logo.alt} />
                ) : (
                  <img src={logo.src} alt={logo.alt} />
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Catalog landing: category carousels, partner logos, product grid. */
export function CatalogView(vm: CatalogVm) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isPublic = pathname.startsWith("/apps/catalog");

  const styleCategories = useMemo(
    () => buildCatalogOverviewTiles(vm.categoryNodes, vm.stylePreviewProducts).map((tile) => ({
      label: tile.name, category: tile.name, imageAlt: tile.name, image: tile.image,
    })),
    [vm.categoryNodes, vm.stylePreviewProducts],
  );

  function selectCategory(next = ALL_PRODUCTS) {
    vm.onCategory(next);
    scrollToProducts();
  }

  return (
    <div className={isPublic ? "sm-cat sm-cat--landing sm-cat--public" : "sm-cat sm-cat--landing"}>

      <section className="sm-cat-hero-banner" aria-label="Catalog hero">
        <img className="sm-cat-hero-banner__image" src={catalogHeroImg} alt="A person holding a Make It Yours T-shirt" />
        <div className="sm-cat-hero-banner__content">
          <p className="sm-cat-hero-banner__eyebrow">Branded merch that builds connections</p>
          <h1>Corporate Gifting &amp;{" "}<em className="sm-catalog-heading-accent">Branded Merch</em></h1>
          <p className="sm-cat-hero-banner__description">
            Curated gifts, company swag, and welcome kits for teams, clients, and events. Premium quality.
            Global fulfillment. Made to elevate your brand.
          </p>
          <div className="sm-cat-hero-banner__actions">
            <button type="button" className="sm-cat-hero-banner__button sm-cat-hero-banner__button--primary" onClick={() => navigate(`${catalogHomePath(pathname)}/browse`)}>
              View catalog <ArrowRight aria-hidden="true" />
            </button>
            <button type="button" className="sm-cat-hero-banner__button sm-cat-hero-banner__button--secondary" onClick={() => navigate("/request-demo")}>
              Book a demo <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <div className="sm-cat-hero-banner__features" aria-label="Catalog benefits">
            <div><Shirt aria-hidden="true" /><span>Premium<br />Quality</span></div>
            <div><Palette aria-hidden="true" /><span>Custom<br />Branding</span></div>
            <div><Globe2 aria-hidden="true" /><span>Global<br />Fulfillment</span></div>
            <div><Package aria-hidden="true" /><span>Bulk<br />Orders</span></div>
          </div>
        </div>
      </section>

      <ReferenceCatalogContent categories={styleCategories} catalog={vm} onSelect={selectCategory} onViewAllCategories={() => navigate(`${catalogHomePath(pathname)}/browse`)} />

      {isPublic ? <CatalogMarketingFooter onViewCatalog={scrollToProducts} /> : null}
    </div>
  );
}
