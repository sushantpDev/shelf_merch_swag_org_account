import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import type { UiProduct } from "../model";
import { ProductCard } from "./ProductCard";
import "./latest-product-carousel.css";

type Props = { products: UiProduct[]; home: string; fromCatalog: string; title: string; viewAll: string; loading: boolean; error: string | null; id: string };

export function LatestProductCarousel({ products, home, fromCatalog, title, viewAll, loading, error, id }: Props) {
  const [pageSize, setPageSize] = useState(4);
  const [page, setPage] = useState(0);
  const touchStart = useRef<number | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const resize = () => { setPageSize(media.matches ? 2 : 4); setPage(0); };
    resize();
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  const pages = Math.ceil(products.length / pageSize);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const visible = products.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const move = (direction: number) => setPage(Math.max(0, Math.min(pages - 1, currentPage + direction)));

  return (
    <section id={id} className="sm-latest-carousel" aria-labelledby={`${id}-title`}>
      <div className="sm-latest-carousel__head"><h2 id={`${id}-title`}>{title}</h2><Link to={viewAll}>View all <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
      {error ? <p role="alert">{error}</p> : loading ? <div className="sm-latest-carousel__grid" aria-busy="true" aria-label="Loading latest products">{Array.from({ length: pageSize }, (_, index) => <div key={index} className="sm-skeleton-card"><div className="sm-skeleton-img" /><div className="sm-skeleton-line" /></div>)}</div> : products.length ? (
        <>
          <div className="sm-latest-carousel__body" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current !== null && end !== undefined && Math.abs(touchStart.current - end) > 40) move(touchStart.current > end ? 1 : -1); touchStart.current = null; }}>
            <div className="sm-latest-carousel__grid">{visible.map((product) => <ProductCard key={product.id} product={product} to={`${home}/${product.id}`} state={{ fromCatalog }} />)}</div>
            {currentPage > 0 ? <button type="button" className="sm-latest-carousel__arrow sm-latest-carousel__arrow--prev" aria-label="Previous products" onClick={() => move(-1)}><ArrowLeft size={23} aria-hidden="true" /></button> : null}
            {currentPage < pages - 1 ? <button type="button" className="sm-latest-carousel__arrow sm-latest-carousel__arrow--next" aria-label="Next products" onClick={() => move(1)}><ArrowRight size={23} aria-hidden="true" /></button> : null}
          </div>
          {pages > 1 ? <nav className="sm-latest-carousel__dots" aria-label="Product pages">{Array.from({ length: pages }, (_, index) => <button key={index} type="button" aria-label={`Go to product page ${index + 1}`} aria-current={currentPage === index ? "page" : undefined} onClick={() => setPage(index)} />)}</nav> : null}
          <p className="sm-latest-carousel__status" aria-live="polite">Products {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, products.length)} of {products.length}</p>
        </>
      ) : <p>More favourites are on the way. Explore our collections above.</p>}
    </section>
  );
}
