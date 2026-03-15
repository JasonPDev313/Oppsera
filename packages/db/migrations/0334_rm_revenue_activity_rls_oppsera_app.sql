-- Add oppsera_app RLS policies to rm_revenue_activity.
-- The table has RLS enabled + forced, but only had policies for the public role.
-- When the app connects as oppsera_app via Supavisor, all queries returned 0 rows
-- (RLS no-policy = deny-all, gotcha #573).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rm_revenue_activity' AND policyname = 'rm_revenue_activity_app_select'
  ) THEN
    CREATE POLICY rm_revenue_activity_app_select ON rm_revenue_activity
      FOR SELECT TO oppsera_app
      USING (tenant_id = current_setting('app.current_tenant_id', true));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rm_revenue_activity' AND policyname = 'rm_revenue_activity_app_insert'
  ) THEN
    CREATE POLICY rm_revenue_activity_app_insert ON rm_revenue_activity
      FOR INSERT TO oppsera_app
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rm_revenue_activity' AND policyname = 'rm_revenue_activity_app_update'
  ) THEN
    CREATE POLICY rm_revenue_activity_app_update ON rm_revenue_activity
      FOR UPDATE TO oppsera_app
      USING (tenant_id = current_setting('app.current_tenant_id', true));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rm_revenue_activity' AND policyname = 'rm_revenue_activity_app_delete'
  ) THEN
    CREATE POLICY rm_revenue_activity_app_delete ON rm_revenue_activity
      FOR DELETE TO oppsera_app
      USING (tenant_id = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
