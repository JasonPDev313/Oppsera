-- Add tax exempt fields to orders
ALTER TABLE orders
  ADD COLUMN tax_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN tax_exempt_reason text;
