/* Phase 23: customer portal identity + read-only own invoices. Staff auth unchanged. */

CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (char_length(trim(email)) BETWEEN 3 AND 320),
  full_name text CHECK (full_name IS NULL OR char_length(trim(full_name)) BETWEEN 1 AND 160),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_profiles_customer_id_uidx UNIQUE (customer_id)
);

CREATE INDEX IF NOT EXISTS customer_profiles_email_idx
  ON public.customer_profiles (lower(email));

DROP TRIGGER IF EXISTS customer_profiles_updated_at ON public.customer_profiles;
CREATE TRIGGER customer_profiles_updated_at
BEFORE UPDATE ON public.customer_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION private.my_customer_id(check_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT customer_id
  FROM public.customer_profiles
  WHERE id = check_user_id
    AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.is_customer(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.my_customer_id(check_user_id) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION private.my_customer_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_customer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.my_customer_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_customer(uuid) TO authenticated;

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_read_own_profile ON public.customer_profiles;
CREATE POLICY customer_read_own_profile
  ON public.customer_profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS workspace_manage_customer_profiles ON public.customer_profiles;
CREATE POLICY workspace_manage_customer_profiles
  ON public.customer_profiles FOR ALL TO authenticated
  USING ((SELECT private.is_workspace_user()))
  WITH CHECK ((SELECT private.is_workspace_user()));

REVOKE ALL ON public.customer_profiles FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_profiles TO authenticated;

DROP POLICY IF EXISTS customer_read_own_customer ON public.customers;
CREATE POLICY customer_read_own_customer
  ON public.customers FOR SELECT TO authenticated
  USING (id = (SELECT private.my_customer_id()));

DROP POLICY IF EXISTS customer_read_own_invoices ON public.invoices;
CREATE POLICY customer_read_own_invoices
  ON public.invoices FOR SELECT TO authenticated
  USING (
    customer_id = (SELECT private.my_customer_id())
    AND status IS DISTINCT FROM 'draft'
    AND status IS DISTINCT FROM 'cancelled'
  );

DROP POLICY IF EXISTS customer_read_own_invoice_items ON public.invoice_items;
CREATE POLICY customer_read_own_invoice_items
  ON public.invoice_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices inv
      WHERE inv.id = invoice_id
        AND inv.customer_id = (SELECT private.my_customer_id())
        AND inv.status IS DISTINCT FROM 'draft'
        AND inv.status IS DISTINCT FROM 'cancelled'
    )
  );
