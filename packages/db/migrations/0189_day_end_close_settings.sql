-- Migration 0189: Add day-end close settings to accounting_settings
-- dayEndCloseEnabled: whether the system runs day-end close automatically
-- dayEndCloseTime: HH:MM in tenant timezone when day-end close triggers

ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS day_end_close_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS day_end_close_time TEXT DEFAULT '23:00';
