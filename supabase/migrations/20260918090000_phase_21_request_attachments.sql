/* Phase 21: private attachments on staff request tickets. Intake tables unchanged. */

CREATE OR REPLACE FUNCTION private.can_access_workspace_request(
  check_request_id uuid,
  check_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_workspace_user(check_user_id)
    AND EXISTS (
      SELECT 1
      FROM public.workspace_requests
      WHERE id = check_request_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_access_workspace_request(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_workspace_request(uuid, uuid) TO authenticated;

ALTER TABLE public.workspace_request_events
  DROP CONSTRAINT IF EXISTS workspace_request_events_event_type_check;

ALTER TABLE public.workspace_request_events
  ADD CONSTRAINT workspace_request_events_event_type_check
  CHECK (event_type IN (
    'opened',
    'status_change',
    'assignment',
    'due_date',
    'note',
    'title_change',
    'attachment'
  ));

CREATE TABLE IF NOT EXISTS public.workspace_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.workspace_requests(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.workspace_request_events(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (char_length(trim(file_name)) BETWEEN 1 AND 250),
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 26214400),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_request_attachments_request_created_idx
  ON public.workspace_request_attachments (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workspace_request_attachments_uploaded_by_idx
  ON public.workspace_request_attachments (uploaded_by);
CREATE INDEX IF NOT EXISTS workspace_request_attachments_event_id_idx
  ON public.workspace_request_attachments (event_id)
  WHERE event_id IS NOT NULL;

ALTER TABLE public.workspace_request_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_read_workspace_request_attachments ON public.workspace_request_attachments;
CREATE POLICY workspace_read_workspace_request_attachments
  ON public.workspace_request_attachments FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

REVOKE ALL ON public.workspace_request_attachments FROM PUBLIC, anon;
GRANT SELECT ON public.workspace_request_attachments TO authenticated;

CREATE OR REPLACE FUNCTION public.register_workspace_request_attachment(
  p_request_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text DEFAULT NULL,
  p_size_bytes bigint DEFAULT NULL
)
RETURNS public.workspace_request_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  clean_name text := NULLIF(btrim(COALESCE(p_file_name, '')), '');
  clean_path text := NULLIF(btrim(COALESCE(p_storage_path, '')), '');
  expected_prefix text := 'requests/' || p_request_id::text || '/';
  new_event public.workspace_request_events%ROWTYPE;
  new_row public.workspace_request_attachments%ROWTYPE;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_requests WHERE id = p_request_id) THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF clean_name IS NULL OR char_length(clean_name) > 250 THEN
    RAISE EXCEPTION 'File name must be 1 to 250 characters';
  END IF;
  IF clean_path IS NULL OR left(clean_path, char_length(expected_prefix)) IS DISTINCT FROM expected_prefix THEN
    RAISE EXCEPTION 'Attachment path must stay under this request folder';
  END IF;
  IF p_size_bytes IS NOT NULL AND (p_size_bytes < 0 OR p_size_bytes > 26214400) THEN
    RAISE EXCEPTION 'Attachment must be 25 MB or smaller';
  END IF;

  INSERT INTO public.workspace_request_events (
    request_id, event_type, notes, created_by
  ) VALUES (
    p_request_id, 'attachment', 'Added ' || clean_name, actor
  )
  RETURNING * INTO new_event;

  INSERT INTO public.workspace_request_attachments (
    request_id, event_id, uploaded_by, storage_path, file_name, mime_type, size_bytes
  ) VALUES (
    p_request_id, new_event.id, actor, clean_path, clean_name, NULLIF(btrim(COALESCE(p_mime_type, '')), ''), p_size_bytes
  )
  RETURNING * INTO new_row;

  UPDATE public.workspace_requests
  SET updated_at = now()
  WHERE id = p_request_id;

  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_workspace_request_attachment(
  p_attachment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  current_row public.workspace_request_attachments%ROWTYPE;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO current_row
  FROM public.workspace_request_attachments
  WHERE id = p_attachment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attachment not found';
  END IF;

  DELETE FROM public.workspace_request_attachments
  WHERE id = p_attachment_id;

  INSERT INTO public.workspace_request_events (
    request_id, event_type, notes, created_by
  ) VALUES (
    current_row.request_id, 'attachment', 'Removed ' || current_row.file_name, actor
  );

  UPDATE public.workspace_requests
  SET updated_at = now()
  WHERE id = current_row.request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_workspace_request_attachment(uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_workspace_request_attachment(uuid, text, text, text, bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_workspace_request_attachment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_workspace_request_attachment(uuid) TO authenticated;

DROP POLICY IF EXISTS internal_files_select ON storage.objects;
CREATE POLICY internal_files_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'internal-files' AND (
    ((storage.foldername(name))[1] = 'chat' AND private.is_chat_member(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'mail' AND private.can_access_internal_mail(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'requests' AND private.can_access_workspace_request(((storage.foldername(name))[2])::uuid))
  )
);

DROP POLICY IF EXISTS internal_files_insert ON storage.objects;
CREATE POLICY internal_files_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'internal-files' AND owner_id = (SELECT auth.uid()::text) AND (
    ((storage.foldername(name))[1] = 'chat' AND private.is_chat_member(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'mail' AND private.can_access_internal_mail(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'requests' AND private.can_access_workspace_request(((storage.foldername(name))[2])::uuid))
  )
);

DROP POLICY IF EXISTS internal_files_delete ON storage.objects;
CREATE POLICY internal_files_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'internal-files' AND (
    owner_id = (SELECT auth.uid()::text)
    OR (
      (storage.foldername(name))[1] = 'requests'
      AND private.can_access_workspace_request(((storage.foldername(name))[2])::uuid)
    )
  )
);
