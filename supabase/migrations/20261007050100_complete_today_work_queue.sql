-- One actionable queue. SECURITY INVOKER preserves every source table's RLS;
-- explicit manager/field-agent scopes also protect aggregates from broad legacy policies.
CREATE OR REPLACE FUNCTION public.get_today_work_queue(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_user uuid := (SELECT auth.uid());
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.admin_profiles WHERE id = v_user AND is_active;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE = '42501'; END IF;
  RETURN (
    WITH queue_items AS (
      SELECT CASE WHEN r.due_at < now() THEN 'overdue_request' WHEN r.due_at::date = current_date THEN 'due_today_request' WHEN r.assigned_to IS NULL THEN 'unassigned_request' ELSE 'new_request' END AS kind,
        r.id AS record_id, r.title,
        concat_ws(' · ', r.status, CASE WHEN r.assigned_to IS NULL THEN 'Unassigned' ELSE 'Assigned' END, NULLIF(left(r.notes, 160), '')) AS subtitle,
        r.status, CASE WHEN r.due_at < now() THEN 'critical' WHEN r.due_at::date = current_date THEN 'high' ELSE 'normal' END AS priority,
        CASE WHEN r.due_at < now() THEN 0 WHEN r.due_at::date = current_date THEN 1 ELSE 3 END AS priority_rank,
        r.due_at, '/admin/requests'::text AS href, r.updated_at
      FROM public.workspace_requests r
      WHERE r.status NOT IN ('done', 'cancelled') AND (r.status = 'open' OR r.assigned_to IS NULL OR r.due_at::date <= current_date)
        AND (v_role NOT IN ('sales', 'freelancer', 'manager') OR r.assigned_to = v_user OR
          (v_role = 'manager' AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = r.customer_id AND c.owner_id = v_user)))
      UNION ALL
      SELECT 'new_inquiry', q.id, COALESCE(NULLIF(q.customer_name, ''), 'Customer inquiry'), left(q.message, 160), q.status, 'high', 2, q.created_at, '/admin/inquiries', q.updated_at
      FROM public.inquiries q WHERE q.status = 'new' AND v_role IN ('admin', 'staff')
        AND NOT EXISTS (SELECT 1 FROM public.workspace_requests r WHERE r.inquiry_id = q.id AND r.status NOT IN ('done', 'cancelled'))
      UNION ALL
      SELECT 'part_request', q.id, COALESCE(NULLIF(q.part_name, ''), 'Customer part request'), concat_ws(' · ', q.customer_name, q.part_number), q.status, 'high', 2, q.created_at, '/admin/inquiries', q.updated_at
      FROM public.part_requests q WHERE q.status = 'new' AND v_role IN ('admin', 'staff')
        AND NOT EXISTS (SELECT 1 FROM public.workspace_requests r WHERE r.part_request_id = q.id AND r.status NOT IN ('done', 'cancelled'))
      UNION ALL
      SELECT CASE WHEN i.provider_status = 'rejected' THEN 'invoice_issue' ELSE 'overdue_invoice' END, i.id,
        COALESCE(NULLIF(i.invoice_number, ''), 'Invoice'), concat_ws(' · ', i.customer_name, CASE WHEN i.provider_status = 'rejected' THEN 'Provider rejected' ELSE 'Balance ' || i.currency || ' ' || i.balance_due::text END),
        i.status, 'critical', 0, i.due_date::timestamptz, '/admin/invoices/' || i.id::text, i.updated_at
      FROM public.invoices i WHERE i.status NOT IN ('draft', 'cancelled', 'paid') AND (i.provider_status = 'rejected' OR (i.due_date < current_date AND i.balance_due > 0))
        AND (v_role NOT IN ('sales', 'freelancer', 'manager') OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = i.customer_id AND c.owner_id = v_user))
      UNION ALL
      SELECT 'payment_proof', p.id, 'TT copy awaiting review', concat_ws(' · ', c.full_name, p.currency || ' ' || p.amount::text), p.status, 'high', 1, p.created_at, '/admin/remittances/customer-proofs', p.updated_at
      FROM public.customer_payment_proofs p JOIN public.customers c ON c.id = p.customer_id
      WHERE p.status = 'submitted' AND (v_role IN ('admin', 'staff', 'accounts') OR (v_role = 'manager' AND c.owner_id = v_user))
      UNION ALL
      SELECT 'unknown_tt', r.id, r.remittance_number, concat_ws(' · ', r.currency || ' ' || r.amount::text, r.bank_reference), r.status, 'high', 1, r.received_date::timestamptz, '/admin/remittances/unknown', r.updated_at
      FROM public.remittances r WHERE r.status = 'unknown' AND v_role IN ('admin', 'staff', 'accounts')
      UNION ALL
      SELECT 'reservation', v.id, COALESCE(NULLIF(v.stock_number, ''), 'Vehicle reservation'), concat_ws(' · ', v.make, v.model, v.reservation_requester_name), v.stock_status, 'normal', 3, v.reservation_etd::timestamptz, '/admin/reservations', v.updated_at
      FROM public.vehicles v WHERE v.stock_status = 'reserved' AND v_role IN ('admin', 'staff', 'manager', 'sales', 'freelancer')
        AND (v_role IN ('admin', 'staff') OR v.reserved_by = v_user OR (v_role = 'manager' AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = v.reserved_customer_id AND c.owner_id = v_user)))
      UNION ALL
      SELECT 'reservation', p.id, COALESCE(NULLIF(p.part_code, ''), 'Part reservation'), concat_ws(' · ', p.name, p.reservation_requester_name), p.stock_status, 'normal', 3, p.reservation_etd::timestamptz, '/admin/reservations', p.updated_at
      FROM public.parts p WHERE p.stock_status = 'reserved' AND v_role IN ('admin', 'staff', 'manager', 'sales', 'freelancer')
        AND (v_role IN ('admin', 'staff') OR p.reserved_by = v_user OR (v_role = 'manager' AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = p.reserved_customer_id AND c.owner_id = v_user)))
      UNION ALL
      SELECT 'shipment_followup', s.id, s.shipment_number, concat_ws(' · ', s.status, s.destination_country, CASE WHEN s.status = 'sailed' THEN 'Arrival overdue' ELSE 'Departure overdue' END), s.status, 'high', 1,
        CASE WHEN s.status = 'sailed' THEN s.eta::timestamptz ELSE s.etd::timestamptz END, '/admin/export-shipments', s.updated_at
      FROM public.export_shipments s WHERE ((s.status IN ('draft', 'booked', 'loaded') AND s.etd <= current_date) OR (s.status = 'sailed' AND s.eta <= current_date))
        AND (v_role IN ('admin', 'staff') OR (v_role = 'manager' AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = s.customer_id AND c.owner_id = v_user)))
      UNION ALL
      SELECT 'support_message', t.id, 'Customer support reply needed', concat_ws(' · ', c.full_name, t.subject), t.status, 'high', 1, t.last_message_at, '/admin/customer-support?thread=' || t.id::text, t.updated_at
      FROM public.support_threads t JOIN public.customer_profiles profile ON profile.id = t.customer_profile_id JOIN public.customers c ON c.id = profile.customer_id
      WHERE t.status <> 'resolved' AND EXISTS (SELECT 1 FROM public.support_messages m WHERE m.thread_id = t.id AND m.sender_kind = 'customer' AND m.read_at IS NULL)
        AND (v_role IN ('admin', 'staff') OR (v_role = 'manager' AND (c.owner_id = v_user OR t.assigned_to = v_user)))
      UNION ALL
      SELECT 'failed_import', j.id, 'Import needs attention', concat_ws(' · ', j.file_name, left(j.error_summary, 160)), j.status, 'high', 1, j.created_at, '/admin/imports', COALESCE(j.completed_at, j.created_at)
      FROM public.import_jobs j WHERE j.status IN ('failed', 'completed_with_errors') AND j.created_at >= now() - interval '7 days' AND v_role IN ('admin', 'staff')
      UNION ALL
      SELECT 'failed_email', e.id, 'Email delivery failed', concat_ws(' · ', e.subject, e.to_email), e.status, 'high', 1, e.created_at, '/admin/email', e.created_at
      FROM public.outbound_email_log e WHERE e.status = 'failed' AND e.created_at >= now() - interval '7 days' AND v_role IN ('admin', 'staff')
        AND NOT EXISTS (SELECT 1 FROM public.outbound_email_log retry WHERE retry.status = 'sent' AND retry.to_email = e.to_email AND retry.subject = e.subject AND retry.created_at > e.created_at)
    ), limited_items AS (
      SELECT * FROM queue_items ORDER BY priority_rank, due_at NULLS LAST, updated_at DESC NULLS LAST, kind, record_id LIMIT v_limit
    )
    SELECT jsonb_build_object(
      'summary', jsonb_build_object(
        'overdue_requests', count(*) FILTER (WHERE kind = 'overdue_request'),
        'due_today_requests', count(*) FILTER (WHERE kind = 'due_today_request'),
        'unassigned_requests', count(*) FILTER (WHERE kind = 'unassigned_request'),
        'new_requests', count(*) FILTER (WHERE kind IN ('new_request', 'new_inquiry', 'part_request')),
        'new_inquiries', count(*) FILTER (WHERE kind IN ('new_inquiry', 'part_request')),
        'overdue_invoices', count(*) FILTER (WHERE kind = 'overdue_invoice'),
        'payment_proofs', count(*) FILTER (WHERE kind = 'payment_proof'),
        'unknown_tt', count(*) FILTER (WHERE kind = 'unknown_tt'),
        'invoice_issues', count(*) FILTER (WHERE kind IN ('invoice_issue', 'overdue_invoice')),
        'reservations', count(*) FILTER (WHERE kind = 'reservation'),
        'shipment_followups', count(*) FILTER (WHERE kind = 'shipment_followup'),
        'support_replies', count(*) FILTER (WHERE kind = 'support_message'),
        'failed_tasks', count(*) FILTER (WHERE kind IN ('failed_import', 'failed_email')),
        'total_items', count(*)
      ),
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', item.kind, 'record_id', item.record_id, 'title', item.title,
        'subtitle', item.subtitle, 'status', item.status, 'priority', item.priority, 'due_at', item.due_at, 'href', item.href)
        ORDER BY item.priority_rank, item.due_at NULLS LAST, item.updated_at DESC NULLS LAST, item.kind, item.record_id) FROM limited_items item), '[]'::jsonb)
    ) FROM queue_items
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_today_work_queue(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_today_work_queue(integer) TO authenticated;
COMMENT ON FUNCTION public.get_today_work_queue(integer) IS 'RLS-preserving workspace queue; role/owner-scoped aggregates, capped at 50 items; failed imports/email limited to the last seven days.';

DO $$ DECLARE queue_table text; BEGIN
  FOREACH queue_table IN ARRAY ARRAY['workspace_requests', 'inquiries', 'part_requests', 'invoices', 'customer_payment_proofs', 'remittances', 'vehicles', 'parts', 'export_shipments', 'support_threads', 'support_messages', 'import_jobs', 'outbound_email_log'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = queue_table) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', queue_table);
    END IF;
  END LOOP;
END $$;
