-- Index for sub_department_gl_defaults tenant lookups (used by getSubDepartmentMappings CTE)
CREATE INDEX IF NOT EXISTS idx_sub_dept_gl_defaults_tenant
  ON sub_department_gl_defaults (tenant_id);

-- Index for discount_gl_mappings tenant + sub-department lookups
CREATE INDEX IF NOT EXISTS idx_discount_gl_mappings_tenant
  ON discount_gl_mappings (tenant_id, sub_department_id);

-- Index for gl_unmapped_events tenant + unresolved (used by getMappingCoverage)
CREATE INDEX IF NOT EXISTS idx_gl_unmapped_events_tenant_unresolved
  ON gl_unmapped_events (tenant_id) WHERE resolved_at IS NULL;

-- Index for gl_transaction_type_mappings tenant lookup (used by coverage query)
CREATE INDEX IF NOT EXISTS idx_gl_tt_mappings_tenant
  ON gl_transaction_type_mappings (tenant_id, transaction_type_code);
