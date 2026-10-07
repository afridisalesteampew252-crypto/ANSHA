/*
  Phase 1: complete payment-proof ownership and function execution boundaries.

  Managers may read proofs and private files only for their assigned customers.
  Proof review is a receivables action: admin/staff/accounts only. In particular,
  a definer proof RPC must not bypass link_remittance()'s normal invoker RLS.

  PostgreSQL gives new functions PUBLIC EXECUTE by default. Removing schema
  USAGE from anon is not a substitute for denying unsafe function execution.
*/

DROP POLICY IF EXISTS receivables_read_payment_proofs ON public.customer_payment_proofs;
CREATE POLICY receivables_read_payment_proofs ON public.customer_payment_proofs
FOR SELECT TO authenticated
USING (
  (SELECT private.can_manage_receivables())
  OR (
    (SELECT private.is_manager())
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_payment_proofs.customer_id
        AND c.owner_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS receivables_read_customer_payment_proof_files ON storage.objects;
CREATE POLICY receivables_read_customer_payment_proof_files ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'customer-payment-proofs'
  AND (
    (SELECT private.can_manage_receivables())
    OR (
      (SELECT private.is_manager())
      AND EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND c.owner_id = (SELECT auth.uid())
      )
    )
  )
);

-- Invoice-item visibility follows the authoritative current owner. A historical
-- created_by match must not retain access after a customer's book is reassigned.
CREATE OR REPLACE FUNCTION private.field_agent_owns_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = p_invoice_id
      AND (SELECT private.is_field_agent())
      AND inv.owner_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION private.field_agent_owns_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.field_agent_owns_invoice(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.match_customer_payment_proof(
  p_proof_id uuid,
  p_remittance_id uuid,
  p_review_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  proof_row public.customer_payment_proofs%ROWTYPE;
  remittance_row public.remittances%ROWTYPE;
BEGIN
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Receivables access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO proof_row FROM public.customer_payment_proofs WHERE id = p_proof_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment proof not found'; END IF;
  IF proof_row.status <> 'submitted' THEN RAISE EXCEPTION 'Payment proof has already been reviewed'; END IF;

  SELECT * INTO remittance_row FROM public.remittances WHERE id = p_remittance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Remittance not found'; END IF;
  IF NOT remittance_row.is_unknown AND remittance_row.status <> 'unknown' THEN
    RAISE EXCEPTION 'Only an unconfirmed Unknown TTS can be matched';
  END IF;
  IF upper(remittance_row.currency) <> upper(proof_row.currency) THEN
    RAISE EXCEPTION 'Currency does not match the remittance';
  END IF;
  IF remittance_row.amount <> proof_row.amount THEN
    RAISE EXCEPTION 'Amount does not match the remittance';
  END IF;

  PERFORM public.link_remittance(p_remittance_id, proof_row.customer_id, NULL, NULL, NULL, NULL, 'confirmed');

  UPDATE public.customer_payment_proofs
  SET status = 'matched', matched_remittance_id = p_remittance_id,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(p_review_note), ''), updated_at = now()
  WHERE id = p_proof_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'match_customer_payment_proof', 'customer_payment_proof', p_proof_id,
    jsonb_build_object('remittance_id', p_remittance_id, 'customer_id', proof_row.customer_id));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_customer_payment_proof(p_proof_id uuid, p_review_note text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Receivables access required' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_review_note), '') IS NULL THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;

  UPDATE public.customer_payment_proofs
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = btrim(p_review_note), updated_at = now()
  WHERE id = p_proof_id AND status = 'submitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'Submitted payment proof not found'; END IF;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'reject_customer_payment_proof', 'customer_payment_proof', p_proof_id,
    jsonb_build_object('reason', btrim(p_review_note)));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.match_customer_payment_proof(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_customer_payment_proof(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.reject_customer_payment_proof(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_customer_payment_proof(uuid, text) TO authenticated;

-- The previous idempotent cancellation path returned a cancelled payroll row
-- before checking caller access. Authorize before looking up or returning it.
CREATE OR REPLACE FUNCTION public.cancel_payroll_run(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  run public.payroll_runs%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF run.id IS NULL THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF run.status = 'cancelled' THEN RETURN run; END IF;

  IF run.status = 'posted' AND NOT private.is_account_admin() THEN
    RAISE EXCEPTION 'Account admin required to cancel a posted payroll run'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.payroll_runs SET status = 'cancelled', updated_at = now()
  WHERE id = p_run_id RETURNING * INTO run;
  RETURN run;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_payroll_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_payroll_run(uuid) TO authenticated;

-- Direct table writes must enforce the same sensitive roles as the RPCs.
-- This trigger is intentionally INVOKER: guarded definer RPCs and internal GL
-- auto-post/reversal helpers execute as the trusted table owner. Their existing
-- state checks remain authoritative. A definer trigger would lose that boundary
-- and incorrectly forbid staff expense cancellation's automatic GL reversal.
CREATE OR REPLACE FUNCTION private.guard_direct_finance_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  journal_status text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required' USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'employees' THEN
    IF NOT private.is_account_admin() THEN
      RAISE EXCEPTION 'Account admin required to delete payroll employees' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'payroll_runs' THEN
    IF TG_OP = 'DELETE' THEN
      IF NOT private.is_account_admin() THEN
        RAISE EXCEPTION 'Account admin required to delete payroll runs' USING ERRCODE = '42501';
      END IF;
      IF OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Cancel the posted payroll run before deleting it';
      END IF;
      RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
      IF (NEW.status = 'posted' OR NEW.posted_at IS NOT NULL OR NEW.posted_by IS NOT NULL)
         AND NOT private.is_account_admin() THEN
        RAISE EXCEPTION 'Account admin required to post payroll runs' USING ERRCODE = '42501';
      END IF;
    ELSIF (
      OLD.status = 'posted' OR NEW.status = 'posted'
      OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
      OR NEW.posted_by IS DISTINCT FROM OLD.posted_by
    ) AND NOT private.is_account_admin() THEN
      RAISE EXCEPTION 'Account admin required to change posted payroll runs' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'payroll_lines' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT status INTO journal_status FROM public.payroll_runs WHERE id = OLD.payroll_run_id;
      IF journal_status IS DISTINCT FROM 'draft' AND NOT private.is_account_admin() THEN
        RAISE EXCEPTION 'Account admin required to change posted or cancelled payroll lines' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT status INTO journal_status FROM public.payroll_runs WHERE id = NEW.payroll_run_id;
      IF journal_status IS DISTINCT FROM 'draft' AND NOT private.is_account_admin() THEN
        RAISE EXCEPTION 'Account admin required to change posted or cancelled payroll lines' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'gl_journals' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Only draft journals can be deleted'; END IF;
      RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
      IF (
        NEW.status = 'reversed' OR NEW.reverses_journal_id IS NOT NULL
        OR NEW.reversed_by_journal_id IS NOT NULL OR NEW.reversed_by IS NOT NULL
        OR NEW.reversed_at IS NOT NULL
      ) AND NOT private.is_account_admin() THEN
        RAISE EXCEPTION 'Account admin required to reverse GL journals' USING ERRCODE = '42501';
      END IF;
    ELSIF (
      OLD.status = 'reversed' OR NEW.status = 'reversed'
      OR NEW.reverses_journal_id IS DISTINCT FROM OLD.reverses_journal_id
      OR NEW.reversed_by_journal_id IS DISTINCT FROM OLD.reversed_by_journal_id
      OR NEW.reversed_by IS DISTINCT FROM OLD.reversed_by
      OR NEW.reversed_at IS DISTINCT FROM OLD.reversed_at
    ) AND NOT private.is_account_admin() THEN
      RAISE EXCEPTION 'Account admin required to reverse GL journals' USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' AND (
      NEW.entry_date IS DISTINCT FROM OLD.entry_date OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.total_debit IS DISTINCT FROM OLD.total_debit OR NEW.total_credit IS DISTINCT FROM OLD.total_credit
      OR NEW.source_module IS DISTINCT FROM OLD.source_module OR NEW.source_id IS DISTINCT FROM OLD.source_id
      OR NEW.status = 'draft'
    ) THEN
      RAISE EXCEPTION 'Posted GL amounts, dates and sources are immutable';
    END IF;
    RETURN NEW;
  END IF;

  -- A posted journal's lines cannot be edited directly, even by an admin.
  -- Reversal copies are written by the guarded definer reversal routines.
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO journal_status FROM public.gl_journals WHERE id = OLD.journal_id;
    IF journal_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Only draft journal lines can be edited';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO journal_status FROM public.gl_journals WHERE id = NEW.journal_id;
    IF journal_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Only draft journal lines can be edited';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_direct_finance_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_direct_payroll_run_mutation ON public.payroll_runs;
CREATE TRIGGER guard_direct_payroll_run_mutation BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_runs
FOR EACH ROW EXECUTE FUNCTION private.guard_direct_finance_mutation();
DROP TRIGGER IF EXISTS guard_direct_payroll_employee_delete ON public.employees;
CREATE TRIGGER guard_direct_payroll_employee_delete BEFORE DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION private.guard_direct_finance_mutation();
DROP TRIGGER IF EXISTS guard_direct_payroll_line_mutation ON public.payroll_lines;
CREATE TRIGGER guard_direct_payroll_line_mutation BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_lines
FOR EACH ROW EXECUTE FUNCTION private.guard_direct_finance_mutation();
DROP TRIGGER IF EXISTS guard_direct_gl_journal_mutation ON public.gl_journals;
CREATE TRIGGER guard_direct_gl_journal_mutation BEFORE INSERT OR UPDATE OR DELETE ON public.gl_journals
FOR EACH ROW EXECUTE FUNCTION private.guard_direct_finance_mutation();
DROP TRIGGER IF EXISTS guard_direct_gl_journal_line_mutation ON public.gl_journal_lines;
CREATE TRIGGER guard_direct_gl_journal_line_mutation BEFORE INSERT OR UPDATE OR DELETE ON public.gl_journal_lines
FOR EACH ROW EXECUTE FUNCTION private.guard_direct_finance_mutation();

-- Deny inherited PUBLIC and explicit anonymous grants, including grants installed
-- by Supabase defaults. Preserve existing authenticated RPC/predicate grants and
-- the intentional anonymous verifier. The service-role scheduler stays separate.
DO $$
DECLARE
  routine record;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prosecdef
      AND p.oid <> 'public.verify_invoice(uuid)'::regprocedure
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', routine.signature);
  END LOOP;

  -- A trigger fires with its table operation; clients do not call trigger
  -- functions directly. This also closes default grants on invoker triggers.
  FOR routine IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', routine.signature);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_invoice(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_invoice(uuid) TO anon;

-- These safe caller-scoped predicates previously depended on PUBLIC defaults.
-- Their RLS and invoker-RPC callers still need authenticated execution.
GRANT EXECUTE ON FUNCTION private.is_active_workspace_user() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_sales_agent() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_ops_user() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_support_agent() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_support_thread(uuid) TO authenticated;

-- Internal definer payroll helpers have no caller guard and must be reachable
-- only through guarded definer payroll RPCs. The requester helper is internal
-- to definer stock RPCs, rather than an independently exposed client entry point.
REVOKE ALL ON FUNCTION private.refresh_payroll_run_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assert_draft_payroll_run(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.field_agent_requester() FROM PUBLIC, anon, authenticated;

-- PostgreSQL's built-in PUBLIC EXECUTE default is global. A schema-local REVOKE
-- cannot subtract that global grant; remove it for the migration owner first.
-- Existing platform/application function ACLs are not changed by this default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Future application functions must also lose any schema-local anon defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
