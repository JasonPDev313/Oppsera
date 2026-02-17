import { registerContracts } from '@oppsera/core/events/contracts';
import {
  CatalogItemCreatedDataSchema,
  CatalogItemUpdatedDataSchema,
  CatalogItemDeactivatedDataSchema,
  CatalogCategoryCreatedDataSchema,
  CatalogTaxCategoryCreatedDataSchema,
  CatalogModifierGroupCreatedDataSchema,
  CatalogLocationPriceSetDataSchema,
  TaxRateCreatedDataSchema,
  TaxRateUpdatedDataSchema,
  TaxGroupCreatedDataSchema,
  TaxGroupUpdatedDataSchema,
  CatalogItemTaxGroupsUpdatedDataSchema,
} from './types';

registerContracts({
  moduleName: 'catalog',
  emits: [
    { eventType: 'catalog.item.created.v1', dataSchema: CatalogItemCreatedDataSchema },
    { eventType: 'catalog.item.updated.v1', dataSchema: CatalogItemUpdatedDataSchema },
    {
      eventType: 'catalog.item.deactivated.v1',
      dataSchema: CatalogItemDeactivatedDataSchema,
    },
    {
      eventType: 'catalog.category.created.v1',
      dataSchema: CatalogCategoryCreatedDataSchema,
    },
    {
      eventType: 'catalog.tax_category.created.v1',
      dataSchema: CatalogTaxCategoryCreatedDataSchema,
    },
    {
      eventType: 'catalog.modifier_group.created.v1',
      dataSchema: CatalogModifierGroupCreatedDataSchema,
    },
    {
      eventType: 'catalog.location_price.set.v1',
      dataSchema: CatalogLocationPriceSetDataSchema,
    },
    { eventType: 'tax.rate.created.v1', dataSchema: TaxRateCreatedDataSchema },
    { eventType: 'tax.rate.updated.v1', dataSchema: TaxRateUpdatedDataSchema },
    { eventType: 'tax.group.created.v1', dataSchema: TaxGroupCreatedDataSchema },
    { eventType: 'tax.group.updated.v1', dataSchema: TaxGroupUpdatedDataSchema },
    {
      eventType: 'catalog.item.tax_groups.updated.v1',
      dataSchema: CatalogItemTaxGroupsUpdatedDataSchema,
    },
  ],
  consumes: [],
});
