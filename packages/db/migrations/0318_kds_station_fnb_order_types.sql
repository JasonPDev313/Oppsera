-- Migration 0318: Ensure KDS stations accept F&B order types
--
-- Stations with non-empty allowed_order_types that are missing F&B tab types
-- (dine_in, bar, takeout, quick_service) will silently reject F&B POS dispatches
-- while retail POS (which sends orderType=undefined) bypasses the filter entirely.
-- This adds the missing F&B types to any station that has a restricted list.

UPDATE fnb_kitchen_stations
SET allowed_order_types = (
  SELECT array_agg(DISTINCT t ORDER BY t)
  FROM unnest(
    allowed_order_types || ARRAY['dine_in', 'bar', 'takeout', 'quick_service']
  ) AS t
),
updated_at = NOW()
WHERE array_length(allowed_order_types, 1) > 0
  AND NOT (allowed_order_types @> ARRAY['dine_in', 'bar', 'takeout', 'quick_service']);
