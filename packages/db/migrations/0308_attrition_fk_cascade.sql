-- 0308: Add ON DELETE CASCADE to attrition_risk_scores FK
-- Without this, deleting a tenant is blocked by orphaned attrition scores.
-- Idempotent: drops existing FK first, then re-adds with CASCADE.

ALTER TABLE attrition_risk_scores
  DROP CONSTRAINT IF EXISTS attrition_risk_scores_tenant_id_tenants_id_fk;

ALTER TABLE attrition_risk_scores
  DROP CONSTRAINT IF EXISTS attrition_risk_scores_tenant_id_fkey;

ALTER TABLE attrition_risk_scores
  ADD CONSTRAINT attrition_risk_scores_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
