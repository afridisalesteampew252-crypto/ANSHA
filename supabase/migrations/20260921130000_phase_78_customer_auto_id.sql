-- Phase 78: auto-generate numeric Customer ID (customer_code) + consignee fields.
-- Additive only. Existing customer_code values are preserved.

CREATE SEQUENCE IF NOT EXISTS public.customer_code_seq;

-- New IDs start in the human-readable 48xxx range used by ops reference UIs.
-- Sequence is advanced past any existing numeric codes.
SELECT setval(
  'public.customer_code_seq',
  GREATEST(
    48000,
    COALESCE(
      (
        SELECT MAX(customer_code::bigint)
        FROM public.customers
        WHERE customer_code ~ '^[0-9]+$'
      ),
      0
    )
  )
);

ALTER TABLE public.customers
  ALTER COLUMN customer_code SET DEFAULT nextval('public.customer_code_seq')::text;

CREATE OR REPLACE FUNCTION private.prepare_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.customer_code IS NULL OR btrim(NEW.customer_code) = '' THEN
    NEW.customer_code := nextval('public.customer_code_seq')::text;
  ELSE
    NEW.customer_code := btrim(NEW.customer_code);
  END IF;

  NEW.full_name := btrim(NEW.full_name);

  IF NEW.company_name IS NOT NULL THEN
    NEW.company_name := nullif(btrim(NEW.company_name), '');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_prepare ON public.customers;
CREATE TRIGGER customers_prepare
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION private.prepare_customer();

REVOKE ALL ON FUNCTION private.prepare_customer() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS consignee_name text,
  ADD COLUMN IF NOT EXISTS consignee_company text,
  ADD COLUMN IF NOT EXISTS consignee_phone text,
  ADD COLUMN IF NOT EXISTS consignee_email text,
  ADD COLUMN IF NOT EXISTS consignee_address text,
  ADD COLUMN IF NOT EXISTS consignee_country text,
  ADD COLUMN IF NOT EXISTS consignee_notes text;

COMMENT ON COLUMN public.customers.customer_code IS
  'Human-readable Customer ID; auto-assigned from customer_code_seq when omitted.';
COMMENT ON COLUMN public.customers.consignee_name IS
  'Optional shipping consignee contact name.';

GRANT USAGE, SELECT ON SEQUENCE public.customer_code_seq TO authenticated;
