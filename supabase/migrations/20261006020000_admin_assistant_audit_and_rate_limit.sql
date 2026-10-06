/* Admin AI assistant: audit logging + per-user rate limit (additive, admin-only).

The assistant (POST /api/admin-assistant) runs every tool AS the signed-in admin with
their own Supabase session, so RLS and existing RPC checks still apply. This migration
only adds:

  1. public.log_admin_assistant_action(...)
     Writes one row to the existing append-only public.audit_logs table through
     private.write_audit_log (action = 'ai_assistant.<tool>'). Called twice per
     approved write: phase 'approved' (before the write, with the preview) and
     phase 'executed' | 'failed' (after, with the actual before/after).
     Admin-only (private.is_account_admin()).

  2. private.admin_assistant_requests + public.admin_assistant_consume_quota()
     Per-user request counter used for rate limiting chat turns.
     Limits: 20 requests / 10 minutes and 200 / 24 hours per admin.
     Admin-only. Rows older than 2 days are pruned on each call for that user.

No existing table, policy or function is changed.
*/

-- ---------------------------------------------------------------------------
-- 1. Audit logging RPC (reuses public.audit_logs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_admin_assistant_action(
  p_tool text,
  p_phase text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  clean_tool text := NULLIF(btrim(COALESCE(p_tool, '')), '');
  clean_phase text := NULLIF(btrim(COALESCE(p_phase, '')), '');
  clean_type text := NULLIF(btrim(COALESCE(p_entity_type, '')), '');
BEGIN
  IF NOT (SELECT private.is_account_admin()) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF clean_tool IS NULL OR clean_tool !~ '^[A-Za-z][A-Za-z0-9_]{0,60}$' THEN
    RAISE EXCEPTION 'Invalid tool name';
  END IF;
  IF clean_phase IS NULL OR clean_phase NOT IN ('approved', 'executed', 'failed') THEN
    RAISE EXCEPTION 'Invalid phase';
  END IF;
  IF clean_type IS NULL OR char_length(clean_type) > 80 THEN
    RAISE EXCEPTION 'Invalid entity type';
  END IF;
  IF p_details IS NOT NULL AND pg_column_size(p_details) > 32768 THEN
    RAISE EXCEPTION 'Details too large';
  END IF;

  RETURN private.write_audit_log(
    'ai_assistant.' || clean_tool,
    clean_type,
    p_entity_id,
    COALESCE(p_details, '{}'::jsonb)
      || jsonb_build_object('phase', clean_phase, 'source', 'admin_assistant'),
    (SELECT auth.uid())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_admin_assistant_action(text, text, text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_assistant_action(text, text, text, uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.log_admin_assistant_action(text, text, text, uuid, jsonb) IS
  'Admin AI assistant: append an ai_assistant.<tool> row to audit_logs (admin only).';

-- ---------------------------------------------------------------------------
-- 2. Rate limit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.admin_assistant_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_assistant_requests_user_created_idx
  ON private.admin_assistant_requests (user_id, created_at DESC);

ALTER TABLE private.admin_assistant_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.admin_assistant_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_assistant_consume_quota()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  recent_count integer;
  daily_count integer;
  oldest_recent timestamptz;
  short_limit constant integer := 20;
  short_window constant interval := interval '10 minutes';
  daily_limit constant integer := 200;
BEGIN
  IF uid IS NULL OR NOT (SELECT private.is_account_admin()) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  -- Serialise per user so parallel requests cannot overshoot the limit.
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_assistant:' || uid::text, 0));

  DELETE FROM private.admin_assistant_requests
  WHERE user_id = uid AND created_at < now() - interval '2 days';

  SELECT count(*), min(created_at)
    INTO recent_count, oldest_recent
  FROM private.admin_assistant_requests
  WHERE user_id = uid AND created_at > now() - short_window;

  SELECT count(*) INTO daily_count
  FROM private.admin_assistant_requests
  WHERE user_id = uid AND created_at > now() - interval '24 hours';

  IF recent_count >= short_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'short',
      'retry_after_seconds',
      GREATEST(1, ceil(extract(epoch FROM (oldest_recent + short_window - now())))::integer)
    );
  END IF;
  IF daily_count >= daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily', 'retry_after_seconds', 3600);
  END IF;

  INSERT INTO private.admin_assistant_requests (user_id) VALUES (uid);
  RETURN jsonb_build_object(
    'allowed', true,
    'remaining_short', short_limit - recent_count - 1,
    'remaining_daily', daily_limit - daily_count - 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assistant_consume_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assistant_consume_quota() TO authenticated;

COMMENT ON FUNCTION public.admin_assistant_consume_quota() IS
  'Admin AI assistant: per-user rate limit (20 / 10 min, 200 / 24 h). Admin only.';
