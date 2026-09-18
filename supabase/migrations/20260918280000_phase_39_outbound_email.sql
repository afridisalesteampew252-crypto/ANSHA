/* Phase 39: Outbound email MVP — send log + ops-only RLS.

Transactional compose/send via Edge Function `send-outbound-email` (Resend).
Not a marketing campaign product.

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- Send log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outbound_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  body_preview text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'failed' CHECK (status IN ('sent', 'failed')),
  provider text NOT NULL DEFAULT 'resend' CHECK (char_length(provider) BETWEEN 1 AND 40),
  provider_message_id text,
  error_message text CHECK (error_message IS NULL OR char_length(error_message) <= 2000),
  related_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_email_log_to_email_len CHECK (char_length(btrim(to_email)) BETWEEN 3 AND 320),
  CONSTRAINT outbound_email_log_subject_len CHECK (char_length(btrim(subject)) BETWEEN 1 AND 300),
  CONSTRAINT outbound_email_log_body_preview_len CHECK (char_length(body_preview) <= 500)
);

CREATE INDEX IF NOT EXISTS outbound_email_log_created_at_idx
  ON public.outbound_email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS outbound_email_log_created_by_idx
  ON public.outbound_email_log (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS outbound_email_log_to_email_idx
  ON public.outbound_email_log (lower(to_email), created_at DESC);
CREATE INDEX IF NOT EXISTS outbound_email_log_status_idx
  ON public.outbound_email_log (status, created_at DESC);

ALTER TABLE public.outbound_email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_select_outbound_email_log ON public.outbound_email_log;
CREATE POLICY ops_select_outbound_email_log
  ON public.outbound_email_log FOR SELECT TO authenticated
  USING ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS ops_insert_outbound_email_log ON public.outbound_email_log;
CREATE POLICY ops_insert_outbound_email_log
  ON public.outbound_email_log FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_ops_user())
    AND created_by = (SELECT auth.uid())
  );

-- No UPDATE/DELETE for ops — append-only audit trail.
REVOKE ALL ON public.outbound_email_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.outbound_email_log TO authenticated;

COMMENT ON TABLE public.outbound_email_log IS
  'Phase 39: append-only outbound email send log (ops-only). Provider secrets stay in Edge env.';

-- ---------------------------------------------------------------------------
-- Guard: do not introduce a zero-arg is_workspace_user overload
-- ---------------------------------------------------------------------------
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
