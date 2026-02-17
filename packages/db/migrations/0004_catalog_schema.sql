-- Catalog Module Schema
-- Creates tables: tax_categories, catalog_categories, catalog_items,
-- catalog_modifier_groups, catalog_modifiers, catalog_item_modifier_groups,
-- catalog_location_prices

CREATE TABLE IF NOT EXISTS tax_categories (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  rate NUMERIC(6, 4) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_tax_categories_tenant_name ON tax_categories(tenant_id, name);
CREATE INDEX idx_tax_categories_tenant ON tax_categories(tenant_id);

CREATE TABLE IF NOT EXISTS catalog_categories (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  parent_id TEXT REFERENCES catalog_categories(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_categories_tenant ON catalog_categories(tenant_id);
CREATE INDEX idx_catalog_categories_parent ON catalog_categories(tenant_id, parent_id);

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  category_id TEXT REFERENCES catalog_categories(id),
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  item_type TEXT NOT NULL DEFAULT 'retail',
  default_price NUMERIC(10, 2) NOT NULL,
  cost NUMERIC(10, 2),
  tax_category_id TEXT REFERENCES tax_categories(id),
  is_trackable BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);
CREATE UNIQUE INDEX uq_catalog_items_tenant_sku ON catalog_items(tenant_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_catalog_items_active ON catalog_items(tenant_id, is_active);
CREATE INDEX idx_catalog_items_category ON catalog_items(tenant_id, category_id);

CREATE TABLE IF NOT EXISTS catalog_modifier_groups (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  selection_type TEXT NOT NULL DEFAULT 'single',
  is_required BOOLEAN NOT NULL DEFAULT false,
  min_selections INTEGER NOT NULL DEFAULT 0,
  max_selections INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_modifier_groups_tenant ON catalog_modifier_groups(tenant_id);

CREATE TABLE IF NOT EXISTS catalog_modifiers (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  modifier_group_id TEXT NOT NULL REFERENCES catalog_modifier_groups(id),
  name TEXT NOT NULL,
  price_adjustment NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_modifiers_group ON catalog_modifiers(modifier_group_id);

CREATE TABLE IF NOT EXISTS catalog_item_modifier_groups (
  catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  modifier_group_id TEXT NOT NULL REFERENCES catalog_modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (catalog_item_id, modifier_group_id)
);

CREATE TABLE IF NOT EXISTS catalog_location_prices (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id),
  price NUMERIC(10, 2) NOT NULL
);
CREATE UNIQUE INDEX uq_catalog_location_prices_item_loc ON catalog_location_prices(catalog_item_id, location_id);
CREATE INDEX idx_catalog_location_prices_tenant_item ON catalog_location_prices(tenant_id, catalog_item_id);
