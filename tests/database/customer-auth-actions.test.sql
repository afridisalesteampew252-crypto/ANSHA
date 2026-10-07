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
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text), pg_temp.expect_error(text,text,text) TO authenticated;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO auth.users(id,email)
SELECT ('74100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'auth-actions-' || n || '@example.invalid'
FROM generate_series(1,7) n;
INSERT INTO public.admin_profiles(id,email,full_name,role,is_active)
SELECT u.id,u.email,'Auth actions fixture ' || n,role,n <> 4
FROM (VALUES(1,'admin'),(2,'manager'),(3,'staff'),(4,'admin'),(5,'sales')) v(n,role)
JOIN auth.users u ON u.id=('74100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
INSERT INTO public.customers(id,customer_code,full_name,owner_id,is_active)
VALUES
 ('74100000-0000-4000-8001-000000000001','auth-actions-1','Active recovery customer','74100000-0000-4000-8000-000000000002',true),
 ('74100000-0000-4000-8001-000000000002','auth-actions-2','Inactive recovery customer','74100000-0000-4000-8000-000000000002',false);
INSERT INTO public.customer_profiles(id,customer_id,email)
VALUES
 ('74100000-0000-4000-8000-000000000006','74100000-0000-4000-8001-000000000001','auth-actions-6@example.invalid'),
 ('74100000-0000-4000-8000-000000000007','74100000-0000-4000-8001-000000000002','auth-actions-7@example.invalid');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"74100000-0000-4000-8000-000000000002"}',true);
SELECT pg_temp.expect_error($s$SELECT public.restore_customer_owner('74100000-0000-4000-8001-000000000001','74100000-0000-4000-8000-000000000002',NULL)$s$,'42501','manager cannot bypass the owner-scope gate through Undo');
SELECT pg_temp.expect_error($s$SELECT public.audit_customer_password_reset_request('74100000-0000-4000-8001-000000000001')$s$,'42501','manager cannot trigger administrator customer recovery');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"74100000-0000-4000-8000-000000000003"}',true);
SELECT pg_temp.expect_error($s$SELECT public.audit_customer_password_reset_request('74100000-0000-4000-8001-000000000001')$s$,'42501','general staff cannot trigger administrator recovery');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"74100000-0000-4000-8000-000000000004"}',true);
SELECT pg_temp.expect_error($s$SELECT public.audit_customer_password_reset_request('74100000-0000-4000-8001-000000000001')$s$,'42501','inactive account admin cannot request recovery');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"74100000-0000-4000-8000-000000000006"}',true);
SELECT pg_temp.expect_error($s$SELECT public.audit_customer_password_reset_request('74100000-0000-4000-8001-000000000001')$s$,'42501','customer cannot invoke the admin reset action for itself');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"74100000-0000-4000-8000-000000000001"}',true);
SELECT public.assign_customer_owner('74100000-0000-4000-8001-000000000001','74100000-0000-4000-8000-000000000005');
SELECT public.restore_customer_owner('74100000-0000-4000-8001-000000000001','74100000-0000-4000-8000-000000000005','74100000-0000-4000-8000-000000000002');
SELECT pg_temp.assert_true((SELECT owner_id FROM public.customers WHERE id='74100000-0000-4000-8001-000000000001')='74100000-0000-4000-8000-000000000002'::uuid,'admin Undo restores the original manager');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.audit_logs WHERE action='customer_owner_changed' AND entity_id='74100000-0000-4000-8001-000000000001')=2,'assignment and reversal both produce audit records');

SELECT public.assign_customer_owner('74100000-0000-4000-8001-000000000001','74100000-0000-4000-8000-000000000005');
SELECT pg_temp.expect_error($s$SELECT public.restore_customer_owner('74100000-0000-4000-8001-000000000001','74100000-0000-4000-8000-000000000002',NULL)$s$,'P0001','stale Undo cannot overwrite a changed owner');
SELECT pg_temp.assert_true((SELECT owner_id FROM public.customers WHERE id='74100000-0000-4000-8001-000000000001')='74100000-0000-4000-8000-000000000005'::uuid,'concurrent owner change is preserved');

SELECT public.audit_customer_password_reset_request('74100000-0000-4000-8001-000000000001');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM public.audit_logs WHERE action='customer_password_reset_requested' AND entity_id='74100000-0000-4000-8001-000000000001' AND actor_id='74100000-0000-4000-8000-000000000001'),'authorized reset audit identifies the administrator');
SELECT pg_temp.expect_error($s$SELECT public.audit_customer_password_reset_request('74100000-0000-4000-8001-000000000002')$s$,'P0001','inactive customer recovery is rejected');

RESET ROLE;
SELECT 'Customer assignment Undo and administrator recovery assertions passed' AS result;
ROLLBACK;
