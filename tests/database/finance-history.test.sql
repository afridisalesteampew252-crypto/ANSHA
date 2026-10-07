BEGIN;

INSERT INTO auth.users(id,email) VALUES
 ('76000000-0000-4000-8000-000000000001','finance-admin@example.invalid'),
 ('76000000-0000-4000-8000-000000000002','finance-customer-a@example.invalid'),
 ('76000000-0000-4000-8000-000000000003','finance-customer-b@example.invalid');
INSERT INTO public.admin_profiles(id,role,full_name,is_active)
VALUES ('76000000-0000-4000-8000-000000000001','admin','Finance regression',true)
ON CONFLICT (id) DO UPDATE SET role='admin',is_active=true;
SELECT set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000001',true);
INSERT INTO public.customers(id,customer_code,full_name,owner_id) VALUES
 ('76000000-0000-4000-8000-000000000012','FIN-TEST-A','Customer A','76000000-0000-4000-8000-000000000001'),
 ('76000000-0000-4000-8000-000000000013','FIN-TEST-B','Customer B','76000000-0000-4000-8000-000000000001');
INSERT INTO public.customer_profiles(id,customer_id,email) VALUES
 ('76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000012','finance-customer-a@example.invalid'),
 ('76000000-0000-4000-8000-000000000003','76000000-0000-4000-8000-000000000013','finance-customer-b@example.invalid');
INSERT INTO public.invoices(id,invoice_number,customer_id,customer_name,seller_name,seller_tax_registration_number,seller_address,
  issue_date,due_date,currency,status,subtotal,total_amount,balance_due,created_by) VALUES
 ('76000000-0000-4000-8000-000000000022','FIN-INV-A','76000000-0000-4000-8000-000000000012','Customer A','ANSHA','TEST','Dubai','2026-10-01','2026-10-31','AED','sent',1000,1000,1000,'76000000-0000-4000-8000-000000000001'),
 ('76000000-0000-4000-8000-000000000023','FIN-INV-B','76000000-0000-4000-8000-000000000013','Customer B','ANSHA','TEST','Dubai','2026-10-01','2026-10-31','AED','sent',1000,1000,1000,'76000000-0000-4000-8000-000000000001');
INSERT INTO public.invoice_items(invoice_id,description,quantity,unit_price,tax_rate) VALUES
 ('76000000-0000-4000-8000-000000000022','Finance regression A',1,1000,0),
 ('76000000-0000-4000-8000-000000000023','Finance regression B',1,1000,0);
INSERT INTO public.invoice_payments(invoice_id,payment_date,amount,method,reference,created_by) VALUES
 ('76000000-0000-4000-8000-000000000022','2026-10-04',100,'cash','CASH-A','76000000-0000-4000-8000-000000000001'),
 ('76000000-0000-4000-8000-000000000023','2026-10-04',100,'cash','CASH-B-PRIVATE','76000000-0000-4000-8000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE expense_id uuid; category_id uuid;
BEGIN
  SELECT id INTO category_id FROM public.expense_categories WHERE code='other';
  expense_id := public.create_expense('2026-10-07',1250,'PKR',category_id,'PKR regression','cash',NULL,NULL,NULL,true);
  ASSERT EXISTS (SELECT 1 FROM public.expenses WHERE id=expense_id AND currency='PKR' AND amount=1250 AND status='posted'), 'PKR expense retains selected original currency and amount';
  ASSERT EXISTS (SELECT 1 FROM public.gl_journals WHERE source_module='expense' AND source_id=expense_id AND currency='PKR' AND status='posted' AND total_debit=1250 AND total_credit=1250), 'PKR expense posts a balanced PKR journal without AED conversion';
END;
$$;
DO $$
DECLARE first_id uuid; second_id uuid; third_id uuid; count_before bigint;
BEGIN
  ASSERT NOT has_function_privilege('anon','public.get_my_customer_finance_history()','EXECUTE'), 'anonymous callers cannot read payment history';
  ASSERT NOT has_function_privilege('anon','public.create_remittance_with_fx(uuid,uuid,text,date,numeric,text,text,text,text,text,text,text,uuid,uuid,uuid,text,numeric,numeric)','EXECUTE'), 'anonymous callers cannot create TTs';
  first_id := public.create_remittance_with_fx(
    '76000000-0000-4000-8000-000000000012',NULL,'Customer A','2026-10-03',300,'AED','bank_transfer','FX-ONE','','','confirmed','',
    NULL,NULL,NULL,'USD',100,3);
  second_id := public.create_remittance_with_fx(
    '76000000-0000-4000-8000-000000000012',NULL,'Customer A','2026-10-05',200,'AED','bank_transfer','FX-TWO','','','confirmed','',
    NULL,NULL,NULL,'USD',50,4);
  third_id := public.create_remittance_with_fx(
    '76000000-0000-4000-8000-000000000013',NULL,'Customer B','2026-10-05',600,'AED','bank_transfer','FX-PRIVATE','','','confirmed','',
    NULL,NULL,NULL,'USD',200,3);
  ASSERT (SELECT exchange_rate=3 AND amount=300 AND source_amount=100 FROM public.remittances WHERE id=first_id), 'first TT keeps original rate';
  ASSERT (SELECT exchange_rate=4 AND amount=200 AND source_amount=50 FROM public.remittances WHERE id=second_id), 'second TT keeps a different original rate';
  PERFORM public.allocate_remittance(first_id,'76000000-0000-4000-8000-000000000022',100);
  ASSERT EXISTS (SELECT 1 FROM public.invoices WHERE id='76000000-0000-4000-8000-000000000022' AND total_amount=1000 AND amount_paid=200 AND balance_due=800 AND currency='AED'), 'invoice total, paid and remaining include direct and TT payments in the original currency';
  BEGIN
    UPDATE public.remittances SET exchange_rate=3.5 WHERE id=first_id;
    ASSERT false, 'recorded rates must reject repricing';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    UPDATE public.remittances SET currency='PKR' WHERE id=first_id;
    ASSERT false, 'changing a recorded currency must not change historical FX';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  SELECT count(*) INTO count_before FROM public.remittances;
  BEGIN
    PERFORM public.create_remittance_with_fx(
      '76000000-0000-4000-8000-000000000012',NULL,'Customer A','2026-10-05',99,'AED','bank_transfer','FX-BROKEN','','','confirmed','',
      NULL,NULL,NULL,'USD',NULL,4);
    ASSERT false, 'partial TT metadata must be rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT (SELECT count(*) FROM public.remittances)=count_before, 'invalid FX must roll back the receipt atomically';
END;
$$;

SELECT set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000002',true);
DO $$
DECLARE history jsonb;
BEGIN
  history := public.get_my_customer_finance_history();
  ASSERT jsonb_array_length(history->'remittances')=2, 'customer A sees only their two TTs';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(history->'remittances') receipt WHERE receipt->>'bank_reference'='FX-PRIVATE'), 'customer A cannot see customer B bank reference';
  ASSERT jsonb_array_length(history->'payments')=2, 'customer sees direct payment plus applied TT payment';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(history->'payments') payment WHERE payment->>'reference'='CASH-B-PRIVATE'), 'customer A cannot see customer B direct payments';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(history->'payments') payment WHERE payment->>'remittance_id' IS NOT NULL AND (payment->>'amount')::numeric=100), 'applied TT history contains its allocation and original receipt link';
  BEGIN
    PERFORM public.create_remittance_with_fx(NULL,NULL,'Forged','2026-10-05',99,'AED','bank_transfer','','','','pending','');
    ASSERT false, 'customer cannot create staff remittances';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
SELECT set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
  ASSERT jsonb_array_length(public.get_my_customer_finance_history()->'remittances')=1, 'customer B cannot see customer A TTs';
END; $$;
RESET ROLE;
UPDATE public.customer_profiles SET is_active=false WHERE id='76000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.get_my_customer_finance_history();
    ASSERT false, 'disabled customer cannot read payment history';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END; $$;
RESET ROLE;
ROLLBACK;
