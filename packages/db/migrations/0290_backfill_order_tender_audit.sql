-- Backfill audit_log for orders and tenders that were created before
-- audit logging was wired into the commands.
-- Idempotent: only inserts where no matching audit entry exists.
-- Safe to re-run: NOT EXISTS skips rows that already have an audit entry.
--
-- Index usage: NOT EXISTS uses idx_audit_entity (tenant_id, entity_type, entity_id)
-- plus idx_audit_action (tenant_id, action, created_at DESC) for plan efficiency.

-- ── Add missing audit_log partitions for historical + future data ────────────
CREATE TABLE IF NOT EXISTS audit_log_2025_01 PARTITION OF audit_log FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_02 PARTITION OF audit_log FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_03 PARTITION OF audit_log FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_04 PARTITION OF audit_log FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_05 PARTITION OF audit_log FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_06 PARTITION OF audit_log FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_07 PARTITION OF audit_log FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_08 PARTITION OF audit_log FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_09 PARTITION OF audit_log FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_10 PARTITION OF audit_log FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_11 PARTITION OF audit_log FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_12 PARTITION OF audit_log FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
-- Extend 2026 coverage through end of year (0003 only created Jan–Jun)
CREATE TABLE IF NOT EXISTS audit_log_2026_07 PARTITION OF audit_log FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_08 PARTITION OF audit_log FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_09 PARTITION OF audit_log FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_10 PARTITION OF audit_log FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_11 PARTITION OF audit_log FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_12 PARTITION OF audit_log FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- 1. Backfill placed orders (status = placed or paid)
INSERT INTO audit_log (id, tenant_id, location_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata, created_at)
SELECT
  gen_ulid(),
  o.tenant_id,
  o.location_id,
  o.created_by,
  'system',
  'order.placed',
  'order',
  o.id,
  jsonb_build_object('backfill', true, 'original_placed_at', o.placed_at),
  COALESCE(o.placed_at, o.created_at)
FROM orders o
WHERE o.status IN ('placed', 'paid')
  AND NOT EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.tenant_id = o.tenant_id
      AND a.entity_type = 'order'
      AND a.entity_id = o.id
      AND a.action = 'order.placed'
  );

-- 2. Backfill voided orders
INSERT INTO audit_log (id, tenant_id, location_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata, created_at)
SELECT
  gen_ulid(),
  o.tenant_id,
  o.location_id,
  o.updated_by,
  'system',
  'order.voided',
  'order',
  o.id,
  jsonb_build_object('backfill', true, 'original_voided_at', o.voided_at),
  COALESCE(o.voided_at, o.updated_at)
FROM orders o
WHERE o.status = 'voided'
  AND NOT EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.tenant_id = o.tenant_id
      AND a.entity_type = 'order'
      AND a.entity_id = o.id
      AND a.action = 'order.voided'
  );

-- 3. Backfill tenders
-- Note: tender audit uses entity_type='order' + entity_id=order_id (matches recordTender command).
-- Multiple tenders per order is normal, so we key idempotency on the tender_id in metadata.
-- The metadata->>tender_id check prevents duplicates when re-running while allowing
-- multiple tender.recorded entries per order (one per tender).
INSERT INTO audit_log (id, tenant_id, location_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata, created_at)
SELECT
  gen_ulid(),
  t.tenant_id,
  t.location_id,
  t.created_by,
  'system',
  'tender.recorded',
  'order',
  t.order_id,
  jsonb_build_object('backfill', true, 'tender_id', t.id, 'tender_type', t.tender_type, 'amount_cents', t.amount),
  t.created_at
FROM tenders t
WHERE NOT EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.tenant_id = t.tenant_id
      AND a.entity_type = 'order'
      AND a.entity_id = t.order_id
      AND a.action = 'tender.recorded'
      AND a.metadata->>'tender_id' = t.id
  );
