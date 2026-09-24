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
 * Native registrations are tied to the authenticated customer/staff account
 * that owns the app session. Anonymous registration would allow token
 * pollution and would make targeted support notifications unreliable.
 */
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
    'android',
    (SELECT auth.uid()),
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

DROP POLICY IF EXISTS workspace_delete_push_subscriptions ON public.push_subscriptions;
CREATE POLICY owner_delete_push_subscriptions
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE DELETE ON public.push_subscriptions FROM authenticated;
GRANT DELETE ON public.push_subscriptions TO authenticated;

DROP POLICY IF EXISTS workspace_read_push_subscriptions ON public.push_subscriptions;
CREATE POLICY ops_read_push_subscriptions
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING ((SELECT private.is_ops_user()));

REVOKE SELECT ON public.push_subscriptions FROM authenticated;
GRANT SELECT ON public.push_subscriptions TO authenticated;

DROP POLICY IF EXISTS workspace_manage_site_offers ON public.site_offers;
CREATE POLICY ops_manage_site_offers
  ON public.site_offers FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));
