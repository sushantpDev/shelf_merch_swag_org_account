import { ArrowRight, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { UiProduct } from "../model";
import { ProductCard } from "./ProductCard";
import kitsImage from "../../../../assets/catalog/kitchen-editorial/kits.png";
import ritualsImage from "../../../../assets/catalog/kitchen-editorial/rituals.png";
import appliancesEverydayImage from "../../../../assets/catalog/home-appliances-editorial/everyday.png";
import "./catalog-editorial.css";

const COLLECTIONS = {
  kitchenware: {
    name: "Kitchenware", slug: "kitchenware", relatedName: "Drinkware", relatedSlug: "drinkware",
    emptyTitle: "More kitchen favourites are on the way", emptyCopy: "Explore drinkware and custom kits for everyday gifting.",
    kitsTitle: <>A little warmth.<br />A lasting impression.</>, kitsCopy: "Thoughtful custom kits for housewarmings, milestones and team celebrations.",
    everydayImage: ritualsImage, everydayAlt: "Fresh coffee being poured beside a toaster in a sunlit kitchen",
    everydayTitle: <>Made for<br />everyday moments</>, everydayCopy: "Bring your brand into the routines people love.",
    storeTitle: <>Your brand.<br />Right at home.</>, storeCopy: "Bring kitchen favourites and thoughtful team gifts together in one company store.",
  },
  "home-appliances": {
    name: "Home Appliances", slug: "home-appliances", relatedName: "Kitchenware", relatedSlug: "kitchenware",
    emptyTitle: "More home essentials are on the way", emptyCopy: "Explore kitchenware and custom kits for thoughtful everyday gifts.",
    kitsTitle: <>Thoughtful gifts.<br />Everyday comfort.</>, kitsCopy: "Make milestones and new beginnings feel special with curated gifts for home.",
    everydayImage: appliancesEverydayImage, everydayAlt: "A garment steamer being used on a linen shirt in a sunlit home",
    everydayTitle: <>Make everyday<br />a little easier</>, everydayCopy: "Useful gifts that become part of the routines people rely on.",
    storeTitle: <>Your brand.<br />Their everyday.</>, storeCopy: "Bring practical home essentials and meaningful team gifts together in one branded store.",
  },
};

type Props = { home: string; products: UiProduct[]; loading: boolean; error: string | null; collection: keyof typeof COLLECTIONS };

export function HomeEditorialView({ home, products, loading, error, collection }: Props) {
  const { pathname } = useLocation();
  const content = COLLECTIONS[collection];
  const allProducts = `${home}/category/${content.slug}?view=products`;
  const card = (product: UiProduct, index: number) => <ProductCard key={product.id ?? `${product.nm}-${index}`} product={product} to={product.id ? `${home}/${product.id}` : undefined} state={{ fromCatalog: pathname }} />;

  return (
    <div className="sm-catalog-shop">
      <aside className="sm-catalog-shop__sidebar"><nav className="sm-catalog-shop__categories" aria-label={`Explore ${content.name.toLowerCase()}`}><p>Shop {content.name.toLowerCase()}</p><Link to={allProducts}>All {content.name}<ChevronRight size={14} aria-hidden="true" /></Link>{products.filter((product) => product.id).map((product) => <Link key={product.id} to={`${home}/${product.id}`}>{product.nm}<ChevronRight size={14} aria-hidden="true" /></Link>)}<Link to={`${home}/category/${content.relatedSlug}`}>{content.relatedName}<ChevronRight size={14} aria-hidden="true" /></Link><Link to={`${home}/category/kits`}>Custom kits<ChevronRight size={14} aria-hidden="true" /></Link><Link to={`${home}/browse`}>All categories<ChevronRight size={14} aria-hidden="true" /></Link></nav></aside>
      <section className={`sm-editorial-grid sm-kitchen-grid sm-home-grid--${collection}`} aria-label={`${content.name} collection`}>
        {error ? <p className="sm-kitchen-notice" role="alert">{error}</p> : loading ? <div className="sm-kitchen-loading" aria-busy="true" aria-label={`Loading ${content.name.toLowerCase()}`}>{Array.from({ length: 4 }, (_, index) => <div key={index} className="sm-skeleton-card"><div className="sm-skeleton-img" /><div className="sm-skeleton-line" /></div>)}</div> : !products.length ? <div className="sm-kitchen-notice"><h2>{content.emptyTitle}</h2><p>{content.emptyCopy}</p></div> : products.slice(0, 2).map(card)}
        <Link to={`${home}/category/kits`} className="sm-editorial-promo sm-editorial-promo--kits">
          <img src={kitsImage} alt="A kitchen gift box with a ceramic mug, linen towel, coffee and wooden board" loading="lazy" width="900" height="600" />
          <div className="sm-editorial-promo__copy"><h2>{content.kitsTitle}</h2><p>{content.kitsCopy}</p><span className="sm-editorial-promo__cta">Explore custom kits <ArrowRight size={18} aria-hidden="true" /></span></div>
        </Link>
        <Link to="/request-demo" className="sm-editorial-promo sm-editorial-promo--team sm-kitchen-rituals">
          <img src={content.everydayImage} alt={content.everydayAlt} loading="lazy" width="900" height="600" />
          <div className="sm-editorial-promo__copy"><h2>{content.everydayTitle}</h2><p>{content.everydayCopy}</p><span className="sm-editorial-promo__cta">Plan your gifts <ArrowRight size={18} aria-hidden="true" /></span></div>
        </Link>
        {!loading && !error ? products.slice(2).map(card) : null}
        <Link to="/platform" className="sm-editorial-promo sm-editorial-promo--store sm-kitchen-store"><div className="sm-editorial-promo__copy"><h2>{content.storeTitle}</h2><p>{content.storeCopy}</p><span className="sm-editorial-promo__cta">Explore company stores <ArrowRight size={18} aria-hidden="true" /></span></div><img src="/images/company-shop-storefront.png" alt="Shelf Merch company store preview" loading="lazy" width="600" height="500" /></Link>
      </section>
    </div>
  );
}
