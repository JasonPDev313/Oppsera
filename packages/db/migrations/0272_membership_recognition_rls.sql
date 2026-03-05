-- Enable RLS on membership revenue recognition tables (security fix)
-- These tenant-scoped financial tables were missing RLS policies.

ALTER TABLE IF EXISTS membership_dues_recognition_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS membership_dues_recognition_entries ENABLE ROW LEVEL SECURITY;

-- SELECT policy: tenants can only see their own recognition data
CREATE POLICY IF NOT EXISTS membership_dues_recognition_schedule_select
  ON membership_dues_recognition_schedule
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY IF NOT EXISTS membership_dues_recognition_entries_select
  ON membership_dues_recognition_entries
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- INSERT policy
CREATE POLICY IF NOT EXISTS membership_dues_recognition_schedule_insert
  ON membership_dues_recognition_schedule
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY IF NOT EXISTS membership_dues_recognition_entries_insert
  ON membership_dues_recognition_entries
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- UPDATE policy
CREATE POLICY IF NOT EXISTS membership_dues_recognition_schedule_update
  ON membership_dues_recognition_schedule
  FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY IF NOT EXISTS membership_dues_recognition_entries_update
  ON membership_dues_recognition_entries
  FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- DELETE policy
CREATE POLICY IF NOT EXISTS membership_dues_recognition_schedule_delete
  ON membership_dues_recognition_schedule
  FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY IF NOT EXISTS membership_dues_recognition_entries_delete
  ON membership_dues_recognition_entries
  FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
