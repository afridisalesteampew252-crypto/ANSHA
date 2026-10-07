-- Run with psql -v ON_ERROR_STOP=1 against a disposable migrated database.
-- Real PostgreSQL roles/RLS and JWT claims are exercised; all fixtures roll back.
BEGIN;
CREATE FUNCTION pg_temp.finance_assert(condition boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF;
END $$;
CREATE FUNCTION pg_temp.finance_denied(statement text, expected_state text, message text) RETURNS void
LANGUAGE plpgsql AS $$ DECLARE actual_state text; BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
  END;
  IF actual_state IS DISTINCT FROM expected_state THEN
    RAISE EXCEPTION 'Assertion failed: %; expected %, received %', message, expected_state, COALESCE(actual_state,'success');
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.finance_assert(boolean,text), pg_temp.finance_denied(text,text,text) TO anon, authenticated;

-- Prove the future-function default, rather than checking only existing ACLs.
CREATE FUNCTION public.phase_1_future_grant_probe() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT true $$;
CREATE FUNCTION private.phase_1_future_grant_probe() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT true $$;
SELECT pg_temp.finance_assert(
  NOT has_function_privilege('anon','public.phase_1_future_grant_probe()','EXECUTE')
  AND NOT has_function_privilege('anon','private.phase_1_future_grant_probe()','EXECUTE')
  AND NOT has_function_privilege('authenticated','private.phase_1_future_grant_probe()','EXECUTE'),
  'future application functions do not inherit anonymous or unsafe private execution');

SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email)
SELECT ('79000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'finance-boundary-' || n || '@example.invalid'
FROM generate_series(1,8) n;
INSERT INTO public.admin_profiles(id,role,full_name,is_active)
SELECT ('79000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,role,'Finance boundary ' || n,true
FROM (VALUES (1,'admin'),(2,'staff'),(3,'accounts'),(4,'sales'),(5,'manager'),(6,'manager')) v(n,role);
INSERT INTO public.customers(id,customer_code,full_name,owner_id) VALUES
 ('79000000-0000-4000-8001-000000000001','BOUNDARY-1','Manager one customer','79000000-0000-4000-8000-000000000005'),
 ('79000000-0000-4000-8001-000000000002','BOUNDARY-2','Manager two customer','79000000-0000-4000-8000-000000000006'),
 ('79000000-0000-4000-8001-000000000003','BOUNDARY-3','Sales transfer customer','79000000-0000-4000-8000-000000000004');
INSERT INTO public.invoices(id,invoice_number,customer_id,customer_name,seller_name,seller_tax_registration_number,seller_address,created_by,status,document_type)
VALUES ('79000000-0000-4000-8007-000000000001','BOUNDARY-INVOICE','79000000-0000-4000-8001-000000000003',
 'Sales transfer customer','Boundary seller','fixture','fixture','79000000-0000-4000-8000-000000000004','draft','proforma_invoice');
INSERT INTO public.invoice_items(invoice_id,description,quantity,unit_price)
VALUES ('79000000-0000-4000-8007-000000000001','BOUNDARY-INVOICE-ITEM',1,0);
INSERT INTO public.customer_profiles(id,customer_id,email) VALUES
 ('79000000-0000-4000-8000-000000000007','79000000-0000-4000-8001-000000000001','finance-boundary-7@example.invalid'),
 ('79000000-0000-4000-8000-000000000008','79000000-0000-4000-8001-000000000002','finance-boundary-8@example.invalid');
INSERT INTO public.customer_payment_proofs(id,customer_id,uploaded_by,amount,currency,transfer_date,storage_path,file_name,mime_type,size_bytes)
SELECT ('79000000-0000-4000-8002-' || lpad(n::text,12,'0'))::uuid,
 ('79000000-0000-4000-8001-' || lpad(n::text,12,'0'))::uuid,
 ('79000000-0000-4000-8000-' || lpad((n+6)::text,12,'0'))::uuid,
 100,'AED','2026-10-07',
 '79000000-0000-4000-8001-' || lpad(n::text,12,'0') || '/79000000-0000-4000-8000-' || lpad((n+6)::text,12,'0') || '/proof.pdf',
 'proof.pdf','application/pdf',100
FROM generate_series(1,2) n;
INSERT INTO storage.objects(bucket_id,name)
SELECT 'customer-payment-proofs',storage_path FROM public.customer_payment_proofs WHERE id::text LIKE '79000000-%';
INSERT INTO public.remittances(id,remittance_number,customer_name,amount,currency,status,is_unknown,created_by)
VALUES ('79000000-0000-4000-8003-000000000001','BOUNDARY-TT','Unknown fixture',100,'AED','unknown',true,'79000000-0000-4000-8000-000000000001');
INSERT INTO public.employees(id,full_name,join_date,basic_salary) VALUES
 ('79000000-0000-4000-8004-000000000001','Boundary employee','2026-01-01',100),
 ('79000000-0000-4000-8004-000000000002','Unlinked employee','2026-01-01',100);
INSERT INTO public.payroll_runs(id,run_number,status,period_start,period_end,created_by)
SELECT ('79000000-0000-4000-8005-' || lpad(n::text,12,'0'))::uuid,'BOUNDARY-PAY-' || n,
 CASE WHEN n=2 THEN 'cancelled' WHEN n=3 THEN 'posted' ELSE 'draft' END,
 '2026-10-01','2026-10-31','79000000-0000-4000-8000-000000000001' FROM generate_series(1,5) n;
INSERT INTO public.payroll_lines(payroll_run_id,employee_id,basic_salary,net_pay)
VALUES ('79000000-0000-4000-8005-000000000001','79000000-0000-4000-8004-000000000001',100,100),
 ('79000000-0000-4000-8005-000000000003','79000000-0000-4000-8004-000000000001',100,100);
INSERT INTO public.gl_journals(id,journal_number,status,entry_date,currency,total_debit,total_credit)
SELECT ('79000000-0000-4000-8006-' || lpad(n::text,12,'0'))::uuid,'BOUNDARY-GL-' || n,
 CASE WHEN n=1 THEN 'posted' ELSE 'draft' END,'2026-10-07','AED',100,100 FROM generate_series(1,2) n;
INSERT INTO public.gl_journal_lines(journal_id,account_id,line_no,debit,credit)
SELECT j.id,a.id,CASE WHEN a.code='1000' THEN 1 ELSE 2 END,
 CASE WHEN a.code='1000' THEN 100 ELSE 0 END,CASE WHEN a.code='1100' THEN 100 ELSE 0 END
FROM public.gl_journals j CROSS JOIN public.gl_accounts a
WHERE j.journal_number LIKE 'BOUNDARY-GL-%' AND a.code IN ('1000','1100');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT pg_temp.finance_denied($s$SELECT public.cancel_payroll_run('79000000-0000-4000-8005-000000000002')$s$,'42501','anon cannot obtain cancelled payroll row');
SELECT pg_temp.finance_denied($s$SELECT public.reverse_gl_journal('79000000-0000-4000-8006-000000000001')$s$,'42501','anon cannot reverse GL');

SET LOCAL ROLE authenticated;
DO $$ DECLARE subject integer; BEGIN
  FOREACH subject IN ARRAY ARRAY[7,3,4] LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','79000000-0000-4000-8000-' || lpad(subject::text,12,'0'))::text,true);
    PERFORM pg_temp.finance_denied($s$SELECT public.cancel_payroll_run('79000000-0000-4000-8005-000000000002')$s$,'42501','customer/accounts/sales cannot obtain cancelled payroll row');
    PERFORM pg_temp.finance_denied($s$SELECT public.post_payroll_run('79000000-0000-4000-8005-000000000001')$s$,'P0001','customer/accounts/sales cannot post payroll');
    PERFORM pg_temp.finance_denied($s$SELECT public.reverse_gl_journal('79000000-0000-4000-8006-000000000001')$s$,'P0001','customer/accounts/sales cannot reverse GL');
    PERFORM pg_temp.finance_denied($s$SELECT public.confirm_purchase_order('79000000-0000-4000-8099-000000000001')$s$,'P0001','customer/accounts/sales cannot confirm PO');
    PERFORM pg_temp.finance_denied($s$SELECT public.reverse_supplier_payment_allocation('79000000-0000-4000-8099-000000000001')$s$,'P0001','customer/accounts/sales cannot reverse supplier payment');
    PERFORM pg_temp.finance_assert((SELECT count(*) FROM public.payroll_runs WHERE run_number LIKE 'BOUNDARY-PAY-%')=0,'non-ops cannot read payroll rows');
  END LOOP;
END $$;

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"79000000-0000-4000-8000-000000000005"}',true);
SELECT pg_temp.finance_assert((SELECT count(*) FROM public.customer_payment_proofs WHERE id::text LIKE '79000000-%')=1,'manager proof reads are assigned-customer scoped');
SELECT pg_temp.finance_assert((SELECT count(*) FROM storage.objects WHERE bucket_id='customer-payment-proofs' AND name LIKE '79000000-%')=1,'manager proof file reads are assigned-customer scoped');
SELECT pg_temp.finance_denied($s$SELECT public.reject_customer_payment_proof('79000000-0000-4000-8002-000000000002','Forbidden')$s$,'42501','manager cannot reject foreign proof');
SELECT pg_temp.finance_denied($s$SELECT public.match_customer_payment_proof('79000000-0000-4000-8002-000000000001','79000000-0000-4000-8003-000000000001')$s$,'42501','manager cannot bypass remittance RLS via definer matching');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"79000000-0000-4000-8000-000000000002"}',true);
SELECT pg_temp.finance_denied($s$SELECT public.post_payroll_run('79000000-0000-4000-8005-000000000001')$s$,'P0001','staff cannot post payroll through RPC');
SELECT pg_temp.finance_denied($s$UPDATE public.payroll_runs SET status='posted' WHERE id='79000000-0000-4000-8005-000000000001'$s$,'42501','staff cannot post payroll directly');
SELECT pg_temp.finance_denied($s$UPDATE public.payroll_runs SET status='cancelled' WHERE id='79000000-0000-4000-8005-000000000003'$s$,'42501','staff cannot cancel posted payroll directly');
SELECT pg_temp.finance_denied($s$DELETE FROM public.payroll_runs WHERE id='79000000-0000-4000-8005-000000000005'$s$,'42501','staff cannot delete payroll directly');
SELECT pg_temp.finance_denied($s$DELETE FROM public.employees WHERE id='79000000-0000-4000-8004-000000000002'$s$,'42501','staff cannot delete employee directly');
SELECT pg_temp.finance_denied($s$UPDATE public.payroll_lines SET basic_salary=500 WHERE payroll_run_id='79000000-0000-4000-8005-000000000003'$s$,'42501','staff cannot change posted payroll lines directly');
SELECT pg_temp.finance_denied($s$UPDATE public.gl_journals SET status='reversed' WHERE id='79000000-0000-4000-8006-000000000001'$s$,'42501','staff cannot reverse GL directly');
SELECT pg_temp.finance_denied($s$UPDATE public.gl_journals SET total_debit=500 WHERE id='79000000-0000-4000-8006-000000000001'$s$,'P0001','posted GL amounts cannot be overwritten');
SELECT pg_temp.finance_denied($s$UPDATE public.gl_journal_lines SET debit=500 WHERE journal_id='79000000-0000-4000-8006-000000000001' AND debit>0$s$,'P0001','posted GL lines cannot be overwritten');
SELECT pg_temp.finance_assert((public.cancel_payroll_run('79000000-0000-4000-8005-000000000004')).status='cancelled','staff retains draft payroll cancellation');
SELECT public.post_gl_journal('79000000-0000-4000-8006-000000000002');
SELECT pg_temp.finance_assert((SELECT status FROM public.gl_journals WHERE id='79000000-0000-4000-8006-000000000002')='posted','staff retains balanced GL posting');
DO $$ DECLARE expense_id uuid; category_id uuid; BEGIN
  SELECT id INTO category_id FROM public.expense_categories WHERE code='other';
  expense_id := public.create_expense('2026-10-07',100,'AED',category_id,'Finance boundary','cash',NULL,NULL,NULL,true);
  PERFORM public.cancel_expense(expense_id);
  PERFORM pg_temp.finance_assert(EXISTS (SELECT 1 FROM public.gl_journals WHERE source_module='expense' AND source_id=expense_id AND status='reversed'),'staff expense cancellation retains automatic GL reversal');
END $$;

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"79000000-0000-4000-8000-000000000003"}',true);
SELECT pg_temp.finance_assert(public.reject_customer_payment_proof('79000000-0000-4000-8002-000000000001','Reviewed by accounts'),'accounts retains proof rejection');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"79000000-0000-4000-8000-000000000001"}',true);
SELECT pg_temp.finance_assert((public.post_payroll_run('79000000-0000-4000-8005-000000000001')).status='posted','admin retains payroll posting');
SELECT pg_temp.finance_assert((public.cancel_payroll_run('79000000-0000-4000-8005-000000000001')).status='cancelled','admin retains posted payroll cancellation');
SELECT pg_temp.finance_assert(public.delete_payroll_run('79000000-0000-4000-8005-000000000005') IS NOT NULL,'admin retains payroll deletion');
SELECT pg_temp.finance_assert(public.reverse_gl_journal('79000000-0000-4000-8006-000000000001') IS NOT NULL,'admin retains GL reversal');
SELECT pg_temp.finance_assert(public.match_customer_payment_proof('79000000-0000-4000-8002-000000000002','79000000-0000-4000-8003-000000000001'),'admin retains proof matching');
SELECT pg_temp.finance_assert((SELECT customer_id FROM public.remittances WHERE id='79000000-0000-4000-8003-000000000001')='79000000-0000-4000-8001-000000000002'::uuid,'matched TT follows selected proof customer');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"79000000-0000-4000-8000-000000000004"}',true);
SELECT pg_temp.finance_assert((SELECT count(*) FROM public.invoice_items WHERE description='BOUNDARY-INVOICE-ITEM')=1,'sales creator sees current own-book invoice items');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"79000000-0000-4000-8000-000000000001"}',true);
SELECT public.assign_customer_owner('79000000-0000-4000-8001-000000000003','79000000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"79000000-0000-4000-8000-000000000004"}',true);
SELECT pg_temp.finance_assert((SELECT count(*) FROM public.invoices WHERE invoice_number='BOUNDARY-INVOICE')=0,'former sales owner loses transferred invoice visibility');
SELECT pg_temp.finance_assert((SELECT count(*) FROM public.invoice_items WHERE description='BOUNDARY-INVOICE-ITEM')=0,'historical creator cannot retain transferred invoice-item visibility');
RESET ROLE;
SELECT 'Finance RPC, direct mutation and proof ownership assertions passed' AS result;
ROLLBACK;
