-- Step 1: Ensure every location has a "Tax Exempt" tax group (0% — no rates attached).
-- Uses gen_ulid() for IDs. Unique constraint (tenant_id, location_id, name) prevents dupes.

INSERT INTO tax_groups (id, tenant_id, location_id, name, is_active, created_at, updated_at)
SELECT
  gen_ulid(),
  l.tenant_id,
  l.id,
  'Tax Exempt',
  true,
  NOW(),
  NOW()
FROM locations l
WHERE NOT EXISTS (
  SELECT 1 FROM tax_groups tg
  WHERE tg.tenant_id = l.tenant_id
    AND tg.location_id = l.id
    AND tg.name = 'Tax Exempt'
)
ON CONFLICT (tenant_id, location_id, name) DO NOTHING;

-- Step 2: Map all "Tax Exempt" tax groups to their tenant's Sales Tax Payable GL account.
-- Uses control_account_type = 'sales_tax', falling back to most-used mapped account.

INSERT INTO tax_group_gl_defaults (tenant_id, tax_group_id, tax_payable_account_id, created_at, updated_at)
SELECT
  tg.tenant_id,
  tg.id,
  COALESCE(
    (SELECT ga.id FROM gl_accounts ga
     WHERE ga.tenant_id = tg.tenant_id
       AND ga.control_account_type = 'sales_tax'
     LIMIT 1),
    (SELECT gd2.tax_payable_account_id FROM tax_group_gl_defaults gd2
     WHERE gd2.tenant_id = tg.tenant_id
       AND gd2.tax_payable_account_id IS NOT NULL
     GROUP BY gd2.tax_payable_account_id
     ORDER BY COUNT(*) DESC
     LIMIT 1)
  ),
  NOW(),
  NOW()
FROM tax_groups tg
WHERE tg.name = 'Tax Exempt'
  AND tg.is_active = true
  AND (
    EXISTS (SELECT 1 FROM gl_accounts ga WHERE ga.tenant_id = tg.tenant_id AND ga.control_account_type = 'sales_tax')
    OR EXISTS (SELECT 1 FROM tax_group_gl_defaults gd2 WHERE gd2.tenant_id = tg.tenant_id AND gd2.tax_payable_account_id IS NOT NULL)
  )
ON CONFLICT (tenant_id, tax_group_id) DO NOTHING;
