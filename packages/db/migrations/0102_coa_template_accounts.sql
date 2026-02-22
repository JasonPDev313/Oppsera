-- Session 42: Add Tips Payable (2160) and Service Charge Revenue (4500) to all COA templates
-- These accounts support the GL posting categories added in Sessions 37-38.

-- ── Golf Default ────────────────────────────────────────────
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  ('gat_2160', 'golf_default', '2160', 'Tips Payable', 'liability', 'credit', 'Accrued Liabilities', false, NULL, 225),
  ('gat_4500', 'golf_default', '4500', 'Service Charge Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 495)
ON CONFLICT DO NOTHING;

-- ── Retail Default ──────────────────────────────────────────
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  ('rat_2160', 'retail_default', '2160', 'Tips Payable', 'liability', 'credit', 'Accrued Liabilities', false, NULL, 225),
  ('rat_4500', 'retail_default', '4500', 'Service Charge Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 495)
ON CONFLICT DO NOTHING;

-- ── Restaurant Default ──────────────────────────────────────
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  ('rest_2160', 'restaurant_default', '2160', 'Tips Payable', 'liability', 'credit', 'Accrued Liabilities', false, NULL, 225),
  ('rest_4500', 'restaurant_default', '4500', 'Service Charge Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 495)
ON CONFLICT DO NOTHING;

-- ── Hybrid Default ──────────────────────────────────────────
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  ('hyb_2160', 'hybrid_default', '2160', 'Tips Payable', 'liability', 'credit', 'Accrued Liabilities', false, NULL, 225),
  ('hyb_4500', 'hybrid_default', '4500', 'Service Charge Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 495)
ON CONFLICT DO NOTHING;

-- ── PMS Default ─────────────────────────────────────────────
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  ('pat_2160', 'pms_default', '2160', 'Tips Payable', 'liability', 'credit', 'Accrued Liabilities', false, NULL, 245),
  ('pat_4500', 'pms_default', '4500', 'Service Charge Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 505)
ON CONFLICT DO NOTHING;
