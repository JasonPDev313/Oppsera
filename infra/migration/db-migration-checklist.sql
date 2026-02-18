-- Post-Migration Validation Queries
-- Run these after migrating from Supabase to RDS/Azure Flexible Server
-- to verify data integrity and RLS functionality.

-- 1. Row count comparison (run on BOTH source and target)
SELECT 'tenants' AS table_name, COUNT(*) AS row_count FROM tenants
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'locations', COUNT(*) FROM locations
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_lines', COUNT(*) FROM order_lines
UNION ALL SELECT 'tenders', COUNT(*) FROM tenders
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'catalog_items', COUNT(*) FROM catalog_items
UNION ALL SELECT 'inventory_movements', COUNT(*) FROM inventory_movements
UNION ALL SELECT 'event_outbox', COUNT(*) FROM event_outbox
ORDER BY table_name;

-- 2. Financial totals (must match exactly)
SELECT
  SUM(subtotal) AS total_subtotal,
  SUM(tax_total) AS total_tax,
  SUM(total) AS total_revenue,
  COUNT(*) AS order_count
FROM orders
WHERE status != 'voided';

-- 3. Tender totals
SELECT
  SUM(amount) AS total_tenders,
  COUNT(*) AS tender_count
FROM tenders
WHERE status = 'captured';

-- 4. RLS verification (should return rows for the configured tenant only)
-- Set a tenant context first:
SELECT set_config('app.current_tenant_id', 'YOUR_TEST_TENANT_ID', true);
SELECT COUNT(*) AS visible_orders FROM orders;
-- Should NOT see orders from other tenants

-- 5. gen_ulid() function works
SELECT gen_ulid() AS test_ulid;

-- 6. Indexes exist
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 7. RLS policies active
SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- 8. pg_stat_statements enabled
SELECT COUNT(*) > 0 AS pg_stat_enabled
FROM pg_stat_statements
LIMIT 1;

-- 9. Connection pool check
SELECT
  state,
  COUNT(*) AS count
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state;

-- 10. Database size
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
