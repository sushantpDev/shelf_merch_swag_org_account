import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { useCatalogFavicon } from "./useCatalogFavicon";
import "@/components/landing-page.css";

function isCatalogIndexPath(pathname: string) {
  return /^\/(?:apps|app)\/catalog\/?$/.test(pathname);
}

function isCatalogProductPath(pathname: string) {
  return /^\/(?:apps|app)\/catalog\/(?!category(?:\/|$))[^/]+/.test(pathname);
}

export function PublicCatalogLayout() {
  useCatalogFavicon();
  const location = useLocation();
  const isCatalogIndex = isCatalogIndexPath(location.pathname);

  useEffect(() => {
    if (!isCatalogProductPath(location.pathname)) {
      document.title = "Catalog Shelf Merch";
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);

  return (
    <div className={`public-catalog${isCatalogIndex ? " public-catalog--marketing" : ""}`}>
      <div className="shelf-landing public-catalog-chrome">
        <Header />
      </div>
      <main className="public-catalog-main public-catalog-main--flush">
        <Outlet />
      </main>
      <div className="shelf-landing public-catalog-chrome">
        <Footer />
      </div>
    </div>
  );
}
