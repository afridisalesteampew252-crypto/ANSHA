-- Phase 74: Auction yards configuration (Configuration | Yards)
-- Additive: auction_yards master list for ops.

CREATE TABLE IF NOT EXISTS public.auction_yards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_name text NOT NULL CHECK (char_length(btrim(auction_name)) BETWEEN 1 AND 120),
  port text NOT NULL CHECK (char_length(btrim(port)) BETWEEN 1 AND 120),
  yard text NOT NULL CHECK (char_length(btrim(yard)) BETWEEN 1 AND 120),
  tentative_days integer NOT NULL DEFAULT 0 CHECK (tentative_days >= 0 AND tentative_days <= 3650),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.auction_yards IS
  'Configuration master: auction house + port + yard + tentative transit days.';

CREATE UNIQUE INDEX IF NOT EXISTS auction_yards_auction_port_yard_uidx
  ON public.auction_yards (lower(btrim(auction_name)), lower(btrim(port)), lower(btrim(yard)));

CREATE INDEX IF NOT EXISTS auction_yards_active_sort_idx
  ON public.auction_yards (is_active, sort_order, auction_name, yard);

CREATE INDEX IF NOT EXISTS auction_yards_search_idx
  ON public.auction_yards (auction_name, port, yard);

ALTER TABLE public.auction_yards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_read_auction_yards ON public.auction_yards;
CREATE POLICY workspace_read_auction_yards
  ON public.auction_yards FOR SELECT
  TO authenticated
  USING ((SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS ops_write_auction_yards ON public.auction_yards;
CREATE POLICY ops_write_auction_yards
  ON public.auction_yards FOR ALL
  TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));
