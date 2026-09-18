/* Phase 19: staff request tickets. Intake tables stay; assignment/due/activity live here. */

CREATE TABLE IF NOT EXISTS public.workspace_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN (
    'inquiry',
    'part_request',
    'bl',
    'inspection',
    'shipping',
    'other'
  )),
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'in_progress',
    'waiting',
    'done',
    'cancelled'
  )),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  assigned_to uuid,
  due_at timestamptz,
  inquiry_id uuid REFERENCES public.inquiries(id) ON DELETE SET NULL,
  part_request_id uuid REFERENCES public.part_requests(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_requests_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  CONSTRAINT workspace_requests_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.admin_profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_requests_inquiry_id_uidx
  ON public.workspace_requests (inquiry_id)
  WHERE inquiry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_requests_part_request_id_uidx
  ON public.workspace_requests (part_request_id)
  WHERE part_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS workspace_requests_status_due_idx
  ON public.workspace_requests (status, due_at);
CREATE INDEX IF NOT EXISTS workspace_requests_assigned_idx
  ON public.workspace_requests (assigned_to, status);
CREATE INDEX IF NOT EXISTS workspace_requests_type_created_idx
  ON public.workspace_requests (request_type, created_at DESC);
CREATE INDEX IF NOT EXISTS workspace_requests_vehicle_idx
  ON public.workspace_requests (vehicle_id, created_at DESC)
  WHERE vehicle_id IS NOT NULL;

DROP TRIGGER IF EXISTS workspace_requests_updated_at ON public.workspace_requests;
CREATE TRIGGER workspace_requests_updated_at
BEFORE UPDATE ON public.workspace_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.workspace_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.workspace_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'opened',
    'status_change',
    'assignment',
    'due_date',
    'note',
    'title_change'
  )),
  from_status text CHECK (from_status IS NULL OR from_status IN ('open', 'in_progress', 'waiting', 'done', 'cancelled')),
  to_status text CHECK (to_status IS NULL OR to_status IN ('open', 'in_progress', 'waiting', 'done', 'cancelled')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_request_events_request_created_idx
  ON public.workspace_request_events (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workspace_request_events_created_by_idx
  ON public.workspace_request_events (created_by);

ALTER TABLE public.workspace_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_request_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_read_workspace_requests ON public.workspace_requests;
CREATE POLICY workspace_read_workspace_requests
  ON public.workspace_requests FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS workspace_read_workspace_request_events ON public.workspace_request_events;
CREATE POLICY workspace_read_workspace_request_events
  ON public.workspace_request_events FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

REVOKE ALL ON public.workspace_requests FROM PUBLIC, anon;
GRANT SELECT ON public.workspace_requests TO authenticated;
REVOKE ALL ON public.workspace_request_events FROM PUBLIC, anon;
GRANT SELECT ON public.workspace_request_events TO authenticated;

CREATE OR REPLACE FUNCTION private.assert_workspace_assignee(p_assigned_to uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_assigned_to IS NOT NULL AND NOT private.is_workspace_user(p_assigned_to) THEN
    RAISE EXCEPTION 'Assignee must be a workspace user';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_workspace_request(
  p_request_type text,
  p_title text,
  p_notes text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_inquiry_id uuid DEFAULT NULL,
  p_part_request_id uuid DEFAULT NULL
)
RETURNS public.workspace_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  clean_title text := NULLIF(btrim(COALESCE(p_title, '')), '');
  clean_notes text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  new_row public.workspace_requests%ROWTYPE;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_request_type NOT IN ('inquiry', 'part_request', 'bl', 'inspection', 'shipping', 'other') THEN
    RAISE EXCEPTION 'Invalid request type';
  END IF;
  IF p_request_type = 'inquiry' AND p_inquiry_id IS NULL THEN
    RAISE EXCEPTION 'Inquiry tickets require inquiry_id';
  END IF;
  IF p_request_type = 'part_request' AND p_part_request_id IS NULL THEN
    RAISE EXCEPTION 'Part request tickets require part_request_id';
  END IF;
  IF clean_title IS NULL OR char_length(clean_title) > 160 THEN
    RAISE EXCEPTION 'Title must be 1 to 160 characters';
  END IF;
  IF clean_notes IS NOT NULL AND char_length(clean_notes) > 5000 THEN
    RAISE EXCEPTION 'Notes are too long';
  END IF;
  PERFORM private.assert_workspace_assignee(p_assigned_to);

  INSERT INTO public.workspace_requests (
    request_type, status, title, notes, assigned_to, due_at,
    inquiry_id, part_request_id, vehicle_id, customer_id, created_by
  ) VALUES (
    p_request_type, 'open', clean_title, clean_notes, p_assigned_to, p_due_at,
    p_inquiry_id, p_part_request_id, p_vehicle_id, p_customer_id, actor
  )
  RETURNING * INTO new_row;

  INSERT INTO public.workspace_request_events (
    request_id, event_type, to_status, notes, created_by
  ) VALUES (
    new_row.id, 'opened', 'open', NULL, actor
  );

  IF p_assigned_to IS NOT NULL THEN
    INSERT INTO public.workspace_request_events (
      request_id, event_type, notes, created_by
    ) VALUES (
      new_row.id, 'assignment', 'Assigned on create', actor
    );
  END IF;

  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_workspace_request(
  p_request_id uuid,
  p_status text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_set_assigned boolean DEFAULT false,
  p_due_at timestamptz DEFAULT NULL,
  p_set_due boolean DEFAULT false,
  p_title text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.workspace_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  current_row public.workspace_requests%ROWTYPE;
  previous_status text;
  previous_assigned uuid;
  previous_due timestamptz;
  previous_title text;
  next_title text;
  next_notes text;
  next_assigned uuid;
  next_due timestamptz;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO current_row
  FROM public.workspace_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('open', 'in_progress', 'waiting', 'done', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid request status';
  END IF;

  previous_status := current_row.status;
  previous_assigned := current_row.assigned_to;
  previous_due := current_row.due_at;
  previous_title := current_row.title;

  next_title := current_row.title;
  IF p_title IS NOT NULL THEN
    next_title := NULLIF(btrim(p_title), '');
    IF next_title IS NULL OR char_length(next_title) > 160 THEN
      RAISE EXCEPTION 'Title must be 1 to 160 characters';
    END IF;
  END IF;

  next_notes := current_row.notes;
  IF p_notes IS NOT NULL THEN
    next_notes := NULLIF(btrim(p_notes), '');
    IF next_notes IS NOT NULL AND char_length(next_notes) > 5000 THEN
      RAISE EXCEPTION 'Notes are too long';
    END IF;
  END IF;

  next_assigned := current_row.assigned_to;
  IF p_set_assigned THEN
    PERFORM private.assert_workspace_assignee(p_assigned_to);
    next_assigned := p_assigned_to;
  END IF;

  next_due := current_row.due_at;
  IF p_set_due THEN
    next_due := p_due_at;
  END IF;

  UPDATE public.workspace_requests
  SET
    status = COALESCE(p_status, status),
    title = next_title,
    notes = next_notes,
    assigned_to = next_assigned,
    due_at = next_due
  WHERE id = p_request_id
  RETURNING * INTO current_row;

  IF p_status IS NOT NULL AND p_status IS DISTINCT FROM previous_status THEN
    INSERT INTO public.workspace_request_events (
      request_id, event_type, from_status, to_status, created_by
    ) VALUES (
      p_request_id, 'status_change', previous_status, p_status, actor
    );
  END IF;

  IF p_set_assigned AND next_assigned IS DISTINCT FROM previous_assigned THEN
    INSERT INTO public.workspace_request_events (
      request_id, event_type, notes, created_by
    ) VALUES (
      p_request_id,
      'assignment',
      CASE WHEN next_assigned IS NULL THEN 'Unassigned' ELSE 'Assignee updated' END,
      actor
    );
  END IF;

  IF p_set_due AND next_due IS DISTINCT FROM previous_due THEN
    INSERT INTO public.workspace_request_events (
      request_id, event_type, notes, created_by
    ) VALUES (
      p_request_id,
      'due_date',
      CASE WHEN next_due IS NULL THEN 'Due date cleared' ELSE 'Due date updated' END,
      actor
    );
  END IF;

  IF p_title IS NOT NULL AND next_title IS DISTINCT FROM previous_title THEN
    INSERT INTO public.workspace_request_events (
      request_id, event_type, notes, created_by
    ) VALUES (
      p_request_id, 'title_change', previous_title || ' → ' || next_title, actor
    );
  END IF;

  RETURN current_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_workspace_request_event(
  p_request_id uuid,
  p_notes text
)
RETURNS public.workspace_request_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  clean_notes text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  new_row public.workspace_request_events%ROWTYPE;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF clean_notes IS NULL THEN
    RAISE EXCEPTION 'Notes are required';
  END IF;
  IF char_length(clean_notes) > 5000 THEN
    RAISE EXCEPTION 'Notes are too long';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_requests WHERE id = p_request_id) THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  INSERT INTO public.workspace_request_events (
    request_id, event_type, notes, created_by
  ) VALUES (
    p_request_id, 'note', clean_notes, actor
  )
  RETURNING * INTO new_row;

  UPDATE public.workspace_requests
  SET updated_at = now()
  WHERE id = p_request_id;

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_request(text, text, text, uuid, timestamptz, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace_request(text, text, text, uuid, timestamptz, uuid, uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.update_workspace_request(uuid, text, uuid, boolean, timestamptz, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_workspace_request(uuid, text, uuid, boolean, timestamptz, boolean, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.record_workspace_request_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_workspace_request_event(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.open_workspace_request_from_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req_type text := TG_ARGV[0];
  req_title text;
  req_notes text;
  req_id uuid;
BEGIN
  IF req_type = 'inquiry' THEN
    req_title := left('Inquiry: ' || COALESCE(NULLIF(btrim(NEW.customer_name), ''), 'Website'), 160);
    req_notes := NULLIF(btrim(COALESCE(NEW.message, '')), '');
    INSERT INTO public.workspace_requests (
      request_type, status, title, notes, inquiry_id, created_by
    ) VALUES (
      'inquiry', 'open', req_title, req_notes, NEW.id, NULL
    )
    ON CONFLICT (inquiry_id) WHERE inquiry_id IS NOT NULL DO NOTHING
    RETURNING id INTO req_id;
  ELSIF req_type = 'part_request' THEN
    req_title := left(
      'Part request: ' || COALESCE(NULLIF(btrim(NEW.part_name), ''), NULLIF(btrim(NEW.customer_name), ''), 'Website'),
      160
    );
    req_notes := NULLIF(btrim(COALESCE(NEW.message, '')), '');
    INSERT INTO public.workspace_requests (
      request_type, status, title, notes, part_request_id, created_by
    ) VALUES (
      'part_request', 'open', req_title, req_notes, NEW.id, NULL
    )
    ON CONFLICT (part_request_id) WHERE part_request_id IS NOT NULL DO NOTHING
    RETURNING id INTO req_id;
  ELSE
    RETURN NEW;
  END IF;

  IF req_id IS NOT NULL THEN
    INSERT INTO public.workspace_request_events (
      request_id, event_type, to_status, notes, created_by
    ) VALUES (
      req_id, 'opened', 'open', 'Opened from website intake', NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS open_workspace_request_from_inquiry_after_insert ON public.inquiries;
CREATE TRIGGER open_workspace_request_from_inquiry_after_insert
AFTER INSERT ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION private.open_workspace_request_from_intake('inquiry');

DROP TRIGGER IF EXISTS open_workspace_request_from_part_request_after_insert ON public.part_requests;
CREATE TRIGGER open_workspace_request_from_part_request_after_insert
AFTER INSERT ON public.part_requests
FOR EACH ROW EXECUTE FUNCTION private.open_workspace_request_from_intake('part_request');

DROP TRIGGER IF EXISTS notify_workspace_inquiry_after_insert ON public.inquiries;
CREATE TRIGGER notify_workspace_inquiry_after_insert
AFTER INSERT ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION private.notify_workspace_on_external_activity('inquiry', 'New customer inquiry', '/admin/requests');

DROP TRIGGER IF EXISTS notify_workspace_part_request_after_insert ON public.part_requests;
CREATE TRIGGER notify_workspace_part_request_after_insert
AFTER INSERT ON public.part_requests
FOR EACH ROW EXECUTE FUNCTION private.notify_workspace_on_external_activity('part_request', 'New part request', '/admin/requests');

INSERT INTO public.workspace_requests (
  request_type, status, title, notes, inquiry_id, created_by
)
SELECT
  'inquiry',
  CASE WHEN i.status = 'closed' THEN 'done' ELSE 'open' END,
  left('Inquiry: ' || COALESCE(NULLIF(btrim(i.customer_name), ''), 'Website'), 160),
  NULLIF(btrim(COALESCE(i.message, '')), ''),
  i.id,
  NULL
FROM public.inquiries i
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_requests r WHERE r.inquiry_id = i.id
);

INSERT INTO public.workspace_requests (
  request_type, status, title, notes, part_request_id, created_by
)
SELECT
  'part_request',
  CASE WHEN pr.status IN ('fulfilled', 'closed') THEN 'done' ELSE 'open' END,
  left(
    'Part request: ' || COALESCE(NULLIF(btrim(pr.part_name), ''), NULLIF(btrim(pr.customer_name), ''), 'Website'),
    160
  ),
  NULLIF(btrim(COALESCE(pr.message, '')), ''),
  pr.id,
  NULL
FROM public.part_requests pr
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_requests r WHERE r.part_request_id = pr.id
);

INSERT INTO public.workspace_request_events (
  request_id, event_type, to_status, notes, created_by
)
SELECT
  r.id,
  'opened',
  r.status,
  'Backfilled from existing intake',
  NULL
FROM public.workspace_requests r
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_request_events e WHERE e.request_id = r.id
);
