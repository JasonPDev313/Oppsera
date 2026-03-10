-- Add checkout notes and folio delivery preference to pms_reservations
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS checkout_notes text;
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS folio_delivery text DEFAULT 'none';

-- Constrain folio_delivery to known values
DO $$ BEGIN
  ALTER TABLE pms_reservations
    ADD CONSTRAINT chk_pms_reservations_folio_delivery
    CHECK (folio_delivery IN ('none', 'email', 'print', 'both'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
