-- tax_categories is deprecated. Replaced by tax_rates + tax_groups system.
-- The old taxCategoryId FK on catalog_items stays for now.
-- TODO: Remove taxCategoryId from catalog_items in a future cleanup migration.

-- Tax rates (tenant-scoped, reusable rate definitions)
CREATE TABLE IF NOT EXISTS tax_rates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  rate_decimal NUMERIC(6,4) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);

CREATE UNIQUE INDEX uq_tax_rates_tenant_name ON tax_rates (tenant_id, name);
CREATE INDEX idx_tax_rates_tenant ON tax_rates (tenant_id);

-- Tax groups (location-scoped containers)
CREATE TABLE IF NOT EXISTS tax_groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  calculation_mode TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);

CREATE UNIQUE INDEX uq_tax_groups_tenant_location_name ON tax_groups (tenant_id, location_id, name);
CREATE INDEX idx_tax_groups_tenant_location ON tax_groups (tenant_id, location_id);

-- Tax group rates (rates inside groups)
CREATE TABLE IF NOT EXISTS tax_group_rates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  tax_group_id TEXT NOT NULL REFERENCES tax_groups(id) ON DELETE CASCADE,
  tax_rate_id TEXT NOT NULL REFERENCES tax_rates(id),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX uq_tax_group_rates_group_rate ON tax_group_rates (tax_group_id, tax_rate_id);
CREATE INDEX idx_tax_group_rates_group ON tax_group_rates (tax_group_id);

-- Catalog item location tax groups (item → groups per location)
CREATE TABLE IF NOT EXISTS catalog_item_location_tax_groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id),
  catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  tax_group_id TEXT NOT NULL REFERENCES tax_groups(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_item_location_tax_group ON catalog_item_location_tax_groups (location_id, catalog_item_id, tax_group_id);
CREATE INDEX idx_item_location_tax_groups_lookup ON catalog_item_location_tax_groups (tenant_id, location_id, catalog_item_id);

-- Order line taxes (snapshot — append-only)
CREATE TABLE IF NOT EXISTS order_line_taxes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_line_id TEXT NOT NULL,
  tax_rate_id TEXT,
  tax_name TEXT NOT NULL,
  rate_decimal NUMERIC(6,4) NOT NULL,
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_line_taxes_tenant_line ON order_line_taxes (tenant_id, order_line_id);
