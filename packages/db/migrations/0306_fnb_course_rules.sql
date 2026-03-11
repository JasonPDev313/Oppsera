-- F&B Course Definitions + Course Rules
-- Course definitions: named course slots per location (replaces hardcoded default_courses array)
-- Course rules: coursing profiles at department/sub-dept/category/item scope with inheritance

-- ── Course Definitions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fnb_course_definitions (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  location_id     TEXT NOT NULL REFERENCES locations(id),
  course_number   INTEGER NOT NULL,
  course_name     TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, location_id, course_number)
);

CREATE INDEX IF NOT EXISTS idx_fnb_course_definitions_tenant_location
  ON fnb_course_definitions(tenant_id, location_id);

-- ── Course Rules ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fnb_course_rules (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  location_id             TEXT NOT NULL REFERENCES locations(id),
  scope_type              TEXT NOT NULL CHECK (scope_type IN ('department', 'sub_department', 'category', 'item')),
  scope_id                TEXT NOT NULL,
  default_course_number   INTEGER,
  allowed_course_numbers  JSONB,
  lock_course             BOOLEAN NOT NULL DEFAULT false,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              TEXT,
  updated_by              TEXT,
  UNIQUE(tenant_id, location_id, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_fnb_course_rules_tenant_scope
  ON fnb_course_rules(tenant_id, location_id, scope_type);

CREATE INDEX IF NOT EXISTS idx_fnb_course_rules_scope_id
  ON fnb_course_rules(tenant_id, scope_id);

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE fnb_course_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_course_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fnb_course_definitions' AND policyname = 'tenant_isolation') THEN
    EXECUTE 'CREATE POLICY tenant_isolation ON fnb_course_definitions USING (tenant_id = current_setting(''app.tenant_id'', true))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fnb_course_rules' AND policyname = 'tenant_isolation') THEN
    EXECUTE 'CREATE POLICY tenant_isolation ON fnb_course_rules USING (tenant_id = current_setting(''app.tenant_id'', true))';
  END IF;
END $$;

-- ── Seed course definitions from existing fnb_ordering settings ─────
-- Extracts default_courses arrays from fnb_settings where module_key='fnb_ordering'
-- and creates corresponding fnb_course_definitions rows.
INSERT INTO fnb_course_definitions (tenant_id, location_id, course_number, course_name, sort_order)
SELECT
  s.tenant_id,
  s.location_id,
  (elem.ordinality)::INTEGER AS course_number,
  elem.value #>> '{}' AS course_name,
  (elem.ordinality)::INTEGER AS sort_order
FROM fnb_settings s,
LATERAL jsonb_array_elements_text(
  CASE
    WHEN s.settings_json ? 'default_courses'
      AND jsonb_typeof(s.settings_json -> 'default_courses') = 'array'
    THEN s.settings_json -> 'default_courses'
    ELSE '["Apps","Entrees","Desserts"]'::jsonb
  END
) WITH ORDINALITY AS elem(value, ordinality)
WHERE s.module_key = 'fnb_ordering'
  AND s.location_id IS NOT NULL
ON CONFLICT (tenant_id, location_id, course_number) DO NOTHING;
