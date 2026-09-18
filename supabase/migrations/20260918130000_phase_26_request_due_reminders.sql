/* Phase 26: due-soon and overdue in-app reminders for assigned workspace requests. */

ALTER TABLE public.admin_notifications
  DROP CONSTRAINT IF EXISTS admin_notifications_notification_type_check;

ALTER TABLE public.admin_notifications
  ADD CONSTRAINT admin_notifications_notification_type_check
  CHECK (notification_type IN (
    'chat_message',
    'internal_mail',
    'inquiry',
    'part_request',
    'invoice',
    'remittance',
    'system',
    'request_due'
  ));

CREATE TABLE IF NOT EXISTS public.workspace_request_due_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.workspace_requests(id) ON DELETE CASCADE,
  assignee_id uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  due_at_snapshot timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('due_soon', 'overdue')),
  notified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_request_due_reminders_unique
    UNIQUE (request_id, kind, due_at_snapshot)
);

CREATE INDEX IF NOT EXISTS workspace_request_due_reminders_assignee_idx
  ON public.workspace_request_due_reminders (assignee_id, notified_at DESC);
CREATE INDEX IF NOT EXISTS workspace_request_due_reminders_request_idx
  ON public.workspace_request_due_reminders (request_id, notified_at DESC);

ALTER TABLE public.workspace_request_due_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_read_workspace_request_due_reminders ON public.workspace_request_due_reminders;
CREATE POLICY workspace_read_workspace_request_due_reminders
  ON public.workspace_request_due_reminders FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

REVOKE ALL ON public.workspace_request_due_reminders FROM PUBLIC, anon;
GRANT SELECT ON public.workspace_request_due_reminders TO authenticated;

CREATE OR REPLACE FUNCTION public.process_workspace_request_due_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  due_soon_count integer := 0;
  overdue_count integer := 0;
BEGIN
  WITH due_soon AS (
    SELECT wr.id AS request_id, wr.title, wr.due_at, wr.assigned_to AS assignee_id
    FROM public.workspace_requests wr
    INNER JOIN public.admin_profiles ap
      ON ap.id = wr.assigned_to
     AND ap.is_active = true
    WHERE wr.due_at IS NOT NULL
      AND wr.assigned_to IS NOT NULL
      AND wr.status NOT IN ('done', 'cancelled')
      AND wr.due_at > now()
      AND wr.due_at <= now() + interval '24 hours'
  ),
  inserted_soon AS (
    INSERT INTO public.workspace_request_due_reminders (
      request_id, assignee_id, due_at_snapshot, kind
    )
    SELECT request_id, assignee_id, due_at, 'due_soon'
    FROM due_soon
    ON CONFLICT (request_id, kind, due_at_snapshot) DO NOTHING
    RETURNING request_id, assignee_id, due_at_snapshot
  ),
  notify_soon AS (
    INSERT INTO public.admin_notifications (
      recipient_id, notification_type, title, body, href, entity_type, entity_id
    )
    SELECT
      i.assignee_id,
      'request_due',
      'Request due within 24 hours',
      COALESCE(d.title, 'Workspace request') || ' is due soon.',
      '/admin/requests/' || i.request_id::text,
      'workspace_request',
      i.request_id
    FROM inserted_soon i
    INNER JOIN due_soon d ON d.request_id = i.request_id
    RETURNING id
  )
  SELECT count(*)::integer INTO due_soon_count FROM notify_soon;

  WITH overdue AS (
    SELECT wr.id AS request_id, wr.title, wr.due_at, wr.assigned_to AS assignee_id
    FROM public.workspace_requests wr
    INNER JOIN public.admin_profiles ap
      ON ap.id = wr.assigned_to
     AND ap.is_active = true
    WHERE wr.due_at IS NOT NULL
      AND wr.assigned_to IS NOT NULL
      AND wr.status NOT IN ('done', 'cancelled')
      AND wr.due_at <= now()
  ),
  inserted_overdue AS (
    INSERT INTO public.workspace_request_due_reminders (
      request_id, assignee_id, due_at_snapshot, kind
    )
    SELECT request_id, assignee_id, due_at, 'overdue'
    FROM overdue
    ON CONFLICT (request_id, kind, due_at_snapshot) DO NOTHING
    RETURNING request_id, assignee_id, due_at_snapshot
  ),
  notify_overdue AS (
    INSERT INTO public.admin_notifications (
      recipient_id, notification_type, title, body, href, entity_type, entity_id
    )
    SELECT
      i.assignee_id,
      'request_due',
      'Request overdue',
      COALESCE(d.title, 'Workspace request') || ' is past its due date.',
      '/admin/requests/' || i.request_id::text,
      'workspace_request',
      i.request_id
    FROM inserted_overdue i
    INNER JOIN overdue d ON d.request_id = i.request_id
    RETURNING id
  )
  SELECT count(*)::integer INTO overdue_count FROM notify_overdue;

  RETURN jsonb_build_object(
    'due_soon', due_soon_count,
    'overdue', overdue_count,
    'processed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_workspace_request_due_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_workspace_request_due_reminders() TO service_role;
