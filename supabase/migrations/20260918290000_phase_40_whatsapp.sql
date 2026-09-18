/* Phase 40: WhatsApp Business Cloud API MVP — outbound message log.

Ops-only via private.is_ops_user() (admin/staff). Sales cannot read or write.

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- Outbound / inbound message audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound')),
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'template')),
  to_phone text NOT NULL
    CHECK (char_length(btrim(to_phone)) BETWEEN 8 AND 20),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  template_name text
    CHECK (template_name IS NULL OR char_length(btrim(template_name)) BETWEEN 1 AND 120),
  body text
    CHECK (body IS NULL OR char_length(body) <= 4096),
  wa_message_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'read')),
  error_message text
    CHECK (error_message IS NULL OR char_length(error_message) <= 2000),
  raw_response jsonb,
  sent_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_message_log_created_at_idx
  ON public.whatsapp_message_log (created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_message_log_to_phone_idx
  ON public.whatsapp_message_log (to_phone);

CREATE INDEX IF NOT EXISTS whatsapp_message_log_customer_id_idx
  ON public.whatsapp_message_log (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_message_log_sent_by_idx
  ON public.whatsapp_message_log (sent_by)
  WHERE sent_by IS NOT NULL;

ALTER TABLE public.whatsapp_message_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_select_whatsapp_message_log ON public.whatsapp_message_log;
CREATE POLICY ops_select_whatsapp_message_log
  ON public.whatsapp_message_log FOR SELECT TO authenticated
  USING ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS ops_insert_whatsapp_message_log ON public.whatsapp_message_log;
CREATE POLICY ops_insert_whatsapp_message_log
  ON public.whatsapp_message_log FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_ops_user()));

-- Service role (Edge Function) bypasses RLS; no UPDATE/DELETE for clients.
REVOKE ALL ON public.whatsapp_message_log FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.whatsapp_message_log TO authenticated;

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
