import { ArrowRight, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { UiProduct } from "../model";
import { catalogCategorySlug } from "../types";
import { newestProducts } from "../newestProducts";
import { LatestProductCarousel } from "./LatestProductCarousel";
import gadgetsImage from "../../../../assets/catalog/electronics-editorial/gadgets.png";
import organisersImage from "../../../../assets/catalog/electronics-editorial/organisers.png";
import kitsImage from "../../../../assets/catalog/electronics-editorial/kits.png";
import workspaceImage from "../../../../assets/catalog/electronics-editorial/workspace.png";
import "./catalog-editorial.css";

type Props = { home: string; types: string[]; products: UiProduct[]; loading: boolean; error: string | null };

export function ElectronicsEditorialView({ home, types, products, loading, error }: Props) {
  const { pathname } = useLocation();
  const allProducts = `${pathname}?view=products`;
  const latestUrl = `${allProducts}&sort=newest`;
  const latest = newestProducts(products.filter((product) => product.id));

  return (
    <>
      <div className="sm-catalog-shop">
        <aside className="sm-catalog-shop__sidebar"><nav className="sm-catalog-shop__categories" aria-label="Explore electronics"><p>Shop electronics</p><Link to={allProducts}>All Electronics &amp; Gadgets<ChevronRight size={14} aria-hidden="true" /></Link>{types.map((name) => <Link key={name} to={`${home}/category/${catalogCategorySlug(name)}`}>{name}<ChevronRight size={14} aria-hidden="true" /></Link>)}<a href="#electronics-latest">New arrivals<ChevronRight size={14} aria-hidden="true" /></a><Link to={`${home}/category/stationery`}>Office essentials<ChevronRight size={14} aria-hidden="true" /></Link><Link to={`${home}/category/kits`}>Custom kits<ChevronRight size={14} aria-hidden="true" /></Link><Link to={`${home}/browse`}>All categories<ChevronRight size={14} aria-hidden="true" /></Link></nav></aside>
        <div className="sm-editorial-grid sm-tech-grid">
          {types.map((name) => <Link key={name} className="sm-cat-type-card" to={`${home}/category/${catalogCategorySlug(name)}`}><span className="sm-cat-type-card__media"><img src={name === "Gadget Organisers" ? organisersImage : gadgetsImage} alt={`${name} category`} loading="lazy" width="600" height="750" /></span><span className="sm-cat-type-card__label">{name}</span></Link>)}
          <Link to={`${home}/category/kits`} className="sm-editorial-promo sm-editorial-promo--kits"><img src={kitsImage} alt="A curated tech gift set with a speaker, wireless dock and cable organiser" loading="lazy" width="900" height="600" /><div className="sm-editorial-promo__copy"><h2>Smart gifts.<br />Everyday impact.</h2><p>Bring useful tech and thoughtful merchandise together for teams and clients.</p><span className="sm-editorial-promo__cta">Explore custom kits <ArrowRight size={18} aria-hidden="true" /></span></div></Link>
          <Link to="/request-demo" className="sm-editorial-promo sm-editorial-promo--team sm-tech-workspace"><img src={workspaceImage} alt="A phone being placed on a wireless charger on a tidy work desk" loading="lazy" width="900" height="600" /><div className="sm-editorial-promo__copy"><h2>Upgrade the<br />everyday workspace</h2><p>Useful tools for focused mornings, connected teams and better workdays.</p><span className="sm-editorial-promo__cta">Plan your tech gifts <ArrowRight size={18} aria-hidden="true" /></span></div></Link>
          <Link to="/platform" className="sm-editorial-promo sm-editorial-promo--store sm-tech-store"><div className="sm-editorial-promo__copy"><h2>Your brand.<br />Fully connected.</h2><p>Put tech essentials and team favourites in one branded company store.</p><span className="sm-editorial-promo__cta">Explore company stores <ArrowRight size={18} aria-hidden="true" /></span></div><img src="/images/company-shop-storefront.png" alt="Shelf Merch company store preview" loading="lazy" width="600" height="500" /></Link>
        </div>
      </div>
      <LatestProductCarousel id="electronics-latest" title="The latest in Electronics & Gadgets" products={latest} home={home} fromCatalog={pathname} viewAll={latestUrl} loading={loading} error={error} />
    </>
  );
}
