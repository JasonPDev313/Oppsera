-- Session 38: Add tips payable and service charge revenue account settings
ALTER TABLE accounting_settings
  ADD COLUMN default_tips_payable_account_id TEXT REFERENCES gl_accounts(id),
  ADD COLUMN default_service_charge_revenue_account_id TEXT REFERENCES gl_accounts(id);
