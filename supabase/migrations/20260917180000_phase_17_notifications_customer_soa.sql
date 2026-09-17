-- Phase 17: notification center, chat delivery state, and auditable customer SOA allocations.

ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS last_delivered_at timestamptz;

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('chat_message', 'internal_mail', 'inquiry', 'part_request', 'invoice', 'remittance', 'system')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  body text,
  href text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notifications_recipient_unread_idx
  ON public.admin_notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS admin_notifications_recipient_created_idx
  ON public.admin_notifications (recipient_id, created_at DESC);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_recipient_select ON public.admin_notifications;
CREATE POLICY notification_recipient_select ON public.admin_notifications
FOR SELECT TO authenticated
USING (recipient_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_user()));
DROP POLICY IF EXISTS notification_recipient_update ON public.admin_notifications;
CREATE POLICY notification_recipient_update ON public.admin_notifications
FOR UPDATE TO authenticated
USING (recipient_id = (SELECT auth.uid()))
WITH CHECK (recipient_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS notification_recipient_delete ON public.admin_notifications;
CREATE POLICY notification_recipient_delete ON public.admin_notifications
FOR DELETE TO authenticated
USING (recipient_id = (SELECT auth.uid()));

REVOKE ALL ON public.admin_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.admin_notifications TO authenticated;

CREATE OR REPLACE FUNCTION private.notify_chat_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sender_name text;
BEGIN
  SELECT COALESCE(NULLIF(full_name, ''), NULLIF(email, ''), 'A colleague')
  INTO sender_name
  FROM public.admin_profiles
  WHERE id = NEW.sender_id;

  INSERT INTO public.admin_notifications (
    recipient_id, actor_id, notification_type, title, body, href, entity_type, entity_id
  )
  SELECT participant.user_id, NEW.sender_id, 'chat_message',
    COALESCE(sender_name, 'A colleague') || ' sent a message',
    left(COALESCE(NULLIF(NEW.body, ''), 'Shared an attachment'), 240),
    '/admin/chat?conversation=' || NEW.conversation_id::text,
    'chat_conversation', NEW.conversation_id
  FROM public.chat_participants participant
  WHERE participant.conversation_id = NEW.conversation_id
    AND participant.user_id <> NEW.sender_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_chat_participants_after_insert ON public.chat_messages;
CREATE TRIGGER notify_chat_participants_after_insert
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION private.notify_chat_participants();

CREATE OR REPLACE FUNCTION private.notify_internal_mail_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  mail_row public.internal_mail%ROWTYPE;
  sender_name text;
BEGIN
  SELECT * INTO mail_row FROM public.internal_mail WHERE id = NEW.mail_id;
  SELECT COALESCE(NULLIF(full_name, ''), NULLIF(email, ''), 'A colleague')
  INTO sender_name FROM public.admin_profiles WHERE id = mail_row.sender_id;
  IF NEW.recipient_id <> mail_row.sender_id THEN
    INSERT INTO public.admin_notifications (
      recipient_id, actor_id, notification_type, title, body, href, entity_type, entity_id
    ) VALUES (
      NEW.recipient_id, mail_row.sender_id, 'internal_mail',
      COALESCE(sender_name, 'A colleague') || ' sent internal mail',
      left(mail_row.subject, 240), '/admin/mail', 'internal_mail', NEW.mail_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_internal_mail_recipient_after_insert ON public.internal_mail_recipients;
CREATE TRIGGER notify_internal_mail_recipient_after_insert
AFTER INSERT ON public.internal_mail_recipients
FOR EACH ROW EXECUTE FUNCTION private.notify_internal_mail_recipient();

CREATE OR REPLACE FUNCTION private.notify_workspace_on_external_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notification_kind text := TG_ARGV[0];
  notification_title text := TG_ARGV[1];
  target_href text := TG_ARGV[2];
  display_body text;
BEGIN
  display_body := CASE notification_kind
    WHEN 'inquiry' THEN COALESCE(to_jsonb(NEW)->>'customer_name', 'New website inquiry')
    WHEN 'part_request' THEN COALESCE(to_jsonb(NEW)->>'customer_name', 'New part request')
    ELSE notification_title
  END;
  INSERT INTO public.admin_notifications (
    recipient_id, notification_type, title, body, href, entity_type, entity_id
  )
  SELECT profile.id, notification_kind, notification_title, left(display_body, 240),
    target_href, notification_kind, NEW.id
  FROM public.admin_profiles profile;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_workspace_inquiry_after_insert ON public.inquiries;
CREATE TRIGGER notify_workspace_inquiry_after_insert
AFTER INSERT ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION private.notify_workspace_on_external_activity('inquiry', 'New customer inquiry', '/admin/inquiries');

DROP TRIGGER IF EXISTS notify_workspace_part_request_after_insert ON public.part_requests;
CREATE TRIGGER notify_workspace_part_request_after_insert
AFTER INSERT ON public.part_requests
FOR EACH ROW EXECUTE FUNCTION private.notify_workspace_on_external_activity('part_request', 'New part request', '/admin/inquiries');

CREATE TABLE IF NOT EXISTS public.remittance_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id uuid NOT NULL REFERENCES public.remittances(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  invoice_payment_id uuid NOT NULL UNIQUE REFERENCES public.invoice_payments(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_by uuid NOT NULL REFERENCES public.admin_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (remittance_id, invoice_id, invoice_payment_id)
);

CREATE INDEX IF NOT EXISTS remittance_allocations_remittance_idx
  ON public.remittance_allocations (remittance_id, created_at);
CREATE INDEX IF NOT EXISTS remittance_allocations_invoice_idx
  ON public.remittance_allocations (invoice_id, created_at);

ALTER TABLE public.remittance_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_read_remittance_allocations ON public.remittance_allocations;
CREATE POLICY workspace_read_remittance_allocations ON public.remittance_allocations
FOR SELECT TO authenticated
USING ((SELECT private.is_workspace_user()));
DROP POLICY IF EXISTS workspace_insert_remittance_allocations ON public.remittance_allocations;
CREATE POLICY workspace_insert_remittance_allocations ON public.remittance_allocations
FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_workspace_user()) AND created_by = (SELECT auth.uid()));
DROP POLICY IF EXISTS workspace_delete_remittance_allocations ON public.remittance_allocations;
CREATE POLICY workspace_delete_remittance_allocations ON public.remittance_allocations
FOR DELETE TO authenticated
USING ((SELECT private.is_platform_admin()) OR created_by = (SELECT auth.uid()));

REVOKE ALL ON public.remittance_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.remittance_allocations TO authenticated;

INSERT INTO public.remittance_allocations (
  remittance_id, invoice_id, invoice_payment_id, amount, created_by, created_at
)
SELECT remittance.id, remittance.invoice_id, remittance.invoice_payment_id,
  payment.amount, remittance.created_by, payment.created_at
FROM public.remittances remittance
JOIN public.invoice_payments payment ON payment.id = remittance.invoice_payment_id
WHERE remittance.invoice_id IS NOT NULL
ON CONFLICT (invoice_payment_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.capture_legacy_remittance_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL AND NEW.invoice_payment_id IS NOT NULL THEN
    INSERT INTO public.remittance_allocations (
      remittance_id, invoice_id, invoice_payment_id, amount, created_by
    )
    SELECT NEW.id, NEW.invoice_id, NEW.invoice_payment_id, payment.amount, NEW.created_by
    FROM public.invoice_payments payment
    WHERE payment.id = NEW.invoice_payment_id
    ON CONFLICT (invoice_payment_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_legacy_remittance_allocation_after_change ON public.remittances;
CREATE TRIGGER capture_legacy_remittance_allocation_after_change
AFTER INSERT OR UPDATE OF invoice_payment_id ON public.remittances
FOR EACH ROW EXECUTE FUNCTION private.capture_legacy_remittance_allocation();

CREATE OR REPLACE FUNCTION private.guard_allocated_remittance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
    NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.status IS DISTINCT FROM OLD.status OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
  ) AND EXISTS (
    SELECT 1 FROM public.remittance_allocations allocation
    WHERE allocation.remittance_id = OLD.id
      AND allocation.invoice_payment_id IS DISTINCT FROM OLD.invoice_payment_id
  ) THEN
    RAISE EXCEPTION 'Reverse additional invoice allocations before changing this remittance';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_allocated_remittance_change_before_update ON public.remittances;
CREATE TRIGGER guard_allocated_remittance_change_before_update
BEFORE UPDATE OF amount, currency, status, customer_id ON public.remittances
FOR EACH ROW EXECUTE FUNCTION private.guard_allocated_remittance_change();

CREATE OR REPLACE FUNCTION public.allocate_remittance(
  p_remittance_id uuid,
  p_invoice_id uuid,
  p_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  remittance_row public.remittances%ROWTYPE;
  invoice_row public.invoices%ROWTYPE;
  allocated_total numeric(14,2);
  payment_id uuid;
BEGIN
  IF NOT private.is_workspace_user() THEN RAISE EXCEPTION 'Workspace access required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Allocation amount must be greater than zero'; END IF;

  SELECT * INTO remittance_row FROM public.remittances WHERE id = p_remittance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Remittance not found'; END IF;
  IF remittance_row.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed remittances can be allocated'; END IF;

  SELECT * INTO invoice_row FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF invoice_row.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled invoices cannot receive payments'; END IF;
  IF invoice_row.currency <> remittance_row.currency THEN RAISE EXCEPTION 'Invoice and remittance currencies must match'; END IF;
  IF remittance_row.customer_id IS NULL OR invoice_row.customer_id IS NULL OR remittance_row.customer_id <> invoice_row.customer_id THEN
    RAISE EXCEPTION 'Invoice and remittance must belong to the same saved customer';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO allocated_total
  FROM public.remittance_allocations WHERE remittance_id = p_remittance_id;
  IF p_amount > remittance_row.amount - allocated_total THEN RAISE EXCEPTION 'Allocation exceeds the available remittance balance'; END IF;
  IF p_amount > invoice_row.balance_due THEN RAISE EXCEPTION 'Allocation exceeds the invoice balance'; END IF;

  INSERT INTO public.invoice_payments (
    invoice_id, payment_date, amount, method, reference, notes, created_by
  ) VALUES (
    invoice_row.id, remittance_row.received_date, p_amount,
    CASE WHEN remittance_row.method IN ('bank_transfer', 'cash', 'card', 'cheque', 'other') THEN remittance_row.method ELSE 'other' END,
    COALESCE(NULLIF(btrim(remittance_row.bank_reference), ''), remittance_row.remittance_number),
    'Allocated from remittance ' || remittance_row.remittance_number,
    (SELECT auth.uid())
  ) RETURNING id INTO payment_id;

  INSERT INTO public.remittance_allocations (
    remittance_id, invoice_id, invoice_payment_id, amount, created_by
  ) VALUES (p_remittance_id, p_invoice_id, payment_id, p_amount, (SELECT auth.uid()));
  RETURN payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_remittance_allocation(p_allocation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  allocation_row public.remittance_allocations%ROWTYPE;
  legacy_payment_id uuid;
BEGIN
  IF NOT private.is_workspace_user() THEN RAISE EXCEPTION 'Workspace access required'; END IF;
  SELECT * INTO allocation_row FROM public.remittance_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Allocation not found'; END IF;
  IF NOT private.is_platform_admin() AND allocation_row.created_by <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Only an administrator or the allocation creator can reverse it';
  END IF;
  SELECT invoice_payment_id INTO legacy_payment_id FROM public.remittances WHERE id = allocation_row.remittance_id;
  IF legacy_payment_id = allocation_row.invoice_payment_id THEN
    RAISE EXCEPTION 'Edit or unlink this original remittance payment from the Remittances page';
  END IF;
  DELETE FROM public.invoice_payments WHERE id = allocation_row.invoice_payment_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_remittance(uuid, uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_remittance_allocation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_remittance(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_remittance_allocation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.cleanup_remittance_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.invoice_payments payment
  USING public.remittance_allocations allocation
  WHERE allocation.remittance_id = OLD.id
    AND allocation.invoice_payment_id = payment.id;
  IF OLD.invoice_payment_id IS NOT NULL THEN
    DELETE FROM public.invoice_payments WHERE id = OLD.invoice_payment_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS remittances_cleanup_payment ON public.remittances;
CREATE TRIGGER remittances_cleanup_payment
BEFORE DELETE ON public.remittances
FOR EACH ROW EXECUTE FUNCTION private.cleanup_remittance_payment();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admin_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
  END IF;
END;
$$;

COMMENT ON TABLE public.remittance_allocations IS 'Auditable allocation of received customer funds to invoice payments.';
COMMENT ON COLUMN public.chat_participants.last_delivered_at IS 'Latest time this participant client received conversation updates.';
