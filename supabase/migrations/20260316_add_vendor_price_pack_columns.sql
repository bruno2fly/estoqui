-- Add pack/case columns to vendor_prices table
-- These columns support case-based pricing from vendor catalogs
-- e.g. "Detergente Ype Coco Fr 24 X 500ML" = 24 units per case at $27.99

ALTER TABLE vendor_prices
  ADD COLUMN IF NOT EXISTS pack_type     TEXT DEFAULT 'UNIT',
  ADD COLUMN IF NOT EXISTS units_per_case INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_descriptor TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS price_basis   TEXT DEFAULT 'PER_UNIT',
  ADD COLUMN IF NOT EXISTS unit_cost     NUMERIC;

-- unit_cost = effective per-unit price
-- For CASE + PER_CASE: unit_cost = price / units_per_case
-- For UNIT + PER_UNIT: unit_cost = price

COMMENT ON COLUMN vendor_prices.pack_type IS 'CASE or UNIT';
COMMENT ON COLUMN vendor_prices.units_per_case IS 'Number of units in a case (e.g. 24)';
COMMENT ON COLUMN vendor_prices.unit_descriptor IS 'Description of each unit (e.g. "12 oz bottle", "500ml")';
COMMENT ON COLUMN vendor_prices.price_basis IS 'PER_CASE or PER_UNIT - what the price column represents';
COMMENT ON COLUMN vendor_prices.unit_cost IS 'Effective per-unit cost (derived from price / units_per_case for case pricing)';
