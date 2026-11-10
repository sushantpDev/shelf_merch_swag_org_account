import { useCatalogController } from "./controllers/useCatalogController";
import { CatalogCategoryView } from "./views/CatalogCategoryView";

export function CatalogCategoryPage() {
  const vm = useCatalogController();
  return <CatalogCategoryView {...vm} />;
}
