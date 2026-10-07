-- Run only against a disposable database. Everything, including fixtures, rolls back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO auth.users(id, email) VALUES
  ('d7500000-0000-4000-8000-000000000001', 'notify-admin@example.test'),
  ('d7500000-0000-4000-8000-000000000002', 'notify-manager-a@example.test'),
  ('d7500000-0000-4000-8000-000000000003', 'notify-manager-b@example.test'),
  ('d7500000-0000-4000-8000-000000000004', 'notify-customer-a@example.test'),
  ('d7500000-0000-4000-8000-000000000005', 'notify-customer-b@example.test');
INSERT INTO public.admin_profiles(id, full_name, email, role, is_active) VALUES
  ('d7500000-0000-4000-8000-000000000001', 'Notify Admin', 'notify-admin@example.test', 'admin', true),
  ('d7500000-0000-4000-8000-000000000002', 'Notify Manager A', 'notify-manager-a@example.test', 'manager', true),
  ('d7500000-0000-4000-8000-000000000003', 'Notify Manager B', 'notify-manager-b@example.test', 'manager', true);
INSERT INTO public.customers(id, customer_code, full_name, owner_id) VALUES
  ('d7510000-0000-4000-8000-000000000001', 'NOTIFY-A', 'Notify Customer A', 'd7500000-0000-4000-8000-000000000002'),
  ('d7510000-0000-4000-8000-000000000002', 'NOTIFY-B', 'Notify Customer B', 'd7500000-0000-4000-8000-000000000003');
INSERT INTO public.customer_profiles(id, customer_id, email, full_name) VALUES
  ('d7500000-0000-4000-8000-000000000004', 'd7510000-0000-4000-8000-000000000001', 'notify-customer-a@example.test', 'Notify Customer A'),
  ('d7500000-0000-4000-8000-000000000005', 'd7510000-0000-4000-8000-000000000002', 'notify-customer-b@example.test', 'Notify Customer B');
INSERT INTO public.support_threads(id, customer_profile_id) VALUES
  ('d7520000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000004'),
  ('d7520000-0000-4000-8000-000000000002', 'd7500000-0000-4000-8000-000000000005');
INSERT INTO public.support_messages(id, thread_id, sender_id, sender_kind, body) VALUES
  ('d7530000-0000-4000-8000-000000000001', 'd7520000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000004', 'customer', 'Customer A support question'),
  ('d7530000-0000-4000-8000-000000000002', 'd7520000-0000-4000-8000-000000000002', 'd7500000-0000-4000-8000-000000000005', 'customer', 'Customer B support question'),
  ('d7530000-0000-4000-8000-000000000003', 'd7520000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000001', 'agent', 'Private reply for customer A'),
  ('d7530000-0000-4000-8000-000000000004', 'd7520000-0000-4000-8000-000000000002', 'd7500000-0000-4000-8000-000000000001', 'agent', 'Private reply for customer B');
INSERT INTO public.workspace_requests(id, request_type, title, customer_id, assigned_to) VALUES
  ('d7540000-0000-4000-8000-000000000001', 'other', 'Customer A task', 'd7510000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000002'),
  ('d7540000-0000-4000-8000-000000000002', 'other', 'Customer B task', 'd7510000-0000-4000-8000-000000000002', 'd7500000-0000-4000-8000-000000000003');
-- A manager's historical broad notification must be hidden by current scope.
INSERT INTO public.admin_notifications(recipient_id, notification_type, title, entity_type, entity_id) VALUES
  ('d7500000-0000-4000-8000-000000000002', 'support_message', 'Legacy unrelated customer alert', 'support_thread', 'd7520000-0000-4000-8000-000000000002');

DO $$ BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.customer_notifications'::regclass) THEN RAISE EXCEPTION 'Customer notification RLS disabled'; END IF;
  IF has_table_privilege('anon', 'public.customer_notifications', 'SELECT') THEN RAISE EXCEPTION 'Anonymous customer notification read grant'; END IF;
  IF has_column_privilege('authenticated', 'public.customer_notifications', 'title', 'UPDATE') OR has_column_privilege('authenticated', 'public.admin_notifications', 'title', 'UPDATE') THEN RAISE EXCEPTION 'Notification content can be rewritten'; END IF;
  IF NOT has_column_privilege('authenticated', 'public.customer_notifications', 'read_at', 'UPDATE') THEN RAISE EXCEPTION 'Customer acknowledgement unavailable'; END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.get_today_work_queue(integer)'::regprocedure) THEN RAISE EXCEPTION 'Queue bypasses RLS'; END IF;
  IF has_function_privilege('anon', 'public.get_today_work_queue(integer)', 'EXECUTE') THEN RAISE EXCEPTION 'Queue anonymously executable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'customer_notifications') THEN RAISE EXCEPTION 'Customer feed missing realtime publication'; END IF;
  IF (SELECT count(*) FROM public.admin_notifications WHERE entity_type = 'support_thread' AND entity_id = 'd7520000-0000-4000-8000-000000000001' AND recipient_id = 'd7500000-0000-4000-8000-000000000002') <> 1 THEN RAISE EXCEPTION 'Customer message did not notify owning manager'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_notifications WHERE entity_type = 'support_thread' AND entity_id = 'd7520000-0000-4000-8000-000000000001' AND recipient_id = 'd7500000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Customer message notified unrelated manager'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"d7500000-0000-4000-8000-000000000004"}', true);
DO $$ DECLARE row_count integer; BEGIN
  IF (SELECT count(*) FROM public.customer_notifications) <> 1 THEN RAISE EXCEPTION 'Customer cannot see exactly own support reply'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_notifications) THEN RAISE EXCEPTION 'Customer can read admin notifications'; END IF;
  UPDATE public.customer_notifications SET read_at = now() WHERE recipient_id = 'd7500000-0000-4000-8000-000000000005';
  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 0 THEN RAISE EXCEPTION 'Customer acknowledged another recipient'; END IF;
  UPDATE public.customer_notifications SET read_at = now() WHERE recipient_id = 'd7500000-0000-4000-8000-000000000004';
  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN RAISE EXCEPTION 'Customer cannot acknowledge own notification'; END IF;
  IF EXISTS (SELECT 1 FROM public.customer_notifications WHERE read_at IS NULL) THEN RAISE EXCEPTION 'Customer unread count did not clear'; END IF;
  BEGIN UPDATE public.customer_notifications SET title = 'Forged title'; RAISE EXCEPTION 'Content rewrite succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.get_today_work_queue(20); RAISE EXCEPTION 'Customer queue call succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"d7500000-0000-4000-8000-000000000002"}', true);
DO $$ DECLARE queue jsonb; BEGIN
  IF EXISTS (SELECT 1 FROM public.customer_notifications) THEN RAISE EXCEPTION 'Manager can read customer notification feed'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_notifications WHERE title = 'Legacy unrelated customer alert') THEN RAISE EXCEPTION 'Manager can read old unrelated customer alert'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_notifications WHERE recipient_id <> 'd7500000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Manager sees another admin recipient'; END IF;
  queue := public.get_today_work_queue(50);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(queue->'items') item WHERE item->>'record_id' = 'd7540000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Manager queue missing owned task'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(queue->'items') item WHERE item->>'record_id' IN ('d7540000-0000-4000-8000-000000000002', 'd7520000-0000-4000-8000-000000000002')) THEN RAISE EXCEPTION 'Manager queue leaked unrelated customer'; END IF;
  IF (queue->'summary'->>'new_requests')::integer <> 1 OR (queue->'summary'->>'support_replies')::integer <> 1 OR (queue->'summary'->>'total_items')::integer <> 2 THEN RAISE EXCEPTION 'Manager aggregate includes unrelated customer work: %', queue; END IF;
  IF jsonb_array_length(public.get_today_work_queue(1)->'items') <> 1 THEN RAISE EXCEPTION 'Queue item cap ignored'; END IF;
END $$;

SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"d7500000-0000-4000-8000-000000000001"}', true);
DO $$ DECLARE queue jsonb; BEGIN
  queue := public.get_today_work_queue(50);
  IF (queue->'summary'->>'new_requests')::integer <> 2 OR (queue->'summary'->>'support_replies')::integer <> 2 THEN RAISE EXCEPTION 'Admin queue missing global work: %', queue; END IF;
  BEGIN UPDATE public.admin_notifications SET recipient_id = 'd7500000-0000-4000-8000-000000000002'; RAISE EXCEPTION 'Recipient rewrite succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.admin_notifications SET read_at = now() WHERE read_at IS NULL;
  IF EXISTS (SELECT 1 FROM public.admin_notifications WHERE read_at IS NULL) THEN RAISE EXCEPTION 'Admin mark all read did not clear unread count'; END IF;
END $$;

-- Trusted invoice/proof state changes persist portal alerts as part of the same transaction.
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role","sub":"d7500000-0000-4000-8000-000000000001"}', true);
INSERT INTO public.invoices(id, invoice_number, customer_id, customer_name, seller_name, seller_tax_registration_number, seller_address, created_by)
VALUES ('d7550000-0000-4000-8000-000000000001', 'NOTIFY-INVOICE', 'd7510000-0000-4000-8000-000000000001', 'Notify Customer A', 'ANSHA', '123456789012345', 'Test address', 'd7500000-0000-4000-8000-000000000001');
UPDATE public.invoices SET status = 'sent' WHERE id = 'd7550000-0000-4000-8000-000000000001';
INSERT INTO public.customer_payment_proofs(id, customer_id, uploaded_by, amount, currency, transfer_date, storage_path, file_name, mime_type, size_bytes)
VALUES ('d7560000-0000-4000-8000-000000000001', 'd7510000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000004', 100, 'USD', current_date,
  'd7510000-0000-4000-8000-000000000001/d7500000-0000-4000-8000-000000000004/test.pdf', 'test.pdf', 'application/pdf', 32);
UPDATE public.customer_payment_proofs SET status = 'rejected', reviewed_by = 'd7500000-0000-4000-8000-000000000001', reviewed_at = now(), review_note = 'Please upload a readable TT copy' WHERE id = 'd7560000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.customer_notifications WHERE recipient_id = 'd7500000-0000-4000-8000-000000000004' AND entity_id = 'd7550000-0000-4000-8000-000000000001') <> 1 THEN RAISE EXCEPTION 'Issued invoice did not notify its customer'; END IF;
  IF (SELECT count(*) FROM public.customer_notifications WHERE recipient_id = 'd7500000-0000-4000-8000-000000000004' AND entity_id = 'd7560000-0000-4000-8000-000000000001') <> 1 THEN RAISE EXCEPTION 'Reviewed proof did not notify its uploader'; END IF;
  IF EXISTS (SELECT 1 FROM public.customer_notifications WHERE recipient_id = 'd7500000-0000-4000-8000-000000000005' AND entity_id IN ('d7550000-0000-4000-8000-000000000001', 'd7560000-0000-4000-8000-000000000001')) THEN RAISE EXCEPTION 'Account alerts sent to unrelated customer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_notifications WHERE recipient_id = 'd7500000-0000-4000-8000-000000000001' AND notification_type = 'payment_proof' AND entity_id = 'd7560000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Submitted TT copy did not reach admin bell'; END IF;
END $$;
UPDATE public.invoices SET status = 'cancelled' WHERE id = 'd7550000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customer_notifications WHERE recipient_id = 'd7500000-0000-4000-8000-000000000004' AND entity_id = 'd7550000-0000-4000-8000-000000000001' AND title = 'Invoice cancelled') THEN RAISE EXCEPTION 'Cancelled invoice did not notify its customer'; END IF;
END $$;
-- Native delivery must recheck current ownership when consuming a queued row.
-- A previously authorized manager loses access after the customer is moved.
INSERT INTO public.admin_notifications(id,recipient_id,notification_type,title,entity_type,entity_id)
VALUES ('d7570000-0000-4000-8000-000000000001','d7500000-0000-4000-8000-000000000002',
  'payment_proof','Queued TT review','customer_payment_proof','d7560000-0000-4000-8000-000000000001');
DO $$ BEGIN
  IF has_function_privilege('anon','public.native_notification_delivery_allowed(uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.native_notification_delivery_allowed(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Native eligibility lookup must remain service-only';
  END IF;
END $$;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF NOT public.native_notification_delivery_allowed('d7570000-0000-4000-8000-000000000001','admin') THEN
    RAISE EXCEPTION 'Current owning manager native delivery was denied';
  END IF;
END $$;
UPDATE public.customers SET owner_id='d7500000-0000-4000-8000-000000000003'
WHERE id='d7510000-0000-4000-8000-000000000001';
DO $$ DECLARE customer_notice uuid; BEGIN
  IF public.native_notification_delivery_allowed('d7570000-0000-4000-8000-000000000001','admin') THEN
    RAISE EXCEPTION 'Queued native delivery leaked to previous customer manager';
  END IF;
  SELECT id INTO customer_notice FROM public.customer_notifications
  WHERE recipient_id='d7500000-0000-4000-8000-000000000004'
    AND entity_id='d7560000-0000-4000-8000-000000000001' LIMIT 1;
  IF NOT public.native_notification_delivery_allowed(customer_notice,'customer') THEN
    RAISE EXCEPTION 'Owning active customer native delivery was denied';
  END IF;
  UPDATE public.customer_profiles SET is_active=false WHERE id='d7500000-0000-4000-8000-000000000004';
  IF public.native_notification_delivery_allowed(customer_notice,'customer') THEN
    RAISE EXCEPTION 'Disabled customer still eligible for native notification';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"d7500000-0000-4000-8000-000000000002"}',true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_notifications WHERE id='d7570000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Bell retained financial alert access after customer reassignment';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
