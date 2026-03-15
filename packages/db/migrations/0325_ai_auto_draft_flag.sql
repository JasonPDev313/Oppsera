-- 0325: Seed auto_draft_enabled feature flag definition
-- This allows platform admins to toggle AI auto-draft per tenant.

INSERT INTO feature_flag_definitions (id, flag_key, display_name, description, module_key, risk_level, is_active)
VALUES (
  'flag_auto_draft_enabled',
  'auto_draft_enabled',
  'AI Auto-Draft Answer Cards',
  'Automatically create draft answer cards from high-confidence AI assistant answers. Drafts appear in the Answer Cards admin page for human review before activation.',
  'ai_support',
  'low',
  true
)
ON CONFLICT (flag_key) DO NOTHING;
