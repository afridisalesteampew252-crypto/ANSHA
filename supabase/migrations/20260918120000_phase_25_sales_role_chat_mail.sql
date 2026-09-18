/* Phase 25: sales agent role, deactivate staff users, customer ownership, chat previews. */

-- Roles: admin | staff | sales
ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS admin_profiles_role_check;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_role_check
  CHECK (role IN ('admin', 'staff', 'sales'));

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS admin_profiles_active_idx
  ON public.admin_profiles (is_active)
  WHERE is_active = true;

-- Sales agents own their CRM customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customers_owner_id_idx
  ON public.customers (owner_id);

CREATE OR REPLACE FUNCTION private.is_active_workspace_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION private.is_sales_agent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true
      AND role = 'sales'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_ops_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true
      AND role IN ('admin', 'staff')
  );
$$;

-- Keep legacy helper aligned with active users.
-- Must REPLACE the Phase 9 uuid DEFAULT signature — a zero-arg overload
-- makes private.is_workspace_user() ambiguous (breaks create_invoice_v3).
CREATE OR REPLACE FUNCTION private.is_workspace_user(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = check_user_id
      AND is_active = true
  );
$$;

-- Customers: keep portal read policy; replace staff manage policies
DROP POLICY IF EXISTS "admin_manage_customers" ON public.customers;
DROP POLICY IF EXISTS workspace_manage_customers ON public.customers;
DROP POLICY IF EXISTS workspace_select_customers ON public.customers;
DROP POLICY IF EXISTS workspace_insert_customers ON public.customers;
DROP POLICY IF EXISTS workspace_update_customers ON public.customers;
DROP POLICY IF EXISTS workspace_delete_customers ON public.customers;

CREATE POLICY workspace_select_customers
  ON public.customers FOR SELECT TO authenticated
  USING (
    (SELECT private.is_ops_user())
    OR ((SELECT private.is_sales_agent()) AND owner_id = (SELECT auth.uid()))
  );

CREATE POLICY workspace_insert_customers
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_ops_user())
    OR (
      (SELECT private.is_sales_agent())
      AND owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY workspace_update_customers
  ON public.customers FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_ops_user())
    OR ((SELECT private.is_sales_agent()) AND owner_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT private.is_ops_user())
    OR (
      (SELECT private.is_sales_agent())
      AND owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY workspace_delete_customers
  ON public.customers FOR DELETE TO authenticated
  USING (
    (SELECT private.is_ops_user())
    OR ((SELECT private.is_sales_agent()) AND owner_id = (SELECT auth.uid()))
  );

-- Chat conversation previews (WhatsApp-style list)
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_preview text;

CREATE OR REPLACE FUNCTION private.touch_chat_conversation_preview()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.chat_conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = CASE
      WHEN NEW.deleted_at IS NOT NULL THEN 'Message deleted'
      ELSE left(COALESCE(NEW.body, ''), 160)
    END,
    updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_touch_conversation ON public.chat_messages;
CREATE TRIGGER chat_messages_touch_conversation
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION private.touch_chat_conversation_preview();

-- Backfill previews from latest messages
UPDATE public.chat_conversations c
SET
  last_message_at = latest.created_at,
  last_message_preview = left(COALESCE(latest.body, ''), 160)
FROM (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    created_at,
    body,
    deleted_at
  FROM public.chat_messages
  ORDER BY conversation_id, created_at DESC
) latest
WHERE c.id = latest.conversation_id;

-- Clearer mail recipient validation
CREATE OR REPLACE FUNCTION public.send_internal_mail(
  mail_subject text,
  mail_body text,
  to_ids uuid[],
  cc_ids uuid[] DEFAULT ARRAY[]::uuid[],
  bcc_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  new_mail_id uuid;
  recipient uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF char_length(trim(COALESCE(mail_subject, ''))) NOT BETWEEN 1 AND 250 THEN
    RAISE EXCEPTION 'Subject is required';
  END IF;
  IF char_length(COALESCE(mail_body, '')) NOT BETWEEN 1 AND 50000 THEN
    RAISE EXCEPTION 'Message is required';
  END IF;
  IF cardinality(COALESCE(to_ids, ARRAY[]::uuid[])) = 0 THEN
    RAISE EXCEPTION 'At least one To recipient is required';
  END IF;

  FOREACH recipient IN ARRAY (
    COALESCE(to_ids, ARRAY[]::uuid[])
    || COALESCE(cc_ids, ARRAY[]::uuid[])
    || COALESCE(bcc_ids, ARRAY[]::uuid[])
  )
  LOOP
    IF recipient IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_profiles p
      WHERE p.id = recipient AND p.is_active = true
    ) THEN
      RAISE EXCEPTION 'Recipient is not an active workspace user';
    END IF;
  END LOOP;

  INSERT INTO public.internal_mail (sender_id, subject, body)
  VALUES ((SELECT auth.uid()), trim(mail_subject), mail_body)
  RETURNING id INTO new_mail_id;

  INSERT INTO public.internal_mail_recipients (mail_id, recipient_id, recipient_type)
  SELECT new_mail_id, recipient_id, recipient_type
  FROM (
    SELECT DISTINCT ON (recipient_id) recipient_id, recipient_type
    FROM (
      SELECT unnest(COALESCE(to_ids, ARRAY[]::uuid[])) AS recipient_id, 'to'::text AS recipient_type, 1 AS priority
      UNION ALL
      SELECT unnest(COALESCE(cc_ids, ARRAY[]::uuid[])), 'cc'::text, 2
      UNION ALL
      SELECT unnest(COALESCE(bcc_ids, ARRAY[]::uuid[])), 'bcc'::text, 3
    ) candidates
    ORDER BY recipient_id, priority
  ) recipients;

  RETURN new_mail_id;
END;
$$;
