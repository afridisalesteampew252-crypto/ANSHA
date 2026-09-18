/* Phase 47: lifecycle hardening — event attachments + stricter stage transitions.

Additive. Preserves existing vehicle_lifecycle_events rows.
Workspace access unchanged (private.is_workspace_user).
Non-recommended stage jumps require p_force + private.is_account_admin() + reason notes.
*/

-- ---------------------------------------------------------------------------
-- Recommended next stage (SQL mirror of lib/vehicle-lifecycle.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.recommended_next_lifecycle_stage(p_from text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_from
    WHEN 'unassigned' THEN 'auction'
    WHEN 'auction' THEN 'yard'
    WHEN 'yard' THEN 'port'
    WHEN 'port' THEN 'sold'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION private.recommended_next_lifecycle_stage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.recommended_next_lifecycle_stage(text) TO authenticated;

COMMENT ON FUNCTION private.recommended_next_lifecycle_stage(text) IS
  'Phase 47: forward path unassigned→auction→yard→port→sold. NULL means no recommended next (e.g. sold).';

-- ---------------------------------------------------------------------------
-- Stricter transition_vehicle_lifecycle (drop 4-arg; recreate with p_force)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.transition_vehicle_lifecycle(uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION public.transition_vehicle_lifecycle(
  p_vehicle_id uuid,
  p_to_stage text,
  p_notes text DEFAULT NULL,
  p_sync_stock_sold boolean DEFAULT true,
  p_force boolean DEFAULT false
)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_row public.vehicles%ROWTYPE;
  previous_stage text;
  recommended text;
  actor uuid := auth.uid();
  clean_notes text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  event_meta jsonb := '{}'::jsonb;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_to_stage NOT IN ('unassigned', 'auction', 'yard', 'port', 'sold') THEN
    RAISE EXCEPTION 'Invalid lifecycle stage';
  END IF;

  SELECT * INTO current_row
  FROM public.vehicles
  WHERE id = p_vehicle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  previous_stage := current_row.lifecycle_stage;

  IF previous_stage IS NOT DISTINCT FROM p_to_stage THEN
    RAISE EXCEPTION 'Vehicle is already in that lifecycle stage';
  END IF;

  recommended := private.recommended_next_lifecycle_stage(previous_stage);

  IF p_to_stage IS DISTINCT FROM recommended THEN
    IF NOT COALESCE(p_force, false) THEN
      RAISE EXCEPTION
        'Lifecycle jump blocked: move % → % is outside the recommended path (next is %). Account admins may override with p_force and a reason in notes.',
        initcap(replace(previous_stage, '_', ' ')),
        initcap(replace(p_to_stage, '_', ' ')),
        COALESCE(initcap(replace(recommended, '_', ' ')), 'none');
    END IF;
    IF NOT private.is_account_admin() THEN
      RAISE EXCEPTION 'Only account admins can force a lifecycle stage jump';
    END IF;
    IF clean_notes IS NULL THEN
      RAISE EXCEPTION 'Forced lifecycle jumps require a reason in notes';
    END IF;
    event_meta := jsonb_build_object(
      'forced', true,
      'recommended_next', to_jsonb(recommended),
      'force_reason', to_jsonb(clean_notes)
    );
  END IF;

  UPDATE public.vehicles
  SET
    lifecycle_stage = p_to_stage,
    stock_status = CASE
      WHEN p_sync_stock_sold AND p_to_stage = 'sold' THEN 'sold'
      ELSE stock_status
    END,
    updated_at = now()
  WHERE id = p_vehicle_id
  RETURNING * INTO current_row;

  INSERT INTO public.vehicle_lifecycle_events (
    vehicle_id, event_type, from_stage, to_stage, title, notes, metadata, created_by
  ) VALUES (
    p_vehicle_id,
    'stage_change',
    previous_stage,
    p_to_stage,
    CASE
      WHEN (event_meta ? 'forced') THEN 'Forced move to ' || initcap(replace(p_to_stage, '_', ' '))
      ELSE 'Moved to ' || initcap(replace(p_to_stage, '_', ' '))
    END,
    clean_notes,
    event_meta,
    actor
  );

  RETURN current_row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_vehicle_lifecycle(uuid, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_vehicle_lifecycle(uuid, text, text, boolean, boolean) TO authenticated;

COMMENT ON FUNCTION public.transition_vehicle_lifecycle(uuid, text, text, boolean, boolean) IS
  'Phase 47: recommended forward hops only unless p_force + is_account_admin() + notes reason.';

-- ---------------------------------------------------------------------------
-- Attachments table
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_access_vehicle_lifecycle_file(
  check_vehicle_id uuid,
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
      FROM public.vehicles
      WHERE id = check_vehicle_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_access_vehicle_lifecycle_file(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_vehicle_lifecycle_file(uuid, uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.vehicle_lifecycle_event_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.vehicle_lifecycle_events(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (char_length(trim(file_name)) BETWEEN 1 AND 250),
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 26214400),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_lifecycle_event_attachments_event_created_idx
  ON public.vehicle_lifecycle_event_attachments (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_lifecycle_event_attachments_vehicle_created_idx
  ON public.vehicle_lifecycle_event_attachments (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_lifecycle_event_attachments_uploaded_by_idx
  ON public.vehicle_lifecycle_event_attachments (uploaded_by);

ALTER TABLE public.vehicle_lifecycle_event_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_read_vehicle_lifecycle_event_attachments
  ON public.vehicle_lifecycle_event_attachments;
CREATE POLICY workspace_read_vehicle_lifecycle_event_attachments
  ON public.vehicle_lifecycle_event_attachments FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

REVOKE ALL ON public.vehicle_lifecycle_event_attachments FROM PUBLIC, anon;
GRANT SELECT ON public.vehicle_lifecycle_event_attachments TO authenticated;

-- ---------------------------------------------------------------------------
-- Register / delete attachment RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_vehicle_lifecycle_event_attachment(
  p_event_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text DEFAULT NULL,
  p_size_bytes bigint DEFAULT NULL
)
RETURNS public.vehicle_lifecycle_event_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  event_row public.vehicle_lifecycle_events%ROWTYPE;
  clean_name text := NULLIF(btrim(COALESCE(p_file_name, '')), '');
  clean_path text := NULLIF(btrim(COALESCE(p_storage_path, '')), '');
  expected_prefix text;
  new_row public.vehicle_lifecycle_event_attachments%ROWTYPE;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO event_row
  FROM public.vehicle_lifecycle_events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lifecycle event not found';
  END IF;

  expected_prefix := 'vehicles/' || event_row.vehicle_id::text || '/lifecycle/' || event_row.id::text || '/';

  IF clean_name IS NULL OR char_length(clean_name) > 250 THEN
    RAISE EXCEPTION 'File name must be 1 to 250 characters';
  END IF;
  IF clean_path IS NULL OR left(clean_path, char_length(expected_prefix)) IS DISTINCT FROM expected_prefix THEN
    RAISE EXCEPTION 'Attachment path must stay under this lifecycle event folder';
  END IF;
  IF p_size_bytes IS NOT NULL AND (p_size_bytes < 0 OR p_size_bytes > 26214400) THEN
    RAISE EXCEPTION 'Attachment must be 25 MB or smaller';
  END IF;

  INSERT INTO public.vehicle_lifecycle_event_attachments (
    event_id, vehicle_id, uploaded_by, storage_path, file_name, mime_type, size_bytes
  ) VALUES (
    event_row.id,
    event_row.vehicle_id,
    actor,
    clean_path,
    clean_name,
    NULLIF(btrim(COALESCE(p_mime_type, '')), ''),
    p_size_bytes
  )
  RETURNING * INTO new_row;

  UPDATE public.vehicles
  SET updated_at = now()
  WHERE id = event_row.vehicle_id;

  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_vehicle_lifecycle_event_attachment(
  p_attachment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  current_row public.vehicle_lifecycle_event_attachments%ROWTYPE;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO current_row
  FROM public.vehicle_lifecycle_event_attachments
  WHERE id = p_attachment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attachment not found';
  END IF;

  DELETE FROM public.vehicle_lifecycle_event_attachments
  WHERE id = p_attachment_id;

  UPDATE public.vehicles
  SET updated_at = now()
  WHERE id = current_row.vehicle_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_vehicle_lifecycle_event_attachment(uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_vehicle_lifecycle_event_attachment(uuid, text, text, text, bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_vehicle_lifecycle_event_attachment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_vehicle_lifecycle_event_attachment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- internal-files storage policies (add vehicles/ prefix; keep chat/mail/requests)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS internal_files_select ON storage.objects;
CREATE POLICY internal_files_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'internal-files' AND (
    ((storage.foldername(name))[1] = 'chat' AND private.is_chat_member(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'mail' AND private.can_access_internal_mail(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'requests' AND private.can_access_workspace_request(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'vehicles' AND private.can_access_vehicle_lifecycle_file(((storage.foldername(name))[2])::uuid))
  )
);

DROP POLICY IF EXISTS internal_files_insert ON storage.objects;
CREATE POLICY internal_files_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'internal-files' AND owner_id = (SELECT auth.uid()::text) AND (
    ((storage.foldername(name))[1] = 'chat' AND private.is_chat_member(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'mail' AND private.can_access_internal_mail(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'requests' AND private.can_access_workspace_request(((storage.foldername(name))[2])::uuid)) OR
    ((storage.foldername(name))[1] = 'vehicles' AND private.can_access_vehicle_lifecycle_file(((storage.foldername(name))[2])::uuid))
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
    OR (
      (storage.foldername(name))[1] = 'vehicles'
      AND private.can_access_vehicle_lifecycle_file(((storage.foldername(name))[2])::uuid)
    )
  )
);
