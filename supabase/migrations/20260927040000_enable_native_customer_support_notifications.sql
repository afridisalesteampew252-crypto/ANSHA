-- Customer app permission to receive notifications also opts in to support alerts.
-- Native registrations previously inherited notify_support=false.
CREATE OR REPLACE FUNCTION public.register_fcm_push_token(p_token text, p_user_agent text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_customer boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required for native notifications';
  END IF;
  IF p_token IS NULL OR char_length(trim(p_token)) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'Invalid FCM token';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.customer_profiles WHERE id = v_user_id) INTO v_customer;
  INSERT INTO public.push_subscriptions (
    endpoint, p256dh, auth, user_id, platform, device_token, user_agent,
    last_seen_at, notify_support
  )
  VALUES (
    'fcm:' || trim(p_token), '', '', v_user_id, 'android', trim(p_token),
    NULLIF(left(trim(coalesce(p_user_agent, '')), 300), ''), now(), v_customer
  )
  ON CONFLICT (device_token) WHERE device_token IS NOT NULL
  DO UPDATE SET
    endpoint = EXCLUDED.endpoint,
    user_id = EXCLUDED.user_id,
    platform = 'android',
    user_agent = EXCLUDED.user_agent,
    last_seen_at = now(),
    updated_at = now(),
    notify_support = EXCLUDED.notify_support;
END;
$function$;

UPDATE public.push_subscriptions AS subscription
SET notify_support = true, updated_at = now()
WHERE platform = 'android'
  AND notify_support = false
  AND EXISTS (
    SELECT 1 FROM public.customer_profiles AS customer
    WHERE customer.id = subscription.user_id
  );