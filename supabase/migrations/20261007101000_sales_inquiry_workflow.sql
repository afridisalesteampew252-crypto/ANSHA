-- Verified agents receive admin-assigned leads. Referral attribution is immutable
-- and never changes customer ownership or approves any financial transaction.
ALTER TABLE public.inquiries
  ADD COLUMN inquiry_number text NOT NULL DEFAULT ('INQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  ADD COLUMN inquiry_source text NOT NULL DEFAULT 'website' CHECK (inquiry_source IN ('website','mobile','portal','whatsapp','phone','manual')),
  ADD COLUMN lead_stage text NOT NULL DEFAULT 'new' CHECK (lead_stage IN ('new','assigned','contacted','quoted','won','lost','archived')),
  ADD COLUMN introduced_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  ADD COLUMN referral_code_snapshot text,
  ADD COLUMN created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX inquiries_inquiry_number_uidx ON public.inquiries(inquiry_number);
CREATE INDEX inquiries_created_by_idx ON public.inquiries(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX inquiries_introduced_by_idx ON public.inquiries(introduced_by) WHERE introduced_by IS NOT NULL;
CREATE INDEX inquiries_customer_id_idx ON public.inquiries(customer_id) WHERE customer_id IS NOT NULL;
UPDATE public.inquiries i SET customer_id=cp.customer_id FROM public.customer_profiles cp WHERE cp.id=i.customer_profile_id;
-- A historical closed inquiry does not establish a won or lost sale.
UPDATE public.inquiries SET lead_stage=CASE status WHEN 'read' THEN 'contacted' WHEN 'responded' THEN 'quoted' WHEN 'closed' THEN 'archived' ELSE 'new' END;
UPDATE public.workspace_requests r SET customer_id=i.customer_id FROM public.inquiries i WHERE r.inquiry_id=i.id AND i.customer_id IS NOT NULL;

ALTER TABLE public.workspace_request_events DROP CONSTRAINT workspace_request_events_event_type_check;
ALTER TABLE public.workspace_request_events ADD CONSTRAINT workspace_request_events_event_type_check
  CHECK (event_type IN ('opened','status_change','assignment','due_date','note','title_change','attachment','lead_stage','customer_link'));

CREATE OR REPLACE FUNCTION private.can_read_sales_inquiry(p_inquiry_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    private.is_ops_user() OR (private.is_verified_sales_agent((SELECT auth.uid())) AND EXISTS (
      SELECT 1 FROM public.inquiries i JOIN public.workspace_requests r ON r.inquiry_id=i.id
      WHERE i.id=p_inquiry_id AND (r.assigned_to=(SELECT auth.uid()) OR (r.assigned_to IS NULL AND i.created_by=(SELECT auth.uid())))
    ))
  );
$$;
REVOKE ALL ON FUNCTION private.can_read_sales_inquiry(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_read_sales_inquiry(uuid) TO authenticated;

-- Remove the older workspace-membership and unrestricted public INSERT paths.
DO $$ DECLARE policy_name text; BEGIN
  FOR policy_name IN SELECT policyname FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='inquiries'
  LOOP EXECUTE format('DROP POLICY %I ON public.inquiries',policy_name); END LOOP;
END $$;
CREATE POLICY workspace_scoped_inquiry_select ON public.inquiries FOR SELECT TO authenticated
  USING (private.can_read_sales_inquiry(id));
CREATE POLICY customer_read_own_inquiries ON public.inquiries FOR SELECT TO authenticated
  USING (customer_profile_id=(SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.customer_profiles cp WHERE cp.id=(SELECT auth.uid()) AND cp.is_active
  ));
CREATE POLICY ops_update_inquiry_status ON public.inquiries FOR UPDATE TO authenticated
  USING ((SELECT private.is_ops_user())) WITH CHECK ((SELECT private.is_ops_user()));
REVOKE INSERT,UPDATE,DELETE ON public.inquiries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.inquiries TO authenticated;
-- Legacy message-status changes use a checked compatibility RPC below.

CREATE OR REPLACE FUNCTION private.guard_inquiry_attribution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.introduced_by IS DISTINCT FROM OLD.introduced_by
     OR NEW.referral_code_snapshot IS DISTINCT FROM OLD.referral_code_snapshot
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.inquiry_number IS DISTINCT FROM OLD.inquiry_number
     OR NEW.customer_profile_id IS DISTINCT FROM OLD.customer_profile_id THEN
    -- FK ON DELETE SET NULL must remain possible for a deleted identity.
    IF pg_trigger_depth() > 1 AND (NEW.introduced_by IS NULL OR NEW.introduced_by IS NOT DISTINCT FROM OLD.introduced_by)
       AND (NEW.created_by IS NULL OR NEW.created_by IS NOT DISTINCT FROM OLD.created_by)
       AND NEW.referral_code_snapshot IS NOT DISTINCT FROM OLD.referral_code_snapshot
       AND NEW.inquiry_number IS NOT DISTINCT FROM OLD.inquiry_number
       AND (NEW.customer_profile_id IS NULL OR NEW.customer_profile_id IS NOT DISTINCT FROM OLD.customer_profile_id) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Inquiry attribution cannot be changed' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_inquiry_attribution() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_inquiry_attribution BEFORE UPDATE ON public.inquiries FOR EACH ROW EXECUTE FUNCTION private.guard_inquiry_attribution();

CREATE OR REPLACE FUNCTION private.link_sales_inquiry_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.workspace_requests SET customer_id=NEW.customer_id,created_by=NEW.created_by
    WHERE inquiry_id=NEW.id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.link_sales_inquiry_request() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sales_inquiry_request_link AFTER INSERT ON public.inquiries FOR EACH ROW EXECUTE FUNCTION private.link_sales_inquiry_request();

CREATE OR REPLACE FUNCTION private.validate_sales_inquiry(
  p_name text,p_email text,p_phone text,p_message text,p_part_id uuid,p_vehicle_id uuid,p_public_stock boolean
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120
    OR p_message IS NULL OR char_length(btrim(p_message)) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Enter a name and message within the allowed limits' USING ERRCODE='22023';
  END IF;
  IF p_email IS NOT NULL AND (char_length(p_email)>254 OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE='22023';
  END IF;
  IF p_phone IS NOT NULL AND (char_length(p_phone)>40 OR p_phone !~ '^[+0-9() .-]{7,40}$' OR length(regexp_replace(p_phone,'[^0-9]','','g')) NOT BETWEEN 7 AND 20) THEN
    RAISE EXCEPTION 'Enter a valid phone number' USING ERRCODE='22023';
  END IF;
  IF p_email IS NULL AND p_phone IS NULL THEN RAISE EXCEPTION 'Enter an email address or phone number' USING ERRCODE='22023'; END IF;
  IF p_part_id IS NOT NULL AND p_vehicle_id IS NOT NULL THEN RAISE EXCEPTION 'Choose one stock item' USING ERRCODE='22023'; END IF;
  IF p_part_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.parts WHERE id=p_part_id AND (NOT p_public_stock OR (is_published AND stock_status='available'))) THEN
    RAISE EXCEPTION 'Stock item is not available for inquiry' USING ERRCODE='22023';
  END IF;
  IF p_vehicle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id=p_vehicle_id AND (NOT p_public_stock OR (is_published AND stock_status='available'))) THEN
    RAISE EXCEPTION 'Stock item is not available for inquiry' USING ERRCODE='22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION private.validate_sales_inquiry(text,text,text,text,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.submit_sales_inquiry(
  p_customer_name text,p_customer_email text,p_customer_phone text,p_message text,
  p_part_id uuid DEFAULT NULL,p_vehicle_id uuid DEFAULT NULL,p_referral_code text DEFAULT NULL,p_source text DEFAULT 'website'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  clean_email text:=nullif(lower(btrim(p_customer_email)),'');
  clean_phone text:=nullif(btrim(p_customer_phone),'');
  agent uuid; valid_code text; profile_id uuid; linked_customer uuid; row_id uuid; reference text;
BEGIN
  IF p_source IS NULL OR p_source NOT IN ('website','mobile','portal') THEN RAISE EXCEPTION 'Invalid public inquiry source' USING ERRCODE='22023'; END IF;
  PERFORM private.validate_sales_inquiry(p_customer_name,clean_email,clean_phone,p_message,p_part_id,p_vehicle_id,true);
  SELECT cp.id,cp.customer_id INTO profile_id,linked_customer FROM public.customer_profiles cp
    WHERE cp.id=(SELECT auth.uid()) AND cp.is_active;
  IF p_source='portal' AND profile_id IS NULL THEN RAISE EXCEPTION 'An active customer account is required' USING ERRCODE='42501'; END IF;
  IF p_referral_code IS NOT NULL AND length(p_referral_code)<=100 THEN
    SELECT v.agent_id,v.referral_code INTO agent,valid_code FROM public.sales_agent_verifications v
      WHERE v.referral_code=btrim(p_referral_code) AND private.is_verified_sales_agent(v.agent_id);
  END IF;
  -- The existing BEFORE INSERT rate limiter still runs under the caller's JWT.
  INSERT INTO public.inquiries(customer_name,customer_email,customer_phone,message,part_id,vehicle_id,
    inquiry_source,introduced_by,referral_code_snapshot,customer_profile_id,customer_id)
  VALUES(btrim(p_customer_name),clean_email,clean_phone,btrim(p_message),p_part_id,p_vehicle_id,
    p_source,agent,valid_code,profile_id,linked_customer) RETURNING id,inquiry_number INTO row_id,reference;
  RETURN jsonb_build_object('id',row_id,'inquiry_number',reference);
END $$;
REVOKE ALL ON FUNCTION public.submit_sales_inquiry(text,text,text,text,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_sales_inquiry(text,text,text,text,uuid,uuid,text,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_agent_inquiry(
  p_customer_name text,p_customer_email text,p_customer_phone text,p_message text,p_source text DEFAULT 'manual',
  p_part_id uuid DEFAULT NULL,p_vehicle_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=(SELECT auth.uid()); agent uuid; code text; row_id uuid; reference text;
  clean_email text:=nullif(lower(btrim(p_customer_email)),''); clean_phone text:=nullif(btrim(p_customer_phone),'');
BEGIN
  IF actor IS NULL OR NOT (private.is_ops_user() OR private.is_verified_sales_agent(actor)) THEN
    RAISE EXCEPTION 'Active staff or a verified agent is required' USING ERRCODE='42501'; END IF;
  IF p_source IS NULL OR p_source NOT IN ('manual','whatsapp','phone') THEN RAISE EXCEPTION 'Invalid manual inquiry source' USING ERRCODE='22023'; END IF;
  PERFORM private.validate_sales_inquiry(p_customer_name,clean_email,clean_phone,p_message,p_part_id,p_vehicle_id,NOT private.is_ops_user());
  IF private.is_verified_sales_agent(actor) THEN
    agent:=actor; SELECT referral_code INTO code FROM public.sales_agent_verifications WHERE agent_id=actor;
  END IF;
  INSERT INTO public.inquiries(customer_name,customer_email,customer_phone,message,part_id,vehicle_id,inquiry_source,introduced_by,referral_code_snapshot,created_by)
  VALUES(btrim(p_customer_name),clean_email,clean_phone,btrim(p_message),p_part_id,p_vehicle_id,p_source,agent,code,actor)
  RETURNING id,inquiry_number INTO row_id,reference;
  RETURN jsonb_build_object('id',row_id,'inquiry_number',reference);
END $$;
REVOKE ALL ON FUNCTION public.create_agent_inquiry(text,text,text,text,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_agent_inquiry(text,text,text,text,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_sales_inquiries(
  p_stage text DEFAULT NULL,p_scope text DEFAULT 'all',p_search text DEFAULT NULL,p_limit integer DEFAULT 100
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=(SELECT auth.uid()); is_admin boolean:=private.is_account_admin(); result jsonb;
BEGIN
  IF actor IS NULL OR NOT (private.is_ops_user() OR private.is_verified_sales_agent(actor)) THEN RAISE EXCEPTION 'Inquiry access required' USING ERRCODE='42501'; END IF;
  IF p_stage IS NOT NULL AND p_stage NOT IN ('new','assigned','contacted','quoted','won','lost','archived') THEN RAISE EXCEPTION 'Invalid inquiry stage' USING ERRCODE='22023'; END IF;
  IF p_scope IS NULL OR p_scope NOT IN ('all','mine','unassigned','overdue') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 300 OR length(coalesce(p_search,''))>160 THEN
    RAISE EXCEPTION 'Invalid inquiry filter' USING ERRCODE='22023'; END IF;
  WITH visible AS (
    SELECT i.*,r.id AS request_id,r.assigned_to,r.due_at,
      coalesce(introducer_contact.full_name,introducer.full_name) AS introduced_by_name,
      coalesce(assignee_contact.full_name,assignee.full_name) AS assignee_name,
      coalesce(part.name,vehicle.title) AS stock_name,coalesce(part.slug,vehicle.slug) AS stock_slug,
      (private.is_ops_user() OR coalesce(r.assigned_to=actor,false)) AS can_edit
    FROM public.inquiries i JOIN public.workspace_requests r ON r.inquiry_id=i.id
    LEFT JOIN public.admin_profiles introducer ON introducer.id=i.introduced_by
    LEFT JOIN public.admin_profiles assignee ON assignee.id=r.assigned_to
    LEFT JOIN public.sales_agent_verifications introducer_contact ON introducer_contact.agent_id=i.introduced_by
    LEFT JOIN public.sales_agent_verifications assignee_contact ON assignee_contact.agent_id=r.assigned_to
    LEFT JOIN public.parts part ON part.id=i.part_id LEFT JOIN public.vehicles vehicle ON vehicle.id=i.vehicle_id
    WHERE private.can_read_sales_inquiry(i.id)
      AND (p_stage IS NULL OR i.lead_stage=p_stage)
      AND (nullif(btrim(p_search),'') IS NULL OR concat_ws(' ',i.inquiry_number,i.customer_name,i.customer_email,i.customer_phone,i.message) ILIKE '%'||btrim(p_search)||'%')
      AND (p_scope='all' OR (p_scope='mine' AND r.assigned_to=actor) OR (p_scope='unassigned' AND r.assigned_to IS NULL AND i.lead_stage NOT IN ('won','lost','archived'))
        OR (p_scope='overdue' AND r.due_at<now() AND i.lead_stage NOT IN ('won','lost','archived')))
  ), limited AS (SELECT * FROM visible ORDER BY (lead_stage='archived'),created_at DESC,id LIMIT p_limit), rows AS (
    SELECT to_jsonb(v)||jsonb_build_object('duplicate_candidates',CASE WHEN is_admin THEN (
      SELECT coalesce(jsonb_agg(to_jsonb(matches)),'[]'::jsonb) FROM (
        SELECT c.id,c.full_name,c.phone,c.email FROM public.customers c
        WHERE c.is_active AND ((v.customer_email IS NOT NULL AND lower(c.email)=lower(v.customer_email))
          OR (v.customer_phone IS NOT NULL AND length(regexp_replace(v.customer_phone,'[^0-9]','','g'))>=5
            AND regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace(v.customer_phone,'[^0-9]','','g')))
        ORDER BY c.created_at DESC,c.id LIMIT 5
      ) matches) ELSE '[]'::jsonb END) AS item FROM limited v
  ) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(item) FROM rows),'[]'::jsonb),'summary',(
    SELECT jsonb_build_object('new',count(*) FILTER (WHERE lead_stage='new'),'assigned',count(*) FILTER (WHERE lead_stage='assigned'),
      'contacted',count(*) FILTER (WHERE lead_stage='contacted'),'quoted',count(*) FILTER (WHERE lead_stage='quoted'),
      'won',count(*) FILTER (WHERE lead_stage='won'),'lost',count(*) FILTER (WHERE lead_stage='lost'),'archived',count(*) FILTER (WHERE lead_stage='archived'),
      'unassigned',count(*) FILTER (WHERE assigned_to IS NULL AND lead_stage NOT IN ('won','lost','archived')),'overdue',count(*) FILTER (WHERE due_at<now() AND lead_stage NOT IN ('won','lost','archived')),'total',count(*)) FROM visible
  )) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_sales_inquiries(text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_sales_inquiries(text,text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_sales_inquiry(
  p_inquiry_id uuid,p_stage text DEFAULT NULL,p_assigned_to uuid DEFAULT NULL,p_set_assignee boolean DEFAULT false,
  p_due_at timestamptz DEFAULT NULL,p_set_due boolean DEFAULT false,p_note text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,p_set_customer boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=(SELECT auth.uid()); admin boolean:=private.is_account_admin(); inquiry public.inquiries%ROWTYPE;
  request public.workspace_requests%ROWTYPE; next_stage text; clean_note text:=nullif(btrim(p_note),'');
BEGIN
  IF actor IS NULL OR NOT (private.is_ops_user() OR private.is_verified_sales_agent(actor)) THEN RAISE EXCEPTION 'Inquiry access required' USING ERRCODE='42501'; END IF;
  IF (coalesce(p_set_assignee,false) OR coalesce(p_set_customer,false)) AND NOT admin THEN RAISE EXCEPTION 'Only an admin can assign or link a customer' USING ERRCODE='42501'; END IF;
  SELECT * INTO request FROM public.workspace_requests WHERE inquiry_id=p_inquiry_id FOR UPDATE;
  -- Match the legacy ticket RPC lock order to avoid assignment deadlocks.
  SELECT * INTO inquiry FROM public.inquiries WHERE id=p_inquiry_id FOR UPDATE;
  IF inquiry.id IS NULL OR request.id IS NULL OR (NOT private.is_ops_user() AND request.assigned_to IS DISTINCT FROM actor) THEN
    RAISE EXCEPTION 'Assigned inquiry access required' USING ERRCODE='42501'; END IF;
  IF p_stage IS NOT NULL AND p_stage NOT IN ('new','assigned','contacted','quoted','won','lost') THEN RAISE EXCEPTION 'Invalid inquiry stage' USING ERRCODE='22023'; END IF;
  IF clean_note IS NOT NULL AND length(clean_note)>5000 THEN RAISE EXCEPTION 'Note is too long' USING ERRCODE='22023'; END IF;
  IF p_set_assignee AND p_assigned_to IS NOT NULL THEN
    -- Contact/review RPCs lock this same parent row. Hold it through assignment
    -- so an admin review cannot concurrently invalidate the checked contact.
    PERFORM 1 FROM public.admin_profiles WHERE id=p_assigned_to FOR SHARE;
    IF NOT private.is_verified_sales_agent(p_assigned_to) THEN RAISE EXCEPTION 'Select an active verified agent' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_set_customer AND p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id=p_customer_id AND is_active) THEN RAISE EXCEPTION 'Select an active customer' USING ERRCODE='22023'; END IF;
  IF p_set_customer AND inquiry.customer_profile_id IS NOT NULL AND p_customer_id IS DISTINCT FROM inquiry.customer_id THEN
    RAISE EXCEPTION 'A portal inquiry must remain linked to its customer account' USING ERRCODE='22023'; END IF;
  next_stage:=coalesce(p_stage,inquiry.lead_stage);
  IF p_set_assignee AND p_assigned_to IS NOT NULL AND next_stage='new' THEN next_stage:='assigned'; END IF;
  IF p_set_assignee AND p_assigned_to IS NULL AND next_stage='assigned' THEN next_stage:='new'; END IF;
  IF next_stage='assigned' AND (CASE WHEN p_set_assignee THEN p_assigned_to ELSE request.assigned_to END) IS NULL THEN
    RAISE EXCEPTION 'Assign an agent before selecting assigned' USING ERRCODE='22023'; END IF;
  UPDATE public.inquiries SET lead_stage=next_stage,customer_id=CASE WHEN p_set_customer THEN p_customer_id ELSE customer_id END,
    status=CASE next_stage WHEN 'new' THEN 'new' WHEN 'assigned' THEN 'new' WHEN 'contacted' THEN 'read' WHEN 'quoted' THEN 'responded' ELSE 'closed' END WHERE id=p_inquiry_id;
  UPDATE public.workspace_requests SET assigned_to=CASE WHEN p_set_assignee THEN p_assigned_to ELSE assigned_to END,
    due_at=CASE WHEN p_set_due THEN p_due_at ELSE due_at END,customer_id=CASE WHEN p_set_customer THEN p_customer_id ELSE customer_id END,
    status=CASE next_stage WHEN 'new' THEN 'open' WHEN 'assigned' THEN 'open' WHEN 'contacted' THEN 'in_progress' WHEN 'quoted' THEN 'waiting' WHEN 'won' THEN 'done' ELSE 'cancelled' END WHERE id=request.id;
  IF next_stage IS DISTINCT FROM inquiry.lead_stage THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by) VALUES(request.id,'lead_stage',inquiry.lead_stage||' → '||next_stage,actor); END IF;
  IF p_set_assignee AND p_assigned_to IS DISTINCT FROM request.assigned_to THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by) VALUES(request.id,'assignment',CASE WHEN p_assigned_to IS NULL THEN 'Unassigned' ELSE 'Assigned to verified agent' END,actor);
    INSERT INTO public.admin_notifications(recipient_id,actor_id,notification_type,title,body,href,entity_type,entity_id)
      SELECT p_assigned_to,actor,'inquiry','Inquiry assigned',inquiry.inquiry_number,'/admin/inquiries','inquiry',p_inquiry_id WHERE p_assigned_to IS NOT NULL;
  END IF;
  IF p_set_due AND p_due_at IS DISTINCT FROM request.due_at THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by) VALUES(request.id,'due_date',CASE WHEN p_due_at IS NULL THEN 'Follow-up cleared' ELSE 'Follow-up: '||p_due_at::text END,actor); END IF;
  IF p_set_customer AND p_customer_id IS DISTINCT FROM inquiry.customer_id THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by) VALUES(request.id,'customer_link',CASE WHEN p_customer_id IS NULL THEN 'Customer link cleared' ELSE 'Customer linked: '||p_customer_id::text END,actor); END IF;
  IF clean_note IS NOT NULL THEN INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by) VALUES(request.id,'note',clean_note,actor); END IF;
  RETURN jsonb_build_object('id',p_inquiry_id,'inquiry_number',inquiry.inquiry_number,'lead_stage',next_stage,'request_id',request.id);
END $$;
REVOKE ALL ON FUNCTION public.update_sales_inquiry(uuid,text,uuid,boolean,timestamptz,boolean,text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_sales_inquiry(uuid,text,uuid,boolean,timestamptz,boolean,text,uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_sales_inquiry_message_status(p_inquiry_id uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=(SELECT auth.uid()); inquiry public.inquiries%ROWTYPE;
  request public.workspace_requests%ROWTYPE; next_stage text; next_request_status text;
BEGIN
  IF actor IS NULL OR NOT private.is_ops_user() THEN RAISE EXCEPTION 'Ops inquiry access required' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('new','read','responded','closed') THEN RAISE EXCEPTION 'Invalid inquiry message status' USING ERRCODE='22023'; END IF;
  SELECT * INTO request FROM public.workspace_requests WHERE inquiry_id=p_inquiry_id FOR UPDATE;
  SELECT * INTO inquiry FROM public.inquiries WHERE id=p_inquiry_id FOR UPDATE;
  IF request.id IS NULL OR inquiry.id IS NULL THEN RAISE EXCEPTION 'Inquiry not found' USING ERRCODE='22023'; END IF;
  IF inquiry.lead_stage IN ('won','lost') AND p_status<>'closed' THEN
    RAISE EXCEPTION 'A completed lead must be reopened explicitly in the inquiry workflow'
      USING ERRCODE='22023',HINT='Use the inquiry inbox stage action'; END IF;
  next_stage:=CASE p_status
    WHEN 'new' THEN CASE WHEN request.assigned_to IS NULL THEN 'new' ELSE 'assigned' END
    WHEN 'read' THEN 'contacted' WHEN 'responded' THEN 'quoted'
    ELSE CASE WHEN inquiry.lead_stage IN ('won','lost') THEN inquiry.lead_stage ELSE 'archived' END END;
  next_request_status:=CASE next_stage WHEN 'new' THEN 'open' WHEN 'assigned' THEN 'open'
    WHEN 'contacted' THEN 'in_progress' WHEN 'quoted' THEN 'waiting' WHEN 'won' THEN 'done' ELSE 'cancelled' END;
  UPDATE public.inquiries SET status=p_status,lead_stage=next_stage WHERE id=p_inquiry_id;
  UPDATE public.workspace_requests SET status=next_request_status WHERE id=request.id;
  IF p_status IS DISTINCT FROM inquiry.status THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,from_status,to_status,notes,created_by)
    VALUES(request.id,'status_change',request.status,next_request_status,'Message status: '||inquiry.status||' → '||p_status,actor); END IF;
  IF next_stage IS DISTINCT FROM inquiry.lead_stage THEN
    INSERT INTO public.workspace_request_events(request_id,event_type,notes,created_by)
    VALUES(request.id,'lead_stage',inquiry.lead_stage||' → '||next_stage||' (message status action)',actor); END IF;
  RETURN jsonb_build_object('id',p_inquiry_id,'inquiry_number',inquiry.inquiry_number,'status',p_status,'lead_stage',next_stage,'request_id',request.id);
END $$;
REVOKE ALL ON FUNCTION public.set_sales_inquiry_message_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_sales_inquiry_message_status(uuid,text) TO authenticated;
REVOKE UPDATE(status) ON public.inquiries FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_sales_inquiry_events(p_inquiry_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT private.can_read_sales_inquiry(p_inquiry_id) THEN RAISE EXCEPTION 'Inquiry access required' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(events)),'[]'::jsonb) INTO result FROM (
    SELECT e.id,e.event_type,e.notes,e.created_at,e.from_status,e.to_status,e.created_by,actor.full_name AS actor_name
    FROM public.workspace_request_events e JOIN public.workspace_requests r ON r.id=e.request_id
    LEFT JOIN public.admin_profiles actor ON actor.id=e.created_by WHERE r.inquiry_id=p_inquiry_id ORDER BY e.created_at DESC,e.id LIMIT 100
  ) events;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_sales_inquiry_events(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_sales_inquiry_events(uuid) TO authenticated;

-- Bell and native delivery must both revoke a transferred agent's old alerts.
CREATE OR REPLACE FUNCTION private.can_read_admin_notification_for(p_recipient uuid,p_type text,p_entity_type text,p_entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_profiles profile WHERE profile.id=p_recipient AND profile.is_active
    AND profile.role IN ('admin','staff','manager','accounts','sales','freelancer')
    AND (profile.role NOT IN ('sales','freelancer')
      OR (coalesce(p_type,'') NOT IN ('inquiry','request_due') AND coalesce(p_entity_type,'') NOT IN ('inquiry','workspace_request')) OR (
      private.is_verified_sales_agent(p_recipient) AND (
        (p_entity_type='inquiry' AND EXISTS (SELECT 1 FROM public.inquiries i JOIN public.workspace_requests r ON r.inquiry_id=i.id WHERE i.id=p_entity_id AND (r.assigned_to=p_recipient OR (r.assigned_to IS NULL AND i.created_by=p_recipient))))
        OR (p_entity_type='workspace_request' AND EXISTS (SELECT 1 FROM public.workspace_requests r WHERE r.id=p_entity_id AND r.assigned_to=p_recipient)))))
    AND (profile.role<>'manager' OR p_type IN ('chat_message','internal_mail')
      OR (p_entity_type='invoice' AND EXISTS (SELECT 1 FROM public.invoices i JOIN public.customers c ON c.id=i.customer_id WHERE i.id=p_entity_id AND c.owner_id=p_recipient))
      OR (p_entity_type='customer_payment_proof' AND EXISTS (SELECT 1 FROM public.customer_payment_proofs p JOIN public.customers c ON c.id=p.customer_id WHERE p.id=p_entity_id AND c.owner_id=p_recipient))
      OR (p_entity_type='support_thread' AND EXISTS (SELECT 1 FROM public.support_threads t JOIN public.customer_profiles cp ON cp.id=t.customer_profile_id JOIN public.customers c ON c.id=cp.customer_id WHERE t.id=p_entity_id AND (t.assigned_to=p_recipient OR c.owner_id=p_recipient)))
      OR (p_entity_type='workspace_request' AND EXISTS (SELECT 1 FROM public.workspace_requests r LEFT JOIN public.customers c ON c.id=r.customer_id
        WHERE r.id=p_entity_id AND r.inquiry_id IS NULL AND r.request_type<>'inquiry'
          AND (r.assigned_to=p_recipient OR c.owner_id=p_recipient)))));
$$;
REVOKE ALL ON FUNCTION private.can_read_admin_notification_for(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
