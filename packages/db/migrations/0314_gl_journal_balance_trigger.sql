-- 0314_gl_journal_balance_trigger.sql
-- Deferred constraint trigger: each posted journal entry must balance on commit.
-- Deferred (INITIALLY DEFERRED) so bulk line inserts within one transaction work.
-- Only enforces on posted entries — drafts are allowed to be unbalanced.

CREATE OR REPLACE FUNCTION fn_check_journal_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total_debit  NUMERIC;
  v_total_credit NUMERIC;
  v_status       TEXT;
  v_entry_id     TEXT;
BEGIN
  v_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

  SELECT status INTO v_status
  FROM gl_journal_entries
  WHERE id = v_entry_id;

  -- Only enforce on posted entries
  IF v_status IS NULL OR v_status != 'posted' THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM gl_journal_lines
  WHERE journal_entry_id = v_entry_id;

  IF ABS(v_total_debit - v_total_credit) >= 0.01 THEN
    RAISE EXCEPTION 'Journal entry % is unbalanced: debits=% credits=%',
      v_entry_id,
      v_total_debit,
      v_total_credit;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tg_gl_journal_lines_balance'
  ) THEN
    CREATE CONSTRAINT TRIGGER tg_gl_journal_lines_balance
    AFTER INSERT OR UPDATE OR DELETE ON gl_journal_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_check_journal_balance();
  END IF;
END;
$$;
