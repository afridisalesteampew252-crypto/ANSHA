/* Phase 9 follow-up: cover every new foreign key used by communication workflows. */

CREATE INDEX chat_conversations_created_by_idx ON public.chat_conversations(created_by);
CREATE INDEX chat_messages_reply_to_id_idx ON public.chat_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX chat_attachments_uploaded_by_idx ON public.chat_attachments(uploaded_by);
CREATE INDEX internal_mail_attachments_uploaded_by_idx ON public.internal_mail_attachments(uploaded_by);
