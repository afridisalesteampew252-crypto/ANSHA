-- Route both notification feeds to the current Mumbai project. The previous
-- admin hook still targeted the retired project after the database cutover.
CREATE OR REPLACE FUNCTION private.can_read_admin_notification_for(
  p_recipient uuid, p_type text, p_entity_type text, p_entity_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_profiles profile
    WHERE profile.id = p_recipient AND profile.is_active
      AND profile.role IN ('admin','staff','manager','accounts','sales','freelancer')
      AND (profile.role <> 'manager' OR p_type IN ('chat_message','internal_mail')
        OR (p_entity_type = 'invoice' AND EXISTS (SELECT 1 FROM public.invoices i JOIN public.customers c ON c.id=i.customer_id WHERE i.id=p_entity_id AND c.owner_id=p_recipient))
        OR (p_entity_type = 'customer_payment_proof' AND EXISTS (SELECT 1 FROM public.customer_payment_proofs p JOIN public.customers c ON c.id=p.customer_id WHERE p.id=p_entity_id AND c.owner_id=p_recipient))
        OR (p_entity_type = 'support_thread' AND EXISTS (SELECT 1 FROM public.support_threads t JOIN public.customer_profiles cp ON cp.id=t.customer_profile_id JOIN public.customers c ON c.id=cp.customer_id WHERE t.id=p_entity_id AND (t.assigned_to=p_recipient OR c.owner_id=p_recipient)))
        OR (p_entity_type = 'workspace_request' AND EXISTS (SELECT 1 FROM public.workspace_requests r LEFT JOIN public.customers c ON c.id=r.customer_id WHERE r.id=p_entity_id AND (r.assigned_to=p_recipient OR c.owner_id=p_recipient)))));
$$;
REVOKE ALL ON FUNCTION private.can_read_admin_notification_for(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;

-- The bell and the service-role sender use the same current ownership check.
CREATE OR REPLACE FUNCTION private.can_read_admin_notification(p_type text, p_entity_type text, p_entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.can_read_admin_notification_for((SELECT auth.uid()), p_type, p_entity_type, p_entity_id);
$$;

CREATE OR REPLACE FUNCTION public.native_notification_delivery_allowed(p_id uuid, p_audience text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_audience = 'admin' THEN
    RETURN EXISTS (SELECT 1 FROM public.admin_notifications n WHERE n.id=p_id
      AND private.can_read_admin_notification_for(n.recipient_id,n.notification_type,n.entity_type,n.entity_id));
  ELSIF p_audience = 'customer' THEN
    RETURN EXISTS (SELECT 1 FROM public.customer_notifications n
      JOIN public.customer_profiles cp ON cp.id=n.recipient_id AND cp.is_active
      WHERE n.id=p_id AND (
        (n.entity_type='invoice' AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id=n.entity_id AND i.customer_id=cp.customer_id AND i.status<>'draft'))
        OR (n.entity_type='customer_payment_proof' AND EXISTS (SELECT 1 FROM public.customer_payment_proofs p WHERE p.id=n.entity_id AND p.customer_id=cp.customer_id AND p.uploaded_by=cp.id))
        OR (n.entity_type='support_message' AND EXISTS (SELECT 1 FROM public.support_messages m JOIN public.support_threads t ON t.id=m.thread_id WHERE m.id=n.entity_id AND t.customer_profile_id=cp.id))));
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.native_notification_delivery_allowed(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.native_notification_delivery_allowed(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION private.enqueue_recipient_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  webhook_secret text;
  audience text;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('admin_notifications', 'customer_notifications') THEN
    RETURN NEW;
  END IF;
  audience := CASE WHEN TG_TABLE_NAME = 'customer_notifications' THEN 'customer' ELSE 'admin' END;
  -- Support replies already use send-support-push; do not send them twice.
  IF audience = 'customer' AND NEW.notification_type = 'support_message' THEN RETURN NEW; END IF;
  IF pg_catalog.to_regclass('vault.decrypted_secrets') IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO webhook_secret
  FROM vault.decrypted_secrets WHERE name = 'admin_push_webhook_secret' LIMIT 1;
  IF coalesce(webhook_secret, '') = '' THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://spmnxwhwsgpaoiklezex.supabase.co/functions/v1/send-admin-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-admin-push-secret', webhook_secret),
    body := jsonb_build_object('notification_id', NEW.id, 'audience', audience)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- An optional delivery outage must not roll back an invoice or support event.
  RAISE WARNING 'Native notification enqueue failed (%)', SQLSTATE;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enqueue_recipient_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_notification_push_after_insert ON public.admin_notifications;
CREATE TRIGGER admin_notification_push_after_insert
AFTER INSERT ON public.admin_notifications
FOR EACH ROW EXECUTE FUNCTION private.enqueue_recipient_push();

DROP TRIGGER IF EXISTS customer_notification_push_after_insert ON public.customer_notifications;
CREATE TRIGGER customer_notification_push_after_insert
AFTER INSERT ON public.customer_notifications
FOR EACH ROW EXECUTE FUNCTION private.enqueue_recipient_push();
