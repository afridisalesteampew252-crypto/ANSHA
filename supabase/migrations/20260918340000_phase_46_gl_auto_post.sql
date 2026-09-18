/* Phase 46: GL auto-posting from finance events.

When remittances confirm, expenses post, tax/commercial invoices leave draft,
or supplier payments confirm, create balanced posted gl_journals automatically.

Uses existing gl_journals.source_module + source_id for idempotency (no double post).
Seeded account codes (Phase 38):
  1000 Cash | 1100 AR | 2000 AP | 2100 VAT Control | 4000 Sales | 6000 OpEx

Hooks: AFTER triggers (narrow) — no massive RPC rewrites.
Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- Ensure source columns exist (additive; already present from Phase 38)
-- ---------------------------------------------------------------------------
ALTER TABLE public.gl_journals
  ADD COLUMN IF NOT EXISTS source_module text;
ALTER TABLE public.gl_journals
  ADD COLUMN IF NOT EXISTS source_id uuid;

CREATE INDEX IF NOT EXISTS gl_journals_source_idx
  ON public.gl_journals (source_module, source_id)
  WHERE source_module IS NOT NULL AND source_id IS NOT NULL;

-- One active (non-reversal) journal per source event
CREATE UNIQUE INDEX IF NOT EXISTS gl_journals_source_active_uidx
  ON public.gl_journals (source_module, source_id)
  WHERE source_module IS NOT NULL
    AND source_id IS NOT NULL
    AND reverses_journal_id IS NULL
    AND status IN ('draft', 'posted');

COMMENT ON COLUMN public.gl_journals.source_module IS
  'Origin module for auto/manual journals (invoice, remittance, expense, supplier_payment, …).';
COMMENT ON COLUMN public.gl_journals.source_id IS
  'Origin row id; with source_module forms the auto-post idempotency key.';

-- ---------------------------------------------------------------------------
-- Internal helpers (SECURITY DEFINER; not granted to clients)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.next_gl_journal_number_internal()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  fy integer := EXTRACT(YEAR FROM (now() AT TIME ZONE 'UTC'))::integer;
  n integer;
BEGIN
  INSERT INTO public.gl_journal_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.gl_journal_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  RETURN 'JE-' || fy::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION private.next_gl_journal_number_internal()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.gl_account_id_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_id uuid;
  v_code text := btrim(COALESCE(p_code, ''));
BEGIN
  IF v_code = '' THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_id
  FROM public.gl_accounts
  WHERE code = v_code AND is_active
  LIMIT 1;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION private.gl_account_id_by_code(text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.gl_resolve_expense_account_id(p_hint text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_hint text := btrim(COALESCE(p_hint, ''));
  v_code text;
  v_id uuid;
BEGIN
  -- Hints look like "6100 Rent expense"; COA MVP only seeds 6000 OpEx.
  IF v_hint <> '' THEN
    v_code := substring(v_hint from '^[0-9A-Za-z.\-]{2,20}');
    IF v_code IS NOT NULL THEN
      v_id := private.gl_account_id_by_code(v_code);
      IF v_id IS NOT NULL THEN
        RETURN v_id;
      END IF;
    END IF;
  END IF;
  RETURN private.gl_account_id_by_code('6000');
END;
$$;

REVOKE ALL ON FUNCTION private.gl_resolve_expense_account_id(text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.gl_find_source_journal(
  p_source_module text,
  p_source_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_source_module IS NULL OR p_source_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_id
  FROM public.gl_journals
  WHERE source_module = p_source_module
    AND source_id = p_source_id
    AND reverses_journal_id IS NULL
    AND status IN ('draft', 'posted')
  ORDER BY created_at DESC
  LIMIT 1;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION private.gl_find_source_journal(text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.post_auto_gl_journal(
  p_entry_date date,
  p_description text,
  p_currency text,
  p_source_module text,
  p_source_id uuid,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_journal_id uuid;
  v_currency text := upper(btrim(COALESCE(NULLIF(btrim(p_currency), ''), 'AED')));
  v_source text := lower(btrim(COALESCE(p_source_module, '')));
  v_count integer;
  v_lines integer;
  j public.gl_journals%ROWTYPE;
BEGIN
  IF p_source_id IS NULL OR v_source = '' THEN
    RAISE EXCEPTION 'source_module and source_id are required for auto-post';
  END IF;
  IF v_source NOT IN (
    'manual', 'invoice', 'remittance', 'supplier_payment',
    'bank', 'expense', 'landed_cost', 'other'
  ) THEN
    RAISE EXCEPTION 'Invalid source_module';
  END IF;
  IF char_length(v_currency) <> 3 THEN
    RAISE EXCEPTION 'Currency must be a 3-letter code';
  END IF;

  -- Idempotent: return existing active journal for this source
  v_journal_id := private.gl_find_source_journal(v_source, p_source_id);
  IF v_journal_id IS NOT NULL THEN
    RETURN v_journal_id;
  END IF;

  INSERT INTO public.gl_journals (
    journal_number, status, entry_date, description, currency,
    source_module, source_id, created_by, posted_at, posted_by
  ) VALUES (
    private.next_gl_journal_number_internal(),
    'draft',
    COALESCE(p_entry_date, (now() AT TIME ZONE 'UTC')::date),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    v_currency,
    v_source,
    p_source_id,
    auth.uid(),
    NULL,
    NULL
  )
  RETURNING id INTO v_journal_id;

  v_count := private.insert_gl_journal_lines(v_journal_id, p_lines);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'At least two journal lines are required';
  END IF;

  PERFORM private.refresh_gl_journal_totals(v_journal_id);
  SELECT * INTO j FROM public.gl_journals WHERE id = v_journal_id;

  SELECT count(*) INTO v_lines FROM public.gl_journal_lines WHERE journal_id = v_journal_id;
  IF v_lines < 2 THEN
    RAISE EXCEPTION 'At least two journal lines are required';
  END IF;
  IF j.total_debit <= 0 OR j.total_credit <= 0 THEN
    RAISE EXCEPTION 'Journal totals must be greater than zero';
  END IF;
  IF abs(j.total_debit - j.total_credit) > 0.005 THEN
    RAISE EXCEPTION 'Journal is not balanced (debit % vs credit %)', j.total_debit, j.total_credit;
  END IF;

  UPDATE public.gl_journals SET
    status = 'posted',
    posted_at = now(),
    posted_by = auth.uid(),
    updated_at = now()
  WHERE id = v_journal_id;

  RETURN v_journal_id;
EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent insert raced; return the winner
    RETURN private.gl_find_source_journal(v_source, p_source_id);
  WHEN OTHERS THEN
    IF v_journal_id IS NOT NULL THEN
      DELETE FROM public.gl_journals
      WHERE id = v_journal_id AND status = 'draft';
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION private.post_auto_gl_journal(date, text, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.reverse_auto_gl_journal(
  p_journal_id uuid,
  p_entry_date date DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  j public.gl_journals%ROWTYPE;
  v_rev_id uuid;
  r record;
  v_line_no integer := 0;
BEGIN
  SELECT * INTO j FROM public.gl_journals WHERE id = p_journal_id FOR UPDATE;
  IF j.id IS NULL THEN
    RAISE EXCEPTION 'Journal not found';
  END IF;
  IF j.status IS DISTINCT FROM 'posted' THEN
    RAISE EXCEPTION 'Only posted journals can be reversed';
  END IF;
  IF j.reversed_by_journal_id IS NOT NULL THEN
    RETURN j.reversed_by_journal_id;
  END IF;

  INSERT INTO public.gl_journals (
    journal_number, status, entry_date, description, currency,
    source_module, source_id, reverses_journal_id, created_by,
    posted_at, posted_by
  ) VALUES (
    private.next_gl_journal_number_internal(),
    'posted',
    COALESCE(p_entry_date, (now() AT TIME ZONE 'UTC')::date),
    COALESCE(
      NULLIF(btrim(COALESCE(p_description, '')), ''),
      'Reversal of ' || j.journal_number
    ),
    j.currency,
    COALESCE(j.source_module, 'manual'),
    j.source_id,
    j.id,
    auth.uid(),
    now(),
    auth.uid()
  )
  RETURNING id INTO v_rev_id;

  FOR r IN
    SELECT account_id, description, debit, credit
    FROM public.gl_journal_lines
    WHERE journal_id = j.id
    ORDER BY line_no
  LOOP
    v_line_no := v_line_no + 1;
    INSERT INTO public.gl_journal_lines (
      journal_id, account_id, line_no, description, debit, credit
    ) VALUES (
      v_rev_id,
      r.account_id,
      v_line_no,
      r.description,
      r.credit,
      r.debit
    );
  END LOOP;

  PERFORM private.refresh_gl_journal_totals(v_rev_id);

  UPDATE public.gl_journals SET
    status = 'reversed',
    reversed_at = now(),
    reversed_by = auth.uid(),
    reversed_by_journal_id = v_rev_id,
    updated_at = now()
  WHERE id = j.id;

  RETURN v_rev_id;
END;
$$;

REVOKE ALL ON FUNCTION private.reverse_auto_gl_journal(uuid, date, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Domain auto-post writers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.gl_auto_post_remittance(p_remittance_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rem public.remittances%ROWTYPE;
  cash_id uuid;
  ar_id uuid;
  amt numeric(14, 2);
BEGIN
  SELECT * INTO rem FROM public.remittances WHERE id = p_remittance_id;
  IF rem.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF rem.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NULL;
  END IF;

  amt := round(COALESCE(rem.amount, 0), 2);
  IF amt <= 0 THEN
    RETURN NULL;
  END IF;

  IF private.gl_find_source_journal('remittance', rem.id) IS NOT NULL THEN
    RETURN private.gl_find_source_journal('remittance', rem.id);
  END IF;

  cash_id := private.gl_account_id_by_code('1000');
  ar_id := private.gl_account_id_by_code('1100');
  IF cash_id IS NULL OR ar_id IS NULL THEN
    RAISE EXCEPTION 'Required GL accounts 1000/1100 missing';
  END IF;

  -- Dr Cash/Bank 1000, Cr AR 1100
  RETURN private.post_auto_gl_journal(
    rem.received_date,
    'Remittance ' || COALESCE(rem.remittance_number, rem.id::text),
    rem.currency,
    'remittance',
    rem.id,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', cash_id,
        'debit', amt,
        'credit', 0,
        'description', 'Cash received'
      ),
      jsonb_build_object(
        'account_id', ar_id,
        'debit', 0,
        'credit', amt,
        'description', 'AR settlement'
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.gl_auto_post_remittance(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.gl_auto_post_expense(p_expense_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  exp public.expenses%ROWTYPE;
  hint text;
  expense_acct uuid;
  credit_acct uuid;
  amt numeric(14, 2);
  use_ap boolean := false;
BEGIN
  SELECT * INTO exp FROM public.expenses WHERE id = p_expense_id;
  IF exp.id IS NULL OR exp.status IS DISTINCT FROM 'posted' THEN
    RETURN NULL;
  END IF;

  amt := round(COALESCE(exp.amount, 0), 2);
  IF amt <= 0 THEN
    RETURN NULL;
  END IF;

  IF private.gl_find_source_journal('expense', exp.id) IS NOT NULL THEN
    RETURN private.gl_find_source_journal('expense', exp.id);
  END IF;

  SELECT gl_account_hint INTO hint
  FROM public.expense_categories
  WHERE id = exp.category_id;

  expense_acct := private.gl_resolve_expense_account_id(hint);

  -- Credit Cash/Bank unless no bank path → AP
  IF exp.payment_method IN ('remittance_company', 'other') AND exp.bank_account_id IS NULL THEN
    use_ap := true;
  END IF;

  IF use_ap THEN
    credit_acct := private.gl_account_id_by_code('2000');
  ELSE
    credit_acct := private.gl_account_id_by_code('1000');
  END IF;

  IF expense_acct IS NULL OR credit_acct IS NULL THEN
    RAISE EXCEPTION 'Required GL accounts for expense posting missing';
  END IF;

  -- Dr Expense (hint→6000), Cr Cash 1000 or AP 2000
  RETURN private.post_auto_gl_journal(
    exp.expense_date,
    'Expense ' || COALESCE(exp.expense_number, exp.id::text),
    exp.currency,
    'expense',
    exp.id,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', expense_acct,
        'debit', amt,
        'credit', 0,
        'description', COALESCE(exp.payee, 'Operating expense')
      ),
      jsonb_build_object(
        'account_id', credit_acct,
        'debit', 0,
        'credit', amt,
        'description', CASE WHEN use_ap THEN 'AP / clearing' ELSE 'Cash/Bank' END
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.gl_auto_post_expense(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.gl_auto_reverse_expense(p_expense_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  jid uuid;
BEGIN
  jid := private.gl_find_source_journal('expense', p_expense_id);
  IF jid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN private.reverse_auto_gl_journal(
    jid,
    (now() AT TIME ZONE 'UTC')::date,
    'Expense cancel reversal'
  );
END;
$$;

REVOKE ALL ON FUNCTION private.gl_auto_reverse_expense(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.gl_auto_post_invoice(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  ar_id uuid;
  sales_id uuid;
  vat_id uuid;
  total_amt numeric(14, 2);
  tax_amt numeric(14, 2);
  sales_amt numeric(14, 2);
  lines jsonb;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id;
  IF inv.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF inv.document_type NOT IN ('tax_invoice', 'commercial_invoice') THEN
    RETURN NULL;
  END IF;
  IF inv.status IN ('draft', 'cancelled') THEN
    RETURN NULL;
  END IF;

  total_amt := round(COALESCE(inv.total_amount, 0), 2);
  tax_amt := round(COALESCE(inv.tax_amount, 0), 2);
  IF total_amt <= 0 THEN
    RETURN NULL;
  END IF;
  IF tax_amt < 0 THEN
    tax_amt := 0;
  END IF;
  IF tax_amt > total_amt THEN
    tax_amt := total_amt;
  END IF;
  sales_amt := round(total_amt - tax_amt, 2);

  IF private.gl_find_source_journal('invoice', inv.id) IS NOT NULL THEN
    RETURN private.gl_find_source_journal('invoice', inv.id);
  END IF;

  ar_id := private.gl_account_id_by_code('1100');
  sales_id := private.gl_account_id_by_code('4000');
  vat_id := private.gl_account_id_by_code('2100');
  IF ar_id IS NULL OR sales_id IS NULL THEN
    RAISE EXCEPTION 'Required GL accounts 1100/4000 missing';
  END IF;

  -- Dr AR 1100, Cr Sales 4000 (+ VAT Control 2100 when tax > 0)
  lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', ar_id,
      'debit', total_amt,
      'credit', 0,
      'description', 'AR invoice'
    )
  );

  IF sales_amt > 0 THEN
    lines := lines || jsonb_build_array(
      jsonb_build_object(
        'account_id', sales_id,
        'debit', 0,
        'credit', sales_amt,
        'description', 'Sales revenue'
      )
    );
  END IF;

  IF tax_amt > 0 THEN
    IF vat_id IS NULL THEN
      RAISE EXCEPTION 'Required GL account 2100 missing for VAT';
    END IF;
    lines := lines || jsonb_build_array(
      jsonb_build_object(
        'account_id', vat_id,
        'debit', 0,
        'credit', tax_amt,
        'description', 'VAT control'
      )
    );
  END IF;

  IF jsonb_array_length(lines) < 2 THEN
    RETURN NULL;
  END IF;

  RETURN private.post_auto_gl_journal(
    inv.issue_date,
    'Invoice ' || COALESCE(inv.invoice_number, inv.id::text),
    inv.currency,
    'invoice',
    inv.id,
    lines
  );
END;
$$;

REVOKE ALL ON FUNCTION private.gl_auto_post_invoice(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.gl_auto_post_supplier_payment(p_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pay public.supplier_payments%ROWTYPE;
  ap_id uuid;
  cash_id uuid;
  amt numeric(14, 2);
BEGIN
  SELECT * INTO pay FROM public.supplier_payments WHERE id = p_payment_id;
  IF pay.id IS NULL OR pay.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NULL;
  END IF;

  amt := round(COALESCE(pay.amount, 0), 2);
  IF amt <= 0 THEN
    RETURN NULL;
  END IF;

  IF private.gl_find_source_journal('supplier_payment', pay.id) IS NOT NULL THEN
    RETURN private.gl_find_source_journal('supplier_payment', pay.id);
  END IF;

  ap_id := private.gl_account_id_by_code('2000');
  cash_id := private.gl_account_id_by_code('1000');
  IF ap_id IS NULL OR cash_id IS NULL THEN
    RAISE EXCEPTION 'Required GL accounts 2000/1000 missing';
  END IF;

  -- Dr AP 2000, Cr Cash 1000
  RETURN private.post_auto_gl_journal(
    pay.paid_date,
    'Supplier payment ' || COALESCE(pay.payment_number, pay.id::text),
    pay.currency,
    'supplier_payment',
    pay.id,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', ap_id,
        'debit', amt,
        'credit', 0,
        'description', 'AP settlement'
      ),
      jsonb_build_object(
        'account_id', cash_id,
        'debit', 0,
        'credit', amt,
        'description', 'Cash/Bank'
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.gl_auto_post_supplier_payment(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.trg_gl_auto_remittance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    PERFORM private.gl_auto_post_remittance(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_gl_auto_remittance()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS remittances_gl_auto_post ON public.remittances;
CREATE TRIGGER remittances_gl_auto_post
AFTER INSERT OR UPDATE OF status ON public.remittances
FOR EACH ROW EXECUTE FUNCTION private.trg_gl_auto_remittance();

-- Cover allocate path: ensure confirmed remittance is journaled (idempotent)
CREATE OR REPLACE FUNCTION private.trg_gl_auto_remittance_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.gl_auto_post_remittance(NEW.remittance_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_gl_auto_remittance_allocation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS remittance_allocations_gl_auto_post ON public.remittance_allocations;
CREATE TRIGGER remittance_allocations_gl_auto_post
AFTER INSERT ON public.remittance_allocations
FOR EACH ROW EXECUTE FUNCTION private.trg_gl_auto_remittance_allocation();

CREATE OR REPLACE FUNCTION private.trg_gl_auto_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'posted' THEN
      PERFORM private.gl_auto_post_expense(NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted' THEN
      PERFORM private.gl_auto_post_expense(NEW.id);
    ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      PERFORM private.gl_auto_reverse_expense(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_gl_auto_expense()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS expenses_gl_auto_post ON public.expenses;
CREATE TRIGGER expenses_gl_auto_post
AFTER INSERT OR UPDATE OF status ON public.expenses
FOR EACH ROW EXECUTE FUNCTION private.trg_gl_auto_expense();

CREATE OR REPLACE FUNCTION private.trg_gl_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.document_type IN ('tax_invoice', 'commercial_invoice')
       AND NEW.status IS DISTINCT FROM 'draft'
       AND NEW.status IS DISTINCT FROM 'cancelled' THEN
      PERFORM private.gl_auto_post_invoice(NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.document_type IN ('tax_invoice', 'commercial_invoice')
       AND NEW.status IS DISTINCT FROM 'draft'
       AND NEW.status IS DISTINCT FROM 'cancelled'
       AND (
         OLD.status IS DISTINCT FROM NEW.status
         OR OLD.document_type IS DISTINCT FROM NEW.document_type
         OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
         OR OLD.tax_amount IS DISTINCT FROM NEW.tax_amount
       ) THEN
      -- Idempotent: first non-draft issue only posts once via source key
      PERFORM private.gl_auto_post_invoice(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_gl_auto_invoice()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invoices_gl_auto_post ON public.invoices;
CREATE TRIGGER invoices_gl_auto_post
AFTER INSERT OR UPDATE OF status, document_type, total_amount, tax_amount ON public.invoices
FOR EACH ROW EXECUTE FUNCTION private.trg_gl_auto_invoice();

CREATE OR REPLACE FUNCTION private.trg_gl_auto_supplier_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    PERFORM private.gl_auto_post_supplier_payment(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_gl_auto_supplier_payment()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS supplier_payments_gl_auto_post ON public.supplier_payments;
CREATE TRIGGER supplier_payments_gl_auto_post
AFTER INSERT OR UPDATE OF status ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION private.trg_gl_auto_supplier_payment();

-- ---------------------------------------------------------------------------
-- Guard: do not introduce a zero-arg is_workspace_user overload
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  overload_count integer;
BEGIN
  SELECT count(*) INTO overload_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'is_workspace_user';

  IF overload_count <> 1 THEN
    RAISE EXCEPTION
      'private.is_workspace_user overload count = %, expected 1',
      overload_count;
  END IF;
END;
$$;
