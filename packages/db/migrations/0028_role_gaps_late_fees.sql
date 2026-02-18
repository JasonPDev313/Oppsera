-- Migration: 0028_role_gaps_late_fees
-- ROLE_GAPS: role_department_access, role_voucher_type_access
-- LATE_FEES: adds fee columns to late_fee_policies
-- Note: GF_RoleModules/GF_RoleSettings -> role_permissions,
--       GF_RoleTerminalLocation/GF_RoleManagementCompanySubGroup -> role_assignments,
--       GF_ClubManagerOverrideSettings -> tenant_settings,
--       GF_Modules/GF_Modules_Group -> entitlements,
--       GF_LateFeeOrderLine -> ar_transactions (type=late_fee)

-- ══════════════════════════════════════════════════════════════════
-- ROLE_GAPS DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── role_department_access (merged GF_RoleDepartment + GF_RoleSubDepartment) ──
CREATE TABLE IF NOT EXISTS role_department_access (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  role_id             TEXT NOT NULL,
  department_id       TEXT NOT NULL,
  sub_department_id   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_dept_access_tenant_role
  ON role_department_access (tenant_id, role_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_role_dept_access_tenant_role_dept_sub
  ON role_department_access (tenant_id, role_id, department_id, sub_department_id);

ALTER TABLE role_department_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_department_access_select ON role_department_access FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY role_department_access_insert ON role_department_access FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY role_department_access_update ON role_department_access FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY role_department_access_delete ON role_department_access FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── role_voucher_type_access (from GF_RoleClubVoucherType) ────────
CREATE TABLE IF NOT EXISTS role_voucher_type_access (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  role_id             TEXT NOT NULL,
  voucher_type_id     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_role_voucher_type_access_tenant_role_voucher
  ON role_voucher_type_access (tenant_id, role_id, voucher_type_id);

ALTER TABLE role_voucher_type_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_voucher_type_access_select ON role_voucher_type_access FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY role_voucher_type_access_insert ON role_voucher_type_access FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY role_voucher_type_access_update ON role_voucher_type_access FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY role_voucher_type_access_delete ON role_voucher_type_access FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- LATE_FEES — ALTER TABLE additions
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE late_fee_policies ADD COLUMN IF NOT EXISTS fee_amount_cents BIGINT;
ALTER TABLE late_fee_policies ADD COLUMN IF NOT EXISTS threshold_amount_cents BIGINT;
ALTER TABLE late_fee_policies ADD COLUMN IF NOT EXISTS minimum_fee_cents BIGINT;
