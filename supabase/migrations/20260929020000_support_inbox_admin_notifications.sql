-- Support notifications for staff portal, admin bell, and Android staff devices.
ALTER TABLE public.admin_notifications
  DROP CONSTRAINT IF EXISTS admin_notifications_notification_type_check;
ALTER TABLE public.admin_notifications
  ADD CONSTRAINT admin_notifications_notification_type_check
  CHECK (notification_type IN (
    'chat_message', 'internal_mail', 'inquiry', 'part_request',
    'invoice', 'remittance', 'system', 'request_due', 'support_message'
  ));

CREATE OR REPLACE FUNCTION public.register_fcm_push_token(p_token text, p_user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_notify_support boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required for native notifications';
  END IF;
  IF p_token IS NULL OR char_length(trim(p_token)) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'Invalid FCM token';
  END IF;

  SELECT
    EXISTS (SELECT 1 FROM public.customer_profiles customer
      WHERE customer.id = v_user_id AND customer.is_active = true)
    OR EXISTS (SELECT 1 FROM public.admin_profiles agent
      WHERE agent.id = v_user_id AND agent.is_active = true
        AND agent.role IN ('admin', 'staff', 'manager'))
  INTO v_notify_support;

  INSERT INTO public.push_subscriptions (
    endpoint, p256dh, auth, user_id, platform, device_token, user_agent,
    last_seen_at, notify_support
  ) VALUES (
    'fcm:' || trim(p_token), '', '', v_user_id, 'android', trim(p_token),
    NULLIF(left(trim(coalesce(p_user_agent, '')), 300), ''), now(), v_notify_support
  )
  ON CONFLICT (device_token) WHERE device_token IS NOT NULL
  DO UPDATE SET endpoint = EXCLUDED.endpoint, user_id = EXCLUDED.user_id,
    platform = 'android', user_agent = EXCLUDED.user_agent, last_seen_at = now(),
    updated_at = now(), notify_support = EXCLUDED.notify_support;
END;
$function$;

UPDATE public.push_subscriptions subscription
SET notify_support = true, updated_at = now()
WHERE subscription.platform = 'android' AND subscription.notify_support = false
  AND EXISTS (SELECT 1 FROM public.admin_profiles agent
    WHERE agent.id = subscription.user_id AND agent.is_active = true
      AND agent.role IN ('admin', 'staff', 'manager'));

CREATE OR REPLACE FUNCTION private.notify_support_agents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_customer_name text;
BEGIN
  IF NEW.sender_kind <> 'customer' THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(customer.full_name, ''), NULLIF(customer.email, ''), 'A customer')
  INTO v_customer_name
  FROM public.support_threads thread
  JOIN public.customer_profiles customer ON customer.id = thread.customer_profile_id
  WHERE thread.id = NEW.thread_id;

  INSERT INTO public.admin_notifications (
    recipient_id, notification_type, title, body, href, entity_type, entity_id
  )
  SELECT recipients.recipient_id, 'support_message', 'New customer support message',
    left(COALESCE(v_customer_name, 'A customer') || ': ' ||
      COALESCE(NULLIF(trim(NEW.body), ''), 'Shared an attachment'), 240),
    '/admin/customer-support?thread=' || NEW.thread_id::text,
    'support_thread', NEW.thread_id
  FROM (
    SELECT DISTINCT agent.id AS recipient_id
    FROM public.admin_profiles agent
    JOIN public.support_threads thread ON thread.id = NEW.thread_id
    WHERE agent.is_active = true AND agent.role IN ('admin', 'staff', 'manager')
      AND (thread.assigned_to IS NULL OR agent.id = thread.assigned_to OR agent.role = 'admin')
  ) recipients;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_support_agents() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_support_agents_after_insert ON public.support_messages;
CREATE TRIGGER notify_support_agents_after_insert
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION private.notify_support_agents();

INSERT INTO public.admin_notifications (
  recipient_id, notification_type, title, body, href, entity_type, entity_id
)
SELECT recipients.recipient_id, 'support_message', 'New customer support message',
  left(COALESCE(NULLIF(customer.full_name, ''), NULLIF(customer.email, ''), 'A customer') || ': ' ||
    COALESCE(NULLIF(trim(message.body), ''), 'Shared an attachment'), 240),
  '/admin/customer-support?thread=' || message.thread_id::text,
  'support_thread', message.thread_id
FROM public.support_messages message
JOIN public.support_threads thread ON thread.id = message.thread_id
JOIN public.customer_profiles customer ON customer.id = thread.customer_profile_id
CROSS JOIN LATERAL (
  SELECT DISTINCT agent.id AS recipient_id
  FROM public.admin_profiles agent
  WHERE agent.is_active = true AND agent.role IN ('admin', 'staff', 'manager')
    AND (thread.assigned_to IS NULL OR agent.id = thread.assigned_to OR agent.role = 'admin')
) recipients
WHERE message.sender_kind = 'customer' AND message.read_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'admin_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
  END IF;
END
$$;
