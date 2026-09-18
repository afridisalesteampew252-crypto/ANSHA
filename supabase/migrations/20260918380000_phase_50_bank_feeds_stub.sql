/* Phase 50: bank feed readiness stub (not Open Banking / PSD2).

- public.bank_feed_connections tracks future provider links with status
  manual | pending_provider only — no OAuth, no live bank sync.
- Hardens import_bank_transactions_stub for simple CSV rows:
  date/amount/description/reference (signed amount ⇒ direction).

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- bank_feed_connections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_feed_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  label text NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 200),
  provider text CHECK (provider IS NULL OR char_length(trim(provider)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'manual'
    CHECK (status IN ('manual', 'pending_provider')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_feed_connections_account_idx
  ON public.bank_feed_connections (bank_account_id);
CREATE INDEX IF NOT EXISTS bank_feed_connections_status_idx
  ON public.bank_feed_connections (status, created_at DESC);

COMMENT ON TABLE public.bank_feed_connections IS
  'Phase 50: placeholder for future licensed bank-feed providers. Status is manual or pending_provider only — not live Open Banking.';

DROP TRIGGER IF EXISTS bank_feed_connections_updated_at ON public.bank_feed_connections;
CREATE TRIGGER bank_feed_connections_updated_at
BEFORE UPDATE ON public.bank_feed_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bank_feed_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_bank_feed_connections ON public.bank_feed_connections;
CREATE POLICY workspace_manage_bank_feed_connections
  ON public.bank_feed_connections FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.bank_feed_connections FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_feed_connections TO authenticated;

-- ---------------------------------------------------------------------------
-- Import stub: accept date alias + signed amount without direction
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_bank_transactions_stub(
  p_bank_account_id uuid,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  acct public.bank_accounts%ROWTYPE;
  row_item jsonb;
  inserted integer := 0;
  v_raw_amount numeric;
  v_amount numeric;
  v_dir text;
  v_date text;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT * INTO acct FROM public.bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
  IF acct.id IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  IF NOT acct.is_active THEN
    RAISE EXCEPTION 'Cannot import into an inactive bank account';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  FOR row_item IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_raw_amount := NULLIF(btrim(COALESCE(row_item->>'amount', '')), '')::numeric;
    IF v_raw_amount IS NULL OR v_raw_amount = 0 THEN
      RAISE EXCEPTION 'Import row amount must be a non-zero number';
    END IF;

    v_dir := lower(NULLIF(btrim(COALESCE(row_item->>'direction', '')), ''));
    IF v_dir IS NULL THEN
      -- Signed CSV amount: positive = in (credit), negative = out (debit)
      IF v_raw_amount > 0 THEN
        v_dir := 'in';
        v_amount := v_raw_amount;
      ELSE
        v_dir := 'out';
        v_amount := abs(v_raw_amount);
      END IF;
    ELSE
      IF v_dir NOT IN ('in', 'out') THEN
        RAISE EXCEPTION 'Import row direction must be in or out';
      END IF;
      v_amount := abs(v_raw_amount);
      IF v_amount <= 0 THEN
        RAISE EXCEPTION 'Import row amount must be positive when direction is set';
      END IF;
    END IF;

    v_date := NULLIF(btrim(COALESCE(row_item->>'txn_date', row_item->>'date', '')), '');

    PERFORM public.create_bank_transaction(
      p_bank_account_id,
      COALESCE(v_date::date, (now() AT TIME ZONE 'UTC')::date),
      v_amount,
      v_dir,
      NULLIF(btrim(COALESCE(row_item->>'description', '')), ''),
      NULLIF(btrim(COALESCE(row_item->>'reference', '')), ''),
      NULL,
      NULL,
      NULL
    );
    inserted := inserted + 1;
  END LOOP;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.import_bank_transactions_stub(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_bank_transactions_stub(uuid, jsonb) TO authenticated;

-- Guard: do not introduce a zero-arg is_workspace_user overload.
DO $$
DECLARE
  overload_count integer;
BEGIN
  SELECT count(*) INTO overload_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'is_workspace_user'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF overload_count > 0 THEN
    RAISE EXCEPTION 'Forbidden zero-arg private.is_workspace_user() overload detected';
  END IF;
END;
$$;
