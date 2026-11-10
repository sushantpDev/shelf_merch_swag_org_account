import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { UiProduct } from "../model";
import { catalogCategorySlug } from "../types";
import { newestProducts } from "../newestProducts";
import { ProductCard } from "./ProductCard";
import arrivalsImage from "../../../../assets/catalog/drinkware-editorial/arrivals.png";
import collectionImage from "../../../../assets/catalog/drinkware-shelfmerch.png";
import "./catalog-editorial.css";

type Props = {
  names: string[];
  home: string;
  imageForType: (name: string) => string;
  products: UiProduct[];
  loading: boolean;
  error: string | null;
};

export function DrinkwareEditorialGrid({ names, home, imageForType, products, loading, error }: Props) {
  const { pathname } = useLocation();
  const priority = ["Tumblers", "Bottles", "Water Bottles", "Mugs"];
  const rank = (name: string) => priority.includes(name) ? priority.indexOf(name) : priority.length;
  const ordered = [...names].sort((a, b) => rank(a) - rank(b));
  const arrivalsUrl = `${home}/category/drinkware?view=products&sort=newest`;
  const latest = newestProducts(products.filter((product) => product.id)).slice(0, 4);
  const tile = (name: string) => (
    <Link key={name} className="sm-cat-type-card" to={`${home}/category/${catalogCategorySlug(name)}`}>
      <span className="sm-cat-type-card__media"><img src={imageForType(name)} alt={`${name} category`} loading="lazy" width="600" height="750" /></span>
      <span className="sm-cat-type-card__label">{name}</span>
    </Link>
  );

  return (
    <>
      <div className="sm-editorial-grid sm-drinkware-grid">
        {ordered.slice(0, 2).map(tile)}
        <Link to={arrivalsUrl} className="sm-editorial-promo sm-drinkware-arrivals">
          <img src={arrivalsImage} alt="Blue insulated bottle from the Shelf Merch drinkware collection" loading="lazy" width="900" height="600" />
          <div className="sm-editorial-promo__copy"><h2>New arrivals</h2><span className="sm-editorial-promo__cta">Find your next favourite <ArrowRight size={18} aria-hidden="true" /></span></div>
        </Link>
        {ordered.slice(2).map(tile)}
        <Link to={`${home}/category/kits`} className="sm-editorial-promo sm-drinkware-kits">
          <img src={collectionImage} alt="Green Shelf Merch travel tumbler for branded gifting" loading="lazy" width="900" height="600" />
          <div className="sm-editorial-promo__copy"><h2>Everyday sips.<br />Lasting impressions.</h2><p>Bring your brand to every coffee break, commute and team gift.</p><span className="sm-editorial-promo__cta">Explore custom kits <ArrowRight size={18} aria-hidden="true" /></span></div>
        </Link>
      </div>
      <section className="sm-drinkware-latest" aria-labelledby="drinkware-latest-title">
        <div className="sm-drinkware-latest__head"><h2 id="drinkware-latest-title">The latest in Drinkware</h2><Link to={arrivalsUrl}>View all <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        {error ? <p role="alert">{error}</p> : loading ? (
          <div className="sm-drinkware-latest__grid" aria-busy="true" aria-label="Loading latest drinkware">{Array.from({ length: 4 }, (_, i) => <div key={i} className="sm-skeleton-card"><div className="sm-skeleton-img" /><div className="sm-skeleton-line" /></div>)}</div>
        ) : latest.length ? (
          <div className="sm-drinkware-latest__grid">{latest.map((product) => <ProductCard key={product.id} product={product} to={`${home}/${product.id}`} state={{ fromCatalog: pathname }} />)}</div>
        ) : <p>New drinkware is on the way. Explore the categories above to find your next favourite.</p>}
      </section>
    </>
  );
}
