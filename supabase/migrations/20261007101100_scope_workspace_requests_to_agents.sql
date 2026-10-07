/*
  Verified agents see only assigned workspace tickets, plus their own unassigned
  inquiry submissions. Creating a lead remains create_agent_inquiry()'s job;
  existing ticket RPCs cannot grant an agent their own assignment.
  Inquiry assignment and customer-account ownership are independent workflows.
*/

CREATE OR REPLACE FUNCTION private.can_access_workspace_request(
  check_request_id uuid,
  check_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT check_user_id IS NOT NULL
    AND check_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workspace_requests r
      WHERE r.id = check_request_id
        AND (
          (SELECT private.is_ops_user())
          OR (
            private.is_verified_sales_agent(check_user_id)
            AND (
              r.assigned_to = check_user_id
              OR (r.inquiry_id IS NOT NULL AND private.can_read_sales_inquiry(r.inquiry_id))
            )
          )
          OR (
            r.inquiry_id IS NULL AND r.request_type <> 'inquiry'
            AND private.is_workspace_user(check_user_id)
            AND NOT (SELECT private.is_field_agent())
            AND (
              r.assigned_to = check_user_id
              OR ((SELECT private.is_manager()) AND EXISTS (
                SELECT 1 FROM public.customers c WHERE c.id = r.customer_id AND c.owner_id = check_user_id
              ))
            )
          )
        )
    );
$$;
REVOKE ALL ON FUNCTION private.can_access_workspace_request(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_workspace_request(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_manage_workspace_request(check_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_requests r WHERE r.id = check_request_id
      AND (
        (SELECT private.is_ops_user())
        OR (private.is_verified_sales_agent((SELECT auth.uid())) AND r.assigned_to = (SELECT auth.uid()))
        OR (
          r.inquiry_id IS NULL AND r.request_type <> 'inquiry'
          AND (SELECT private.is_workspace_user()) AND NOT (SELECT private.is_field_agent())
          AND (
            r.assigned_to = (SELECT auth.uid())
            OR ((SELECT private.is_manager()) AND EXISTS (
              SELECT 1 FROM public.customers c WHERE c.id = r.customer_id AND c.owner_id = (SELECT auth.uid())
            ))
          )
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION private.can_manage_workspace_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_workspace_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_access_workspace_request_file(p_name text, p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE folders text[] := storage.foldername(p_name); request_id uuid;
BEGIN
  IF folders[1] IS DISTINCT FROM 'requests' OR folders[2] IS NULL
     OR folders[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  request_id := folders[2]::uuid;
  IF p_write THEN RETURN private.can_manage_workspace_request(request_id); END IF;
  RETURN private.can_access_workspace_request(request_id);
END;
$$;
REVOKE ALL ON FUNCTION private.can_access_workspace_request_file(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_workspace_request_file(text, boolean) TO authenticated;

DROP POLICY IF EXISTS workspace_read_workspace_requests ON public.workspace_requests;
CREATE POLICY workspace_read_workspace_requests ON public.workspace_requests
FOR SELECT TO authenticated USING ((SELECT private.can_access_workspace_request(id)));
DROP POLICY IF EXISTS workspace_read_workspace_request_events ON public.workspace_request_events;
CREATE POLICY workspace_read_workspace_request_events ON public.workspace_request_events
FOR SELECT TO authenticated USING ((SELECT private.can_access_workspace_request(request_id)));
DROP POLICY IF EXISTS workspace_read_workspace_request_attachments ON public.workspace_request_attachments;
CREATE POLICY workspace_read_workspace_request_attachments ON public.workspace_request_attachments
FOR SELECT TO authenticated USING ((SELECT private.can_access_workspace_request(request_id)));
DROP POLICY IF EXISTS workspace_read_workspace_request_due_reminders ON public.workspace_request_due_reminders;
CREATE POLICY workspace_read_workspace_request_due_reminders ON public.workspace_request_due_reminders
FOR SELECT TO authenticated USING (
  (SELECT private.is_ops_user())
  OR (assignee_id = (SELECT auth.uid()) AND (SELECT private.can_access_workspace_request(request_id)))
);

-- Mutation is through the checked RPCs. These tables contain internal activity;
-- customer portal inquiry reads remain governed by the inquiry's own policies.
REVOKE ALL ON TABLE public.workspace_requests, public.workspace_request_events,
  public.workspace_request_attachments, public.workspace_request_due_reminders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.workspace_requests, public.workspace_request_events,
  public.workspace_request_attachments, public.workspace_request_due_reminders TO authenticated;

DROP POLICY IF EXISTS internal_files_select ON storage.objects;
CREATE POLICY internal_files_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'internal-files' AND (
    ((storage.foldername(name))[1] = 'chat' AND private.is_chat_member(((storage.foldername(name))[2])::uuid))
    OR ((storage.foldername(name))[1] = 'mail' AND private.can_access_internal_mail(((storage.foldername(name))[2])::uuid))
    OR private.can_access_workspace_request_file(name)
    OR ((storage.foldername(name))[1] = 'vehicles' AND private.can_access_vehicle_lifecycle_file(((storage.foldername(name))[2])::uuid))
  )
);
DROP POLICY IF EXISTS internal_files_insert ON storage.objects;
CREATE POLICY internal_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'internal-files' AND owner_id = (SELECT auth.uid()::text) AND (
    ((storage.foldername(name))[1] = 'chat' AND private.is_chat_member(((storage.foldername(name))[2])::uuid))
    OR ((storage.foldername(name))[1] = 'mail' AND private.can_access_internal_mail(((storage.foldername(name))[2])::uuid))
    OR private.can_access_workspace_request_file(name, true)
    OR ((storage.foldername(name))[1] = 'vehicles' AND private.can_access_vehicle_lifecycle_file(((storage.foldername(name))[2])::uuid))
  )
);
DROP POLICY IF EXISTS internal_files_delete ON storage.objects;
CREATE POLICY internal_files_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'internal-files' AND CASE
    WHEN (storage.foldername(name))[1] = 'requests' THEN private.can_access_workspace_request_file(name, true)
    ELSE owner_id = (SELECT auth.uid()::text)
      OR ((storage.foldername(name))[1] = 'vehicles' AND private.can_access_vehicle_lifecycle_file(((storage.foldername(name))[2])::uuid))
    END
);

CREATE OR REPLACE FUNCTION public.create_workspace_request(
  p_request_type text, p_title text, p_notes text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL, p_due_at timestamptz DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL, p_customer_id uuid DEFAULT NULL,
  p_inquiry_id uuid DEFAULT NULL, p_part_request_id uuid DEFAULT NULL
)
RETURNS public.workspace_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
  clean_title text := nullif(btrim(coalesce(p_title, '')), '');
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  next_customer_id uuid := p_customer_id;
  new_row public.workspace_requests%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT (SELECT private.is_ops_user()) THEN
    RAISE EXCEPTION 'Ops access required; agents submit leads through the inquiry workflow' USING ERRCODE = '42501';
  END IF;
  IF p_assigned_to IS NOT NULL AND NOT (SELECT private.is_account_admin()) THEN
    RAISE EXCEPTION 'Only an admin can assign requests' USING ERRCODE = '42501';
  END IF;
  IF p_request_type IS NULL OR p_request_type NOT IN ('inquiry','part_request','bl','inspection','shipping','other') THEN
    RAISE EXCEPTION 'Invalid request type';
  END IF;
  IF p_request_type = 'inquiry' AND p_inquiry_id IS NULL THEN RAISE EXCEPTION 'Inquiry tickets require inquiry_id'; END IF;
  IF p_request_type = 'part_request' AND p_part_request_id IS NULL THEN RAISE EXCEPTION 'Part request tickets require part_request_id'; END IF;
  IF clean_title IS NULL OR char_length(clean_title) > 160 THEN RAISE EXCEPTION 'Title must be 1 to 160 characters'; END IF;
  IF char_length(clean_notes) > 5000 THEN RAISE EXCEPTION 'Notes are too long'; END IF;
  IF p_inquiry_id IS NOT NULL THEN
    -- Match the inquiry workflow's request-first lock order, and reject an
    -- existing ticket before attempting a duplicate linked-ticket insertion.
    PERFORM 1 FROM public.workspace_requests WHERE inquiry_id=p_inquiry_id FOR UPDATE;
    IF FOUND THEN RAISE EXCEPTION 'Inquiry already has a workspace request' USING ERRCODE = '23505'; END IF;
    SELECT customer_id INTO next_customer_id FROM public.inquiries WHERE id=p_inquiry_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry not found'; END IF;
    IF p_customer_id IS NOT NULL AND p_customer_id IS DISTINCT FROM next_customer_id THEN
      RAISE EXCEPTION 'Set customer links through the inquiry workflow' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_assigned_to IS NOT NULL THEN
    PERFORM 1 FROM public.admin_profiles WHERE id=p_assigned_to FOR SHARE;
  END IF;
  PERFORM private.assert_workspace_assignee(p_assigned_to);
  IF p_inquiry_id IS NOT NULL AND p_assigned_to IS NOT NULL AND NOT private.is_verified_sales_agent(p_assigned_to) THEN
    RAISE EXCEPTION 'Inquiry assignee must be an active verified sales agent' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.workspace_requests(request_type,status,title,notes,assigned_to,due_at,inquiry_id,part_request_id,vehicle_id,customer_id,created_by)
  VALUES (p_request_type,'open',clean_title,clean_notes,p_assigned_to,p_due_at,p_inquiry_id,p_part_request_id,p_vehicle_id,next_customer_id,actor)
  RETURNING * INTO new_row;
  INSERT INTO public.workspace_request_events(request_id,event_type,to_status,created_by)
  VALUES (new_row.id,'opened','open',actor);
  IF p_assigned_to IS NOT NULL THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by)
    VALUES (new_row.id,'assignment','Assigned on create',actor);
    IF p_inquiry_id IS NOT NULL THEN
      UPDATE public.inquiries SET lead_stage='assigned' WHERE id=p_inquiry_id AND lead_stage='new';
    END IF;
    INSERT INTO public.admin_notifications(recipient_id,notification_type,title,body,href,entity_type,entity_id)
    VALUES (p_assigned_to,'system','Request assigned',clean_title,
      CASE WHEN p_inquiry_id IS NOT NULL THEN '/admin/inquiries' ELSE '/admin/requests' END,'workspace_request',new_row.id);
  END IF;
  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_workspace_request(
  p_request_id uuid, p_status text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL, p_set_assigned boolean DEFAULT false,
  p_due_at timestamptz DEFAULT NULL, p_set_due boolean DEFAULT false,
  p_title text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS public.workspace_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := (SELECT auth.uid()); current_row public.workspace_requests%ROWTYPE;
  previous_status text; previous_assigned uuid; previous_due timestamptz;
  previous_title text; previous_notes text; next_title text; next_notes text;
  next_assigned uuid; next_due timestamptz;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_set_assigned AND NOT (SELECT private.is_account_admin()) THEN
    RAISE EXCEPTION 'Only an admin can assign requests' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO current_row FROM public.workspace_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR NOT private.can_manage_workspace_request(p_request_id) THEN
    RAISE EXCEPTION 'Request access denied' USING ERRCODE = '42501';
  END IF;
  IF current_row.inquiry_id IS NOT NULL OR current_row.request_type = 'inquiry' THEN
    RAISE EXCEPTION 'Inquiry changes must use the sales inquiry workflow'
      USING ERRCODE = '42501', HINT = 'Use update_sales_inquiry through /admin/inquiries';
  END IF;
  IF p_title IS NOT NULL AND (SELECT private.is_field_agent()) THEN
    RAISE EXCEPTION 'Agents may update request status, follow-up dates and notes only' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('open','in_progress','waiting','done','cancelled') THEN
    RAISE EXCEPTION 'Invalid request status';
  END IF;
  previous_status := current_row.status; previous_assigned := current_row.assigned_to;
  previous_due := current_row.due_at; previous_title := current_row.title; previous_notes := current_row.notes;
  next_title := current_row.title; next_notes := current_row.notes;
  next_assigned := current_row.assigned_to; next_due := current_row.due_at;
  IF p_title IS NOT NULL THEN
    next_title := nullif(btrim(p_title),'');
    IF next_title IS NULL OR char_length(next_title)>160 THEN RAISE EXCEPTION 'Title must be 1 to 160 characters'; END IF;
  END IF;
  IF p_notes IS NOT NULL THEN
    next_notes := nullif(btrim(p_notes),'');
    IF char_length(next_notes)>5000 THEN RAISE EXCEPTION 'Notes are too long'; END IF;
  END IF;
  IF p_set_assigned THEN
    IF p_assigned_to IS NOT NULL THEN
      PERFORM 1 FROM public.admin_profiles WHERE id=p_assigned_to FOR SHARE;
    END IF;
    PERFORM private.assert_workspace_assignee(p_assigned_to);
    IF current_row.inquiry_id IS NOT NULL AND p_assigned_to IS NOT NULL AND NOT private.is_verified_sales_agent(p_assigned_to) THEN
      RAISE EXCEPTION 'Inquiry assignee must be an active verified sales agent' USING ERRCODE = '42501';
    END IF;
    next_assigned := p_assigned_to;
  END IF;
  IF p_set_due THEN next_due := p_due_at; END IF;
  UPDATE public.workspace_requests SET status=coalesce(p_status,status),title=next_title,notes=next_notes,
    assigned_to=next_assigned,due_at=next_due WHERE id=p_request_id RETURNING * INTO current_row;

  IF p_status IS NOT NULL AND p_status IS DISTINCT FROM previous_status THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,from_status,to_status,created_by)
    VALUES (p_request_id,'status_change',previous_status,p_status,actor);
  END IF;
  IF p_set_assigned AND next_assigned IS DISTINCT FROM previous_assigned THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by)
    VALUES (p_request_id,'assignment',CASE WHEN next_assigned IS NULL THEN 'Unassigned' ELSE 'Assignee updated' END,actor);
    IF next_assigned IS NULL AND current_row.inquiry_id IS NOT NULL THEN
      UPDATE public.inquiries SET lead_stage='new' WHERE id=current_row.inquiry_id AND lead_stage='assigned';
    END IF;
    IF next_assigned IS NOT NULL THEN
      IF current_row.inquiry_id IS NOT NULL THEN
        UPDATE public.inquiries SET lead_stage='assigned' WHERE id=current_row.inquiry_id AND lead_stage='new';
      END IF;
      INSERT INTO public.admin_notifications(recipient_id,notification_type,title,body,href,entity_type,entity_id)
      VALUES (next_assigned,'system','Request assigned',current_row.title,
        CASE WHEN current_row.inquiry_id IS NOT NULL THEN '/admin/inquiries' ELSE '/admin/requests' END,'workspace_request',p_request_id);
    END IF;
  END IF;
  IF p_set_due AND next_due IS DISTINCT FROM previous_due THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by)
    VALUES (p_request_id,'due_date',CASE WHEN next_due IS NULL THEN 'Due date cleared' ELSE 'Due date updated' END,actor);
  END IF;
  IF p_title IS NOT NULL AND next_title IS DISTINCT FROM previous_title THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by)
    VALUES (p_request_id,'title_change',previous_title || ' → ' || next_title,actor);
  END IF;
  IF p_notes IS NOT NULL AND next_notes IS DISTINCT FROM previous_notes THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by)
    VALUES (p_request_id,'note',coalesce(next_notes,'Request notes cleared'),actor);
  END IF;
  RETURN current_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_workspace_request_event(p_request_id uuid,p_notes text)
RETURNS public.workspace_request_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); clean_notes text := nullif(btrim(coalesce(p_notes,'')),'');
  new_row public.workspace_request_events%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.workspace_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR NOT private.can_manage_workspace_request(p_request_id) THEN
    RAISE EXCEPTION 'Request access denied' USING ERRCODE = '42501';
  END IF;
  IF clean_notes IS NULL THEN RAISE EXCEPTION 'Notes are required'; END IF;
  IF char_length(clean_notes)>5000 THEN RAISE EXCEPTION 'Notes are too long'; END IF;
  INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by)
  VALUES (p_request_id,'note',clean_notes,actor) RETURNING * INTO new_row;
  UPDATE public.workspace_requests SET updated_at=now() WHERE id=p_request_id;
  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_request(text,text,text,uuid,timestamptz,uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace_request(text,text,text,uuid,timestamptz,uuid,uuid,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.update_workspace_request(uuid,text,uuid,boolean,timestamptz,boolean,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_workspace_request(uuid,text,uuid,boolean,timestamptz,boolean,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.record_workspace_request_event(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_workspace_request_event(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_workspace_request_attachment(
  p_request_id uuid,p_storage_path text,p_file_name text,p_mime_type text DEFAULT NULL,p_size_bytes bigint DEFAULT NULL
)
RETURNS public.workspace_request_attachments LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := (SELECT auth.uid()); clean_name text := nullif(btrim(coalesce(p_file_name,'')),'');
  clean_path text := nullif(btrim(coalesce(p_storage_path,'')),''); expected_prefix text := 'requests/' || p_request_id::text || '/';
  new_event public.workspace_request_events%ROWTYPE; new_row public.workspace_request_attachments%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.workspace_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR NOT private.can_manage_workspace_request(p_request_id) THEN
    RAISE EXCEPTION 'Request access denied' USING ERRCODE = '42501';
  END IF;
  IF clean_name IS NULL OR char_length(clean_name)>250 THEN RAISE EXCEPTION 'File name must be 1 to 250 characters'; END IF;
  IF clean_path IS NULL OR left(clean_path,char_length(expected_prefix)) IS DISTINCT FROM expected_prefix THEN
    RAISE EXCEPTION 'Attachment path must stay under this request folder';
  END IF;
  IF p_size_bytes IS NOT NULL AND (p_size_bytes<0 OR p_size_bytes>26214400) THEN RAISE EXCEPTION 'Attachment must be 25 MB or smaller'; END IF;
  INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by)
  VALUES (p_request_id,'attachment','Added ' || clean_name,actor) RETURNING * INTO new_event;
  INSERT INTO public.workspace_request_attachments(request_id,event_id,uploaded_by,storage_path,file_name,mime_type,size_bytes)
  VALUES (p_request_id,new_event.id,actor,clean_path,clean_name,nullif(btrim(coalesce(p_mime_type,'')),''),p_size_bytes)
  RETURNING * INTO new_row;
  UPDATE public.workspace_requests SET updated_at=now() WHERE id=p_request_id;
  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_workspace_request_attachment(p_attachment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); current_row public.workspace_request_attachments%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO current_row FROM public.workspace_request_attachments WHERE id=p_attachment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attachment access denied' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.workspace_requests WHERE id=current_row.request_id FOR UPDATE;
  IF NOT FOUND OR NOT private.can_manage_workspace_request(current_row.request_id) THEN
    RAISE EXCEPTION 'Request access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO current_row FROM public.workspace_request_attachments WHERE id=p_attachment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attachment not found'; END IF;
  DELETE FROM public.workspace_request_attachments WHERE id=p_attachment_id;
  INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by)
  VALUES (current_row.request_id,'attachment','Removed ' || current_row.file_name,actor);
  UPDATE public.workspace_requests SET updated_at=now() WHERE id=current_row.request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.register_workspace_request_attachment(uuid,text,text,text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_workspace_request_attachment(uuid,text,text,text,bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_workspace_request_attachment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_workspace_request_attachment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_workspace_request(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  req public.workspace_requests%ROWTYPE; event_count integer := 0; attachment_count integer := 0;
  storage_deleted integer := 0; attachment_paths text[];
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT (SELECT private.is_ops_user()) THEN
    RAISE EXCEPTION 'Ops access required to delete requests' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO req FROM public.workspace_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.inquiry_id IS NOT NULL OR req.request_type='inquiry' THEN
    RAISE EXCEPTION 'Close an inquiry through its workflow; inquiry activity cannot be deleted' USING ERRCODE = '42501';
  END IF;
  SELECT count(*)::integer INTO event_count FROM public.workspace_request_events WHERE request_id=p_request_id;
  SELECT coalesce(array_agg(storage_path),ARRAY[]::text[]),count(*)::integer INTO attachment_paths,attachment_count
  FROM public.workspace_request_attachments WHERE request_id=p_request_id;
  IF cardinality(attachment_paths)>0 THEN
    DELETE FROM storage.objects WHERE bucket_id='internal-files' AND name=ANY(attachment_paths);
    GET DIAGNOSTICS storage_deleted=ROW_COUNT;
  END IF;
  DELETE FROM public.workspace_requests WHERE id=p_request_id;
  PERFORM private.write_audit_log('delete','workspace_request',p_request_id,
    jsonb_build_object('title',req.title,'request_type',req.request_type,'status',req.status,
      'events_deleted',event_count,'attachments_deleted',attachment_count,'storage_objects_deleted',storage_deleted,
      'part_request_id',req.part_request_id,'inquiry_id',req.inquiry_id));
  RETURN jsonb_build_object('request_id',p_request_id,'title',req.title,'request_type',req.request_type,'status',req.status,
    'events_deleted',event_count,'attachments_deleted',attachment_count,'storage_objects_deleted',storage_deleted);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_workspace_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_workspace_request(uuid) TO authenticated;
COMMENT ON FUNCTION public.delete_workspace_request(uuid) IS
  'Ops-only non-inquiry ticket deletion. Inquiry activity is retained; use the sales-inquiry close/lost workflow.';

-- CRM account-owner changes still cascade to financial/reservation ownership and
-- non-inquiry customer workflows. They cannot act as an inquiry-assignment RPC.
CREATE OR REPLACE FUNCTION private.cascade_customer_workflow_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_name text; owner_role text; owner_office uuid; owner_shift uuid;
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(full_name),''),email),role,office_id,shift_id
    INTO owner_name,owner_role,owner_office,owner_shift FROM public.admin_profiles WHERE id=NEW.owner_id AND is_active=true;
  END IF;
  UPDATE public.invoices SET owner_id=NEW.owner_id,updated_at=now()
  WHERE customer_id=NEW.id AND owner_id IS DISTINCT FROM NEW.owner_id;
  UPDATE public.remittances SET owner_id=NEW.owner_id,
    received_by=CASE WHEN NEW.owner_id IS NULL THEN received_by ELSE NEW.owner_id END,
    office_id=CASE WHEN NEW.owner_id IS NULL THEN office_id ELSE owner_office END,
    shift_id=CASE WHEN NEW.owner_id IS NULL THEN shift_id ELSE owner_shift END,updated_at=now()
  WHERE customer_id=NEW.id;
  UPDATE public.parts SET reserved_by=NEW.owner_id,reservation_requester_name=owner_name,reservation_requester_role=owner_role,updated_at=now()
  WHERE reserved_customer_id=NEW.id AND stock_status='reserved';
  UPDATE public.vehicles SET reserved_by=NEW.owner_id,reservation_requester_name=owner_name,reservation_requester_role=owner_role,updated_at=now()
  WHERE reserved_customer_id=NEW.id AND stock_status='reserved';
  UPDATE public.workspace_requests SET assigned_to=NEW.owner_id,updated_at=now()
  WHERE customer_id=NEW.id AND status IN ('open','in_progress','waiting')
    AND inquiry_id IS NULL AND request_type<>'inquiry';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.cascade_customer_workflow_owner() FROM PUBLIC, anon, authenticated;

-- The analytics RPC is a definer and therefore does not inherit table RLS.
-- Keep its financial/stock calculations unchanged, while applying the same
-- inquiry/request row scopes to all four operational counters. Require the
-- expected original snippets so a future RPC rewrite cannot silently evade
-- this hardening; repeated application of the migration is harmless.
DO $$
DECLARE
  definition text := pg_get_functiondef('public.get_ops_analytics_summary(date,date)'::regprocedure);
  original_status text := 'WHERE wr.status IN (''open'', ''in_progress'', ''waiting'')';
  original_group text := E'FROM public.workspace_requests wr\n        GROUP BY wr.status';
  original_inquiry text := 'SELECT COUNT(*)::integer FROM public.inquiries i WHERE i.status = ''new''';
BEGIN
  IF position('private.can_access_workspace_request(wr.id)' IN definition) = 0 THEN
    IF (length(definition)-length(replace(definition,original_status,'')))/length(original_status) <> 2
       OR position(original_group IN definition) = 0
       OR position(original_inquiry IN definition) = 0 THEN
      RAISE EXCEPTION 'Analytics request/inquiry counter definition changed; review row-scope hardening';
    END IF;
    definition := replace(definition,original_status,
      E'WHERE private.can_access_workspace_request(wr.id)\n        AND wr.status IN (''open'', ''in_progress'', ''waiting'')');
    definition := replace(definition,original_group,
      E'FROM public.workspace_requests wr\n        WHERE private.can_access_workspace_request(wr.id)\n        GROUP BY wr.status');
    definition := replace(definition,original_inquiry,
      'SELECT COUNT(*)::integer FROM public.inquiries i WHERE i.status = ''new'' AND private.can_read_sales_inquiry(i.id)');
    EXECUTE definition;
  END IF;
  IF (length(definition)-length(replace(definition,'private.can_access_workspace_request(wr.id)','')))
       /length('private.can_access_workspace_request(wr.id)') <> 3
     OR position('private.can_read_sales_inquiry(i.id)' IN definition) = 0 THEN
    RAISE EXCEPTION 'Analytics request/inquiry counters must all use caller row scopes';
  END IF;
END;
$$;

-- A definer chat-link RPC calls this invoker helper as its own database owner.
-- Explicitly guard inquiry/request targets so knowledge of another lead's UUID
-- cannot attach it to an agent's chat. Preserve other existing entity branches.
CREATE OR REPLACE FUNCTION private.chat_link_entity_exists(p_entity_type text,p_entity_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_entity_type='vehicle' THEN RETURN EXISTS (SELECT 1 FROM public.vehicles WHERE id=p_entity_id);
  ELSIF p_entity_type='customer' THEN RETURN EXISTS (SELECT 1 FROM public.customers WHERE id=p_entity_id);
  ELSIF p_entity_type='inquiry' THEN RETURN private.can_read_sales_inquiry(p_entity_id)
    AND EXISTS (SELECT 1 FROM public.inquiries WHERE id=p_entity_id);
  ELSIF p_entity_type='invoice' THEN RETURN EXISTS (SELECT 1 FROM public.invoices WHERE id=p_entity_id);
  ELSIF p_entity_type='request' THEN RETURN private.can_access_workspace_request(p_entity_id);
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.chat_link_entity_exists(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.chat_link_entity_exists(text,uuid) TO authenticated;
