/* Phase 58: Tawk.to live-chat webhook mirror for admin+manager.

Stores chat start/end (and optional ticket) events from Tawk webhooks so
/admin/live-chat can show open sessions + a needs-attention list without
embedding the Tawk dashboard.

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- Helpers (match canAccessLiveChat in lib/admin-rbac.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_access_live_chat()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true
      AND role IN ('admin', 'manager')
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_live_chat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_live_chat() TO authenticated;

COMMENT ON FUNCTION private.can_access_live_chat() IS
  'Phase 58: true when caller is active admin|manager — Tawk live-chat inbox.';

-- ---------------------------------------------------------------------------
-- Dedup receipts (X-Hook-Event-Id survives retries)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tawk_webhook_receipts (
  hook_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tawk_webhook_receipts_hook_event_id_len CHECK (char_length(hook_event_id) BETWEEN 1 AND 200),
  CONSTRAINT tawk_webhook_receipts_event_type_len CHECK (char_length(event_type) BETWEEN 1 AND 80)
);

ALTER TABLE public.tawk_webhook_receipts ENABLE ROW LEVEL SECURITY;

-- No authenticated policies — service role (Edge Function) only.
REVOKE ALL ON public.tawk_webhook_receipts FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.tawk_webhook_receipts IS
  'Phase 58: Tawk webhook delivery dedup by X-Hook-Event-Id. Writes via Edge tawk-webhook only.';

-- ---------------------------------------------------------------------------
-- Chat sessions (upserted from chat:start / chat:end)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tawk_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  property_id text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ended')),
  visitor_name text,
  visitor_email text,
  visitor_city text,
  visitor_country text,
  domain text,
  referrer text,
  first_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_event_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  last_hook_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tawk_chat_sessions_chat_id_len CHECK (char_length(btrim(chat_id)) BETWEEN 1 AND 120),
  CONSTRAINT tawk_chat_sessions_property_id_len CHECK (property_id IS NULL OR char_length(property_id) <= 80),
  CONSTRAINT tawk_chat_sessions_visitor_name_len CHECK (visitor_name IS NULL OR char_length(visitor_name) <= 200),
  CONSTRAINT tawk_chat_sessions_visitor_email_len CHECK (visitor_email IS NULL OR char_length(visitor_email) <= 320),
  CONSTRAINT tawk_chat_sessions_first_message_len CHECK (first_message IS NULL OR char_length(first_message) <= 2000),
  CONSTRAINT tawk_chat_sessions_chat_id_unique UNIQUE (chat_id)
);

CREATE INDEX IF NOT EXISTS tawk_chat_sessions_needs_attention_idx
  ON public.tawk_chat_sessions (last_event_at DESC)
  WHERE status = 'open' AND dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS tawk_chat_sessions_status_idx
  ON public.tawk_chat_sessions (status, last_event_at DESC);

ALTER TABLE public.tawk_chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_chat_select_tawk_sessions ON public.tawk_chat_sessions;
CREATE POLICY live_chat_select_tawk_sessions
  ON public.tawk_chat_sessions FOR SELECT TO authenticated
  USING ((SELECT private.can_access_live_chat()));

DROP POLICY IF EXISTS live_chat_update_tawk_sessions ON public.tawk_chat_sessions;
CREATE POLICY live_chat_update_tawk_sessions
  ON public.tawk_chat_sessions FOR UPDATE TO authenticated
  USING ((SELECT private.can_access_live_chat()))
  WITH CHECK ((SELECT private.can_access_live_chat()));

REVOKE ALL ON public.tawk_chat_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.tawk_chat_sessions TO authenticated;

COMMENT ON TABLE public.tawk_chat_sessions IS
  'Phase 58: mirrored Tawk chat sessions from webhooks. Inserts via Edge tawk-webhook; admin|manager may SELECT and dismiss.';

-- ---------------------------------------------------------------------------
-- Tickets (optional ticket:create events)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tawk_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id text NOT NULL,
  human_id integer,
  subject text,
  message_preview text,
  requester_name text,
  requester_email text,
  property_id text,
  event_time timestamptz NOT NULL DEFAULT now(),
  hook_event_id text,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tawk_ticket_events_ticket_id_len CHECK (char_length(btrim(ticket_id)) BETWEEN 1 AND 120),
  CONSTRAINT tawk_ticket_events_subject_len CHECK (subject IS NULL OR char_length(subject) <= 500),
  CONSTRAINT tawk_ticket_events_message_preview_len CHECK (message_preview IS NULL OR char_length(message_preview) <= 2000),
  CONSTRAINT tawk_ticket_events_ticket_id_unique UNIQUE (ticket_id)
);

CREATE INDEX IF NOT EXISTS tawk_ticket_events_event_time_idx
  ON public.tawk_ticket_events (event_time DESC);

ALTER TABLE public.tawk_ticket_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_chat_select_tawk_tickets ON public.tawk_ticket_events;
CREATE POLICY live_chat_select_tawk_tickets
  ON public.tawk_ticket_events FOR SELECT TO authenticated
  USING ((SELECT private.can_access_live_chat()));

DROP POLICY IF EXISTS live_chat_update_tawk_tickets ON public.tawk_ticket_events;
CREATE POLICY live_chat_update_tawk_tickets
  ON public.tawk_ticket_events FOR UPDATE TO authenticated
  USING ((SELECT private.can_access_live_chat()))
  WITH CHECK ((SELECT private.can_access_live_chat()));

REVOKE ALL ON public.tawk_ticket_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.tawk_ticket_events TO authenticated;

COMMENT ON TABLE public.tawk_ticket_events IS
  'Phase 58: Tawk ticket:create webhook mirror. Inserts via Edge tawk-webhook; admin|manager SELECT/dismiss.';

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
