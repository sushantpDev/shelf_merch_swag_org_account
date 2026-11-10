import { ArrowRight, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { UiProduct } from "../model";
import { ProductCard } from "./ProductCard";
import kitsImage from "../../../../assets/catalog/travel-editorial/kits.png";
import journeyImage from "../../../../assets/catalog/travel-editorial/journey.png";
import bagsImage from "../../../../assets/catalog/bags-editorial/backpacks.png";
import drinkwareImage from "../../../../assets/catalog/drinkware-editorial/bottles.png";
import "./catalog-editorial.css";

type Props = { home: string; products: UiProduct[]; loading: boolean; error: string | null };

export function TravelEditorialView({ home, products, loading, error }: Props) {
  const { pathname } = useLocation();
  const allProducts = `${home}/category/travel-accessories?view=products`;
  const links = [
    { label: "All Travel Accessories", to: allProducts },
    { label: "Travel essentials", to: "#travel-products" },
    { label: "Bags for the journey", to: `${home}/category/bags` },
    { label: "Drinkware on the go", to: `${home}/category/drinkware` },
    { label: "Custom kits", to: `${home}/category/kits` },
    { label: "All categories", to: `${home}/browse` },
  ];

  return (
    <div className="sm-catalog-shop">
      <aside className="sm-catalog-shop__sidebar"><nav className="sm-catalog-shop__categories" aria-label="Explore travel"><p>Shop travel</p>{links.map(({ label, to }) => to.startsWith("#") ? <a key={label} href={to}>{label}<ChevronRight size={14} aria-hidden="true" /></a> : <Link key={label} to={to}>{label}<ChevronRight size={14} aria-hidden="true" /></Link>)}</nav></aside>
      <div className="sm-editorial-grid sm-travel-grid">
        <section id="travel-products" className="sm-travel-products" aria-labelledby="travel-products-title">
          <div className="sm-travel-products__head"><h2 id="travel-products-title">Travel essentials</h2><Link to={allProducts}>View all <ArrowRight size={16} aria-hidden="true" /></Link></div>
          {error ? <p role="alert">{error}</p> : loading ? <div className="sm-skeleton-card" aria-busy="true" aria-label="Loading travel products"><div className="sm-skeleton-img" /><div className="sm-skeleton-line" /></div> : products.length ? <div className={`sm-travel-products__grid${products.length === 1 ? " sm-travel-products__grid--single" : ""}`}>{products.slice(0, 4).map((product, index) => <ProductCard key={product.id ?? index} product={product} to={product.id ? `${home}/${product.id}` : undefined} state={{ fromCatalog: pathname }} />)}</div> : <div className="sm-travel-products__empty"><h3>More travel essentials are on the way</h3><p>Explore bags, drinkware and curated kits for your next journey.</p></div>}
        </section>
        <Link to={`${home}/category/kits`} className="sm-editorial-promo sm-editorial-promo--kits sm-travel-kits">
          <img src={kitsImage} alt="A curated travel gift box with a neck pillow, passport wallet and bottle" loading="lazy" width="900" height="600" />
          <div className="sm-editorial-promo__copy"><h2>Good journeys<br />start with good gifts</h2><p>Bring a little comfort to every trip with thoughtful custom kits.</p><span className="sm-editorial-promo__cta">Explore custom kits <ArrowRight size={18} aria-hidden="true" /></span></div>
        </Link>
        <Link to="/request-demo" className="sm-editorial-promo sm-editorial-promo--team sm-travel-journey">
          <img src={journeyImage} alt="A traveller relaxing in an airport lounge with a neck pillow and carry-on bag" loading="lazy" width="900" height="600" />
          <div className="sm-editorial-promo__copy"><h2>Make the journey<br />feel better</h2><p>Thoughtful gifting for teams that are always on the move.</p><span className="sm-editorial-promo__cta">Plan your travel gifts <ArrowRight size={18} aria-hidden="true" /></span></div>
        </Link>
        <Link to={`${home}/category/bags`} className="sm-cat-type-card"><span className="sm-cat-type-card__media"><img src={bagsImage} alt="Green travel backpack" loading="lazy" width="600" height="750" /></span><span className="sm-cat-type-card__label">Bags for the journey</span></Link>
        <Link to={`${home}/category/drinkware`} className="sm-cat-type-card"><span className="sm-cat-type-card__media"><img src={drinkwareImage} alt="Blue reusable travel bottle" loading="lazy" width="600" height="750" /></span><span className="sm-cat-type-card__label">Drinkware on the go</span></Link>
        <Link to="/platform" className="sm-editorial-promo sm-editorial-promo--store sm-travel-store"><div className="sm-editorial-promo__copy"><h2>Your brand.<br />Every destination.</h2><p>Bring your team's travel gifts and everyday favourites together in one branded store.</p><span className="sm-editorial-promo__cta">Explore company stores <ArrowRight size={18} aria-hidden="true" /></span></div><img src="/images/company-shop-storefront.png" alt="Shelf Merch company store preview" loading="lazy" width="600" height="500" /></Link>
      </div>
    </div>
  );
}
