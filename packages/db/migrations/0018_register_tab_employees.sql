-- 0018_register_tab_employees.sql
-- Add employee/server assignment to register tabs

ALTER TABLE register_tabs ADD COLUMN employee_id TEXT;
ALTER TABLE register_tabs ADD COLUMN employee_name TEXT;

CREATE INDEX idx_register_tabs_employee
  ON register_tabs (tenant_id, employee_id)
  WHERE employee_id IS NOT NULL;
