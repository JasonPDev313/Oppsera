-- UXOPS-11: Unified deposit slips for hybrid locations
-- Aggregates cash from retail terminal closes + F&B close into single deposit records

CREATE TABLE deposit_slips (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date DATE NOT NULL,
  deposit_type TEXT NOT NULL DEFAULT 'cash',
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  bank_account_id TEXT REFERENCES bank_accounts(id),
  status TEXT NOT NULL DEFAULT 'pending',
  retail_close_batch_ids TEXT[] DEFAULT '{}',
  fnb_close_batch_id TEXT,
  deposited_at TIMESTAMPTZ,
  deposited_by TEXT,
  reconciled_at TIMESTAMPTZ,
  reconciled_by TEXT,
  gl_journal_entry_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deposit_slips_location_date ON deposit_slips(tenant_id, location_id, business_date);
CREATE INDEX idx_deposit_slips_status ON deposit_slips(tenant_id, status);

-- No RLS — accessed via tenant-filtered queries through withTenant
