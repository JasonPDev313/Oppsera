-- Migration 0195: SaaS Pricing Plans & Tenant Subscriptions
-- Platform-scoped tables (no RLS — admin-only access)

-- ── System-wide pricing configuration (one row per tier) ──
CREATE TABLE IF NOT EXISTS pricing_plans (
  id TEXT PRIMARY KEY,
  tier TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  price_per_seat_cents INTEGER NOT NULL DEFAULT 2500,
  max_seats INTEGER,
  base_fee_cents INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Per-module add-on pricing ──
CREATE TABLE IF NOT EXISTS module_pricing (
  id TEXT PRIMARY KEY,
  module_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  price_per_seat_cents INTEGER NOT NULL DEFAULT 0,
  flat_fee_cents INTEGER NOT NULL DEFAULT 0,
  is_addon BOOLEAN NOT NULL DEFAULT false,
  included_in_tiers TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Per-tenant subscription record ──
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) UNIQUE,
  pricing_plan_id TEXT NOT NULL REFERENCES pricing_plans(id),
  seat_count INTEGER NOT NULL DEFAULT 1,
  monthly_total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  addon_module_keys TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Append-only subscription change log ──
CREATE TABLE IF NOT EXISTS subscription_change_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  changed_by TEXT NOT NULL,
  change_type TEXT NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_change_log_tenant
  ON subscription_change_log(tenant_id, created_at DESC);

-- ── Seed default pricing plans ──
INSERT INTO pricing_plans (id, tier, display_name, price_per_seat_cents, max_seats, base_fee_cents, sort_order, features) VALUES
  ('plan_smb',        'SMB',        'Starter',       2500, 5,    0, 1, '["Up to 5 seats", "Automated workflows", "Standard support"]'::jsonb),
  ('plan_mid_market', 'MID_MARKET', 'Professional',  2500, 25,   0, 2, '["Up to 25 seats", "Visible workflows", "Priority support", "Custom reports"]'::jsonb),
  ('plan_enterprise', 'ENTERPRISE', 'Enterprise',    2500, NULL, 0, 3, '["Unlimited seats", "Approval workflows", "Dedicated support", "Full audit trail"]'::jsonb)
ON CONFLICT (tier) DO NOTHING;
