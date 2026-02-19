-- Fix RLS policies that restrict to oppsera_app role
-- The connection uses postgres role, not oppsera_app, so role-restricted policies
-- return empty results with FORCE ROW LEVEL SECURITY enabled.
-- Fix: drop role-restricted policies and recreate without role restriction,
-- matching the pattern used by the original core tables (0002_rls_policies.sql).

-- ── Vendors ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS vendors_select ON vendors;
DROP POLICY IF EXISTS vendors_insert ON vendors;
DROP POLICY IF EXISTS vendors_update ON vendors;
DROP POLICY IF EXISTS vendors_delete ON vendors;
CREATE POLICY tenant_isolation_select ON vendors FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON vendors FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON vendors FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON vendors FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── UOMs ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS uoms_select ON uoms;
DROP POLICY IF EXISTS uoms_insert ON uoms;
DROP POLICY IF EXISTS uoms_update ON uoms;
DROP POLICY IF EXISTS uoms_delete ON uoms;
CREATE POLICY tenant_isolation_select ON uoms FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON uoms FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON uoms FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON uoms FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Item UOM Conversions ─────────────────────────────────────────
DROP POLICY IF EXISTS item_uom_conversions_select ON item_uom_conversions;
DROP POLICY IF EXISTS item_uom_conversions_insert ON item_uom_conversions;
DROP POLICY IF EXISTS item_uom_conversions_update ON item_uom_conversions;
DROP POLICY IF EXISTS item_uom_conversions_delete ON item_uom_conversions;
CREATE POLICY tenant_isolation_select ON item_uom_conversions FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON item_uom_conversions FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON item_uom_conversions FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON item_uom_conversions FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Item Vendors ─────────────────────────────────────────────────
DROP POLICY IF EXISTS item_vendors_select ON item_vendors;
DROP POLICY IF EXISTS item_vendors_insert ON item_vendors;
DROP POLICY IF EXISTS item_vendors_update ON item_vendors;
DROP POLICY IF EXISTS item_vendors_delete ON item_vendors;
CREATE POLICY tenant_isolation_select ON item_vendors FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON item_vendors FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON item_vendors FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON item_vendors FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Item Identifiers ─────────────────────────────────────────────
DROP POLICY IF EXISTS item_identifiers_select ON item_identifiers;
DROP POLICY IF EXISTS item_identifiers_insert ON item_identifiers;
DROP POLICY IF EXISTS item_identifiers_update ON item_identifiers;
DROP POLICY IF EXISTS item_identifiers_delete ON item_identifiers;
CREATE POLICY tenant_isolation_select ON item_identifiers FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON item_identifiers FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON item_identifiers FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON item_identifiers FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Receiving Receipts ───────────────────────────────────────────
DROP POLICY IF EXISTS receiving_receipts_select ON receiving_receipts;
DROP POLICY IF EXISTS receiving_receipts_insert ON receiving_receipts;
DROP POLICY IF EXISTS receiving_receipts_update ON receiving_receipts;
DROP POLICY IF EXISTS receiving_receipts_delete ON receiving_receipts;
CREATE POLICY tenant_isolation_select ON receiving_receipts FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON receiving_receipts FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON receiving_receipts FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON receiving_receipts FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Receiving Receipt Lines ──────────────────────────────────────
DROP POLICY IF EXISTS receiving_receipt_lines_select ON receiving_receipt_lines;
DROP POLICY IF EXISTS receiving_receipt_lines_insert ON receiving_receipt_lines;
DROP POLICY IF EXISTS receiving_receipt_lines_update ON receiving_receipt_lines;
DROP POLICY IF EXISTS receiving_receipt_lines_delete ON receiving_receipt_lines;
CREATE POLICY tenant_isolation_select ON receiving_receipt_lines FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON receiving_receipt_lines FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON receiving_receipt_lines FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON receiving_receipt_lines FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Purchase Orders ──────────────────────────────────────────────
DROP POLICY IF EXISTS purchase_orders_select ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_insert ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_update ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_delete ON purchase_orders;
CREATE POLICY tenant_isolation_select ON purchase_orders FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON purchase_orders FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON purchase_orders FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON purchase_orders FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Purchase Order Lines ─────────────────────────────────────────
DROP POLICY IF EXISTS purchase_order_lines_select ON purchase_order_lines;
DROP POLICY IF EXISTS purchase_order_lines_insert ON purchase_order_lines;
DROP POLICY IF EXISTS purchase_order_lines_update ON purchase_order_lines;
DROP POLICY IF EXISTS purchase_order_lines_delete ON purchase_order_lines;
CREATE POLICY tenant_isolation_select ON purchase_order_lines FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON purchase_order_lines FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON purchase_order_lines FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON purchase_order_lines FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Purchase Order Revisions ─────────────────────────────────────
DROP POLICY IF EXISTS po_revisions_select ON purchase_order_revisions;
DROP POLICY IF EXISTS po_revisions_insert ON purchase_order_revisions;
DROP POLICY IF EXISTS po_revisions_update ON purchase_order_revisions;
DROP POLICY IF EXISTS po_revisions_delete ON purchase_order_revisions;
CREATE POLICY tenant_isolation_select ON purchase_order_revisions FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON purchase_order_revisions FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON purchase_order_revisions FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON purchase_order_revisions FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Reporting Read Models ────────────────────────────────────────
DROP POLICY IF EXISTS rm_daily_sales_select ON rm_daily_sales;
DROP POLICY IF EXISTS rm_daily_sales_insert ON rm_daily_sales;
DROP POLICY IF EXISTS rm_daily_sales_update ON rm_daily_sales;
DROP POLICY IF EXISTS rm_daily_sales_delete ON rm_daily_sales;
CREATE POLICY tenant_isolation_select ON rm_daily_sales FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON rm_daily_sales FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON rm_daily_sales FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON rm_daily_sales FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS rm_item_sales_select ON rm_item_sales;
DROP POLICY IF EXISTS rm_item_sales_insert ON rm_item_sales;
DROP POLICY IF EXISTS rm_item_sales_update ON rm_item_sales;
DROP POLICY IF EXISTS rm_item_sales_delete ON rm_item_sales;
CREATE POLICY tenant_isolation_select ON rm_item_sales FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON rm_item_sales FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON rm_item_sales FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON rm_item_sales FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS rm_inventory_on_hand_select ON rm_inventory_on_hand;
DROP POLICY IF EXISTS rm_inventory_on_hand_insert ON rm_inventory_on_hand;
DROP POLICY IF EXISTS rm_inventory_on_hand_update ON rm_inventory_on_hand;
DROP POLICY IF EXISTS rm_inventory_on_hand_delete ON rm_inventory_on_hand;
CREATE POLICY tenant_isolation_select ON rm_inventory_on_hand FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON rm_inventory_on_hand FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON rm_inventory_on_hand FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON rm_inventory_on_hand FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS rm_customer_activity_select ON rm_customer_activity;
DROP POLICY IF EXISTS rm_customer_activity_insert ON rm_customer_activity;
DROP POLICY IF EXISTS rm_customer_activity_update ON rm_customer_activity;
DROP POLICY IF EXISTS rm_customer_activity_delete ON rm_customer_activity;
CREATE POLICY tenant_isolation_select ON rm_customer_activity FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON rm_customer_activity FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON rm_customer_activity FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON rm_customer_activity FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Report + Dashboard Definitions ───────────────────────────────
DROP POLICY IF EXISTS report_definitions_select ON report_definitions;
DROP POLICY IF EXISTS report_definitions_insert ON report_definitions;
DROP POLICY IF EXISTS report_definitions_update ON report_definitions;
DROP POLICY IF EXISTS report_definitions_delete ON report_definitions;
CREATE POLICY tenant_isolation_select ON report_definitions FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON report_definitions FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON report_definitions FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON report_definitions FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS dashboard_definitions_select ON dashboard_definitions;
DROP POLICY IF EXISTS dashboard_definitions_insert ON dashboard_definitions;
DROP POLICY IF EXISTS dashboard_definitions_update ON dashboard_definitions;
DROP POLICY IF EXISTS dashboard_definitions_delete ON dashboard_definitions;
CREATE POLICY tenant_isolation_select ON dashboard_definitions FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON dashboard_definitions FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON dashboard_definitions FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON dashboard_definitions FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
