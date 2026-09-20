/* Phase 68: hard-delete export shipments + workspace request tickets.

- delete_export_shipment: ops can delete draft/cancelled; other statuses need
  account-admin p_force. Child vehicle/part/doc rows CASCADE; storage objects
  for export-shipment-documents are removed best-effort.
- delete_workspace_request: any active workspace user (Requests UI is ops-gated).
  Events/attachments/reminders CASCADE; attachment storage removed best-effort.
  Linked part_requests / inquiries are left intact (intake history).

Additive only.
*/

-- ---------------------------------------------------------------------------
-- delete_export_shipment — ops; draft/cancelled free, else admin force
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_export_shipment(
  p_shipment_id uuid,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ship public.export_shipments%ROWTYPE;
  v_vehicle_count integer := 0;
  v_part_count integer := 0;
  v_doc_count integer := 0;
  v_storage_deleted integer := 0;
  v_doc_paths text[];
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF p_shipment_id IS NULL THEN
    RAISE EXCEPTION 'Shipment id is required';
  END IF;

  SELECT * INTO ship FROM public.export_shipments WHERE id = p_shipment_id FOR UPDATE;
  IF ship.id IS NULL THEN
    RAISE EXCEPTION 'Export shipment not found';
  END IF;

  IF ship.status NOT IN ('draft', 'cancelled') THEN
    IF NOT coalesce(p_force, false) THEN
      RAISE EXCEPTION
        'Only draft or cancelled shipments can be deleted. Cancel first, or an account admin may force-delete.';
    END IF;
    IF NOT private.is_account_admin() THEN
      RAISE EXCEPTION 'Account admin required to force-delete a non-draft/cancelled shipment';
    END IF;
  END IF;

  SELECT count(*)::integer INTO v_vehicle_count
  FROM public.export_shipment_vehicles
  WHERE export_shipment_id = p_shipment_id;

  SELECT count(*)::integer INTO v_part_count
  FROM public.export_shipment_parts
  WHERE export_shipment_id = p_shipment_id;

  SELECT coalesce(array_agg(storage_path), ARRAY[]::text[]), count(*)::integer
  INTO v_doc_paths, v_doc_count
  FROM public.export_shipment_documents
  WHERE export_shipment_id = p_shipment_id;

  IF v_doc_paths IS NOT NULL AND cardinality(v_doc_paths) > 0 THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'export-shipment-documents'
      AND name = ANY (v_doc_paths);
    GET DIAGNOSTICS v_storage_deleted = ROW_COUNT;
  END IF;

  DELETE FROM public.export_shipments WHERE id = p_shipment_id;

  PERFORM private.write_audit_log(
    'delete',
    'export_shipment',
    p_shipment_id,
    jsonb_build_object(
      'shipment_number', ship.shipment_number,
      'status', ship.status,
      'mode', ship.mode,
      'forced', coalesce(p_force, false) AND ship.status NOT IN ('draft', 'cancelled'),
      'vehicles_deleted', v_vehicle_count,
      'parts_deleted', v_part_count,
      'documents_deleted', v_doc_count,
      'storage_objects_deleted', v_storage_deleted
    )
  );

  RETURN jsonb_build_object(
    'shipment_id', p_shipment_id,
    'shipment_number', ship.shipment_number,
    'status', ship.status,
    'vehicles_deleted', v_vehicle_count,
    'parts_deleted', v_part_count,
    'documents_deleted', v_doc_count,
    'storage_objects_deleted', v_storage_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_export_shipment(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_export_shipment(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.delete_export_shipment(uuid, boolean) IS
  'Phase 68: ops hard-delete of draft/cancelled export shipments; account-admin p_force for other statuses. Cascades lines/docs; cleans export-shipment-documents storage.';

-- ---------------------------------------------------------------------------
-- delete_workspace_request — workspace users (Requests UI ops-gated)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_workspace_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.workspace_requests%ROWTYPE;
  v_event_count integer := 0;
  v_attachment_count integer := 0;
  v_storage_deleted integer := 0;
  v_attachment_paths text[];
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Request id is required';
  END IF;

  SELECT * INTO req FROM public.workspace_requests WHERE id = p_request_id FOR UPDATE;
  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  SELECT count(*)::integer INTO v_event_count
  FROM public.workspace_request_events
  WHERE request_id = p_request_id;

  SELECT coalesce(array_agg(storage_path), ARRAY[]::text[]), count(*)::integer
  INTO v_attachment_paths, v_attachment_count
  FROM public.workspace_request_attachments
  WHERE request_id = p_request_id;

  IF v_attachment_paths IS NOT NULL AND cardinality(v_attachment_paths) > 0 THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'internal-files'
      AND name = ANY (v_attachment_paths);
    GET DIAGNOSTICS v_storage_deleted = ROW_COUNT;
  END IF;

  DELETE FROM public.workspace_requests WHERE id = p_request_id;

  PERFORM private.write_audit_log(
    'delete',
    'workspace_request',
    p_request_id,
    jsonb_build_object(
      'title', req.title,
      'request_type', req.request_type,
      'status', req.status,
      'events_deleted', v_event_count,
      'attachments_deleted', v_attachment_count,
      'storage_objects_deleted', v_storage_deleted,
      'part_request_id', req.part_request_id,
      'inquiry_id', req.inquiry_id
    )
  );

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'title', req.title,
    'request_type', req.request_type,
    'status', req.status,
    'events_deleted', v_event_count,
    'attachments_deleted', v_attachment_count,
    'storage_objects_deleted', v_storage_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_workspace_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_workspace_request(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_workspace_request(uuid) IS
  'Phase 68: workspace-user hard-delete of a request ticket (events/attachments/reminders CASCADE; internal-files cleaned best-effort). Intake rows kept.';
