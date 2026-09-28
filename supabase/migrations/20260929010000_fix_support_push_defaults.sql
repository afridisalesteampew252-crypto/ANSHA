-- Preserve support reply notifications for opted-in signed-in users.
-- General push registration used to overwrite support preference with false.
CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_notify_insights boolean DEFAULT true,
  p_notify_deals boolean DEFAULT true,
  p_notify_support boolean DEFAULT true,
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

-- Existing opted-in devices belong to signed-in customers or active support staff.
UPDATE public.push_subscriptions AS subscription
SET notify_support = true, updated_at = now()
WHERE subscription.notify_support = false
  AND subscription.platform IN ('web', 'android')
  AND (
    EXISTS (
      SELECT 1 FROM public.customer_profiles AS customer
      WHERE customer.id = subscription.user_id AND customer.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_profiles AS agent
      WHERE agent.id = subscription.user_id
        AND agent.is_active = true
        AND agent.role IN ('admin', 'staff', 'manager')
    )
  );
