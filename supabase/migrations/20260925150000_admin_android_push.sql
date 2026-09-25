-- Fix native push registration and forward admin in-app notifications to Android FCM.
-- The Vault value is optional: without it, web notifications keep working and this
-- trigger quietly skips native delivery until the operator configures the secret.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.register_fcm_push_token(
  p_token text,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required for native notifications';
  END IF;
  IF p_token IS NULL OR char_length(trim(p_token)) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'Invalid FCM token';
  END IF;

  INSERT INTO public.push_subscriptions (
    endpoint,
    p256dh,
    auth,
    user_id,
    platform,
    device_token,
    user_agent,
    last_seen_at
  )
  VALUES (
    'fcm:' || trim(p_token),
    '',
    '',
    (SELECT auth.uid()),
    'android',
    trim(p_token),
    NULLIF(left(trim(coalesce(p_user_agent, '')), 300), ''),
    now()
  )
  ON CONFLICT (device_token) WHERE device_token IS NOT NULL
  DO UPDATE SET
    endpoint = EXCLUDED.endpoint,
    user_id = EXCLUDED.user_id,
    platform = 'android',
    user_agent = EXCLUDED.user_agent,
    last_seen_at = now(),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_fcm_push_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_fcm_push_token(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.enqueue_admin_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  webhook_secret text;
BEGIN
  SELECT decrypted_secret
  INTO webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'admin_push_webhook_secret'
  LIMIT 1;

  IF COALESCE(webhook_secret, '') = '' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://ydrnilquojvalhgifest.supabase.co/functions/v1/send-admin-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-admin-push-secret', webhook_secret
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_admin_push() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS admin_notification_push_after_insert ON public.admin_notifications;
CREATE TRIGGER admin_notification_push_after_insert
AFTER INSERT ON public.admin_notifications
FOR EACH ROW EXECUTE FUNCTION private.enqueue_admin_push();
