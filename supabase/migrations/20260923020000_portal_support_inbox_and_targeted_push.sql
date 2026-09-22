/* Portal support inbox, customer presence, and targeted Web Push. */

CREATE TABLE IF NOT EXISTS public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_profile_id uuid NOT NULL UNIQUE REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT 'Portal support' CHECK (char_length(trim(subject)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved')),
  assigned_to uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_kind text NOT NULL CHECK (sender_kind IN ('customer', 'agent')),
  body text CHECK (body IS NULL OR char_length(trim(body)) BETWEEN 1 AND 4000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.support_messages(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR (size_bytes >= 0 AND size_bytes <= 10485760)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_threads_inbox_idx
  ON public.support_threads (status, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS support_messages_thread_idx
  ON public.support_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS support_attachments_message_idx
  ON public.support_attachments (message_id);

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS notify_support boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS push_subscriptions_user_support_idx
  ON public.push_subscriptions (user_id)
  WHERE notify_support = true AND user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.is_support_agent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles ap
    WHERE ap.id = (SELECT auth.uid())
      AND ap.is_active = true
      AND ap.role IN ('admin', 'staff', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_support_thread(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_threads st
    WHERE st.id = p_thread_id
      AND (
        st.customer_profile_id = (SELECT auth.uid())
        OR private.is_support_agent()
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.touch_support_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.support_threads
  SET last_message_at = NEW.created_at,
      status = CASE WHEN NEW.sender_kind = 'customer' THEN 'open' ELSE status END,
      updated_at = now()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_messages_touch_thread ON public.support_messages;
CREATE TRIGGER support_messages_touch_thread
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION private.touch_support_thread();

DROP TRIGGER IF EXISTS support_threads_updated_at ON public.support_threads;
CREATE TRIGGER support_threads_updated_at
BEFORE UPDATE ON public.support_threads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_threads_select_participant ON public.support_threads;
CREATE POLICY support_threads_select_participant
ON public.support_threads FOR SELECT TO authenticated
USING (customer_profile_id = (SELECT auth.uid()) OR (SELECT private.is_support_agent()));

DROP POLICY IF EXISTS support_threads_customer_insert ON public.support_threads;
CREATE POLICY support_threads_customer_insert
ON public.support_threads FOR INSERT TO authenticated
WITH CHECK (
  customer_profile_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.customer_profiles cp
    WHERE cp.id = (SELECT auth.uid()) AND cp.is_active = true
  )
);

DROP POLICY IF EXISTS support_threads_agent_update ON public.support_threads;
CREATE POLICY support_threads_agent_update
ON public.support_threads FOR UPDATE TO authenticated
USING ((SELECT private.is_support_agent()))
WITH CHECK ((SELECT private.is_support_agent()));

DROP POLICY IF EXISTS support_messages_select_participant ON public.support_messages;
CREATE POLICY support_messages_select_participant
ON public.support_messages FOR SELECT TO authenticated
USING ((SELECT private.can_access_support_thread(thread_id)));

DROP POLICY IF EXISTS support_messages_insert_participant ON public.support_messages;
CREATE POLICY support_messages_insert_participant
ON public.support_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = (SELECT auth.uid())
  AND (SELECT private.can_access_support_thread(thread_id))
  AND (
    (sender_kind = 'agent' AND (SELECT private.is_support_agent()))
    OR
    (sender_kind = 'customer' AND EXISTS (
      SELECT 1 FROM public.support_threads st
      WHERE st.id = thread_id AND st.customer_profile_id = (SELECT auth.uid())
    ))
  )
);

DROP POLICY IF EXISTS support_attachments_select_participant ON public.support_attachments;
CREATE POLICY support_attachments_select_participant
ON public.support_attachments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.support_messages sm
    WHERE sm.id = message_id
      AND private.can_access_support_thread(sm.thread_id)
  )
);

DROP POLICY IF EXISTS support_attachments_insert_participant ON public.support_attachments;
CREATE POLICY support_attachments_insert_participant
ON public.support_attachments FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.support_messages sm
    WHERE sm.id = message_id
      AND sm.sender_id = (SELECT auth.uid())
      AND private.can_access_support_thread(sm.thread_id)
  )
);

REVOKE ALL ON public.support_threads, public.support_messages, public.support_attachments FROM PUBLIC;
GRANT SELECT, INSERT ON public.support_threads TO authenticated;
GRANT UPDATE ON public.support_threads TO authenticated;
GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT SELECT, INSERT ON public.support_attachments TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_customer_last_seen()
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.customer_profiles
  SET last_seen_at = now()
  WHERE id = (SELECT auth.uid()) AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_support_presence()
RETURNS TABLE (online boolean, last_seen_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(max(ap.last_seen_at) > now() - interval '2 minutes', false) AS online,
    max(ap.last_seen_at) AS last_seen_at
  FROM public.admin_profiles ap
  WHERE ap.is_active = true
    AND ap.role IN ('admin', 'staff', 'manager')
    AND EXISTS (
      SELECT 1 FROM public.customer_profiles cp
      WHERE cp.id = (SELECT auth.uid()) AND cp.is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.mark_support_thread_read(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_agent boolean := private.is_support_agent();
BEGIN
  IF NOT private.can_access_support_thread(p_thread_id) THEN
    RAISE EXCEPTION 'Support thread access denied';
  END IF;
  UPDATE public.support_messages
  SET read_at = COALESCE(read_at, now())
  WHERE thread_id = p_thread_id
    AND ((v_is_agent AND sender_kind = 'customer') OR (NOT v_is_agent AND sender_kind = 'agent'));
END;
$$;

REVOKE ALL ON FUNCTION public.touch_customer_last_seen() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_support_presence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_support_thread_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_customer_last_seen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_presence() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_support_thread_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_notify_insights boolean DEFAULT true,
  p_notify_deals boolean DEFAULT true,
  p_notify_support boolean DEFAULT false,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF char_length(p_endpoint) NOT BETWEEN 10 AND 2000
     OR char_length(p_p256dh) NOT BETWEEN 10 AND 500
     OR char_length(p_auth) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Invalid push subscription';
  END IF;

  INSERT INTO public.push_subscriptions (
    endpoint, p256dh, auth, user_id, notify_insights, notify_deals,
    notify_support, user_agent, updated_at
  )
  VALUES (
    p_endpoint, p_p256dh, p_auth, (SELECT auth.uid()),
    p_notify_insights, p_notify_deals,
    CASE WHEN (SELECT auth.uid()) IS NULL THEN false ELSE p_notify_support END,
    left(p_user_agent, 300), now()
  )
  ON CONFLICT (endpoint) DO UPDATE SET
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    user_id = EXCLUDED.user_id,
    notify_insights = EXCLUDED.notify_insights,
    notify_deals = EXCLUDED.notify_deals,
    notify_support = EXCLUDED.notify_support,
    user_agent = EXCLUDED.user_agent,
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

DROP POLICY IF EXISTS anon_insert_push_subscriptions ON public.push_subscriptions;
DROP POLICY IF EXISTS anon_delete_push_subscriptions ON public.push_subscriptions;
DROP POLICY IF EXISTS owner_delete_push_subscriptions ON public.push_subscriptions;
CREATE POLICY owner_delete_push_subscriptions
ON public.push_subscriptions FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.push_subscriptions FROM anon;
REVOKE INSERT, UPDATE ON public.push_subscriptions FROM authenticated;
GRANT DELETE ON public.push_subscriptions TO authenticated;
REVOKE ALL ON FUNCTION public.register_push_subscription(text,text,text,boolean,boolean,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text,text,text,boolean,boolean,boolean,text) TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-files',
  'support-files',
  false,
  10485760,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS support_files_select ON storage.objects;
CREATE POLICY support_files_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'support-files'
  AND private.can_access_support_thread(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS support_files_insert ON storage.objects;
CREATE POLICY support_files_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'support-files'
  AND owner_id = (SELECT auth.uid())::text
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND private.can_access_support_thread(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS support_files_delete ON storage.objects;
CREATE POLICY support_files_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'support-files'
  AND (
    owner_id = (SELECT auth.uid())::text
    OR (SELECT private.is_support_agent())
  )
  AND private.can_access_support_thread(((storage.foldername(name))[1])::uuid)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
  END IF;
END
$$;
