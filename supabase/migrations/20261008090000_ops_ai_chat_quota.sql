-- Durable, per-user quotas for the separate ops AI chat route.
CREATE TABLE IF NOT EXISTS private.ops_ai_chat_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ops_ai_chat_requests_user_created_idx
  ON private.ops_ai_chat_requests (user_id, created_at DESC);
ALTER TABLE private.ops_ai_chat_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ops_ai_chat_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE private.ops_ai_chat_requests_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ops_ai_chat_consume_quota()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  checked_at timestamptz;
  recent_count integer;
  daily_count integer;
  oldest_recent timestamptz;
  oldest_daily timestamptz;
BEGIN
  IF uid IS NULL OR NOT COALESCE((SELECT private.is_ops_user()), false) THEN
    RAISE EXCEPTION 'Ops access required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ops_ai_chat:' || uid::text, 0));
  checked_at := clock_timestamp();
  DELETE FROM private.ops_ai_chat_requests WHERE user_id = uid AND created_at <= checked_at - interval '24 hours';
  SELECT count(*) FILTER (WHERE created_at > checked_at - interval '10 minutes'), count(*),
    min(created_at) FILTER (WHERE created_at > checked_at - interval '10 minutes'), min(created_at)
    INTO recent_count, daily_count, oldest_recent, oldest_daily
    FROM private.ops_ai_chat_requests WHERE user_id = uid;
  IF recent_count >= 20 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'short', 'retry_after_seconds',
      GREATEST(1, ceil(extract(epoch FROM oldest_recent + interval '10 minutes' - checked_at))::integer));
  END IF;
  IF daily_count >= 200 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily', 'retry_after_seconds',
      GREATEST(1, ceil(extract(epoch FROM oldest_daily + interval '24 hours' - checked_at))::integer));
  END IF;
  INSERT INTO private.ops_ai_chat_requests(user_id, created_at) VALUES (uid, checked_at);
  RETURN jsonb_build_object('allowed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.ops_ai_chat_consume_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_ai_chat_consume_quota() TO authenticated;

-- Insert and update the owned thread atomically, under its current owner's identity.
CREATE OR REPLACE FUNCTION public.ops_ai_chat_append_message(p_thread_id uuid, p_role text, p_content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  thread_title text;
  message_id uuid;
BEGIN
  IF uid IS NULL OR NOT COALESCE((SELECT private.is_ops_user()), false) THEN
    RAISE EXCEPTION 'Ops access required' USING ERRCODE = '42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('user', 'assistant') OR p_content IS NULL
     OR btrim(p_content) = '' OR char_length(p_content) > 50000 THEN
    RAISE EXCEPTION 'Invalid message' USING ERRCODE = '22023';
  END IF;
  SELECT title INTO thread_title FROM public.ai_chat_threads
    WHERE id = p_thread_id AND created_by = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Thread not found' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.ai_chat_messages(thread_id, role, content, created_by)
    VALUES (p_thread_id, p_role, p_content, uid) RETURNING id INTO message_id;
  UPDATE public.ai_chat_threads SET updated_at = clock_timestamp(),
    title = CASE WHEN p_role = 'user' AND thread_title = 'New chat' THEN left(btrim(p_content), 80) ELSE title END
    WHERE id = p_thread_id AND created_by = uid;
  RETURN message_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ops_ai_chat_append_message(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_ai_chat_append_message(uuid, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
