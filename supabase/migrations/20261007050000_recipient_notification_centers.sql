-- Persist customer account alerts, harden read acknowledgements, and route new
-- customer activity only to staff who can act on it. No direct client INSERTs.
CREATE TABLE public.customer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('support_message', 'invoice', 'payment_proof')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  body text,
  href text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_notifications_recipient_created_idx ON public.customer_notifications(recipient_id, created_at DESC);
CREATE INDEX customer_notifications_recipient_unread_idx ON public.customer_notifications(recipient_id, created_at DESC) WHERE read_at IS NULL;
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_notification_recipient_select ON public.customer_notifications
  FOR SELECT TO authenticated USING (recipient_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.customer_profiles profile WHERE profile.id = (SELECT auth.uid()) AND profile.is_active
  ));
CREATE POLICY customer_notification_recipient_update ON public.customer_notifications
  FOR UPDATE TO authenticated USING (recipient_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.customer_profiles profile WHERE profile.id = (SELECT auth.uid()) AND profile.is_active
  )) WITH CHECK (recipient_id = (SELECT auth.uid()));
REVOKE ALL ON public.customer_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_notifications TO authenticated;
GRANT UPDATE(read_at) ON public.customer_notifications TO authenticated;
-- Recipient RLS alone does not prevent someone rewriting the title/body/recipient.
REVOKE UPDATE ON public.admin_notifications FROM PUBLIC, anon, authenticated;
GRANT UPDATE(read_at) ON public.admin_notifications TO authenticated;

-- Legacy external-activity triggers notified every profile. Apply current owner
-- scope when a manager reads old alerts too, without deleting anyone's history.
CREATE OR REPLACE FUNCTION private.can_read_admin_notification(p_type text, p_entity_type text, p_entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT private.is_manager() OR p_type IN ('chat_message', 'internal_mail')
    OR (p_entity_type = 'invoice' AND EXISTS (SELECT 1 FROM public.invoices i JOIN public.customers c ON c.id = i.customer_id WHERE i.id = p_entity_id AND c.owner_id = (SELECT auth.uid())))
    OR (p_entity_type = 'customer_payment_proof' AND EXISTS (SELECT 1 FROM public.customer_payment_proofs p JOIN public.customers c ON c.id = p.customer_id WHERE p.id = p_entity_id AND c.owner_id = (SELECT auth.uid())))
    OR (p_entity_type = 'support_thread' AND EXISTS (SELECT 1 FROM public.support_threads t JOIN public.customer_profiles profile ON profile.id = t.customer_profile_id JOIN public.customers c ON c.id = profile.customer_id WHERE t.id = p_entity_id AND (t.assigned_to = (SELECT auth.uid()) OR c.owner_id = (SELECT auth.uid()))))
    OR (p_entity_type = 'workspace_request' AND EXISTS (SELECT 1 FROM public.workspace_requests r LEFT JOIN public.customers c ON c.id = r.customer_id WHERE r.id = p_entity_id AND (r.assigned_to = (SELECT auth.uid()) OR c.owner_id = (SELECT auth.uid()))));
$$;
REVOKE ALL ON FUNCTION private.can_read_admin_notification(text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_admin_notification(text,text,uuid) TO authenticated;
DROP POLICY notification_recipient_select ON public.admin_notifications;
CREATE POLICY notification_recipient_select ON public.admin_notifications FOR SELECT TO authenticated
  USING (recipient_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_user())
    AND private.can_read_admin_notification(notification_type, entity_type, entity_id));

ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_notification_type_check;
ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_notification_type_check CHECK (notification_type IN (
  'chat_message', 'internal_mail', 'inquiry', 'part_request', 'invoice', 'remittance', 'system', 'request_due', 'support_message', 'payment_proof'
));

CREATE OR REPLACE FUNCTION private.notify_workspace_on_external_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.admin_notifications(recipient_id, notification_type, title, body, href, entity_type, entity_id)
  SELECT profile.id, TG_ARGV[0], TG_ARGV[1], left(COALESCE(to_jsonb(NEW)->>'customer_name', TG_ARGV[1]), 240), TG_ARGV[2], TG_ARGV[0], NEW.id
  FROM public.admin_profiles profile WHERE profile.is_active AND profile.role IN ('admin', 'staff');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_workspace_on_external_activity() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.notify_payment_proof_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_notifications(recipient_id, notification_type, title, body, href, entity_type, entity_id)
    SELECT profile.id, 'payment_proof', 'New customer TT copy',
      left(COALESCE(customer.full_name, 'Customer') || ' · ' || NEW.currency || ' ' || NEW.amount::text, 240),
      '/admin/remittances/customer-proofs', 'customer_payment_proof', NEW.id
    FROM public.admin_profiles profile JOIN public.customers customer ON customer.id = NEW.customer_id
    WHERE profile.is_active AND (profile.role IN ('admin', 'staff', 'accounts') OR (profile.role = 'manager' AND customer.owner_id = profile.id));
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('matched', 'rejected') THEN
    INSERT INTO public.customer_notifications(recipient_id, notification_type, title, body, href, entity_type, entity_id)
    SELECT profile.id, 'payment_proof', CASE NEW.status WHEN 'matched' THEN 'Your TT copy was matched' ELSE 'Your TT copy needs attention' END,
      left(COALESCE(NULLIF(NEW.review_note, ''), CASE NEW.status WHEN 'matched' THEN 'Your payment proof was matched to a received transfer.' ELSE 'Please review the TT copy and contact the accounts team.' END), 240),
      '/portal/payments', 'customer_payment_proof', NEW.id
    FROM public.customer_profiles profile WHERE profile.id = NEW.uploaded_by AND profile.customer_id = NEW.customer_id AND profile.is_active;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_payment_proof_activity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notify_payment_proof_after_insert AFTER INSERT ON public.customer_payment_proofs FOR EACH ROW EXECUTE FUNCTION private.notify_payment_proof_activity();
CREATE TRIGGER notify_payment_proof_after_update AFTER UPDATE OF status ON public.customer_payment_proofs FOR EACH ROW EXECUTE FUNCTION private.notify_payment_proof_activity();

CREATE OR REPLACE FUNCTION private.notify_customer_invoice_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.customer_id IS NULL OR NEW.status = 'draft' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.balance_due IS NOT DISTINCT FROM OLD.balance_due THEN RETURN NEW; END IF;
  INSERT INTO public.customer_notifications(recipient_id, notification_type, title, body, href, entity_type, entity_id)
  SELECT profile.id, 'invoice', CASE NEW.status WHEN 'paid' THEN 'Invoice paid' WHEN 'cancelled' THEN 'Invoice cancelled' ELSE 'Invoice update' END,
    left(COALESCE(NEW.invoice_number, 'Invoice') || ' · ' || replace(NEW.status, '_', ' ') || ' · Balance ' || NEW.currency || ' ' || COALESCE(NEW.balance_due, 0)::text, 240),
    '/portal/invoices', 'invoice', NEW.id
  FROM public.customer_profiles profile WHERE profile.customer_id = NEW.customer_id AND profile.is_active;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_customer_invoice_activity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notify_customer_invoice_after_insert AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.notify_customer_invoice_activity();
CREATE TRIGGER notify_customer_invoice_after_update AFTER UPDATE OF status, balance_due ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.notify_customer_invoice_activity();

CREATE OR REPLACE FUNCTION private.notify_customer_support_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.sender_kind <> 'agent' THEN RETURN NEW; END IF;
  INSERT INTO public.customer_notifications(recipient_id, notification_type, title, body, href, entity_type, entity_id)
  SELECT thread.customer_profile_id, 'support_message', 'New reply from ANSHA Support',
    left(COALESCE(NULLIF(trim(NEW.body), ''), 'Your support team shared an attachment.'), 240), '/portal/support', 'support_message', NEW.id
  FROM public.support_threads thread JOIN public.customer_profiles profile ON profile.id = thread.customer_profile_id
  WHERE thread.id = NEW.thread_id AND profile.is_active;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_customer_support_reply() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notify_customer_support_reply_after_insert AFTER INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION private.notify_customer_support_reply();
-- Reading a support thread also acknowledges its existing bell entries.
CREATE OR REPLACE FUNCTION private.acknowledge_customer_support_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.sender_kind = 'agent' AND NEW.read_at IS NOT NULL AND OLD.read_at IS NULL THEN
    UPDATE public.customer_notifications SET read_at = NEW.read_at WHERE entity_type = 'support_message' AND entity_id = NEW.id AND read_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.acknowledge_customer_support_notification() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER acknowledge_customer_support_notification_after_update AFTER UPDATE OF read_at ON public.support_messages FOR EACH ROW EXECUTE FUNCTION private.acknowledge_customer_support_notification();

CREATE OR REPLACE FUNCTION private.notify_support_agents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.sender_kind <> 'customer' THEN RETURN NEW; END IF;
  INSERT INTO public.admin_notifications(recipient_id, notification_type, title, body, href, entity_type, entity_id)
  SELECT agent.id, 'support_message', 'New customer support message',
    left(COALESCE(NULLIF(profile.full_name, ''), profile.email, 'A customer') || ': ' || COALESCE(NULLIF(trim(NEW.body), ''), 'Shared an attachment'), 240),
    '/admin/customer-support?thread=' || NEW.thread_id::text, 'support_thread', NEW.thread_id
  FROM public.support_threads thread JOIN public.customer_profiles profile ON profile.id = thread.customer_profile_id
  JOIN public.customers customer ON customer.id = profile.customer_id
  CROSS JOIN public.admin_profiles agent
  WHERE thread.id = NEW.thread_id AND agent.is_active
    AND ((agent.role IN ('admin', 'staff') AND (thread.assigned_to IS NULL OR thread.assigned_to = agent.id OR agent.role = 'admin'))
      OR (agent.role = 'manager' AND (thread.assigned_to = agent.id OR customer.owner_id = agent.id)));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_support_agents() FROM PUBLIC, anon, authenticated;

-- Keep unread replies from before this migration visible without replaying history.
INSERT INTO public.customer_notifications(recipient_id, notification_type, title, body, href, entity_type, entity_id, created_at)
SELECT thread.customer_profile_id, 'support_message', 'New reply from ANSHA Support', left(COALESCE(message.body, 'Shared an attachment'), 240),
  '/portal/support', 'support_message', message.id, message.created_at
FROM public.support_messages message JOIN public.support_threads thread ON thread.id = message.thread_id
JOIN public.customer_profiles profile ON profile.id = thread.customer_profile_id
WHERE message.sender_kind = 'agent' AND message.read_at IS NULL AND profile.is_active;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customer_notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;
  END IF;
END $$;
