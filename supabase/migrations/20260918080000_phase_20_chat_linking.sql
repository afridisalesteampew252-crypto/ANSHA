/* Phase 20: attach existing chat conversations to ERP entities. No second chat product. */

CREATE TABLE IF NOT EXISTS public.chat_conversation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN (
    'vehicle',
    'customer',
    'inquiry',
    'invoice',
    'request'
  )),
  entity_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_conversation_links_unique UNIQUE (conversation_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS chat_conversation_links_conversation_idx
  ON public.chat_conversation_links (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_conversation_links_entity_idx
  ON public.chat_conversation_links (entity_type, entity_id);

ALTER TABLE public.chat_conversation_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_links_select ON public.chat_conversation_links;
CREATE POLICY chat_links_select
  ON public.chat_conversation_links FOR SELECT TO authenticated
  USING ((SELECT private.is_chat_member(conversation_id)));

REVOKE ALL ON public.chat_conversation_links FROM PUBLIC, anon;
GRANT SELECT ON public.chat_conversation_links TO authenticated;

CREATE OR REPLACE FUNCTION private.chat_link_entity_exists(p_entity_type text, p_entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_entity_type = 'vehicle' THEN
    RETURN EXISTS (SELECT 1 FROM public.vehicles WHERE id = p_entity_id);
  ELSIF p_entity_type = 'customer' THEN
    RETURN EXISTS (SELECT 1 FROM public.customers WHERE id = p_entity_id);
  ELSIF p_entity_type = 'inquiry' THEN
    RETURN EXISTS (SELECT 1 FROM public.inquiries WHERE id = p_entity_id);
  ELSIF p_entity_type = 'invoice' THEN
    RETURN EXISTS (SELECT 1 FROM public.invoices WHERE id = p_entity_id);
  ELSIF p_entity_type = 'request' THEN
    RETURN EXISTS (SELECT 1 FROM public.workspace_requests WHERE id = p_entity_id);
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_chat_conversation(
  p_conversation_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
RETURNS public.chat_conversation_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  new_row public.chat_conversation_links%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF NOT private.is_chat_member(p_conversation_id, actor) THEN
    RAISE EXCEPTION 'Conversation membership required';
  END IF;
  IF p_entity_type NOT IN ('vehicle', 'customer', 'inquiry', 'invoice', 'request') THEN
    RAISE EXCEPTION 'Invalid link entity type';
  END IF;
  IF NOT private.chat_link_entity_exists(p_entity_type, p_entity_id) THEN
    RAISE EXCEPTION 'Linked record not found';
  END IF;

  INSERT INTO public.chat_conversation_links (
    conversation_id, entity_type, entity_id, created_by
  ) VALUES (
    p_conversation_id, p_entity_type, p_entity_id, actor
  )
  ON CONFLICT (conversation_id, entity_type, entity_id) DO UPDATE
    SET created_by = EXCLUDED.created_by
  RETURNING * INTO new_row;

  UPDATE public.chat_conversations
  SET updated_at = now()
  WHERE id = p_conversation_id;

  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_chat_conversation(p_link_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  target public.chat_conversation_links%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  SELECT * INTO target
  FROM public.chat_conversation_links
  WHERE id = p_link_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link not found';
  END IF;
  IF NOT private.is_chat_member(target.conversation_id, actor) THEN
    RAISE EXCEPTION 'Conversation membership required';
  END IF;

  DELETE FROM public.chat_conversation_links WHERE id = p_link_id;

  UPDATE public.chat_conversations
  SET updated_at = now()
  WHERE id = target.conversation_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.link_chat_conversation(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_chat_conversation(uuid, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.unlink_chat_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_chat_conversation(uuid) TO authenticated;
