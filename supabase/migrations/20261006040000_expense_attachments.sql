/* Expense attachments: invoices / receipts (PDF, JPG, PNG, WEBP; max 10 MB each)
   attached to operating expenses (/admin/expenses).

   - Files live in the EXISTING private bucket `internal-files` under
       expenses/<expense_id>/<random-uuid>-<safe-file-name>
     No new bucket. Downloads are short-lived signed URLs only.
   - Metadata table public.expense_attachments. Access mirrors public.expenses
     (policy workspace_manage_expenses = private.can_manage_receivables(),
     i.e. active admin / staff / accounts).
   - Writes go through SECURITY DEFINER RPCs that validate the path, type, size
     and expense status, and write private.write_audit_log entries
     (entity_type 'expense', actions 'attachment_add' / 'attachment_remove').
   - Storage policies are ADDITIVE (new expense_files_* policies). The existing
     internal_files_select / _insert / _delete policies (chat, mail, requests,
     vehicles) are NOT modified.
   - Cancelled expenses are read-only (attachments can be viewed, not added or
     removed). Draft and posted expenses accept attachments, because invoices
     often arrive after payment is posted.

   Idempotent: safe to re-run.
*/

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_access_expense_file(check_expense_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.can_manage_receivables()
    AND EXISTS (SELECT 1 FROM public.expenses WHERE id = check_expense_id);
$$;

REVOKE ALL ON FUNCTION private.can_access_expense_file(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_expense_file(uuid) TO authenticated;

-- Parses a storage object name `expenses/<uuid>/<file>` without ever casting a
-- non-uuid segment (so it is safe to evaluate against any internal-files row).
CREATE OR REPLACE FUNCTION private.can_access_expense_object(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parts text[] := string_to_array(COALESCE(p_object_name, ''), '/');
BEGIN
  IF cardinality(parts) < 3 OR parts[1] IS DISTINCT FROM 'expenses' OR COALESCE(parts[3], '') = '' THEN
    RETURN false;
  END IF;
  IF parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  RETURN private.can_access_expense_file(parts[2]::uuid);
END;
$$;

REVOKE ALL ON FUNCTION private.can_access_expense_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_expense_object(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 250),
  mime_type text NOT NULL CHECK (
    mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  ),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  uploaded_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_attachments_storage_path_uidx UNIQUE (storage_path),
  CONSTRAINT expense_attachments_storage_path_prefix_chk CHECK (
    left(storage_path, char_length('expenses/' || expense_id::text || '/'))
      = 'expenses/' || expense_id::text || '/'
    AND char_length(storage_path) > char_length('expenses/' || expense_id::text || '/')
  )
);

COMMENT ON TABLE public.expense_attachments IS
  'Invoices / receipts for operating expenses. Files in private bucket internal-files under expenses/<expense_id>/. Write via register_/delete_expense_attachment RPCs.';

CREATE INDEX IF NOT EXISTS expense_attachments_expense_created_idx
  ON public.expense_attachments (expense_id, created_at DESC);
CREATE INDEX IF NOT EXISTS expense_attachments_uploaded_by_idx
  ON public.expense_attachments (uploaded_by)
  WHERE uploaded_by IS NOT NULL;

ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;

-- Mirrors public.expenses (workspace_manage_expenses). Direct writes are not
-- granted; inserts/deletes happen only through the RPCs below.
DROP POLICY IF EXISTS receivables_read_expense_attachments ON public.expense_attachments;
CREATE POLICY receivables_read_expense_attachments
  ON public.expense_attachments FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_receivables()));

REVOKE ALL ON public.expense_attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.expense_attachments TO authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_expense_attachment(
  p_expense_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text DEFAULT NULL,
  p_size_bytes bigint DEFAULT NULL
)
RETURNS public.expense_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  exp public.expenses%ROWTYPE;
  clean_name text := NULLIF(btrim(COALESCE(p_file_name, '')), '');
  clean_path text := NULLIF(btrim(COALESCE(p_storage_path, '')), '');
  expected_prefix text := 'expenses/' || p_expense_id::text || '/';
  obj_metadata jsonb;
  v_mime text;
  v_size bigint;
  v_count integer;
  new_row public.expense_attachments%ROWTYPE;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Expense access required';
  END IF;

  SELECT * INTO exp FROM public.expenses WHERE id = p_expense_id;
  IF exp.id IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;
  IF exp.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled expenses are read-only';
  END IF;

  IF clean_name IS NULL OR char_length(clean_name) > 250 THEN
    RAISE EXCEPTION 'File name must be 1 to 250 characters';
  END IF;
  IF clean_path IS NULL
    OR left(clean_path, char_length(expected_prefix)) IS DISTINCT FROM expected_prefix
    OR char_length(clean_path) <= char_length(expected_prefix)
    OR position('/' IN substr(clean_path, char_length(expected_prefix) + 1)) > 0 THEN
    RAISE EXCEPTION 'Attachment path must stay under this expense folder';
  END IF;

  -- The file must already be uploaded; prefer the storage-reported type/size.
  SELECT o.metadata INTO obj_metadata
  FROM storage.objects o
  WHERE o.bucket_id = 'internal-files' AND o.name = clean_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Uploaded file not found';
  END IF;

  v_mime := lower(COALESCE(NULLIF(obj_metadata->>'mimetype', ''), NULLIF(btrim(p_mime_type), '')));
  v_size := COALESCE(NULLIF(obj_metadata->>'size', '')::bigint, p_size_bytes);

  IF v_mime IS NULL OR v_mime NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'Only PDF, JPG, PNG or WEBP files can be attached';
  END IF;
  IF v_size IS NULL OR v_size < 1 OR v_size > 10485760 THEN
    RAISE EXCEPTION 'Attachment must be 10 MB or smaller';
  END IF;

  SELECT count(*) INTO v_count FROM public.expense_attachments WHERE expense_id = p_expense_id;
  IF v_count >= 25 THEN
    RAISE EXCEPTION 'An expense can have at most 25 attachments';
  END IF;

  INSERT INTO public.expense_attachments (
    expense_id, storage_path, file_name, mime_type, size_bytes, uploaded_by
  ) VALUES (
    p_expense_id, clean_path, clean_name, v_mime, v_size, actor
  )
  RETURNING * INTO new_row;

  PERFORM private.write_audit_log(
    'attachment_add',
    'expense',
    p_expense_id,
    jsonb_build_object(
      'expense_number', exp.expense_number,
      'attachment_id', new_row.id,
      'file_name', new_row.file_name,
      'mime_type', new_row.mime_type,
      'size_bytes', new_row.size_bytes,
      'storage_path', new_row.storage_path
    ),
    actor
  );

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.register_expense_attachment(uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_expense_attachment(uuid, text, text, text, bigint) TO authenticated;

-- Deletes the metadata row and returns the storage path; the client then
-- removes the object through the Storage API (direct DELETE on storage.objects
-- is blocked by Supabase's protect_objects_delete trigger).
CREATE OR REPLACE FUNCTION public.delete_expense_attachment(p_attachment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  current_row public.expense_attachments%ROWTYPE;
  exp public.expenses%ROWTYPE;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Expense access required';
  END IF;

  SELECT * INTO current_row
  FROM public.expense_attachments
  WHERE id = p_attachment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attachment not found';
  END IF;

  SELECT * INTO exp FROM public.expenses WHERE id = current_row.expense_id;
  IF exp.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled expenses are read-only';
  END IF;

  DELETE FROM public.expense_attachments WHERE id = p_attachment_id;

  PERFORM private.write_audit_log(
    'attachment_remove',
    'expense',
    current_row.expense_id,
    jsonb_build_object(
      'expense_number', exp.expense_number,
      'attachment_id', current_row.id,
      'file_name', current_row.file_name,
      'mime_type', current_row.mime_type,
      'size_bytes', current_row.size_bytes,
      'storage_path', current_row.storage_path
    ),
    actor
  );

  RETURN current_row.storage_path;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_expense_attachment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_expense_attachment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage policies (internal-files, expenses/ prefix only; additive)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS expense_files_select ON storage.objects;
CREATE POLICY expense_files_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'internal-files'
  AND (storage.foldername(name))[1] = 'expenses'
  AND private.can_access_expense_object(name)
);

DROP POLICY IF EXISTS expense_files_insert ON storage.objects;
CREATE POLICY expense_files_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'internal-files'
  AND owner_id = (SELECT auth.uid()::text)
  AND (storage.foldername(name))[1] = 'expenses'
  AND private.can_access_expense_object(name)
);

DROP POLICY IF EXISTS expense_files_delete ON storage.objects;
CREATE POLICY expense_files_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'internal-files'
  AND (storage.foldername(name))[1] = 'expenses'
  AND private.can_access_expense_object(name)
);
