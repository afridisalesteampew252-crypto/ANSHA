-- Executable authorization regression. SET ROLE enforces PostgreSQL privileges
-- and RLS; JWT claims exercise the same auth.uid/auth.role contract as PostgREST.
-- Fixtures and changes roll back; this file is also safe in a disposable
-- Supabase test DB independently of pgTAP catalog assertions.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF;
END $$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected_state text, message text) RETURNS void
LANGUAGE plpgsql AS $$ DECLARE actual_state text; BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
  END;
  IF actual_state IS DISTINCT FROM expected_state THEN
    RAISE EXCEPTION 'Assertion failed: %; expected %, received %', message, expected_state, COALESCE(actual_state,'success');
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text), pg_temp.expect_error(text,text,text) TO anon, authenticated;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email)
SELECT ('71000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'phase1-' || n || '@example.invalid'
FROM generate_series(1,10) n;
INSERT INTO public.admin_profiles(id,email,full_name,role,is_active,allowed_stock_origins)
SELECT u.id,u.email,'Phase 1 fixture ' || n, role, n <> 8,
  CASE WHEN role='manager' THEN ARRAY['dubai'] ELSE '{}'::text[] END
FROM (VALUES (1,'admin'),(2,'manager'),(3,'manager'),(4,'sales'),(5,'freelancer'),(6,'accounts'),(8,'admin'),(9,'staff')) v(n,role)
JOIN auth.users u ON u.id=('71000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
INSERT INTO public.customers(id,customer_code,full_name,owner_id)
VALUES
 ('71000000-0000-4000-8001-000000000001','phase1-1','Manager one customer','71000000-0000-4000-8000-000000000002'),
 ('71000000-0000-4000-8001-000000000002','phase1-2','Manager two customer','71000000-0000-4000-8000-000000000003'),
 ('71000000-0000-4000-8001-000000000003','phase1-3','Sales customer','71000000-0000-4000-8000-000000000004'),
 ('71000000-0000-4000-8001-000000000005','phase1-5','Freelancer customer','71000000-0000-4000-8000-000000000005');
INSERT INTO public.customer_profiles(id,customer_id,email)
VALUES
 ('71000000-0000-4000-8000-000000000007','71000000-0000-4000-8001-000000000001','phase1-7@example.invalid'),
 ('71000000-0000-4000-8000-000000000010','71000000-0000-4000-8001-000000000002','phase1-10@example.invalid');
INSERT INTO public.invoices(id,invoice_number,customer_id,customer_name,seller_name,seller_tax_registration_number,seller_address,created_by,status,document_type)
SELECT ('71000000-0000-4000-8002-' || lpad(n::text,12,'0'))::uuid, 'PHASE1-' || n,
  ('71000000-0000-4000-8001-' || lpad(n::text,12,'0'))::uuid, 'Fixture customer', 'Fixture seller','fixture','fixture',
  '71000000-0000-4000-8000-000000000001','sent','tax_invoice'
FROM generate_series(1,3) n;
INSERT INTO public.invoice_items(invoice_id,description,quantity,unit_price)
SELECT ('71000000-0000-4000-8002-' || lpad(n::text,12,'0'))::uuid,'Fixture item',1,0
FROM generate_series(1,3) n;
INSERT INTO public.vehicles(id,title,slug,make,model,stock_origin,is_published)
SELECT ('71000000-0000-4000-8003-' || lpad(n::text,12,'0'))::uuid,'Fixture vehicle', 'phase1-vehicle-' || n,'Fixture','Fixture',
  CASE WHEN n=4 THEN 'japan' ELSE 'dubai' END, true
FROM generate_series(1,6) n;
INSERT INTO public.parts(id,part_code,name,slug,stock_origin,is_published,quantity)
VALUES ('71000000-0000-4000-8004-000000000001','PHASE1-PART','Fixture part','phase1-part','dubai',true,1);

SELECT pg_temp.assert_true(NOT EXISTS (
 SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private') AND p.prosecdef AND p.proname <> 'verify_invoice'
 AND has_function_privilege('anon',p.oid,'EXECUTE')
), 'anon has no privileged definer entry point except invoice verifier');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','private.assert_draft_payroll_run(uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated','private.refresh_payroll_run_totals(uuid)','EXECUTE'), 'internal payroll helpers cannot be called directly');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT pg_temp.assert_true(public.verify_invoice('71000000-0000-4000-8099-000000000001')='{"valid":false}'::jsonb,'unknown public QR returns invalid');
SELECT pg_temp.expect_error($s$SELECT public.register_fcm_push_token('phase1-fixture-token-that-is-long')$s$,'42501','anonymous native push registration forbidden');
SELECT pg_temp.expect_error($s$SELECT purchase_price FROM public.vehicles$s$,'42501','public internal inventory columns forbidden');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000007"}',true);
SELECT pg_temp.assert_true((SELECT count(*) FROM public.customers WHERE customer_code LIKE 'phase1-%')=1,'portal customer sees own customer only');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.invoices WHERE invoice_number LIKE 'PHASE1-%')=1,'portal customer sees own sent invoice only');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.vehicles WHERE slug LIKE 'phase1-%')=0,'portal cannot directly read internal inventory rows');
SELECT pg_temp.expect_error($s$SELECT public.assign_customer_owner('71000000-0000-4000-8001-000000000001','71000000-0000-4000-8000-000000000002')$s$,'42501','missing workspace role cannot invoke even same-owner reassignment');
SELECT pg_temp.expect_error($s$SELECT public.apply_invoice_stock('71000000-0000-4000-8002-000000000001')$s$,'42501','portal cannot apply invoice stock');
WITH changed AS (UPDATE public.customer_profiles SET customer_id='71000000-0000-4000-8001-000000000002' WHERE id='71000000-0000-4000-8000-000000000007' RETURNING id)
SELECT pg_temp.assert_true((SELECT count(*) FROM changed)=0,'portal cannot remap its customer identity');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000008"}',true);
SELECT pg_temp.expect_error($s$SELECT public.assign_customer_owner('71000000-0000-4000-8001-000000000001','71000000-0000-4000-8000-000000000002')$s$,'42501','inactive admin cannot perform same-owner assignment');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002"}',true);
SELECT pg_temp.assert_true((SELECT count(*) FROM public.customers WHERE customer_code LIKE 'phase1-%')=1,'manager sees own customer book only');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.invoices WHERE invoice_number LIKE 'PHASE1-%')=1,'manager sees own customer invoices only');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.invoice_items WHERE description='Fixture item')=1,'manager sees own invoice items only');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.customer_profiles WHERE email LIKE 'phase1-%')=1,'manager sees own customer portal profile only');
WITH changed AS (UPDATE public.customers SET full_name='Forbidden' WHERE id='71000000-0000-4000-8001-000000000002' RETURNING id)
SELECT pg_temp.assert_true((SELECT count(*) FROM changed)=0,'manager direct update cannot modify foreign customer');
WITH changed AS (UPDATE public.customer_profiles SET customer_id='71000000-0000-4000-8001-000000000002' WHERE id='71000000-0000-4000-8000-000000000007' RETURNING id)
SELECT pg_temp.assert_true((SELECT count(*) FROM changed)=0,'manager cannot remap a portal identity');
SELECT pg_temp.expect_error($s$SELECT public.assign_customer_owner('71000000-0000-4000-8001-000000000002',NULL)$s$,'42501','manager cannot reassign foreign customer');
SELECT pg_temp.expect_error($s$SELECT public.reserve_vehicle_stock('71000000-0000-4000-8003-000000000004','71000000-0000-4000-8001-000000000001')$s$,'42501','manager cannot reserve outside assigned stock origin');
SELECT pg_temp.expect_error($s$SELECT public.reserve_vehicle_stock('71000000-0000-4000-8003-000000000001','71000000-0000-4000-8001-000000000002')$s$,'42501','manager cannot reserve for foreign customer');
SELECT pg_temp.assert_true((public.reserve_vehicle_stock('71000000-0000-4000-8003-000000000001','71000000-0000-4000-8001-000000000001')).stock_status='reserved','manager may reserve assigned-origin stock for own customer');
SELECT pg_temp.assert_true((public.release_vehicle_reservation('71000000-0000-4000-8003-000000000001',true)).stock_status='available','manager may release and republish own assigned-origin reservation');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000004"}',true);
SELECT pg_temp.assert_true((SELECT count(*) FROM public.customers WHERE customer_code LIKE 'phase1-%')=1,'sales sees own customer only');
WITH changed AS (UPDATE public.vehicles SET purchase_price=1 WHERE id='71000000-0000-4000-8003-000000000002' RETURNING id)
SELECT pg_temp.assert_true((SELECT count(*) FROM changed)=0,'sales cannot bypass RPC to write catalog');
SELECT pg_temp.expect_error($s$SELECT public.reserve_vehicle_stock('71000000-0000-4000-8003-000000000002','71000000-0000-4000-8001-000000000002')$s$,'42501','sales cannot reserve for foreign customer');
SELECT pg_temp.assert_true((public.reserve_vehicle_stock('71000000-0000-4000-8003-000000000002','71000000-0000-4000-8001-000000000003')).stock_status='reserved','sales may reserve own customer published stock');
SELECT pg_temp.expect_error($s$SELECT public.release_vehicle_reservation('71000000-0000-4000-8003-000000000002',true)$s$,'42501','sales cannot smuggle publishing through release RPC');
SELECT pg_temp.assert_true((public.release_vehicle_reservation('71000000-0000-4000-8003-000000000002',false)).stock_status='available','sales may release own reservation');
SELECT pg_temp.assert_true((public.reserve_part_stock('71000000-0000-4000-8004-000000000001','71000000-0000-4000-8001-000000000003')).stock_status='reserved','sales part reservation follows same ownership gate');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000006"}',true);
SELECT pg_temp.expect_error($s$SELECT public.reserve_vehicle_stock('71000000-0000-4000-8003-000000000003','71000000-0000-4000-8001-000000000003')$s$,'42501','accounts cannot reserve inventory');
SELECT pg_temp.expect_error($s$SELECT public.release_part_reservation('71000000-0000-4000-8004-000000000001',false)$s$,'42501','accounts cannot release another user part reservation');
SELECT pg_temp.expect_error($s$SELECT public.set_vehicle_public_listing('71000000-0000-4000-8003-000000000002',true)$s$,'42501','accounts cannot publish stock');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.invoices WHERE invoice_number LIKE 'PHASE1-%')=3,'accounts retains global receivables view');
SELECT public.apply_invoice_stock('71000000-0000-4000-8002-000000000001');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000003"}',true);
SELECT pg_temp.assert_true((public.reserve_vehicle_stock('71000000-0000-4000-8003-000000000003','71000000-0000-4000-8001-000000000002')).stock_status='reserved','second manager can reserve own customer');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002"}',true);
SELECT pg_temp.expect_error($s$SELECT public.release_vehicle_reservation('71000000-0000-4000-8003-000000000003',false)$s$,'42501','manager cannot release another manager reservation even in allowed origin');
SELECT pg_temp.assert_true((public.reserve_vehicle_stock('71000000-0000-4000-8003-000000000005','71000000-0000-4000-8001-000000000001')).stock_status='reserved','manager customer has reserved stock for reassignment cascade');
SELECT public.assign_customer_owner('71000000-0000-4000-8001-000000000001','71000000-0000-4000-8000-000000000004');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.customers WHERE id='71000000-0000-4000-8001-000000000001')=0,'manager loses customer access after valid reassignment');
SELECT pg_temp.expect_error($s$SELECT public.assign_customer_owner('71000000-0000-4000-8001-000000000001','71000000-0000-4000-8000-000000000002')$s$,'42501','manager cannot take customer back after reassignment');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001"}',true);
SELECT pg_temp.assert_true((SELECT reserved_by FROM public.vehicles WHERE id='71000000-0000-4000-8003-000000000005')='71000000-0000-4000-8000-000000000004'::uuid,'customer ownership cascade updates reservation owner');
SELECT pg_temp.assert_true((public.release_vehicle_reservation('71000000-0000-4000-8003-000000000003',true)).stock_status='available','admin can release another manager reservation');
SELECT public.assign_customer_owner('71000000-0000-4000-8001-000000000002','71000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true((SELECT owner_id FROM public.customers WHERE id='71000000-0000-4000-8001-000000000002')='71000000-0000-4000-8000-000000000001'::uuid,'admin may globally assign own account');
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM public.audit_logs WHERE entity_id='71000000-0000-4000-8001-000000000002' AND action='customer_owner_changed'),'assignment audit row recorded');

RESET ROLE;
SELECT 'Phase 1 role/action boundary assertions passed' AS result;
ROLLBACK;
