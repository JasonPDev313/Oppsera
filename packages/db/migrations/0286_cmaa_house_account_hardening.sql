-- Migration 0286: CMAA house account hardening
-- Adds: billing account CMAA columns, disputes table, statements table, signature storage

-- ── 1. Billing account CMAA fields ──
ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS min_charge_cents       BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_tip_percentage     NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS daily_limit_cents      BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monthly_limit_cents    BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS charging_hours_start   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS charging_hours_end     TEXT DEFAULT NULL;

COMMENT ON COLUMN billing_accounts.min_charge_cents IS 'CMAA: minimum charge amount per transaction (cents). NULL = no minimum.';
COMMENT ON COLUMN billing_accounts.max_tip_percentage IS 'CMAA: maximum gratuity percentage allowed (e.g. 25.00 = 25%). NULL = no cap.';
COMMENT ON COLUMN billing_accounts.daily_limit_cents IS 'CMAA: maximum cumulative charges per calendar day (cents). NULL = no daily limit.';
COMMENT ON COLUMN billing_accounts.monthly_limit_cents IS 'CMAA: maximum cumulative charges per billing cycle (cents). NULL = no monthly limit.';
COMMENT ON COLUMN billing_accounts.charging_hours_start IS 'CMAA: earliest hour charges are permitted (HH:MM 24h). NULL = no restriction.';
COMMENT ON COLUMN billing_accounts.charging_hours_end IS 'CMAA: latest hour charges are permitted (HH:MM 24h). NULL = no restriction.';

-- CHECK constraints on CMAA limits (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_accounts_min_charge_positive') THEN
    ALTER TABLE billing_accounts
      ADD CONSTRAINT chk_billing_accounts_min_charge_positive
        CHECK (min_charge_cents IS NULL OR min_charge_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_accounts_max_tip_positive') THEN
    ALTER TABLE billing_accounts
      ADD CONSTRAINT chk_billing_accounts_max_tip_positive
        CHECK (max_tip_percentage IS NULL OR max_tip_percentage >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_accounts_daily_limit_positive') THEN
    ALTER TABLE billing_accounts
      ADD CONSTRAINT chk_billing_accounts_daily_limit_positive
        CHECK (daily_limit_cents IS NULL OR daily_limit_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_accounts_monthly_limit_positive') THEN
    ALTER TABLE billing_accounts
      ADD CONSTRAINT chk_billing_accounts_monthly_limit_positive
        CHECK (monthly_limit_cents IS NULL OR monthly_limit_cents >= 0);
  END IF;

  -- Monthly limit must be >= daily limit when both are set
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_accounts_monthly_gte_daily') THEN
    ALTER TABLE billing_accounts
      ADD CONSTRAINT chk_billing_accounts_monthly_gte_daily
        CHECK (
          daily_limit_cents IS NULL
          OR monthly_limit_cents IS NULL
          OR monthly_limit_cents >= daily_limit_cents
        );
  END IF;

  -- Charging hours must be valid HH:MM format (00:00 through 23:59)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_accounts_charging_hours_start_fmt') THEN
    ALTER TABLE billing_accounts
      ADD CONSTRAINT chk_billing_accounts_charging_hours_start_fmt
        CHECK (charging_hours_start IS NULL OR charging_hours_start ~ '^([01]\d|2[0-3]):[0-5]\d$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_accounts_charging_hours_end_fmt') THEN
    ALTER TABLE billing_accounts
      ADD CONSTRAINT chk_billing_accounts_charging_hours_end_fmt
        CHECK (charging_hours_end IS NULL OR charging_hours_end ~ '^([01]\d|2[0-3]):[0-5]\d$');
  END IF;

  -- Both charging hours must be set or both null
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_accounts_charging_hours_pair') THEN
    ALTER TABLE billing_accounts
      ADD CONSTRAINT chk_billing_accounts_charging_hours_pair
        CHECK (
          (charging_hours_start IS NULL AND charging_hours_end IS NULL)
          OR (charging_hours_start IS NOT NULL AND charging_hours_end IS NOT NULL)
        );
  END IF;
END $$;

-- ── 2. AR disputes table ──
CREATE TABLE IF NOT EXISTS ar_disputes (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL REFERENCES tenants(id),
  location_id          TEXT REFERENCES locations(id),
  billing_account_id   TEXT NOT NULL REFERENCES billing_accounts(id),
  customer_id          TEXT NOT NULL REFERENCES customers(id),
  invoice_id           TEXT REFERENCES ar_invoices(id),
  dispute_number       TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'open',
  reason               TEXT NOT NULL,
  description          TEXT,
  amount_cents         BIGINT NOT NULL,
  resolution_notes     TEXT,
  resolved_by          TEXT,
  resolved_at          TIMESTAMPTZ,
  created_by           TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ar_disputes_status CHECK (status IN ('open', 'under_review', 'resolved', 'rejected')),
  CONSTRAINT chk_ar_disputes_amount_positive CHECK (amount_cents > 0),
  -- resolved_at and resolved_by must both be set for terminal statuses
  CONSTRAINT chk_ar_disputes_resolution_complete CHECK (
    (status NOT IN ('resolved', 'rejected'))
    OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  ),
  -- resolved_at/resolved_by must NOT be set for non-terminal statuses
  CONSTRAINT chk_ar_disputes_resolution_clean CHECK (
    (status IN ('resolved', 'rejected'))
    OR (resolved_at IS NULL AND resolved_by IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ar_disputes_tenant_number
  ON ar_disputes (tenant_id, dispute_number);
CREATE INDEX IF NOT EXISTS idx_ar_disputes_tenant_status
  ON ar_disputes (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ar_disputes_tenant_customer
  ON ar_disputes (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_disputes_tenant_billing_account
  ON ar_disputes (tenant_id, billing_account_id);
CREATE INDEX IF NOT EXISTS idx_ar_disputes_tenant_invoice
  ON ar_disputes (tenant_id, invoice_id) WHERE invoice_id IS NOT NULL;
-- Open/under_review disputes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_ar_disputes_tenant_open
  ON ar_disputes (tenant_id, created_at DESC) WHERE status IN ('open', 'under_review');

-- ── 3. Billing account statements table ──
CREATE TABLE IF NOT EXISTS billing_account_statements (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  location_id           TEXT REFERENCES locations(id),
  billing_account_id    TEXT NOT NULL REFERENCES billing_accounts(id),
  customer_id           TEXT NOT NULL REFERENCES customers(id),
  statement_number      TEXT NOT NULL,
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  opening_balance_cents BIGINT NOT NULL DEFAULT 0,
  charges_cents         BIGINT NOT NULL DEFAULT 0,
  payments_cents        BIGINT NOT NULL DEFAULT 0,
  adjustments_cents     BIGINT NOT NULL DEFAULT 0,
  late_fees_cents       BIGINT NOT NULL DEFAULT 0,
  closing_balance_cents BIGINT NOT NULL DEFAULT 0,
  due_date              DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft',
  sent_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_statements_status CHECK (status IN ('draft', 'finalized', 'sent', 'paid', 'overdue', 'void')),
  CONSTRAINT chk_statements_period CHECK (period_end >= period_start),
  CONSTRAINT chk_statements_due_date_after_period CHECK (due_date >= period_end),
  CONSTRAINT chk_statements_charges_positive CHECK (charges_cents >= 0),
  CONSTRAINT chk_statements_payments_positive CHECK (payments_cents >= 0),
  CONSTRAINT chk_statements_late_fees_positive CHECK (late_fees_cents >= 0),
  -- Verify closing balance = opening + charges - payments + adjustments + late_fees
  CONSTRAINT chk_statements_closing_balance CHECK (
    closing_balance_cents = opening_balance_cents + charges_cents - payments_cents + adjustments_cents + late_fees_cents
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_statements_tenant_number
  ON billing_account_statements (tenant_id, statement_number);
CREATE INDEX IF NOT EXISTS idx_statements_tenant_billing_account
  ON billing_account_statements (tenant_id, billing_account_id);
CREATE INDEX IF NOT EXISTS idx_statements_tenant_customer
  ON billing_account_statements (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_statements_tenant_status
  ON billing_account_statements (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_statements_tenant_due_date
  ON billing_account_statements (tenant_id, due_date);
-- Prevent overlapping statement periods for the same billing account
CREATE UNIQUE INDEX IF NOT EXISTS uq_statements_tenant_account_period
  ON billing_account_statements (tenant_id, billing_account_id, period_start, period_end)
  WHERE status != 'void';

-- ── 4. Tender signature storage on payment sessions ──
ALTER TABLE fnb_payment_sessions
  ADD COLUMN IF NOT EXISTS house_account_id       TEXT REFERENCES billing_accounts(id),
  ADD COLUMN IF NOT EXISTS house_customer_id      TEXT REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS house_signature_data   TEXT;

COMMENT ON COLUMN fnb_payment_sessions.house_account_id IS 'Billing account ID for house account tenders (CMAA traceability)';
COMMENT ON COLUMN fnb_payment_sessions.house_customer_id IS 'Customer ID for house account tenders';
COMMENT ON COLUMN fnb_payment_sessions.house_signature_data IS 'Base64 SVG signature data for house account chit (CMAA signed chit requirement)';

-- Signature data length guard: base64 SVG signatures should be well under 100KB
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fnb_payment_sessions_sig_length') THEN
    ALTER TABLE fnb_payment_sessions
      ADD CONSTRAINT chk_fnb_payment_sessions_sig_length
        CHECK (house_signature_data IS NULL OR length(house_signature_data) <= 100000);
  END IF;

  -- house_account_id and house_customer_id must both be set or both null
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fnb_payment_sessions_house_pair') THEN
    ALTER TABLE fnb_payment_sessions
      ADD CONSTRAINT chk_fnb_payment_sessions_house_pair
        CHECK (
          (house_account_id IS NULL AND house_customer_id IS NULL)
          OR (house_account_id IS NOT NULL AND house_customer_id IS NOT NULL)
        );
  END IF;
END $$;

-- Index for house account lookups (billing reconciliation, dispute resolution)
CREATE INDEX IF NOT EXISTS idx_fnb_payment_sessions_house_account
  ON fnb_payment_sessions (house_account_id) WHERE house_account_id IS NOT NULL;

-- ── 5. RLS on new tables (FORCE prevents table owner bypass) ──
ALTER TABLE ar_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_disputes FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_account_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_account_statements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ar_disputes_tenant_isolation ON ar_disputes;
CREATE POLICY ar_disputes_tenant_isolation ON ar_disputes
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS billing_account_statements_tenant_isolation ON billing_account_statements;
CREATE POLICY billing_account_statements_tenant_isolation ON billing_account_statements
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
