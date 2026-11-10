import { useCatalogController } from "./controllers/useCatalogController";
import { CatalogBrowseView } from "./views/CatalogBrowseView";

export function CatalogBrowsePage() {
  const vm = useCatalogController();
  return <CatalogBrowseView {...vm} />;
}
