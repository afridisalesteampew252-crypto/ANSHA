/* Phase 43: append-only audit log MVP.

Table public.audit_logs + private.write_audit_log(...) SECURITY DEFINER helper.
Ops SELECT only; inserts only via the helper / SECURITY DEFINER triggers.
Hooks (no massive RPC rewrites):
  - AFTER UPDATE OF status ON invoices
  - AFTER UPDATE OF stock_status ON vehicles
  - AFTER INSERT OR DELETE ON remittance_allocations (covers allocate_remittance /
    reverse_remittance_allocation)

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).

Note: a legacy public.audit_log + public.write_audit_log from an earlier remote
migration may exist; this phase intentionally uses audit_logs (plural) and a
private writer so the two do not collide.
*/

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 80),
  entity_type text NOT NULL CHECK (char_length(entity_type) BETWEEN 1 AND 80),
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_at_idx
  ON public.audit_logs (actor_id, created_at DESC);

COMMENT ON TABLE public.audit_logs IS
  'Phase 43: immutable append-only activity log (ops SELECT; write via private.write_audit_log).';

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_select_audit_logs ON public.audit_logs;
CREATE POLICY ops_select_audit_logs
  ON public.audit_logs FOR SELECT TO authenticated
  USING ((SELECT private.is_ops_user()));

REVOKE ALL ON public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

-- ---------------------------------------------------------------------------
-- Writer (SECURITY DEFINER) — callable from other DEFINER RPCs / triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_actor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  clean_action text := NULLIF(btrim(COALESCE(p_action, '')), '');
  clean_type text := NULLIF(btrim(COALESCE(p_entity_type, '')), '');
  actor uuid := COALESCE(p_actor_id, auth.uid());
  new_id uuid;
BEGIN
  IF clean_action IS NULL OR char_length(clean_action) > 80 THEN
    RAISE EXCEPTION 'Action must be 1 to 80 characters';
  END IF;
  IF clean_type IS NULL OR char_length(clean_type) > 80 THEN
    RAISE EXCEPTION 'Entity type must be 1 to 80 characters';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    actor,
    clean_action,
    clean_type,
    p_entity_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION private.write_audit_log(text, text, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Append-only guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.prevent_audit_logs_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_audit_logs_mutation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_logs_immutable_update ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable_update
BEFORE UPDATE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION private.prevent_audit_logs_mutation();

DROP TRIGGER IF EXISTS audit_logs_immutable_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable_delete
BEFORE DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION private.prevent_audit_logs_mutation();

DROP TRIGGER IF EXISTS audit_logs_immutable_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable_truncate
BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION private.prevent_audit_logs_mutation();

-- ---------------------------------------------------------------------------
-- Domain hooks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.trg_audit_invoice_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM private.write_audit_log(
      'status_change',
      'invoice',
      NEW.id,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'invoice_number', NEW.invoice_number
      ),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_audit_invoice_status()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invoices_audit_status ON public.invoices;
CREATE TRIGGER invoices_audit_status
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION private.trg_audit_invoice_status();

CREATE OR REPLACE FUNCTION private.trg_audit_vehicle_stock_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.stock_status IS DISTINCT FROM NEW.stock_status THEN
    PERFORM private.write_audit_log(
      'stock_status_change',
      'vehicle',
      NEW.id,
      jsonb_build_object(
        'old_stock_status', OLD.stock_status,
        'new_stock_status', NEW.stock_status,
        'stock_number', NEW.stock_number,
        'chassis_number', NEW.chassis_number
      ),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_audit_vehicle_stock_status()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vehicles_audit_stock_status ON public.vehicles;
CREATE TRIGGER vehicles_audit_stock_status
AFTER UPDATE OF stock_status ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION private.trg_audit_vehicle_stock_status();

CREATE OR REPLACE FUNCTION private.trg_audit_remittance_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row_id uuid;
  rem_id uuid;
  inv_id uuid;
  amt numeric;
  act text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    row_id := NEW.id;
    rem_id := NEW.remittance_id;
    inv_id := NEW.invoice_id;
    amt := NEW.amount;
    act := 'allocate';
  ELSE
    row_id := OLD.id;
    rem_id := OLD.remittance_id;
    inv_id := OLD.invoice_id;
    amt := OLD.amount;
    act := 'reverse_allocate';
  END IF;

  PERFORM private.write_audit_log(
    act,
    'remittance_allocation',
    row_id,
    jsonb_build_object(
      'remittance_id', rem_id,
      'invoice_id', inv_id,
      'amount', amt,
      'op', TG_OP
    ),
    auth.uid()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION private.trg_audit_remittance_allocation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS remittance_allocations_audit ON public.remittance_allocations;
CREATE TRIGGER remittance_allocations_audit
AFTER INSERT OR DELETE ON public.remittance_allocations
FOR EACH ROW EXECUTE FUNCTION private.trg_audit_remittance_allocation();

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
