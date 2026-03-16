-- Retroactively detect CASE pricing from product names
-- Parses patterns like "24 X 500ML", "06X500ml", "12 x 1L" in product names
-- and updates vendor_prices with pack_type, units_per_case, and unit_cost
--
-- IMPORTANT: Requires a volume/weight unit (ml, l, g, kg, oz, lb, lts, gal)
-- after the second number to avoid false positives on dimensions like "45X75" (cloth),
-- "2X3" (flags), "13X7X17" (bags), etc.

-- The key regex: (\d{1,4})\s*[xX×]\s*\d+(?:\.\d+)?\s*(?:oz|ml|l|lts?|g|gr|kg|lb|lbs?|gal)
-- This matches: "24 X 500ML", "06X500ml", "12 x 1L", "24 x 12 oz"
-- Does NOT match: "45X75" (no unit), "2X3" (no unit), "13X7X17" (no unit)

UPDATE vendor_prices vp
SET
  pack_type = 'CASE',
  units_per_case = extracted.units::INTEGER,
  price_basis = 'PER_CASE',
  unit_cost = ROUND(vp.price / extracted.units::NUMERIC, 2),
  unit_descriptor = extracted.descriptor
FROM (
  SELECT
    vp2.id AS vp_id,
    -- Extract the case count (number before 'x')
    (regexp_match(
      p.name,
      '(\d{1,4})\s*[xX×]\s*\d+(?:\.\d+)?\s*(?:oz|ml|l|lts?|g|gr|kg|lb|lbs?|gal)',
      'i'
    ))[1] AS units,
    -- Extract the unit descriptor (size + unit after x)
    (regexp_match(
      p.name,
      '\d{1,4}\s*[xX×]\s*(\d+(?:\.\d+)?\s*(?:oz|ml|l|lts?|g|gr|kg|lb|lbs?|gal)[a-z]*)',
      'i'
    ))[1] AS descriptor
  FROM vendor_prices vp2
  JOIN products p ON p.id = vp2.product_id AND p.user_id = vp2.user_id
  WHERE
    -- Only update records that are currently UNIT or NULL
    (vp2.pack_type IS NULL OR vp2.pack_type = 'UNIT')
    -- Product name must have: number X number+UNIT (volume/weight unit required)
    AND p.name ~* '\d{1,4}\s*[xX×]\s*\d+(?:\.\d+)?\s*(?:oz|ml|l|lts?|g|gr|kg|lb|lbs?|gal)'
    -- Case count must be > 1
    AND (regexp_match(
      p.name,
      '(\d{1,4})\s*[xX×]\s*\d+(?:\.\d+)?\s*(?:oz|ml|l|lts?|g|gr|kg|lb|lbs?|gal)',
      'i'
    ))[1]::INTEGER > 1
) AS extracted
WHERE vp.id = extracted.vp_id;
