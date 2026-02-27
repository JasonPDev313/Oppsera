-- Tag fields for custom report builder
-- Adds tag-related dimensions, measures, and filters to the reporting field catalog

INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  -- Tag dimensions
  (gen_random_uuid()::text, 'customers', 'tag_names', 'Active Tags', 'string', NULL, false, true, true,
   $$STRING_AGG(DISTINCT t.name, ', ' ORDER BY t.name)$$,
   'customer_tags'),

  (gen_random_uuid()::text, 'customers', 'tag_groups', 'Tag Groups', 'string', NULL, false, true, true,
   $$STRING_AGG(DISTINCT t.tag_group, ', ' ORDER BY t.tag_group)$$,
   'customer_tags'),

  (gen_random_uuid()::text, 'customers', 'tag_applied_date', 'Tag Applied Date', 'date', NULL, false, true, true,
   'ct.applied_at::date',
   'customer_tags'),

  -- Tag measures
  (gen_random_uuid()::text, 'customers', 'tag_count', 'Active Tag Count', 'number', 'count', true, true, true,
   'ct.id',
   'customer_tags'),

  -- Tag group boolean filters
  (gen_random_uuid()::text, 'customers', 'has_service_flag', 'Has Service Flag', 'boolean', NULL, false, true, false,
   $$EXISTS (SELECT 1 FROM customer_tags ct2 JOIN tags t2 ON ct2.tag_id = t2.id WHERE ct2.customer_id = c.id AND ct2.tenant_id = c.tenant_id AND ct2.removed_at IS NULL AND t2.tag_group = 'service_flag')$$,
   'customer_tags'),

  (gen_random_uuid()::text, 'customers', 'has_value_tier', 'Has Value Tier Tag', 'boolean', NULL, false, true, false,
   $$EXISTS (SELECT 1 FROM customer_tags ct2 JOIN tags t2 ON ct2.tag_id = t2.id WHERE ct2.customer_id = c.id AND ct2.tenant_id = c.tenant_id AND ct2.removed_at IS NULL AND t2.tag_group = 'value_tier')$$,
   'customer_tags'),

  (gen_random_uuid()::text, 'customers', 'has_engagement_tag', 'Has Engagement Tag', 'boolean', NULL, false, true, false,
   $$EXISTS (SELECT 1 FROM customer_tags ct2 JOIN tags t2 ON ct2.tag_id = t2.id WHERE ct2.customer_id = c.id AND ct2.tenant_id = c.tenant_id AND ct2.removed_at IS NULL AND t2.tag_group = 'engagement')$$,
   'customer_tags'),

  (gen_random_uuid()::text, 'customers', 'has_lifecycle_tag', 'Has Lifecycle Tag', 'boolean', NULL, false, true, false,
   $$EXISTS (SELECT 1 FROM customer_tags ct2 JOIN tags t2 ON ct2.tag_id = t2.id WHERE ct2.customer_id = c.id AND ct2.tenant_id = c.tenant_id AND ct2.removed_at IS NULL AND t2.tag_group = 'lifecycle')$$,
   'customer_tags'),

  (gen_random_uuid()::text, 'customers', 'has_behavioral_tag', 'Has Behavioral Tag', 'boolean', NULL, false, true, false,
   $$EXISTS (SELECT 1 FROM customer_tags ct2 JOIN tags t2 ON ct2.tag_id = t2.id WHERE ct2.customer_id = c.id AND ct2.tenant_id = c.tenant_id AND ct2.removed_at IS NULL AND t2.tag_group = 'behavioral')$$,
   'customer_tags'),

  (gen_random_uuid()::text, 'customers', 'has_membership_tag', 'Has Membership Tag', 'boolean', NULL, false, true, false,
   $$EXISTS (SELECT 1 FROM customer_tags ct2 JOIN tags t2 ON ct2.tag_id = t2.id WHERE ct2.customer_id = c.id AND ct2.tenant_id = c.tenant_id AND ct2.removed_at IS NULL AND t2.tag_group = 'membership')$$,
   'customer_tags'),

  -- Tag source filter
  (gen_random_uuid()::text, 'customers', 'tag_source', 'Tag Source', 'string', NULL, false, true, true,
   'ct.source',
   'customer_tags')

ON CONFLICT (dataset, field_key) DO NOTHING;
