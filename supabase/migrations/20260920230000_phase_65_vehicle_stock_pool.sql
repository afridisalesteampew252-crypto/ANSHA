-- Phase 65: separate owned inventory vs third-party auction stock (additive).

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS stock_pool text NOT NULL DEFAULT 'owned';

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_stock_pool_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_stock_pool_check
  CHECK (stock_pool IN ('owned', 'auction_third_party'));

COMMENT ON COLUMN public.vehicles.stock_pool IS
  'owned = ANSHA purchased inventory; auction_third_party = auction/yard listings not yet bought into stock.';

CREATE INDEX IF NOT EXISTS vehicles_stock_pool_idx
  ON public.vehicles (stock_pool);

CREATE INDEX IF NOT EXISTS vehicles_stock_pool_status_idx
  ON public.vehicles (stock_pool, stock_status, created_at DESC);

-- Japan-origin catalog uploads are third-party auction stock until purchased into inventory.
-- Dubai / other yards with explicit purchase stay owned (default).
UPDATE public.vehicles
SET stock_pool = 'auction_third_party'
WHERE stock_origin = 'japan'
  AND stock_pool = 'owned';
