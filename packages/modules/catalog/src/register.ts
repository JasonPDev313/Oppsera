import { setCatalogReadApi } from '@oppsera/core/helpers/catalog-read-api';
import { createDrizzleCatalogReadApi } from './internal-api';

let _registered = false;

export function registerCatalogReadApi(): void {
  if (_registered) return;
  setCatalogReadApi(createDrizzleCatalogReadApi());
  _registered = true;
}
