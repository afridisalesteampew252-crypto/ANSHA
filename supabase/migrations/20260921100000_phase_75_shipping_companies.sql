-- Phase 75: Shipping companies configuration (Configuration | Shipping Companies)
-- Additive: company + vessel pairing master (one company may have many vessel rows).

CREATE TABLE IF NOT EXISTS public.shipping_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL CHECK (char_length(btrim(company_name)) BETWEEN 1 AND 120),
  vessel_name text NOT NULL CHECK (char_length(btrim(vessel_name)) BETWEEN 1 AND 120),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shipping_companies IS
  'Configuration master: shipping company + vessel name pairings (many vessels per company).';

CREATE UNIQUE INDEX IF NOT EXISTS shipping_companies_company_vessel_uidx
  ON public.shipping_companies (lower(btrim(company_name)), lower(btrim(vessel_name)));

CREATE INDEX IF NOT EXISTS shipping_companies_active_sort_idx
  ON public.shipping_companies (is_active, sort_order, company_name, vessel_name);

CREATE INDEX IF NOT EXISTS shipping_companies_search_idx
  ON public.shipping_companies (company_name, vessel_name);

ALTER TABLE public.shipping_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_read_shipping_companies ON public.shipping_companies;
CREATE POLICY workspace_read_shipping_companies
  ON public.shipping_companies FOR SELECT
  TO authenticated
  USING ((SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS ops_write_shipping_companies ON public.shipping_companies;
CREATE POLICY ops_write_shipping_companies
  ON public.shipping_companies FOR ALL
  TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));
