-- Allow fnb_kitchen_tickets to be created without a tab (retail POS orders).
ALTER TABLE fnb_kitchen_tickets ALTER COLUMN tab_id DROP NOT NULL;
