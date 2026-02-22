-- UXOPS-07: Tax Jurisdiction Enrichment
-- Adds jurisdiction/authority dimensions to tax_rates for remittance reporting.

ALTER TABLE tax_rates ADD COLUMN jurisdiction_code TEXT;
ALTER TABLE tax_rates ADD COLUMN authority_name TEXT;
ALTER TABLE tax_rates ADD COLUMN authority_type TEXT; -- 'state' | 'county' | 'city' | 'district'
ALTER TABLE tax_rates ADD COLUMN tax_type TEXT NOT NULL DEFAULT 'sales'; -- 'sales' | 'excise' | 'hospitality' | 'use'
ALTER TABLE tax_rates ADD COLUMN filing_frequency TEXT; -- 'monthly' | 'quarterly' | 'annual'

-- Index for jurisdiction-based reporting queries
CREATE INDEX idx_tax_rates_jurisdiction ON tax_rates (tenant_id, jurisdiction_code) WHERE jurisdiction_code IS NOT NULL;
CREATE INDEX idx_tax_rates_authority_type ON tax_rates (tenant_id, authority_type) WHERE authority_type IS NOT NULL;
