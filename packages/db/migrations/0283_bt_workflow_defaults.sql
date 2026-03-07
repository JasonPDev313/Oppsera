-- Add workflow_defaults jsonb column to business_type_accounting_templates
ALTER TABLE business_type_accounting_templates
  ADD COLUMN IF NOT EXISTS workflow_defaults jsonb NOT NULL DEFAULT '{}';
