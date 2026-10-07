-- Execute against a disposable migrated database. Real RPCs, roles and dates;
-- fixture data and all accounting mutations are rolled back.
BEGIN;

CREATE FUNCTION pg_temp.report_assert(condition boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF;
END $$;
CREATE FUNCTION pg_temp.report_denied(statement text, expected_state text, message text) RETURNS void
LANGUAGE plpgsql AS $$ DECLARE actual_state text; BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual_state=RETURNED_SQLSTATE;
  END;
  IF actual_state IS DISTINCT FROM expected_state THEN
    RAISE EXCEPTION 'Assertion failed: %; expected %, received %', message, expected_state, coalesce(actual_state,'success');
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.report_assert(boolean,text), pg_temp.report_denied(text,text,text) TO anon, authenticated;

SELECT set_config('request.jwt.claim.sub','',true), set_config('request.jwt.claim.role','',true),
  set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email)
SELECT ('92000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'report-reversal-' || n || '@example.invalid' FROM generate_series(1,7) n;
INSERT INTO public.admin_profiles(id,role,full_name,is_active)
SELECT ('92000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, role,
  'Report reversal actor ' || n, n <> 4
FROM (VALUES(1,'admin'),(2,'staff'),(3,'accounts'),(4,'admin'),(5,'manager'),(6,'sales')) v(n,role);
INSERT INTO public.customers(id,customer_code,full_name)
VALUES('92000000-0000-4000-8002-000000000001','REPORT-REVERSAL','Report reversal portal customer');
INSERT INTO public.customer_profiles(id,customer_id,email)
VALUES('92000000-0000-4000-8000-000000000007','92000000-0000-4000-8002-000000000001','report-reversal-7@example.invalid');
INSERT INTO public.gl_accounts(id,code,name,account_type)
VALUES
 ('92000000-0000-4000-8001-000000000001','REV-CASH','Reversal fixture cash','asset'),
 ('92000000-0000-4000-8001-000000000002','REV-EXP','Reversal fixture expense','expense'),
 ('92000000-0000-4000-8001-000000000003','REV-REV','Reversal fixture revenue','revenue');
INSERT INTO public.expense_categories(id,code,name,gl_account_hint)
VALUES('92000000-0000-4000-8003-000000000001','report_reversal','Reversal fixture category','REV-EXP Reversal fixture expense');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"92000000-0000-4000-8000-000000000001"}',true);

-- Same-period manual reversal must net to zero while retaining both entries.
SAVEPOINT same_period;
DO $$ DECLARE
  cash_id constant uuid := '92000000-0000-4000-8001-000000000001';
  expense_id constant uuid := '92000000-0000-4000-8001-000000000002';
  original uuid; reversal uuid; baseline_currency numeric; baseline_legacy numeric;
BEGIN
  SELECT coalesce(sum(amount),0) INTO baseline_currency FROM public.gl_balance_sheet_currency('2026-01-31','USD') WHERE account_code='NI';
  SELECT coalesce(sum(amount),0) INTO baseline_legacy FROM public.gl_balance_sheet('2026-01-31') WHERE account_code='NI';
  original := public.create_gl_journal('2026-01-10','Same-period reversal',jsonb_build_array(
    jsonb_build_object('account_id',expense_id,'debit',100,'credit',0),
    jsonb_build_object('account_id',cash_id,'debit',0,'credit',100)), 'USD');
  PERFORM public.post_gl_journal(original);
  PERFORM pg_temp.report_assert((SELECT amount=100 FROM public.gl_profit_and_loss_currency('2026-01-01','2026-01-31','USD') WHERE account_id=expense_id),'posted expense appears before reversal');
  reversal := public.reverse_gl_journal(original,'2026-01-20','Same-period correction');
  PERFORM pg_temp.report_assert((SELECT status='reversed' AND reversed_by_journal_id=reversal FROM public.gl_journals WHERE id=original),'manual RPC marks original reversed with a linked correction');
  PERFORM pg_temp.report_assert((SELECT status='posted' AND currency='USD' AND reverses_journal_id=original FROM public.gl_journals WHERE id=reversal),'manual reversal is separately posted in the original currency');
  PERFORM pg_temp.report_assert((SELECT count(*) FROM public.gl_journal_lines a JOIN public.gl_journal_lines b ON b.journal_id=reversal AND b.line_no=a.line_no AND b.account_id=a.account_id AND b.debit=a.credit AND b.credit=a.debit WHERE a.journal_id=original)=2,'reversal retains and exactly offsets original lines');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_profit_and_loss_currency('2026-01-01','2026-01-31','USD') WHERE account_id=expense_id)=0,'same-period currency P&L nets to zero');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_profit_and_loss('2026-01-01','2026-01-31') WHERE account_id=expense_id)=0,'same-period legacy P&L nets to zero');
  PERFORM pg_temp.report_assert((SELECT balance=0 AND total_debit=100 AND total_credit=100 FROM public.gl_trial_balance_currency('2026-01-31','USD') WHERE account_id=expense_id),'currency trial balance retains original and correction totals');
  PERFORM pg_temp.report_assert((SELECT balance=0 AND total_debit=100 AND total_credit=100 FROM public.gl_trial_balance('2026-01-31') WHERE account_id=expense_id),'legacy trial balance retains original and correction totals');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet_currency('2026-01-31','USD') WHERE account_id=cash_id)=0,'same-period currency balance sheet cash nets to zero');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet('2026-01-31') WHERE account_id=cash_id)=0,'same-period legacy balance sheet cash nets to zero');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet_currency('2026-01-31','USD') WHERE account_code='NI')=baseline_currency,'currency net-income plug retains no phantom reversal profit');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet('2026-01-31') WHERE account_code='NI')=baseline_legacy,'legacy net-income plug retains no phantom reversal profit');
END $$;
ROLLBACK TO SAVEPOINT same_period;
RELEASE SAVEPOINT same_period;

-- A February reversal does not erase January. Inactive historical accounts
-- must still appear in January's trial balance (including its EXISTS branch).
SAVEPOINT cross_period;
DO $$ DECLARE
  cash_id constant uuid := '92000000-0000-4000-8001-000000000001';
  expense_id constant uuid := '92000000-0000-4000-8001-000000000002';
  original uuid; baseline_jan numeric; baseline_feb numeric; legacy_jan numeric; legacy_feb numeric;
BEGIN
  SELECT coalesce(sum(amount),0) INTO baseline_jan FROM public.gl_balance_sheet_currency('2026-01-31','USD') WHERE account_code='NI';
  SELECT coalesce(sum(amount),0) INTO baseline_feb FROM public.gl_balance_sheet_currency('2026-02-28','USD') WHERE account_code='NI';
  SELECT coalesce(sum(amount),0) INTO legacy_jan FROM public.gl_balance_sheet('2026-01-31') WHERE account_code='NI';
  SELECT coalesce(sum(amount),0) INTO legacy_feb FROM public.gl_balance_sheet('2026-02-28') WHERE account_code='NI';
  original := public.create_gl_journal('2026-01-10','Cross-period reversal',jsonb_build_array(
    jsonb_build_object('account_id',expense_id,'debit',100,'credit',0),
    jsonb_build_object('account_id',cash_id,'debit',0,'credit',100)), 'USD');
  PERFORM public.post_gl_journal(original);
  PERFORM public.reverse_gl_journal(original,'2026-02-10','February correction');
  UPDATE public.gl_accounts SET is_active=false WHERE id IN(cash_id,expense_id);
  PERFORM pg_temp.report_assert((SELECT amount=100 FROM public.gl_profit_and_loss_currency('2026-01-01','2026-01-31','USD') WHERE account_id=expense_id),'currency January P&L keeps original expense after February reversal');
  PERFORM pg_temp.report_assert((SELECT amount=100 FROM public.gl_profit_and_loss('2026-01-01','2026-01-31') WHERE account_id=expense_id),'legacy January P&L keeps original expense after February reversal');
  PERFORM pg_temp.report_assert((SELECT amount=-100 FROM public.gl_profit_and_loss_currency('2026-02-01','2026-02-28','USD') WHERE account_id=expense_id),'currency February P&L contains only the negative correction');
  PERFORM pg_temp.report_assert((SELECT amount=-100 FROM public.gl_profit_and_loss('2026-02-01','2026-02-28') WHERE account_id=expense_id),'legacy February P&L contains only the negative correction');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_profit_and_loss_currency('2026-01-01','2026-02-28','USD') WHERE account_id=expense_id)=0,'combined currency period nets original and correction to zero');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_profit_and_loss('2026-01-01','2026-02-28') WHERE account_id=expense_id)=0,'combined legacy period nets original and correction to zero');
  PERFORM pg_temp.report_assert((SELECT balance=100 AND total_debit=100 AND total_credit=0 FROM public.gl_trial_balance_currency('2026-01-31','USD') WHERE account_id=expense_id),'currency January trial balance retains inactive original-only account');
  PERFORM pg_temp.report_assert((SELECT balance=100 AND total_debit=100 AND total_credit=0 FROM public.gl_trial_balance('2026-01-31') WHERE account_id=expense_id),'legacy January trial balance retains inactive original-only account');
  PERFORM pg_temp.report_assert((SELECT balance=-100 FROM public.gl_trial_balance_currency('2026-01-31','USD') WHERE account_id=cash_id),'currency January trial cash excludes the future reversal');
  PERFORM pg_temp.report_assert((SELECT balance=-100 FROM public.gl_trial_balance('2026-01-31') WHERE account_id=cash_id),'legacy January trial cash excludes the future reversal');
  PERFORM pg_temp.report_assert((SELECT balance=0 AND total_debit=100 AND total_credit=100 FROM public.gl_trial_balance_currency('2026-02-28','USD') WHERE account_id=expense_id),'currency February trial balance includes both entries');
  PERFORM pg_temp.report_assert((SELECT balance=0 AND total_debit=100 AND total_credit=100 FROM public.gl_trial_balance('2026-02-28') WHERE account_id=expense_id),'legacy February trial balance includes both entries');
  PERFORM pg_temp.report_assert((SELECT amount=-100 FROM public.gl_balance_sheet_currency('2026-01-31','USD') WHERE account_id=cash_id),'currency January balance sheet preserves historical cash');
  PERFORM pg_temp.report_assert((SELECT amount=-100 FROM public.gl_balance_sheet('2026-01-31') WHERE account_id=cash_id),'legacy January balance sheet preserves historical cash');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet_currency('2026-02-28','USD') WHERE account_id=cash_id)=0,'currency February balance sheet cash nets to zero');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet('2026-02-28') WHERE account_id=cash_id)=0,'legacy February balance sheet cash nets to zero');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet_currency('2026-01-31','USD') WHERE account_code='NI')=baseline_jan-100,'currency January net-income plug keeps original expense');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet('2026-01-31') WHERE account_code='NI')=legacy_jan-100,'legacy January net-income plug keeps original expense');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet_currency('2026-02-28','USD') WHERE account_code='NI')=baseline_feb,'currency February net-income plug returns to baseline');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet('2026-02-28') WHERE account_code='NI')=legacy_feb,'legacy February net-income plug returns to baseline');
END $$;
ROLLBACK TO SAVEPOINT cross_period;
RELEASE SAVEPOINT cross_period;

-- Reversed USD revenue cannot turn into negative revenue or offset AED activity.
-- A never-posted draft also remains excluded from every statement.
SAVEPOINT currencies;
DO $$ DECLARE
  cash_id constant uuid := '92000000-0000-4000-8001-000000000001';
  revenue_id constant uuid := '92000000-0000-4000-8001-000000000003';
  original uuid; control uuid; draft uuid;
BEGIN
  original := public.create_gl_journal('2026-01-10','USD revenue reversal',jsonb_build_array(
    jsonb_build_object('account_id',cash_id,'debit',125,'credit',0),
    jsonb_build_object('account_id',revenue_id,'debit',0,'credit',125)), 'USD');
  control := public.create_gl_journal('2026-01-10','Separate AED revenue',jsonb_build_array(
    jsonb_build_object('account_id',cash_id,'debit',375,'credit',0),
    jsonb_build_object('account_id',revenue_id,'debit',0,'credit',375)), 'AED');
  draft := public.create_gl_journal('2026-01-10','Excluded USD draft',jsonb_build_array(
    jsonb_build_object('account_id',cash_id,'debit',999,'credit',0),
    jsonb_build_object('account_id',revenue_id,'debit',0,'credit',999)), 'USD');
  PERFORM public.post_gl_journal(original);
  PERFORM public.post_gl_journal(control);
  PERFORM public.reverse_gl_journal(original,'2026-01-20','USD correction');
  PERFORM pg_temp.report_assert((SELECT status='draft' FROM public.gl_journals WHERE id=draft),'control journal remains unposted');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_profit_and_loss_currency('2026-01-01','2026-01-31','USD') WHERE account_id=revenue_id)=0,'USD revenue reversal nets to zero and excludes draft');
  PERFORM pg_temp.report_assert((SELECT amount=375 FROM public.gl_profit_and_loss_currency('2026-01-01','2026-01-31','AED') WHERE account_id=revenue_id),'AED revenue is isolated from USD original and correction');
  PERFORM pg_temp.report_assert((SELECT amount=375 FROM public.gl_profit_and_loss('2026-01-01','2026-01-31') WHERE account_id=revenue_id),'legacy P&L includes only unreversed posted control activity');
  PERFORM pg_temp.report_assert((SELECT balance=0 AND total_debit=125 AND total_credit=125 FROM public.gl_trial_balance_currency('2026-01-31','USD') WHERE account_id=revenue_id),'USD trial balance retains both real entries and excludes draft');
  PERFORM pg_temp.report_assert((SELECT balance=375 AND total_credit=375 FROM public.gl_trial_balance_currency('2026-01-31','AED') WHERE account_id=revenue_id),'AED trial balance stays isolated');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet_currency('2026-01-31','USD') WHERE account_id=cash_id)=0,'USD balance sheet excludes AED control and USD draft');
  PERFORM pg_temp.report_assert((SELECT amount=375 FROM public.gl_balance_sheet_currency('2026-01-31','AED') WHERE account_id=cash_id),'AED balance sheet retains only AED cash');
END $$;
ROLLBACK TO SAVEPOINT currencies;
RELEASE SAVEPOINT currencies;

-- Staff still cancel expenses through the actual domain RPC/automatic reversal.
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"92000000-0000-4000-8000-000000000002"}',true);
SAVEPOINT automatic_expense;
DO $$ DECLARE
  expense_account constant uuid := '92000000-0000-4000-8001-000000000002';
  today date := (now() AT TIME ZONE 'UTC')::date;
  expense_id uuid; original uuid; reversal uuid; currency_ni numeric; legacy_ni numeric;
  currency_cash numeric; legacy_cash numeric; cash_id uuid;
BEGIN
  SELECT id INTO cash_id FROM public.gl_accounts WHERE code='1000';
  SELECT coalesce(sum(amount),0) INTO currency_ni FROM public.gl_balance_sheet_currency(today,'USD') WHERE account_code='NI';
  SELECT coalesce(sum(amount),0) INTO legacy_ni FROM public.gl_balance_sheet(today) WHERE account_code='NI';
  SELECT coalesce(sum(amount),0) INTO currency_cash FROM public.gl_balance_sheet_currency(today,'USD') WHERE account_id=cash_id;
  SELECT coalesce(sum(amount),0) INTO legacy_cash FROM public.gl_balance_sheet(today) WHERE account_id=cash_id;
  expense_id := public.create_expense(today,37.50,'USD','92000000-0000-4000-8003-000000000001','Automatic reversal fixture','cash',NULL,NULL,NULL,true);
  SELECT id INTO original FROM public.gl_journals WHERE source_module='expense' AND source_id=expense_id AND reverses_journal_id IS NULL;
  PERFORM pg_temp.report_assert(original IS NOT NULL,'real posted expense creates a source journal');
  PERFORM public.cancel_expense(expense_id);
  SELECT reversed_by_journal_id INTO reversal FROM public.gl_journals WHERE id=original AND status='reversed';
  PERFORM pg_temp.report_assert(reversal IS NOT NULL AND (SELECT status='posted' AND entry_date=today AND currency='USD' AND reverses_journal_id=original FROM public.gl_journals WHERE id=reversal),'staff cancellation creates a dated same-currency automatic reversal');
  PERFORM pg_temp.report_assert((SELECT count(*) FROM public.gl_journal_lines WHERE journal_id IN(original,reversal))=4,'automatic reversal preserves both original and opposite lines');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_profit_and_loss_currency(today,today,'USD') WHERE account_id=expense_account)=0,'automatic same-period currency P&L nets to zero');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_profit_and_loss(today,today) WHERE account_id=expense_account)=0,'automatic same-period legacy P&L nets to zero');
  PERFORM pg_temp.report_assert((SELECT balance=0 AND total_debit=37.50 AND total_credit=37.50 FROM public.gl_trial_balance_currency(today,'USD') WHERE account_id=expense_account),'automatic currency trial balance keeps both source and correction');
  PERFORM pg_temp.report_assert((SELECT balance=0 AND total_debit=37.50 AND total_credit=37.50 FROM public.gl_trial_balance(today) WHERE account_id=expense_account),'automatic legacy trial balance keeps both source and correction');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet_currency(today,'USD') WHERE account_id=cash_id)=currency_cash,'automatic currency cash returns to baseline');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet(today) WHERE account_id=cash_id)=legacy_cash,'automatic legacy cash returns to baseline');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet_currency(today,'USD') WHERE account_code='NI')=currency_ni,'automatic currency net income returns to baseline');
  PERFORM pg_temp.report_assert((SELECT coalesce(sum(amount),0) FROM public.gl_balance_sheet(today) WHERE account_code='NI')=legacy_ni,'automatic legacy net income returns to baseline');
END $$;
ROLLBACK TO SAVEPOINT automatic_expense;
RELEASE SAVEPOINT automatic_expense;

-- Keep all six report boundaries: anonymous has no grant; authenticated accounts,
-- inactive admins, managers, sales agents and portal customers are not GL ops.
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
DO $$ DECLARE statement text; BEGIN
  FOREACH statement IN ARRAY ARRAY[
    'SELECT * FROM public.gl_trial_balance(''2026-01-31'')',
    'SELECT * FROM public.gl_profit_and_loss(''2026-01-01'',''2026-01-31'')',
    'SELECT * FROM public.gl_balance_sheet(''2026-01-31'')',
    'SELECT * FROM public.gl_trial_balance_currency(''2026-01-31'',''USD'')',
    'SELECT * FROM public.gl_profit_and_loss_currency(''2026-01-01'',''2026-01-31'',''USD'')',
    'SELECT * FROM public.gl_balance_sheet_currency(''2026-01-31'',''USD'')'
  ] LOOP
    PERFORM pg_temp.report_denied(statement,'42501','anonymous report execution stays denied');
  END LOOP;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ DECLARE actor integer; statement text; BEGIN
  FOR actor IN 3..7 LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','92000000-0000-4000-8000-' || lpad(actor::text,12,'0'))::text,true);
    FOREACH statement IN ARRAY ARRAY[
      'SELECT * FROM public.gl_trial_balance(''2026-01-31'')',
      'SELECT * FROM public.gl_profit_and_loss(''2026-01-01'',''2026-01-31'')',
      'SELECT * FROM public.gl_balance_sheet(''2026-01-31'')',
      'SELECT * FROM public.gl_trial_balance_currency(''2026-01-31'',''USD'')',
      'SELECT * FROM public.gl_profit_and_loss_currency(''2026-01-01'',''2026-01-31'',''USD'')',
      'SELECT * FROM public.gl_balance_sheet_currency(''2026-01-31'',''USD'')'
    ] LOOP
      PERFORM pg_temp.report_denied(statement,'P0001','non-ops report execution stays denied');
    END LOOP;
  END LOOP;
END $$;
RESET ROLE;

ROLLBACK;
