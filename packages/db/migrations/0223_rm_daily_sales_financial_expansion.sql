-- Migration 0223: Expand rm_daily_sales with full tender/financial columns
-- Adds columns for gift card, house account, ACH, other tenders,
-- plus tip, service charge, surcharge, and return tracking.

ALTER TABLE rm_daily_sales
  ADD COLUMN IF NOT EXISTS tender_gift_card NUMERIC(19,4) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS tender_house_account NUMERIC(19,4) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS tender_ach NUMERIC(19,4) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS tender_other NUMERIC(19,4) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS tip_total NUMERIC(19,4) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS service_charge_total NUMERIC(19,4) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS surcharge_total NUMERIC(19,4) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS return_total NUMERIC(19,4) NOT NULL DEFAULT '0';
