-- Session 45: Voucher GL audit trail columns
ALTER TABLE voucher_ledger_entries ADD COLUMN IF NOT EXISTS gl_journal_entry_id TEXT;
ALTER TABLE voucher_expiration_income ADD COLUMN IF NOT EXISTS gl_journal_entry_id TEXT;
