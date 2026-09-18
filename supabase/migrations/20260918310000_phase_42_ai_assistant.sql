/* Phase 42: AI ops assistant MVP (ops-only).

Optional chat history for staff Q&A about stock / customers / invoices.
Grounding RPC returns compact counts + recent/matched catalog titles.
Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- ai_chat_threads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'New chat'
    CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  created_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_chat_threads_created_by_updated_idx
  ON public.ai_chat_threads (created_by, updated_at DESC);

DROP TRIGGER IF EXISTS ai_chat_threads_updated_at ON public.ai_chat_threads;
CREATE TRIGGER ai_chat_threads_updated_at
BEFORE UPDATE ON public.ai_chat_threads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_chat_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_select_ai_chat_threads ON public.ai_chat_threads;
CREATE POLICY ops_select_ai_chat_threads
  ON public.ai_chat_threads FOR SELECT TO authenticated
  USING ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS ops_insert_ai_chat_threads ON public.ai_chat_threads;
CREATE POLICY ops_insert_ai_chat_threads
  ON public.ai_chat_threads FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_ops_user())
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS ops_update_ai_chat_threads ON public.ai_chat_threads;
CREATE POLICY ops_update_ai_chat_threads
  ON public.ai_chat_threads FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_ops_user())
    AND created_by = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT private.is_ops_user())
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS ops_delete_ai_chat_threads ON public.ai_chat_threads;
CREATE POLICY ops_delete_ai_chat_threads
  ON public.ai_chat_threads FOR DELETE TO authenticated
  USING (
    (SELECT private.is_ops_user())
    AND created_by = (SELECT auth.uid())
  );

REVOKE ALL ON public.ai_chat_threads FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_chat_threads TO authenticated;

-- ---------------------------------------------------------------------------
-- ai_chat_messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.ai_chat_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 50000),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_chat_messages_thread_created_idx
  ON public.ai_chat_messages (thread_id, created_at);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_select_ai_chat_messages ON public.ai_chat_messages;
CREATE POLICY ops_select_ai_chat_messages
  ON public.ai_chat_messages FOR SELECT TO authenticated
  USING (
    (SELECT private.is_ops_user())
    AND EXISTS (
      SELECT 1
      FROM public.ai_chat_threads t
      WHERE t.id = thread_id
        AND t.created_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS ops_insert_ai_chat_messages ON public.ai_chat_messages;
CREATE POLICY ops_insert_ai_chat_messages
  ON public.ai_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_ops_user())
    AND EXISTS (
      SELECT 1
      FROM public.ai_chat_threads t
      WHERE t.id = thread_id
        AND t.created_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS ops_delete_ai_chat_messages ON public.ai_chat_messages;
CREATE POLICY ops_delete_ai_chat_messages
  ON public.ai_chat_messages FOR DELETE TO authenticated
  USING (
    (SELECT private.is_ops_user())
    AND EXISTS (
      SELECT 1
      FROM public.ai_chat_threads t
      WHERE t.id = thread_id
        AND t.created_by = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.ai_chat_messages FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.ai_chat_messages TO authenticated;

-- ---------------------------------------------------------------------------
-- Grounding RPC (counts + recent / title search)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ai_ops_grounding(p_query text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q text := nullif(trim(coalesce(p_query, '')), '');
  like_q text;
  result jsonb;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  IF q IS NOT NULL THEN
    like_q := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  SELECT jsonb_build_object(
    'counts', jsonb_build_object(
      'parts', (SELECT count(*)::int FROM public.parts),
      'vehicles', (SELECT count(*)::int FROM public.vehicles),
      'customers', (SELECT count(*)::int FROM public.customers),
      'invoices_open', (
        SELECT count(*)::int
        FROM public.invoices
        WHERE status IS DISTINCT FROM 'cancelled'
          AND document_type IN ('tax_invoice', 'commercial_invoice')
          AND coalesce(balance_due, 0) > 0
      ),
      'invoices_total', (
        SELECT count(*)::int
        FROM public.invoices
        WHERE status IS DISTINCT FROM 'cancelled'
      )
    ),
    'recent_vehicles', coalesce((
      SELECT jsonb_agg(row_to_json(v)::jsonb)
      FROM (
        SELECT
          id,
          title,
          make,
          model,
          year,
          stock_status,
          stock_origin,
          chassis_number,
          stock_number,
          lifecycle_stage,
          created_at
        FROM public.vehicles
        ORDER BY created_at DESC
        LIMIT 8
      ) v
    ), '[]'::jsonb),
    'matched_vehicles', CASE
      WHEN like_q IS NULL THEN '[]'::jsonb
      ELSE coalesce((
        SELECT jsonb_agg(row_to_json(v)::jsonb)
        FROM (
          SELECT
            id,
            title,
            make,
            model,
            year,
            stock_status,
            chassis_number,
            stock_number
          FROM public.vehicles
          WHERE title ILIKE like_q ESCAPE '\'
             OR make ILIKE like_q ESCAPE '\'
             OR model ILIKE like_q ESCAPE '\'
             OR coalesce(chassis_number, '') ILIKE like_q ESCAPE '\'
             OR coalesce(stock_number, '') ILIKE like_q ESCAPE '\'
          ORDER BY created_at DESC
          LIMIT 8
        ) v
      ), '[]'::jsonb)
    END,
    'matched_parts', CASE
      WHEN like_q IS NULL THEN '[]'::jsonb
      ELSE coalesce((
        SELECT jsonb_agg(row_to_json(p)::jsonb)
        FROM (
          SELECT
            id,
            part_code,
            name,
            brand,
            stock_status,
            quantity,
            price,
            currency
          FROM public.parts
          WHERE name ILIKE like_q ESCAPE '\'
             OR part_code ILIKE like_q ESCAPE '\'
             OR coalesce(brand, '') ILIKE like_q ESCAPE '\'
             OR coalesce(part_number, '') ILIKE like_q ESCAPE '\'
          ORDER BY created_at DESC
          LIMIT 8
        ) p
      ), '[]'::jsonb)
    END,
    'matched_customers', CASE
      WHEN like_q IS NULL THEN '[]'::jsonb
      ELSE coalesce((
        SELECT jsonb_agg(row_to_json(c)::jsonb)
        FROM (
          SELECT
            id,
            customer_code,
            full_name,
            company_name,
            country,
            email
          FROM public.customers
          WHERE full_name ILIKE like_q ESCAPE '\'
             OR coalesce(company_name, '') ILIKE like_q ESCAPE '\'
             OR customer_code ILIKE like_q ESCAPE '\'
             OR coalesce(email, '') ILIKE like_q ESCAPE '\'
          ORDER BY updated_at DESC
          LIMIT 6
        ) c
      ), '[]'::jsonb)
    END,
    'matched_invoices', CASE
      WHEN like_q IS NULL THEN '[]'::jsonb
      ELSE coalesce((
        SELECT jsonb_agg(row_to_json(i)::jsonb)
        FROM (
          SELECT
            id,
            invoice_number,
            document_type,
            status,
            customer_name,
            customer_company,
            currency,
            total_amount,
            balance_due,
            issue_date
          FROM public.invoices
          WHERE invoice_number ILIKE like_q ESCAPE '\'
             OR customer_name ILIKE like_q ESCAPE '\'
             OR coalesce(customer_company, '') ILIKE like_q ESCAPE '\'
          ORDER BY issue_date DESC NULLS LAST, created_at DESC
          LIMIT 6
        ) i
      ), '[]'::jsonb)
    END
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_ops_grounding(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_ops_grounding(text) TO authenticated;

-- Guard: do not introduce a zero-arg is_workspace_user overload.
DO $$
DECLARE
  overload_count integer;
BEGIN
  SELECT count(*) INTO overload_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'is_workspace_user';

  IF overload_count <> 1 THEN
    RAISE EXCEPTION
      'private.is_workspace_user overload count = %, expected 1',
      overload_count;
  END IF;
END;
$$;
