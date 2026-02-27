-- Migration 0222: Add target_business_types to semantic_lenses
-- Allows super admins to restrict lenses to specific business verticals.
-- NULL = available to all business types.

ALTER TABLE semantic_lenses
  ADD COLUMN IF NOT EXISTS target_business_types TEXT[];
