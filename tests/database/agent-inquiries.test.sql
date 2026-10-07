-- Real role/JWT/RLS fixtures; execute only on a disposable migrated database.
BEGIN;
CREATE FUNCTION pg_temp.inquiry_assert(condition boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.inquiry_denied(statement text,state text,message text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text; BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM state THEN RAISE EXCEPTION 'Assertion failed: % expected %, received %',message,state,coalesce(actual,'success'); END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.inquiry_assert(boolean,text),pg_temp.inquiry_denied(text,text,text) TO anon,authenticated,service_role;
CREATE TEMP TABLE inquiry_fixture(key text PRIMARY KEY,id uuid,value text);
GRANT ALL ON pg_temp.inquiry_fixture TO anon,authenticated,service_role;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) SELECT ('81000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'inquiry-actor-'||n||'@example.invalid' FROM generate_series(1,8)n;
INSERT INTO public.admin_profiles(id,role,full_name,is_active)
SELECT ('81000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,role,'Inquiry actor '||n,true
FROM (VALUES(1,'admin'),(2,'staff'),(3,'sales'),(4,'freelancer'),(5,'sales'),(6,'manager'))v(n,role);
INSERT INTO public.customers(id,customer_code,full_name,email,phone,owner_id) VALUES
 ('81000000-0000-4000-8001-000000000001','INQUIRY-CUSTOMER-1','Existing inquiry customer','existing-inquiry@example.invalid','+971501234567','81000000-0000-4000-8000-000000000006'),
 ('81000000-0000-4000-8001-000000000002','INQUIRY-CUSTOMER-2','Other customer','other-inquiry@example.invalid','+971509876543',NULL);
INSERT INTO public.customer_profiles(id,customer_id,email) VALUES
 ('81000000-0000-4000-8000-000000000007','81000000-0000-4000-8001-000000000001','inquiry-actor-7@example.invalid'),
 ('81000000-0000-4000-8000-000000000008','81000000-0000-4000-8001-000000000002','inquiry-actor-8@example.invalid');
INSERT INTO public.parts(id,part_code,name,slug,is_published,quantity) VALUES
 ('81000000-0000-4000-8002-000000000001','INQUIRY-PART-1','Inquiry published part','inquiry-published-part',true,1),
 ('81000000-0000-4000-8002-000000000002','INQUIRY-PART-2','Inquiry private part','inquiry-private-part',false,1);
DELETE FROM private.public_form_submissions;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000001"}',true);
SELECT public.save_sales_agent_contact('81000000-0000-4000-8000-000000000003','Verified sales one','inquiry-agent-one@example.invalid','+971501111111');
SELECT public.save_sales_agent_contact('81000000-0000-4000-8000-000000000004','Verified freelancer two','inquiry-agent-two@example.invalid','+971502222222');
SELECT public.save_sales_agent_contact('81000000-0000-4000-8000-000000000005','Suspended sales three','inquiry-agent-three@example.invalid','+971503333333');
SELECT public.review_sales_agent('81000000-0000-4000-8000-000000000003','verified','Reviewed contact');
SELECT public.review_sales_agent('81000000-0000-4000-8000-000000000004','verified','Reviewed contact');
SELECT public.review_sales_agent('81000000-0000-4000-8000-000000000005','suspended','Manual review required');
RESET ROLE;
INSERT INTO pg_temp.inquiry_fixture(key,id,value) SELECT 'code-'||right(agent_id::text,1),agent_id,referral_code FROM public.sales_agent_verifications WHERE agent_id::text LIKE '81000000-%';

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true),set_config('request.headers','{"x-real-ip":"198.51.100.81"}',true);
INSERT INTO pg_temp.inquiry_fixture(key,id,value)
SELECT 'referred',(r->>'id')::uuid,r->>'inquiry_number' FROM (SELECT public.submit_sales_inquiry('INQUIRY-Referred','existing-inquiry@example.invalid',NULL,'Interested in this part','81000000-0000-4000-8002-000000000001',NULL,(SELECT value FROM pg_temp.inquiry_fixture WHERE key='code-3'))r)s;
SELECT pg_temp.inquiry_assert((SELECT value LIKE 'INQ-%' FROM pg_temp.inquiry_fixture WHERE key='referred'),'public returns actual safe reference');
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.inquiries WHERE customer_name LIKE 'INQUIRY-%')=0,'anonymous cannot read inquiry contacts');
SELECT pg_temp.inquiry_denied($s$INSERT INTO public.inquiries(customer_name,customer_phone,message,introduced_by) VALUES('Spoof','1234567','Spoof attribution','81000000-0000-4000-8000-000000000004')$s$,'42501','raw public INSERT cannot spoof attribution');
SELECT pg_temp.inquiry_denied($s$SELECT public.submit_sales_inquiry('Invalid',NULL,NULL,'Missing contact')$s$,'22023','public contact is required');
SELECT pg_temp.inquiry_denied($s$SELECT public.submit_sales_inquiry('Invalid','bad-address',NULL,'Invalid email')$s$,'22023','invalid email rejected');
SELECT pg_temp.inquiry_denied($s$SELECT public.submit_sales_inquiry('Invalid',NULL,'1234567','Private stock','81000000-0000-4000-8002-000000000002')$s$,'22023','public cannot inquire against unpublished stock');
INSERT INTO pg_temp.inquiry_fixture(key,id) SELECT 'invalid-code',(public.submit_sales_inquiry('INQUIRY-Unknown',NULL,'1234567','Phone only',NULL,NULL,'not-a-valid-referral')->>'id')::uuid;
INSERT INTO pg_temp.inquiry_fixture(key,id) SELECT 'suspended-code',(public.submit_sales_inquiry('INQUIRY-Suspended','suspended-buyer@example.invalid',NULL,'Email only',NULL,NULL,(SELECT value FROM pg_temp.inquiry_fixture WHERE key='code-5'))->>'id')::uuid;
SELECT public.submit_sales_inquiry('Rate four',NULL,'1234567','Fourth request');
SELECT public.submit_sales_inquiry('Rate five',NULL,'1234567','Fifth request');
SELECT pg_temp.inquiry_denied($s$SELECT public.submit_sales_inquiry('Rate six',NULL,'1234567','Sixth request')$s$,'P0001','public RPC retains existing per-client rate limit');
RESET ROLE;
SELECT pg_temp.inquiry_assert((SELECT introduced_by='81000000-0000-4000-8000-000000000003' AND referral_code_snapshot=(SELECT value FROM pg_temp.inquiry_fixture WHERE key='code-3') AND created_by IS NULL FROM public.inquiries WHERE id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred')),'server resolves verified referral without inventing creator');
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.inquiries WHERE id IN (SELECT id FROM pg_temp.inquiry_fixture WHERE key IN ('invalid-code','suspended-code')) AND introduced_by IS NULL AND referral_code_snapshot IS NULL)=2,'invalid and suspended referrals accepted without attribution');
INSERT INTO pg_temp.inquiry_fixture(key,id) SELECT 'referred-request',id FROM public.workspace_requests WHERE inquiry_id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000003"}',true);
SELECT pg_temp.inquiry_denied($s$SELECT public.review_sales_agent('81000000-0000-4000-8000-000000000003','verified','Self approve')$s$,'42501','agent cannot verify self');
INSERT INTO pg_temp.inquiry_fixture(key,id) SELECT 'agent-created',(public.create_agent_inquiry('INQUIRY-Agent-created',NULL,'7654321','Manual submitted lead','whatsapp')->>'id')::uuid;
INSERT INTO pg_temp.inquiry_fixture(key,id) SELECT 'agent-created-request',id FROM public.workspace_requests WHERE inquiry_id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='agent-created');
SELECT pg_temp.inquiry_assert((public.get_sales_inquiries(NULL,'all','INQUIRY-',100)->'summary'->>'total')::int=1,'agent sees own-created unassigned lead only');
SELECT pg_temp.inquiry_assert((public.get_sales_inquiries(NULL,'all','INQUIRY-',100)->'items'->0->>'can_edit')::boolean=false,'own unassigned submission is read only');
SELECT pg_temp.inquiry_denied($s$SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='agent-created'),'contacted')$s$,'42501','creator cannot edit unassigned submission');
SELECT pg_temp.inquiry_denied($s$SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='invalid-code'),'contacted')$s$,'42501','NULL assignee cannot bypass mutation guard');
SELECT pg_temp.inquiry_denied($s$SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),NULL,'81000000-0000-4000-8000-000000000003',true)$s$,'42501','agent cannot take own referred lead');
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.workspace_requests WHERE inquiry_id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'))=0,'agent cannot browse unassigned referred ticket');
SELECT pg_temp.inquiry_denied($s$SELECT public.get_sales_inquiry_events((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'))$s$,'42501','agent cannot browse another ticket activity');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000001"}',true);
SELECT pg_temp.inquiry_assert(jsonb_array_length(public.get_sales_inquiries(NULL,'all','INQUIRY-Referred',100)->'items'->0->'duplicate_candidates')=1,'admin gets actual customer duplicate by email');
SELECT pg_temp.inquiry_denied($s$SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),NULL,'81000000-0000-4000-8000-000000000005',true)$s$,'22023','admin cannot assign suspended agent');
SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),NULL,'81000000-0000-4000-8000-000000000003',true,now()-interval '1 hour',true,'Assigned for follow-up','81000000-0000-4000-8001-000000000001',true);
SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='agent-created'),NULL,'81000000-0000-4000-8000-000000000004',true);
INSERT INTO pg_temp.inquiry_fixture(key,id)
SELECT 'foreign-attachment',(public.register_workspace_request_attachment((SELECT id FROM pg_temp.inquiry_fixture WHERE key='agent-created-request'),
  'requests/'||(SELECT id::text FROM pg_temp.inquiry_fixture WHERE key='agent-created-request')||'/other.pdf','other.pdf','application/pdf',100)).id;
RESET ROLE;
INSERT INTO public.workspace_request_due_reminders(request_id,assignee_id,due_at_snapshot,kind)
SELECT id,'81000000-0000-4000-8000-000000000003',now()-interval '1 hour','overdue' FROM pg_temp.inquiry_fixture WHERE key='referred-request';
INSERT INTO public.workspace_request_due_reminders(request_id,assignee_id,due_at_snapshot,kind)
SELECT id,'81000000-0000-4000-8000-000000000004',now()-interval '1 hour','overdue' FROM pg_temp.inquiry_fixture WHERE key='agent-created-request';
SELECT pg_temp.inquiry_assert((SELECT lead_stage='assigned' AND customer_id='81000000-0000-4000-8001-000000000001' FROM public.inquiries WHERE id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred')),'admin assignment and explicit customer link succeed');
SELECT pg_temp.inquiry_assert((SELECT customer_id='81000000-0000-4000-8001-000000000001' FROM public.workspace_requests WHERE inquiry_id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred')),'workspace customer link consistent');
INSERT INTO pg_temp.inquiry_fixture(key,id) SELECT 'assignment-alert',id FROM public.admin_notifications WHERE entity_id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred') AND recipient_id='81000000-0000-4000-8000-000000000003' ORDER BY created_at DESC LIMIT 1;
WITH alert AS (
  INSERT INTO public.admin_notifications(recipient_id,notification_type,title,body,entity_type,entity_id)
  VALUES('81000000-0000-4000-8000-000000000006','request_due','Historical inquiry reminder','Old customer book reminder','workspace_request',
    (SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred-request')) RETURNING id
) INSERT INTO pg_temp.inquiry_fixture(key,id) SELECT 'manager-inquiry-alert',id FROM alert;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000006"}',true);
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.admin_notifications WHERE id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='manager-inquiry-alert'))=0,'manager cannot read historical inquiry reminder through customer ownership');
SET LOCAL ROLE service_role;
SELECT pg_temp.inquiry_assert(public.native_notification_delivery_allowed((SELECT id FROM pg_temp.inquiry_fixture WHERE key='assignment-alert'),'admin'),'assigned verified recipient initially eligible for push');
SELECT pg_temp.inquiry_assert(NOT public.native_notification_delivery_allowed((SELECT id FROM pg_temp.inquiry_fixture WHERE key='manager-inquiry-alert'),'admin'),'manager historical inquiry reminder cannot deliver through native push');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000003"}',true);
SELECT pg_temp.inquiry_assert((public.get_sales_inquiries(NULL,'all','INQUIRY-',100)->'summary'->>'total')::int=1,'creator loses lead assigned elsewhere; sees assigned lead only');
SELECT pg_temp.inquiry_assert((public.get_sales_inquiries(NULL,'all','INQUIRY-',100)->'summary'->>'overdue')::int=1,'overdue count scoped to agent');
SELECT pg_temp.inquiry_assert(jsonb_array_length(public.get_sales_inquiries(NULL,'all','INQUIRY-',100)->'items'->0->'duplicate_candidates')=0,'agent cannot see duplicate customer contacts');
SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),'contacted',NULL,false,now()+interval '1 day',true,'Called buyer');
INSERT INTO pg_temp.inquiry_fixture(key,id,value)
SELECT 'own-attachment',(public.register_workspace_request_attachment((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred-request'),
  'requests/'||(SELECT id::text FROM pg_temp.inquiry_fixture WHERE key='referred-request')||'/own.pdf','own.pdf','application/pdf',100)).id,
  'requests/'||(SELECT id::text FROM pg_temp.inquiry_fixture WHERE key='referred-request')||'/own.pdf';
INSERT INTO storage.objects(bucket_id,name,owner_id)
SELECT 'internal-files',value,'81000000-0000-4000-8000-000000000003' FROM pg_temp.inquiry_fixture WHERE key='own-attachment';
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.workspace_request_attachments WHERE id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='foreign-attachment'))=0,'agent cannot browse other assigned attachment');
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.workspace_request_events WHERE request_id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='agent-created-request'))=0,'direct event SELECT cannot bypass agent scope');
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.workspace_request_due_reminders WHERE request_id IN (SELECT id FROM pg_temp.inquiry_fixture WHERE key IN ('referred-request','agent-created-request')))=1,'due reminders expose current agent records only');
SELECT pg_temp.inquiry_denied($s$SELECT public.delete_workspace_request_attachment((SELECT id FROM pg_temp.inquiry_fixture WHERE key='foreign-attachment'))$s$,'42501','attachment RPC cannot delete foreign record');
SELECT pg_temp.inquiry_denied($s$SELECT public.create_workspace_request('other','Agent self assignment',NULL,'81000000-0000-4000-8000-000000000003')$s$,'42501','legacy create cannot grant agent a self assigned ticket');
SELECT pg_temp.inquiry_denied($s$SELECT public.update_workspace_request((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred-request'),NULL,NULL,false,NULL,false,'Unauthorized title')$s$,'42501','agent legacy mutation limited to status due notes');
SELECT pg_temp.inquiry_denied($s$SELECT public.update_workspace_request((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred-request'),'done')$s$,'42501','assigned verified agent cannot desynchronize inquiry through legacy status RPC');
SELECT pg_temp.inquiry_denied($s$UPDATE public.workspace_request_events SET notes='Rewrite history' WHERE request_id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred-request')$s$,'42501','activity is append only to clients');
SELECT pg_temp.inquiry_assert((public.get_ops_analytics_summary('2026-10-01','2026-10-31')->'counts'->>'new_inquiries')::int=0,'legacy definer analytics cannot leak other new inquiry counts');
SELECT pg_temp.inquiry_assert((public.get_ops_analytics_summary('2026-10-01','2026-10-31')->'requests'->>'open')::int=1,'legacy definer analytics counts assigned requests only');
SELECT pg_temp.inquiry_assert(jsonb_array_length(public.get_sales_inquiry_events((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred')))>=5,'assigned agent sees appended stage/due/note history');
SELECT pg_temp.inquiry_denied($s$SELECT public.update_workspace_request((SELECT id FROM public.workspace_requests WHERE inquiry_id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred')),NULL,'81000000-0000-4000-8000-000000000004',true)$s$,'42501','legacy RPC cannot reassign an inquiry');
SELECT pg_temp.inquiry_denied($s$SELECT public.record_workspace_request_event((SELECT id FROM pg_temp.inquiry_fixture WHERE key='agent-created-request'),'Foreign note')$s$,'42501','legacy event RPC cannot write existing cross-agent ticket');
SELECT pg_temp.inquiry_denied($s$UPDATE public.inquiries SET introduced_by='81000000-0000-4000-8000-000000000004' WHERE id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred')$s$,'42501','agent cannot rewrite introducer directly');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000002"}',true);
SELECT pg_temp.inquiry_assert((public.get_sales_inquiries(NULL,'all','INQUIRY-',100)->'summary'->>'total')::int=4,'staff has legitimate global inbox');
SELECT pg_temp.inquiry_denied($s$SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),NULL,'81000000-0000-4000-8000-000000000004',true)$s$,'42501','staff cannot assign despite global inbox');
SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),'quoted');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000001"}',true);
SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),NULL,'81000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.inquiry_denied($s$SELECT public.update_workspace_request((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred-request'),'open',NULL,false,now(),true)$s$,'42501','admin cannot bypass CRM status and follow-up through legacy RPC');
SELECT pg_temp.inquiry_denied($s$SELECT public.delete_workspace_request((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred-request'))$s$,'42501','admin cannot erase inquiry activity through ticket deletion');
SELECT pg_temp.inquiry_denied($s$DELETE FROM public.inquiries WHERE id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred')$s$,'42501','admin closes rather than hard deletes inquiry');
SELECT public.assign_customer_owner('81000000-0000-4000-8001-000000000001','81000000-0000-4000-8000-000000000003');
RESET ROLE;
SELECT pg_temp.inquiry_assert((SELECT introduced_by='81000000-0000-4000-8000-000000000003' FROM public.inquiries WHERE id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred')),'assignment transfer retains original introducer');
SELECT pg_temp.inquiry_assert((SELECT assigned_to='81000000-0000-4000-8000-000000000004' FROM public.workspace_requests WHERE inquiry_id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred')),'customer ownership cascade cannot change inquiry assignee');
SET LOCAL ROLE service_role;
SELECT pg_temp.inquiry_assert(NOT public.native_notification_delivery_allowed((SELECT id FROM pg_temp.inquiry_fixture WHERE key='assignment-alert'),'admin'),'queued notification revoked after assignment transfer');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000003"}',true);
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.admin_notifications WHERE id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='assignment-alert'))=0,'old assignment notification hidden after transfer');
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.workspace_request_attachments WHERE id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='own-attachment'))=0,'previous uploader loses transferred attachment visibility');
WITH deleted AS (DELETE FROM storage.objects WHERE bucket_id='internal-files' AND name=(SELECT value FROM pg_temp.inquiry_fixture WHERE key='own-attachment') RETURNING id)
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM deleted)=0,'previous Storage owner cannot delete transferred inquiry file');
SELECT pg_temp.inquiry_denied($s$SELECT public.delete_workspace_request_attachment((SELECT id FROM pg_temp.inquiry_fixture WHERE key='own-attachment'))$s$,'42501','previous uploader cannot delete transferred attachment metadata');
SELECT pg_temp.inquiry_denied($s$SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),'lost')$s$,'42501','former assignee cannot edit transferred lead');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000004"}',true);
SELECT public.update_sales_inquiry((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),'won');
RESET ROLE;
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.invoices WHERE customer_id='81000000-0000-4000-8001-000000000001')=0,'won stage never creates invoice or approves payment');
SELECT pg_temp.inquiry_assert((SELECT stock_status='available' AND is_published FROM public.parts WHERE id='81000000-0000-4000-8002-000000000001'),'won stage does not reserve or sell stock');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000007"}',true),set_config('request.headers','{"x-real-ip":"198.51.100.82"}',true);
INSERT INTO pg_temp.inquiry_fixture(key,id) SELECT 'portal',(public.submit_sales_inquiry('INQUIRY-Portal',NULL,'1234567','Own portal question',NULL,NULL,NULL,'portal')->>'id')::uuid;
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.inquiries WHERE customer_name LIKE 'INQUIRY-%')=1,'customer sees only own signed-in inquiry');
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.workspace_requests WHERE inquiry_id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='portal'))=0,'portal customer cannot browse internal inquiry tickets');
SELECT pg_temp.inquiry_denied($s$SELECT public.get_sales_inquiries()$s$,'42501','portal customer cannot use staff inquiry inbox');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000008"}',true);
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.inquiries WHERE id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='portal'))=0,'other customer cannot read portal inquiry');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000005"}',true);
SELECT pg_temp.inquiry_denied($s$SELECT public.get_sales_inquiries()$s$,'42501','suspended agent loses inbox access');
SELECT pg_temp.inquiry_denied($s$SELECT public.create_agent_inquiry('Blocked',NULL,'1234567','Suspended submission')$s$,'42501','suspended agent cannot create manual leads');
SELECT pg_temp.inquiry_denied($s$SELECT public.set_sales_inquiry_message_status((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),'closed')$s$,'42501','non-ops cannot use legacy message status action');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000002"}',true);
SELECT pg_temp.inquiry_denied($s$UPDATE public.inquiries SET status='closed' WHERE id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='invalid-code')$s$,'42501','even ops cannot desynchronize stages through raw status UPDATE');
SELECT pg_temp.inquiry_assert(public.set_sales_inquiry_message_status((SELECT id FROM pg_temp.inquiry_fixture WHERE key='invalid-code'),'responded')->>'lead_stage'='quoted','staff legacy responded action updates lead stage');
SELECT pg_temp.inquiry_assert(public.set_sales_inquiry_message_status((SELECT id FROM pg_temp.inquiry_fixture WHERE key='invalid-code'),'closed')->>'lead_stage'='archived','staff legacy close archives without inferring won or lost');
SELECT pg_temp.inquiry_assert((public.get_sales_inquiries('archived','all','INQUIRY-Unknown',100)->'summary'->>'archived')::int=1,'archived stage remains discoverable');
SELECT pg_temp.inquiry_assert((public.get_sales_inquiries(NULL,'unassigned','INQUIRY-Unknown',100)->'summary'->>'total')::int=0,'archived closed lead excluded from active unassigned queue');
SELECT pg_temp.inquiry_assert((SELECT r.status='cancelled' AND i.status='closed' FROM public.inquiries i JOIN public.workspace_requests r ON r.inquiry_id=i.id WHERE i.id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='invalid-code')),'legacy close synchronizes message and request status');
SELECT pg_temp.inquiry_assert(public.set_sales_inquiry_message_status((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),'closed')->>'lead_stage'='won','closing already won lead preserves known outcome');
SELECT pg_temp.inquiry_denied($s$SELECT public.set_sales_inquiry_message_status((SELECT id FROM pg_temp.inquiry_fixture WHERE key='referred'),'new')$s$,'22023','legacy tool cannot silently reopen completed lead');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000001"}',true);
SELECT pg_temp.inquiry_assert(public.set_sales_inquiry_message_status((SELECT id FROM pg_temp.inquiry_fixture WHERE key='invalid-code'),'new')->>'lead_stage'='new','admin legacy reopen of archive is explicit new unassigned lead');
SELECT pg_temp.inquiry_assert(jsonb_array_length(public.get_sales_inquiry_events((SELECT id FROM pg_temp.inquiry_fixture WHERE key='invalid-code')))>=6,'legacy message and stage actions append real audit events');
INSERT INTO pg_temp.inquiry_fixture(key,id)
SELECT 'ordinary-request',(public.create_workspace_request('other','Ordinary assigned workflow',NULL,'81000000-0000-4000-8000-000000000003')).id;
INSERT INTO pg_temp.inquiry_fixture(key,id)
SELECT 'manager-ordinary-request',(public.create_workspace_request('other','Ordinary manager workflow',NULL,'81000000-0000-4000-8000-000000000006')).id;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000006"}',true);
SELECT pg_temp.inquiry_assert((SELECT count(*) FROM public.admin_notifications WHERE entity_type='workspace_request' AND entity_id=(SELECT id FROM pg_temp.inquiry_fixture WHERE key='manager-ordinary-request'))=1,'manager ordinary task notification remains readable');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000003"}',true);
SELECT pg_temp.inquiry_assert((public.update_workspace_request((SELECT id FROM pg_temp.inquiry_fixture WHERE key='ordinary-request'),'in_progress',NULL,false,now()+interval '1 day',true,NULL,'Ordinary follow-up')).status='in_progress','assigned verified agent retains ordinary request status due notes workflow');
SELECT pg_temp.inquiry_denied($s$SELECT public.update_workspace_request((SELECT id FROM pg_temp.inquiry_fixture WHERE key='ordinary-request'),NULL,NULL,false,NULL,false,'Unauthorized title')$s$,'42501','ordinary request title remains ops controlled for agents');
SELECT pg_temp.inquiry_denied($s$SELECT public.update_workspace_request((SELECT id FROM pg_temp.inquiry_fixture WHERE key='ordinary-request'),NULL,'81000000-0000-4000-8000-000000000004',true)$s$,'42501','ordinary request cannot be reassigned by agent');
ROLLBACK;
SELECT 'Agent inquiry role/referral/assignment assertions passed' AS result;
