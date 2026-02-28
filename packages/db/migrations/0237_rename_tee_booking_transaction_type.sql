-- 0237_rename_tee_booking_transaction_type.sql
-- Renames the 'tee_booking' transaction type code to 'tee_time'
-- to match the table rename done in migration 0088

UPDATE gl_transaction_types
SET code = 'tee_time', name = 'Tee Times', updated_at = NOW()
WHERE code = 'tee_booking';
