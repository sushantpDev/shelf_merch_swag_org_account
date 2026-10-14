import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { tenantCatalogFilter } from '../catalog/catalogFilters.js';
import { SITE_ORIGIN } from './sitemap.controller.js';
import {
  applyCatalogProductSeo,
  catalogProductNotFoundHtml,
  isCatalogProductId,
} from './catalogProductDocument.js';

const FALLBACK_SHELL = '<!doctype html><html lang="en"><head><title>ShelfMerch</title></head><body><div id="root"></div></body></html>';

export function sendCatalogProductSeo(distDir) {
  return async function sendCatalogProductSeoHandler(req, res, next) {
    if (!isCatalogProductId(req.params.id)) return next();
    const product = await CatalogProduct.findOne({
      _id: req.params.id,
      status: 'active',
      ...tenantCatalogFilter(),
    })
      .select('name description brand category primaryImageUrl imageUrls')
      .lean();
    if (!product) {
      return res
        .status(404)
        .type('html')
        .set('Cache-Control', 'private, no-store')
        .set('X-Robots-Tag', 'noindex, follow')
        .send(catalogProductNotFoundHtml());
    }
    const indexPath = path.join(distDir, 'index.html');
    const shell = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : FALLBACK_SHELL;
    const html = applyCatalogProductSeo(shell, {
      id: String(product._id),
      name: product.name,
      description: product.description,
      brand: product.brand,
      category: product.category,
      image: product.primaryImageUrl || product.imageUrls?.[0] || '',
    }, SITE_ORIGIN);
    return res
      .status(200)
      .type('html')
      .set('Cache-Control', 'private, no-store')
      .set('X-Robots-Tag', 'index, follow')
      .send(html);
  };
}
