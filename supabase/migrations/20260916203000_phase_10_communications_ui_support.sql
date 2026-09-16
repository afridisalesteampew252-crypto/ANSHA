/* Phase 10: reliable communications actions and secure self-service profiles. */

CREATE POLICY workspace_read_admin_profiles
ON public.admin_profiles
FOR SELECT
TO authenticated
USING (private.is_workspace_user());

CREATE POLICY self_update_admin_profile
ON public.admin_profiles
FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

/* Authenticated browser clients may only change non-privileged profile fields. */
REVOKE UPDATE ON public.admin_profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.admin_profiles TO authenticated;

CREATE POLICY workspace_read_profile_images
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'profile-images' AND private.is_workspace_user());

CREATE POLICY self_insert_profile_images
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-images'
  AND owner_id = (SELECT auth.uid()::text)
  AND (storage.foldername(name))[1] = 'self'
  AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
);

CREATE POLICY self_update_profile_images
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-images'
  AND owner_id = (SELECT auth.uid()::text)
  AND (storage.foldername(name))[1] = 'self'
  AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
)
WITH CHECK (
  bucket_id = 'profile-images'
  AND owner_id = (SELECT auth.uid()::text)
  AND (storage.foldername(name))[1] = 'self'
  AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
);

CREATE POLICY self_delete_profile_images
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-images'
  AND owner_id = (SELECT auth.uid()::text)
  AND (storage.foldername(name))[1] = 'self'
  AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
);

CREATE OR REPLACE FUNCTION public.create_chat_conversation(
  requested_type text,
  requested_name text,
  requested_participants uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  new_conversation_id uuid;
  clean_participants uuid[];
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT participant_id), ARRAY[]::uuid[])
  INTO clean_participants
  FROM unnest(COALESCE(requested_participants, ARRAY[]::uuid[])) participant_id
  WHERE participant_id <> (SELECT auth.uid());

  IF requested_type NOT IN ('direct', 'group') THEN
    RAISE EXCEPTION 'Invalid conversation type';
  END IF;
  IF requested_type = 'direct' AND cardinality(clean_participants) <> 1 THEN
    RAISE EXCEPTION 'A direct conversation requires exactly one colleague';
  END IF;
  IF requested_type = 'group' AND (cardinality(clean_participants) < 1 OR char_length(trim(COALESCE(requested_name, ''))) NOT BETWEEN 1 AND 120) THEN
    RAISE EXCEPTION 'A group needs a name and at least one colleague';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(clean_participants) participant_id
    WHERE NOT private.is_workspace_user(participant_id)
  ) THEN
    RAISE EXCEPTION 'Invalid workspace participant';
  END IF;

  INSERT INTO public.chat_conversations (conversation_type, name, created_by)
  VALUES (requested_type, CASE WHEN requested_type = 'group' THEN trim(requested_name) ELSE NULL END, (SELECT auth.uid()))
  RETURNING id INTO new_conversation_id;

  INSERT INTO public.chat_participants (conversation_id, user_id, is_manager)
  VALUES (new_conversation_id, (SELECT auth.uid()), true);

  INSERT INTO public.chat_participants (conversation_id, user_id, is_manager)
  SELECT new_conversation_id, participant_id, false
  FROM unnest(clean_participants) participant_id;

  RETURN new_conversation_id;
END;
$$;

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

REVOKE ALL ON FUNCTION public.create_chat_conversation(text, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_internal_mail(text, text, uuid[], uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_chat_conversation(text, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_internal_mail(text, text, uuid[], uuid[], uuid[]) TO authenticated;
