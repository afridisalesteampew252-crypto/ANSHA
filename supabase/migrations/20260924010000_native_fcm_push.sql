/* Native Android FCM registrations share the existing notification subscriber table. */

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS device_token text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_platform_check;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_platform_check
  CHECK (platform IN ('web', 'android', 'ios'));

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_device_token_uidx
  ON public.push_subscriptions (device_token)
  WHERE device_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS push_subscriptions_platform_idx
  ON public.push_subscriptions (platform);

/*
 * Device registration is intentionally public: an FCM token is an address for
 * this app installation, not an authorization credential. The function only
 * upserts the caller-provided token and never exposes subscriber rows.
 */
CREATE OR REPLACE FUNCTION public.register_fcm_push_token(
  p_token text,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_token IS NULL OR char_length(trim(p_token)) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'Invalid FCM token';
  END IF;

  INSERT INTO public.push_subscriptions (
    endpoint,
    p256dh,
    auth,
    platform,
    device_token,
    user_agent,
    last_seen_at
  )
  VALUES (
    'fcm:' || trim(p_token),
    '',
    '',
    'android',
    trim(p_token),
    NULLIF(left(trim(coalesce(p_user_agent, '')), 300), ''),
    now()
  )
  ON CONFLICT (device_token) WHERE device_token IS NOT NULL
  DO UPDATE SET
    endpoint = EXCLUDED.endpoint,
    platform = 'android',
    user_agent = EXCLUDED.user_agent,
    last_seen_at = now(),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_fcm_push_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_fcm_push_token(text, text) TO anon, authenticated;
