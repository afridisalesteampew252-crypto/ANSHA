BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.expect_denied(statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
  RAISE EXCEPTION 'Expected insufficient_privilege: %', statement;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text), pg_temp.expect_denied(text) TO anon, authenticated;
INSERT INTO auth.users(id, email) SELECT
  ('93000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid, 'ai-quota-' || i || '@example.invalid'
  FROM generate_series(1,7) i;
INSERT INTO public.admin_profiles(id,full_name,email,role,is_active) VALUES
 ('93000000-0000-4000-8000-000000000001','Quota Admin','ai-quota-1@example.invalid','admin',true),
 ('93000000-0000-4000-8000-000000000002','Quota Staff','ai-quota-2@example.invalid','staff',true),
 ('93000000-0000-4000-8000-000000000003','Quota Sales','ai-quota-3@example.invalid','sales',true),
 ('93000000-0000-4000-8000-000000000004','Quota Manager','ai-quota-4@example.invalid','manager',true),
 ('93000000-0000-4000-8000-000000000005','Quota Accounts','ai-quota-5@example.invalid','accounts',true),
 ('93000000-0000-4000-8000-000000000006','Inactive Admin','ai-quota-6@example.invalid','admin',false);

SET LOCAL ROLE anon;
SELECT pg_temp.expect_denied('SELECT public.ops_ai_chat_consume_quota()');
SELECT pg_temp.expect_denied($s$SELECT public.ops_ai_chat_append_message(NULL,'user','test')$s$);
SET LOCAL ROLE authenticated;
DO $$ BEGIN FOR i IN 3..7 LOOP
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub','93000000-0000-4000-8000-' || lpad(i::text,12,'0'))::text, true);
  PERFORM pg_temp.expect_denied('SELECT public.ops_ai_chat_consume_quota()');
  PERFORM pg_temp.expect_denied($s$SELECT public.ops_ai_chat_append_message(NULL,'user','test')$s$);
END LOOP; END $$;

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"93000000-0000-4000-8000-000000000001"}',true);
DO $$ BEGIN FOR i IN 1..20 LOOP
  PERFORM pg_temp.assert_true((public.ops_ai_chat_consume_quota()->>'allowed')::boolean,'first twenty requests allowed');
END LOOP; END $$;
SELECT pg_temp.assert_true(public.ops_ai_chat_consume_quota()->>'reason'='short','twenty-first request denied');
SELECT pg_temp.assert_true((public.ops_ai_chat_consume_quota()->>'retry_after_seconds')::integer BETWEEN 1 AND 600,'short limit retry is bounded');
SELECT pg_temp.expect_denied('SELECT * FROM private.ops_ai_chat_requests');
SELECT pg_temp.expect_denied('DELETE FROM private.ops_ai_chat_requests');
INSERT INTO public.ai_chat_threads(id,created_by) VALUES ('93000000-0000-4000-8001-000000000001',auth.uid());
SELECT public.ops_ai_chat_append_message('93000000-0000-4000-8001-000000000001','user','Test owned conversation');
SELECT pg_temp.assert_true((SELECT title='Test owned conversation' FROM public.ai_chat_threads WHERE id='93000000-0000-4000-8001-000000000001'),'owned thread renamed with message');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.ai_chat_messages WHERE thread_id='93000000-0000-4000-8001-000000000001' AND created_by=auth.uid()),'message belongs to authenticated actor');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"93000000-0000-4000-8000-000000000002"}',true);
SELECT pg_temp.assert_true((public.ops_ai_chat_consume_quota()->>'allowed')::boolean,'staff has independent quota');
SELECT pg_temp.expect_denied($s$SELECT public.ops_ai_chat_append_message('93000000-0000-4000-8001-000000000001','assistant','Cannot forge another owner')$s$);

RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=20 FROM private.ops_ai_chat_requests WHERE user_id='93000000-0000-4000-8000-000000000001'),'denials do not consume more rows');
DELETE FROM private.ops_ai_chat_requests WHERE user_id='93000000-0000-4000-8000-000000000001';
INSERT INTO private.ops_ai_chat_requests(user_id,created_at)
SELECT '93000000-0000-4000-8000-000000000001',clock_timestamp()-interval '1 hour' FROM generate_series(1,200);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"93000000-0000-4000-8000-000000000001"}',true);
SELECT pg_temp.assert_true(public.ops_ai_chat_consume_quota()->>'reason'='daily','daily cap works outside short window');
SELECT pg_temp.assert_true((public.ops_ai_chat_consume_quota()->>'retry_after_seconds')::integer BETWEEN 1 AND 86400,'daily retry is bounded');
DO $$ BEGIN
  BEGIN PERFORM public.ops_ai_chat_append_message('93000000-0000-4000-8001-000000000001','system','forged');
    RAISE EXCEPTION 'Invalid role allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.ops_ai_chat_append_message('93000000-0000-4000-8001-000000000001','user',repeat('a',50001));
    RAISE EXCEPTION 'Oversize message allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
UPDATE private.ops_ai_chat_requests SET created_at=clock_timestamp()-interval '25 hours' WHERE user_id='93000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((public.ops_ai_chat_consume_quota()->>'allowed')::boolean,'expired windows recover');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM private.ops_ai_chat_requests WHERE user_id='93000000-0000-4000-8000-000000000001'),'expired rows are pruned');

-- Force a thread update failure to prove the preceding message insert rolls back too.
CREATE FUNCTION pg_temp.reject_thread_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fixture update failure'; END $$;
CREATE TRIGGER fixture_reject_thread_update BEFORE UPDATE ON public.ai_chat_threads
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_thread_update();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.ops_ai_chat_append_message('93000000-0000-4000-8001-000000000001','assistant','Rollback test');
    RAISE EXCEPTION 'Expected update failure';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Fixture update failure' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.ai_chat_messages WHERE thread_id='93000000-0000-4000-8001-000000000001'),'failed title/timestamp update leaves no orphan message');
SELECT 'PASS ops AI quota, role boundaries, owned-thread writes, input validation, window recovery and atomic rollback';
ROLLBACK;
