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
    RAISE EXCEPTION 'Assertion failed: %; expected %, received %', message, expected_state, coalesce(actual_state,'success');
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text), pg_temp.expect_error(text,text,text) TO anon, authenticated;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email)
SELECT ('76000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'agent-verification-' || n || '@example.invalid'
FROM generate_series(1,10) n;
INSERT INTO public.admin_profiles(id,email,full_name,role,is_active)
SELECT u.id,u.email,'Agent verification fixture ' || n,role,n NOT IN (6,7)
FROM (VALUES(1,'admin'),(2,'sales'),(3,'freelancer'),(4,'manager'),(5,'staff'),(6,'admin'),(7,'sales'),(8,'accounts'),(9,'sales')) v(n,role)
JOIN auth.users u ON u.id=('76000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT pg_temp.expect_error($s$SELECT public.get_sales_agents()$s$,'42501','anonymous users cannot read agent contacts');
SELECT pg_temp.expect_error($s$SELECT public.save_sales_agent_contact('76000000-0000-4000-8000-000000000002','Agent Two','two@example.invalid','+971501234567')$s$,'42501','anonymous users cannot submit agent verification');
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','verified',NULL)$s$,'42501','anonymous users cannot review agents');
SELECT pg_temp.expect_error($s$SELECT * FROM public.sales_agent_verifications$s$,'42501','anonymous users cannot browse raw verification rows');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000002"}',true);
SELECT public.save_sales_agent_contact('76000000-0000-4000-8000-000000000002',' Agent Two ',' TWO@Example.invalid ','+971 (50) 123-4567');
SELECT pg_temp.assert_true(jsonb_array_length(public.get_sales_agents())=1,'field agents see only their own verification');
SELECT pg_temp.assert_true((SELECT email='two@example.invalid' AND phone='+971501234567' AND verification_status='pending' AND referral_code ~ '^[a-f0-9]{32}$' FROM public.sales_agent_verifications WHERE agent_id=auth.uid()),'submission normalizes contact and creates a pending permanent code');
SELECT pg_temp.assert_true((SELECT email FROM public.admin_profiles WHERE id=auth.uid())='agent-verification-2@example.invalid','verification contact must not change sign-in profile email');
SELECT pg_temp.expect_error($s$SELECT public.save_sales_agent_contact('76000000-0000-4000-8000-000000000003','Agent Three','three@example.invalid','+971501234568')$s$,'42501','agent cannot change another agent contact');
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','verified',NULL)$s$,'42501','agent cannot approve themselves');
SELECT pg_temp.expect_error($s$UPDATE public.sales_agent_verifications SET verification_status='verified' WHERE agent_id=auth.uid()$s$,'42501','direct authenticated status updates are denied');
SELECT pg_temp.expect_error($s$INSERT INTO public.sales_agent_verifications(agent_id,full_name,email,phone) VALUES('76000000-0000-4000-8000-000000000003','Agent Three','three@example.invalid','+971501234568')$s$,'42501','raw authenticated inserts cannot bypass verification RPC');
SELECT pg_temp.expect_error($s$SELECT public.save_sales_agent_contact('76000000-0000-4000-8000-000000000002','Agent Two','not-an-email','+971501234567')$s$,'22023','invalid contact email fails');
SELECT pg_temp.expect_error($s$SELECT public.save_sales_agent_contact('76000000-0000-4000-8000-000000000002','Agent Two','two@example.invalid','123')$s$,'22023','short phone fails');
SELECT pg_temp.expect_error($s$SELECT public.save_sales_agent_contact('76000000-0000-4000-8000-000000000002','Agent Two','two@example.invalid','++971501234567')$s$,'22023','misplaced plus signs fail');

-- Only an active account admin can approve or see every record.
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000004"}',true);
SELECT pg_temp.expect_error($s$SELECT public.get_sales_agents()$s$,'42501','manager cannot see all agent verification contacts');
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','verified',NULL)$s$,'42501','manager cannot approve agents');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.sales_agent_verifications)=0,'manager cannot browse raw contact rows');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000005"}',true);
SELECT pg_temp.expect_error($s$SELECT public.get_sales_agents()$s$,'42501','staff cannot browse agent verification contacts');
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','verified',NULL)$s$,'42501','staff cannot approve agents');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000008"}',true);
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','verified',NULL)$s$,'42501','accounts cannot approve agents');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000006"}',true);
SELECT pg_temp.expect_error($s$SELECT public.get_sales_agents()$s$,'42501','inactive admin cannot view sensitive verification');
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','verified',NULL)$s$,'42501','inactive admin cannot approve agents');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000010"}',true);
SELECT pg_temp.expect_error($s$SELECT public.get_sales_agents()$s$,'42501','signed-in customer without staff profile cannot read agent contacts');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000001"}',true);
SELECT pg_temp.assert_true(jsonb_array_length(public.get_sales_agents())=4,'admin list includes all field agent accounts, including no submission and inactive');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_sales_agents()) a WHERE a->>'agent_id'='76000000-0000-4000-8000-000000000009' AND a->>'verification_status'='pending' AND a->>'referral_code' IS NULL),'agent without submission has accurate pending status and no share code');
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000009','verified',NULL)$s$,'22023','missing contact cannot be approved');
SELECT public.save_sales_agent_contact('76000000-0000-4000-8000-000000000003','Agent Three','three@example.invalid','+971501234568');
SELECT public.save_sales_agent_contact('76000000-0000-4000-8000-000000000007','Inactive Agent','inactive@example.invalid','+971501234569');
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000007','verified',NULL)$s$,'22023','inactive field agent cannot be approved');
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','rejected',' ')$s$,'22023','rejection requires a reason');
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','suspended',NULL)$s$,'22023','suspension requires a reason');
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','otp_verified','invalid status')$s$,'22023','only truthful manual-review statuses accepted');
SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','verified','Contact reviewed',jsonb_build_object('full_name','Agent Two','email','two@example.invalid','phone','+971501234567'));
SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000003','verified','Contact reviewed');
SELECT pg_temp.assert_true(private.is_verified_sales_agent('76000000-0000-4000-8000-000000000002'),'helper checks the target agent, rather than the active admin caller');
SELECT pg_temp.assert_true(NOT private.is_verified_sales_agent('76000000-0000-4000-8000-000000000001'),'admin account is not a verified sales agent');
SELECT pg_temp.assert_true((SELECT reviewed_by=auth.uid() AND reviewed_at IS NOT NULL FROM public.sales_agent_verifications WHERE agent_id='76000000-0000-4000-8000-000000000002'),'review records acting administrator and time');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.audit_logs WHERE entity_type='sales_agent_verification' AND entity_id='76000000-0000-4000-8000-000000000002')=2,'submission and admin review each produce append-only audit events');
SELECT pg_temp.expect_error($s$UPDATE public.audit_logs SET metadata='{}' WHERE entity_type='sales_agent_verification'$s$,'42501','even an admin cannot edit audit history directly');

-- A formatting-only save does not revoke review or change the permanent code.
CREATE TEMP TABLE saved_agent_code ON COMMIT DROP AS
SELECT referral_code FROM public.sales_agent_verifications WHERE agent_id='76000000-0000-4000-8000-000000000002';
GRANT SELECT ON saved_agent_code TO authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000002"}',true);
SELECT public.save_sales_agent_contact(auth.uid(),' Agent Two ',' TWO@example.invalid ','+971 50 123 4567');
SELECT pg_temp.assert_true(private.is_verified_sales_agent(auth.uid()),'formatting-only save keeps verified status');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.sales_agent_verifications)=1,'sales agent raw SELECT is restricted to self');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.audit_logs)=0,'field agents cannot see contact or review audit events');
SELECT public.save_sales_agent_contact(auth.uid(),'Agent Two Changed','two-new@example.invalid','+971501234570');
SELECT pg_temp.assert_true((SELECT verification_status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_note IS NULL AND referral_code=(SELECT referral_code FROM saved_agent_code) FROM public.sales_agent_verifications WHERE agent_id=auth.uid()),'changing reviewed contact resets verification and retains the same referral code');
SELECT pg_temp.assert_true(NOT private.is_verified_sales_agent(auth.uid()),'contact change disables verified-agent privileges until re-reviewed');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000001"}',true);
SELECT pg_temp.expect_error($s$SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','verified','Stale review',jsonb_build_object('full_name','Agent Two','email','two@example.invalid','phone','+971501234567'))$s$,'40001','stale contact review cannot approve an unseen changed submission');
SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','rejected','Phone could not be confirmed during manual review');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000002"}',true);
SELECT pg_temp.assert_true((public.get_sales_agents()->0->>'review_note')='Phone could not be confirmed during manual review','agent can read their own rejection reason');
SELECT public.save_sales_agent_contact(auth.uid(),'Agent Two Changed','two-new@example.invalid','+971501234571');
SELECT pg_temp.assert_true((SELECT verification_status FROM public.sales_agent_verifications WHERE agent_id=auth.uid())='pending','corrected rejected contact can request another review');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000001"}',true);
SELECT public.review_sales_agent('76000000-0000-4000-8000-000000000002','suspended','Access suspended by admin');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000002"}',true);
SELECT public.save_sales_agent_contact(auth.uid(),'Agent Two Changed','two-new@example.invalid','+971501234572');
SELECT pg_temp.assert_true((SELECT verification_status='suspended' AND review_note='Access suspended by admin' FROM public.sales_agent_verifications WHERE agent_id=auth.uid()),'self contact editing cannot undo suspension or erase the reason');
SELECT pg_temp.assert_true(NOT private.is_verified_sales_agent(auth.uid()),'suspended agent fails the verified predicate');

-- Caller identity never changes the target predicate; inactivity always blocks.
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.admin_profiles SET is_active=false WHERE id='76000000-0000-4000-8000-000000000003';
SELECT pg_temp.expect_error($s$UPDATE public.sales_agent_verifications SET referral_code=replace(gen_random_uuid()::text,'-','') WHERE agent_id='76000000-0000-4000-8000-000000000002'$s$,'23514','referral code remains permanent even through trusted bulk edits');
SELECT pg_temp.assert_true((SELECT email FROM auth.users WHERE id='76000000-0000-4000-8000-000000000002')='agent-verification-2@example.invalid','Auth sign-in email is unchanged by contact review');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000010"}',true);
SELECT pg_temp.assert_true(NOT private.is_verified_sales_agent('76000000-0000-4000-8000-000000000003'),'inactive verified target is ineligible even for caller-independent lookup');
SELECT pg_temp.assert_true(NOT private.is_verified_sales_agent('76000000-0000-4000-8000-000000000009'),'unsubmitted target is never verified');

RESET ROLE;
SELECT 'Manual agent verification, review race, referral permanence and role assertions passed' AS result;
ROLLBACK;
