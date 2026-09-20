/* Phase 76: Freight Charges configuration master (ops + accounts write; workspace read). */

CREATE TABLE IF NOT EXISTS public.freight_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_country text NOT NULL CHECK (char_length(btrim(source_country)) BETWEEN 1 AND 120),
  source_port text CHECK (source_port IS NULL OR char_length(btrim(source_port)) BETWEEN 1 AND 120),
  destination_country text NOT NULL CHECK (char_length(btrim(destination_country)) BETWEEN 1 AND 120),
  destination_port text CHECK (destination_port IS NULL OR char_length(btrim(destination_port)) BETWEEN 1 AND 120),
  shipment_type text NOT NULL CHECK (
    shipment_type IN ('dhl', 'roro', 'container_20ft', 'container_40ft')
  ),
  freight_charge numeric(14, 2) NOT NULL CHECK (freight_charge >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (char_length(btrim(currency)) BETWEEN 1 AND 8),
  shipping_company text CHECK (
    shipping_company IS NULL OR char_length(btrim(shipping_company)) BETWEEN 1 AND 160
  ),
  contact_person text CHECK (
    contact_person IS NULL OR char_length(btrim(contact_person)) BETWEEN 1 AND 120
  ),
  contact_number text CHECK (
    contact_number IS NULL OR char_length(btrim(contact_number)) BETWEEN 1 AND 60
  ),
  email text CHECK (email IS NULL OR char_length(btrim(email)) BETWEEN 3 AND 160),
  website text CHECK (website IS NULL OR char_length(btrim(website)) BETWEEN 3 AND 240),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS freight_charges_active_idx
  ON public.freight_charges (is_active, sort_order, source_country, destination_country);

CREATE INDEX IF NOT EXISTS freight_charges_route_idx
  ON public.freight_charges (source_country, destination_country, shipment_type);

CREATE INDEX IF NOT EXISTS freight_charges_company_idx
  ON public.freight_charges (shipping_company)
  WHERE shipping_company IS NOT NULL;

COMMENT ON TABLE public.freight_charges IS
  'Phase 76: freight charge rates by route / shipment type / shipping company (Configuration).';

DROP TRIGGER IF EXISTS freight_charges_updated_at ON public.freight_charges;
CREATE TRIGGER freight_charges_updated_at
BEFORE UPDATE ON public.freight_charges
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.freight_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_select_freight_charges ON public.freight_charges;
CREATE POLICY workspace_select_freight_charges
  ON public.freight_charges FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS receivables_write_freight_charges ON public.freight_charges;
CREATE POLICY receivables_write_freight_charges
  ON public.freight_charges FOR ALL TO authenticated
  USING ((SELECT private.can_manage_receivables()))
  WITH CHECK ((SELECT private.can_manage_receivables()));

REVOKE ALL ON public.freight_charges FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freight_charges TO authenticated;
