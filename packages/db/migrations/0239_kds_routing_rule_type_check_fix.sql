-- Migration 0239: Fix fnb_kitchen_routing_rules rule_type CHECK constraint
-- The original migration 0082 restricted rule_type to ('item','modifier','department').
-- Migration 0209 added category_id and sub_department routing support but didn't update the constraint.
-- The Drizzle schema, Zod validation, and UI all support 5 rule types.

DO $$
BEGIN
  -- Drop existing check constraint (name may vary)
  ALTER TABLE fnb_kitchen_routing_rules DROP CONSTRAINT IF EXISTS fnb_kitchen_routing_rules_rule_type_check;

  -- Add updated constraint with all 5 rule types
  ALTER TABLE fnb_kitchen_routing_rules ADD CONSTRAINT fnb_kitchen_routing_rules_rule_type_check
    CHECK (rule_type IN ('item', 'modifier', 'department', 'sub_department', 'category'));
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist yet (migration 0082 not run) — skip
    NULL;
END $$;
