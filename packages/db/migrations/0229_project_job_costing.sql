-- Migration 0229: Project/Job Costing Schema
-- Adds projects, project_tasks, rm_project_cost_summary tables
-- Adds project_id and project_task_id dimension columns to gl_journal_lines

-- ── projects table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT,
  project_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  project_type TEXT,
  customer_id TEXT,
  manager_user_id TEXT,
  start_date DATE,
  end_date DATE,
  completion_date DATE,
  budget_amount NUMERIC(12,2),
  budget_labor_hours NUMERIC(10,2),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archived_reason TEXT,
  client_request_id TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_tenant_number
  ON projects (tenant_id, project_number);

CREATE INDEX IF NOT EXISTS idx_projects_tenant_status
  ON projects (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_projects_tenant_customer
  ON projects (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_tenant_location
  ON projects (tenant_id, location_id)
  WHERE location_id IS NOT NULL;

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'projects_select') THEN
    CREATE POLICY projects_select ON projects FOR SELECT USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'projects_insert') THEN
    CREATE POLICY projects_insert ON projects FOR INSERT WITH CHECK (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'projects_update') THEN
    CREATE POLICY projects_update ON projects FOR UPDATE USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'projects_delete') THEN
    CREATE POLICY projects_delete ON projects FOR DELETE USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
END $$;

-- ── project_tasks table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  task_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  budget_amount NUMERIC(12,2),
  budget_hours NUMERIC(10,2),
  gl_expense_account_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_tasks_project_number
  ON project_tasks (tenant_id, project_id, task_number);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project
  ON project_tasks (project_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_gl_account
  ON project_tasks (gl_expense_account_id)
  WHERE gl_expense_account_id IS NOT NULL;

-- RLS
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_tasks' AND policyname = 'project_tasks_select') THEN
    CREATE POLICY project_tasks_select ON project_tasks FOR SELECT USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_tasks' AND policyname = 'project_tasks_insert') THEN
    CREATE POLICY project_tasks_insert ON project_tasks FOR INSERT WITH CHECK (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_tasks' AND policyname = 'project_tasks_update') THEN
    CREATE POLICY project_tasks_update ON project_tasks FOR UPDATE USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_tasks' AND policyname = 'project_tasks_delete') THEN
    CREATE POLICY project_tasks_delete ON project_tasks FOR DELETE USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
END $$;

-- ── GL journal lines: add project dimension columns ─────────────
ALTER TABLE gl_journal_lines
  ADD COLUMN IF NOT EXISTS project_id TEXT;

ALTER TABLE gl_journal_lines
  ADD COLUMN IF NOT EXISTS project_task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_project
  ON gl_journal_lines (tenant_id, project_id)
  WHERE project_id IS NOT NULL;

-- ── rm_project_cost_summary read model ──────────────────────────
CREATE TABLE IF NOT EXISTS rm_project_cost_summary (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  fiscal_period TEXT NOT NULL,
  revenue_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  direct_cost_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  labor_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  labor_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  material_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  other_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  gross_margin NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_project_cost_summary
  ON rm_project_cost_summary (tenant_id, project_id, fiscal_period);

CREATE INDEX IF NOT EXISTS idx_rm_project_cost_project
  ON rm_project_cost_summary (project_id);

CREATE INDEX IF NOT EXISTS idx_rm_project_cost_tenant
  ON rm_project_cost_summary (tenant_id);

-- RLS
ALTER TABLE rm_project_cost_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_project_cost_summary FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rm_project_cost_summary' AND policyname = 'rm_project_cost_summary_select') THEN
    CREATE POLICY rm_project_cost_summary_select ON rm_project_cost_summary FOR SELECT USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rm_project_cost_summary' AND policyname = 'rm_project_cost_summary_insert') THEN
    CREATE POLICY rm_project_cost_summary_insert ON rm_project_cost_summary FOR INSERT WITH CHECK (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rm_project_cost_summary' AND policyname = 'rm_project_cost_summary_update') THEN
    CREATE POLICY rm_project_cost_summary_update ON rm_project_cost_summary FOR UPDATE USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rm_project_cost_summary' AND policyname = 'rm_project_cost_summary_delete') THEN
    CREATE POLICY rm_project_cost_summary_delete ON rm_project_cost_summary FOR DELETE USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
END $$;
