/* Phase 9: secure internal chat, group conversations, attachments, and internal mail. */

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_type text NOT NULL CHECK (conversation_type IN ('direct', 'group')),
  name text CHECK (name IS NULL OR char_length(trim(name)) BETWEEN 1 AND 120),
  created_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (conversation_type = 'group' OR name IS NULL)
);

CREATE TABLE public.chat_participants (
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  is_manager boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  body text CHECK (body IS NULL OR char_length(body) <= 10000),
  reply_to_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  CHECK (body IS NULL OR char_length(trim(body)) > 0)
);

CREATE TABLE public.chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 26214400),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.internal_mail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  subject text NOT NULL CHECK (char_length(trim(subject)) BETWEEN 1 AND 250),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 50000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.internal_mail_recipients (
  mail_id uuid NOT NULL REFERENCES public.internal_mail(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  recipient_type text NOT NULL DEFAULT 'to' CHECK (recipient_type IN ('to', 'cc', 'bcc')),
  read_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  PRIMARY KEY (mail_id, recipient_id)
);

CREATE TABLE public.internal_mail_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id uuid NOT NULL REFERENCES public.internal_mail(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 26214400),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_participants_user_id_idx ON public.chat_participants(user_id, joined_at DESC);
CREATE INDEX chat_messages_conversation_created_idx ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX chat_messages_sender_id_idx ON public.chat_messages(sender_id);
CREATE INDEX chat_attachments_message_id_idx ON public.chat_attachments(message_id);
CREATE INDEX internal_mail_sender_created_idx ON public.internal_mail(sender_id, created_at DESC);
CREATE INDEX internal_mail_recipients_recipient_idx ON public.internal_mail_recipients(recipient_id, read_at, mail_id);
CREATE INDEX internal_mail_attachments_mail_id_idx ON public.internal_mail_attachments(mail_id);

CREATE OR REPLACE FUNCTION private.is_workspace_user(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = check_user_id);
$$;

CREATE OR REPLACE FUNCTION private.is_chat_member(check_conversation_id uuid, check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE conversation_id = check_conversation_id AND user_id = check_user_id
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_chat(check_conversation_id uuid, check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = check_conversation_id AND created_by = check_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE conversation_id = check_conversation_id AND user_id = check_user_id AND is_manager
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_internal_mail(check_mail_id uuid, check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.internal_mail WHERE id = check_mail_id AND sender_id = check_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.internal_mail_recipients
    WHERE mail_id = check_mail_id AND recipient_id = check_user_id AND deleted_at IS NULL
  );
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_workspace_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_chat_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_chat(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_internal_mail(uuid, uuid) TO authenticated;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_mail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_mail_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_mail_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_conversations_select ON public.chat_conversations FOR SELECT TO authenticated
USING (private.is_chat_member(id) OR created_by = (SELECT auth.uid()));
CREATE POLICY chat_conversations_insert ON public.chat_conversations FOR INSERT TO authenticated
WITH CHECK (created_by = (SELECT auth.uid()) AND private.is_workspace_user());
CREATE POLICY chat_conversations_update ON public.chat_conversations FOR UPDATE TO authenticated
USING (private.can_manage_chat(id)) WITH CHECK (private.can_manage_chat(id));
CREATE POLICY chat_conversations_delete ON public.chat_conversations FOR DELETE TO authenticated
USING (created_by = (SELECT auth.uid()));

CREATE POLICY chat_participants_select ON public.chat_participants FOR SELECT TO authenticated
USING (private.is_chat_member(conversation_id) OR user_id = (SELECT auth.uid()) OR private.can_manage_chat(conversation_id));
CREATE POLICY chat_participants_insert ON public.chat_participants FOR INSERT TO authenticated
WITH CHECK (private.can_manage_chat(conversation_id) AND private.is_workspace_user(user_id));
CREATE POLICY chat_participants_update ON public.chat_participants FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) OR private.can_manage_chat(conversation_id))
WITH CHECK (user_id = (SELECT auth.uid()) OR private.can_manage_chat(conversation_id));
CREATE POLICY chat_participants_delete ON public.chat_participants FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()) OR private.can_manage_chat(conversation_id));

CREATE POLICY chat_messages_select ON public.chat_messages FOR SELECT TO authenticated
USING (private.is_chat_member(conversation_id));
CREATE POLICY chat_messages_insert ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = (SELECT auth.uid()) AND private.is_chat_member(conversation_id));
CREATE POLICY chat_messages_update ON public.chat_messages FOR UPDATE TO authenticated
USING (sender_id = (SELECT auth.uid()))
WITH CHECK (sender_id = (SELECT auth.uid()) AND private.is_chat_member(conversation_id));

CREATE POLICY chat_attachments_select ON public.chat_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.chat_messages message WHERE message.id = message_id AND private.is_chat_member(message.conversation_id)));
CREATE POLICY chat_attachments_insert ON public.chat_attachments FOR INSERT TO authenticated
WITH CHECK (uploaded_by = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.chat_messages message WHERE message.id = message_id AND message.sender_id = (SELECT auth.uid()) AND private.is_chat_member(message.conversation_id)));
CREATE POLICY chat_attachments_delete ON public.chat_attachments FOR DELETE TO authenticated
USING (uploaded_by = (SELECT auth.uid()));

CREATE POLICY internal_mail_select ON public.internal_mail FOR SELECT TO authenticated
USING (private.can_access_internal_mail(id));
CREATE POLICY internal_mail_insert ON public.internal_mail FOR INSERT TO authenticated
WITH CHECK (sender_id = (SELECT auth.uid()) AND private.is_workspace_user());

CREATE POLICY internal_mail_recipients_select ON public.internal_mail_recipients FOR SELECT TO authenticated
USING (recipient_id = (SELECT auth.uid()) OR EXISTS (SELECT 1 FROM public.internal_mail mail WHERE mail.id = mail_id AND mail.sender_id = (SELECT auth.uid())));
CREATE POLICY internal_mail_recipients_insert ON public.internal_mail_recipients FOR INSERT TO authenticated
WITH CHECK (private.is_workspace_user(recipient_id) AND EXISTS (SELECT 1 FROM public.internal_mail mail WHERE mail.id = mail_id AND mail.sender_id = (SELECT auth.uid())));
CREATE POLICY internal_mail_recipients_update ON public.internal_mail_recipients FOR UPDATE TO authenticated
USING (recipient_id = (SELECT auth.uid())) WITH CHECK (recipient_id = (SELECT auth.uid()));

CREATE POLICY internal_mail_attachments_select ON public.internal_mail_attachments FOR SELECT TO authenticated
USING (private.can_access_internal_mail(mail_id));
CREATE POLICY internal_mail_attachments_insert ON public.internal_mail_attachments FOR INSERT TO authenticated
WITH CHECK (uploaded_by = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.internal_mail mail WHERE mail.id = mail_id AND mail.sender_id = (SELECT auth.uid())));
CREATE POLICY internal_mail_attachments_delete ON public.internal_mail_attachments FOR DELETE TO authenticated
USING (uploaded_by = (SELECT auth.uid()));

REVOKE ALL ON public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_attachments,
  public.internal_mail, public.internal_mail_recipients, public.internal_mail_attachments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations, public.chat_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.chat_attachments TO authenticated;
GRANT SELECT, INSERT ON public.internal_mail TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.internal_mail_recipients TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.internal_mail_attachments TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('internal-files', 'internal-files', false, 26214400, ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
  'text/plain', 'text/csv', 'application/zip',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY internal_files_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'internal-files' AND (
    ((storage.foldername(name))[1] = 'chat' AND private.is_chat_member(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'mail' AND private.can_access_internal_mail(((storage.foldername(name))[2])::uuid))
  )
);
CREATE POLICY internal_files_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'internal-files' AND owner_id = (SELECT auth.uid()::text) AND (
    ((storage.foldername(name))[1] = 'chat' AND private.is_chat_member(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'mail' AND private.can_access_internal_mail(((storage.foldername(name))[2])::uuid))
  )
);
CREATE POLICY internal_files_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'internal-files' AND owner_id = (SELECT auth.uid()::text));

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
