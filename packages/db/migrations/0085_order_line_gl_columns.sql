-- Migration: Add GL-related columns to order_lines for subdepartment revenue mapping
-- These columns snapshot the catalog hierarchy at order time, enabling GL posting
-- without cross-module catalog queries downstream.

ALTER TABLE order_lines ADD COLUMN sub_department_id TEXT;
ALTER TABLE order_lines ADD COLUMN tax_group_id TEXT;

-- Partial index for grouping/querying by subdepartment (only when populated)
CREATE INDEX idx_order_lines_tenant_subdept
  ON order_lines (tenant_id, sub_department_id)
  WHERE sub_department_id IS NOT NULL;
