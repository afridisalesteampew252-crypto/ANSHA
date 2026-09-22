-- Clear misleading show_price on unpriced published catalog rows.
-- Does not invent prices; only turns off show_price when no list/term amount is > 0.

UPDATE public.parts
SET show_price = false
WHERE show_price = true
  AND COALESCE(price, 0) <= 0
  AND COALESCE(price_fob, 0) <= 0
  AND COALESCE(price_cf, 0) <= 0
  AND COALESCE(price_cif, 0) <= 0;

UPDATE public.vehicles
SET show_price = false
WHERE show_price = true
  AND COALESCE(price, 0) <= 0
  AND COALESCE(price_fob, 0) <= 0
  AND COALESCE(price_cf, 0) <= 0
  AND COALESCE(price_cif, 0) <= 0;
