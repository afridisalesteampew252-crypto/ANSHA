/* Phase 33: landed-cost packs (freight/duty/charges allocated into stock landed_cost).

Post formula (replace, not cumulative across packs):
  vehicles.landed_cost / parts.landed_cost
    := COALESCE(purchase_price, 0) + this pack's allocated_amount

Ops who need multiple packs on one unit should include all charges in one pack,
or manually adjust stock landed_cost after posting.

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- Sequences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.landed_cost_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

ALTER TABLE public.landed_cost_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_direct_landed_cost_sequence_access ON public.landed_cost_sequences;
CREATE POLICY deny_direct_landed_cost_sequence_access
  ON public.landed_cost_sequences FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.landed_cost_sequences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_landed_cost_pack_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  fy integer := EXTRACT(YEAR FROM (now() AT TIME ZONE 'UTC'))::integer;
  n integer;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  INSERT INTO public.landed_cost_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.landed_cost_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  RETURN 'LC-' || fy::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_landed_cost_pack_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_landed_cost_pack_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.landed_cost_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  pack_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  allocation_method text NOT NULL DEFAULT 'equal' CHECK (
    allocation_method IN ('equal', 'purchase_value', 'manual')
  ),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  inventory_receipt_id uuid REFERENCES public.inventory_receipts(id) ON DELETE SET NULL,
  supplier_invoice_id uuid REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  total_charges numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_charges >= 0),
  posted_at timestamptz,
  posted_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT landed_cost_packs_pack_number_uidx UNIQUE (pack_number)
);

CREATE TABLE IF NOT EXISTS public.landed_cost_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.landed_cost_packs(id) ON DELETE CASCADE,
  charge_type text NOT NULL CHECK (
    charge_type IN ('freight', 'duty', 'insurance', 'handling', 'other')
  ),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.landed_cost_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.landed_cost_packs(id) ON DELETE CASCADE,
  inventory_type text NOT NULL CHECK (inventory_type IN ('vehicle', 'part')),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  part_id uuid REFERENCES public.parts(id) ON DELETE RESTRICT,
  allocated_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
  purchase_basis numeric(14, 2) CHECK (purchase_basis IS NULL OR purchase_basis >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT landed_cost_allocations_target_chk CHECK (
    (inventory_type = 'vehicle' AND vehicle_id IS NOT NULL AND part_id IS NULL)
    OR (inventory_type = 'part' AND part_id IS NOT NULL AND vehicle_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS landed_cost_allocations_pack_vehicle_uidx
  ON public.landed_cost_allocations (pack_id, vehicle_id)
  WHERE vehicle_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS landed_cost_allocations_pack_part_uidx
  ON public.landed_cost_allocations (pack_id, part_id)
  WHERE part_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS landed_cost_packs_status_idx ON public.landed_cost_packs (status);
CREATE INDEX IF NOT EXISTS landed_cost_packs_pack_date_idx ON public.landed_cost_packs (pack_date DESC);
CREATE INDEX IF NOT EXISTS landed_cost_charges_pack_idx ON public.landed_cost_charges (pack_id);
CREATE INDEX IF NOT EXISTS landed_cost_allocations_pack_idx ON public.landed_cost_allocations (pack_id);
CREATE INDEX IF NOT EXISTS landed_cost_allocations_vehicle_idx
  ON public.landed_cost_allocations (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS landed_cost_allocations_part_idx
  ON public.landed_cost_allocations (part_id) WHERE part_id IS NOT NULL;

DROP TRIGGER IF EXISTS landed_cost_packs_updated_at ON public.landed_cost_packs;
CREATE TRIGGER landed_cost_packs_updated_at
BEFORE UPDATE ON public.landed_cost_packs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.landed_cost_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landed_cost_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landed_cost_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_landed_cost_packs ON public.landed_cost_packs;
CREATE POLICY workspace_manage_landed_cost_packs
  ON public.landed_cost_packs FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS workspace_manage_landed_cost_charges ON public.landed_cost_charges;
CREATE POLICY workspace_manage_landed_cost_charges
  ON public.landed_cost_charges FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS workspace_manage_landed_cost_allocations ON public.landed_cost_allocations;
CREATE POLICY workspace_manage_landed_cost_allocations
  ON public.landed_cost_allocations FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.landed_cost_packs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landed_cost_packs TO authenticated;
REVOKE ALL ON public.landed_cost_charges FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landed_cost_charges TO authenticated;
REVOKE ALL ON public.landed_cost_allocations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landed_cost_allocations TO authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.refresh_landed_cost_pack_totals(p_pack_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.landed_cost_packs SET
    total_charges = COALESCE((
      SELECT sum(c.amount)::numeric(14, 2)
      FROM public.landed_cost_charges c
      WHERE c.pack_id = p_pack_id
    ), 0),
    updated_at = now()
  WHERE id = p_pack_id;
END;
$$;

REVOKE ALL ON FUNCTION private.refresh_landed_cost_pack_totals(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.assert_draft_landed_cost_pack(p_pack_id uuid)
RETURNS public.landed_cost_packs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pack public.landed_cost_packs%ROWTYPE;
BEGIN
  SELECT * INTO pack FROM public.landed_cost_packs WHERE id = p_pack_id FOR UPDATE;
  IF pack.id IS NULL THEN
    RAISE EXCEPTION 'Landed-cost pack not found';
  END IF;
  IF pack.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only draft landed-cost packs can be edited';
  END IF;
  RETURN pack;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_draft_landed_cost_pack(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.redistribute_landed_cost_allocations(
  p_pack_id uuid,
  p_method text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_method text := lower(btrim(COALESCE(p_method, 'equal')));
  v_total numeric(14, 2);
  v_count integer;
  v_basis_sum numeric(14, 2);
  v_assigned numeric(14, 2) := 0;
  v_share numeric(14, 2);
  r record;
  i integer := 0;
BEGIN
  IF v_method NOT IN ('equal', 'purchase_value', 'manual') THEN
    RAISE EXCEPTION 'Invalid allocation method';
  END IF;

  PERFORM private.refresh_landed_cost_pack_totals(p_pack_id);

  SELECT total_charges INTO v_total
  FROM public.landed_cost_packs
  WHERE id = p_pack_id;

  SELECT count(*) INTO v_count
  FROM public.landed_cost_allocations
  WHERE pack_id = p_pack_id;

  IF v_count = 0 THEN
    UPDATE public.landed_cost_packs SET
      allocation_method = v_method,
      updated_at = now()
    WHERE id = p_pack_id;
    RETURN;
  END IF;

  IF v_method = 'manual' THEN
    UPDATE public.landed_cost_packs SET
      allocation_method = 'manual',
      updated_at = now()
    WHERE id = p_pack_id;
    RETURN;
  END IF;

  IF v_method = 'purchase_value' THEN
    SELECT COALESCE(sum(COALESCE(purchase_basis, 0)), 0) INTO v_basis_sum
    FROM public.landed_cost_allocations
    WHERE pack_id = p_pack_id;

    IF v_basis_sum <= 0 THEN
      v_method := 'equal';
    END IF;
  END IF;

  IF v_method = 'equal' THEN
    FOR r IN
      SELECT id
      FROM public.landed_cost_allocations
      WHERE pack_id = p_pack_id
      ORDER BY created_at, id
    LOOP
      i := i + 1;
      IF i = v_count THEN
        v_share := round(v_total - v_assigned, 2);
      ELSE
        v_share := round(v_total / v_count, 2);
        v_assigned := v_assigned + v_share;
      END IF;
      UPDATE public.landed_cost_allocations
      SET allocated_amount = GREATEST(v_share, 0)
      WHERE id = r.id;
    END LOOP;
  ELSE
    -- purchase_value
    FOR r IN
      SELECT id, COALESCE(purchase_basis, 0) AS basis
      FROM public.landed_cost_allocations
      WHERE pack_id = p_pack_id
      ORDER BY created_at, id
    LOOP
      i := i + 1;
      IF i = v_count THEN
        v_share := round(v_total - v_assigned, 2);
      ELSE
        v_share := round(v_total * (r.basis / v_basis_sum), 2);
        v_assigned := v_assigned + v_share;
      END IF;
      UPDATE public.landed_cost_allocations
      SET allocated_amount = GREATEST(v_share, 0)
      WHERE id = r.id;
    END LOOP;
  END IF;

  UPDATE public.landed_cost_packs SET
    allocation_method = CASE
      WHEN p_method = 'purchase_value' AND v_method = 'equal' THEN 'purchase_value'
      ELSE v_method
    END,
    updated_at = now()
  WHERE id = p_pack_id;
END;
$$;

REVOKE ALL ON FUNCTION private.redistribute_landed_cost_allocations(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_landed_cost_pack(
  p_pack_date date,
  p_currency text,
  p_allocation_method text,
  p_notes text,
  p_supplier_id uuid,
  p_purchase_order_id uuid,
  p_inventory_receipt_id uuid,
  p_supplier_invoice_id uuid,
  p_charges jsonb,
  p_stock jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_method text := lower(btrim(COALESCE(p_allocation_method, 'equal')));
  v_currency text := upper(btrim(COALESCE(NULLIF(btrim(p_currency), ''), 'AED')));
  v_pack_id uuid;
  v_charge jsonb;
  v_stock jsonb;
  v_sort integer := 0;
  v_inv_type text;
  v_vehicle_id uuid;
  v_part_id uuid;
  v_basis numeric(14, 2);
  v_charge_count integer := 0;
  v_stock_count integer := 0;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF v_method NOT IN ('equal', 'purchase_value', 'manual') THEN
    RAISE EXCEPTION 'Invalid allocation method';
  END IF;
  IF char_length(v_currency) <> 3 THEN
    RAISE EXCEPTION 'Currency must be a 3-letter code';
  END IF;
  IF p_charges IS NULL OR jsonb_typeof(p_charges) <> 'array' OR jsonb_array_length(p_charges) = 0 THEN
    RAISE EXCEPTION 'At least one charge is required';
  END IF;
  IF p_stock IS NULL OR jsonb_typeof(p_stock) <> 'array' OR jsonb_array_length(p_stock) = 0 THEN
    RAISE EXCEPTION 'At least one stock line is required';
  END IF;

  INSERT INTO public.landed_cost_packs (
    pack_number,
    status,
    pack_date,
    currency,
    allocation_method,
    supplier_id,
    purchase_order_id,
    inventory_receipt_id,
    supplier_invoice_id,
    notes,
    created_by
  ) VALUES (
    public.next_landed_cost_pack_number(),
    'draft',
    COALESCE(p_pack_date, (now() AT TIME ZONE 'UTC')::date),
    v_currency,
    v_method,
    p_supplier_id,
    p_purchase_order_id,
    p_inventory_receipt_id,
    p_supplier_invoice_id,
    NULLIF(btrim(p_notes), ''),
    auth.uid()
  )
  RETURNING id INTO v_pack_id;

  FOR v_charge IN SELECT value FROM jsonb_array_elements(p_charges)
  LOOP
    IF COALESCE((v_charge ->> 'amount')::numeric, 0) <= 0 THEN
      CONTINUE;
    END IF;
    IF COALESCE(v_charge ->> 'charge_type', '') NOT IN ('freight', 'duty', 'insurance', 'handling', 'other') THEN
      RAISE EXCEPTION 'Invalid charge_type';
    END IF;
    v_sort := v_sort + 1;
    INSERT INTO public.landed_cost_charges (
      pack_id, charge_type, description, amount, supplier_id, sort_order
    ) VALUES (
      v_pack_id,
      v_charge ->> 'charge_type',
      NULLIF(btrim(COALESCE(v_charge ->> 'description', '')), ''),
      round((v_charge ->> 'amount')::numeric, 2),
      NULLIF(v_charge ->> 'supplier_id', '')::uuid,
      v_sort
    );
    v_charge_count := v_charge_count + 1;
  END LOOP;

  IF v_charge_count = 0 THEN
    RAISE EXCEPTION 'At least one charge with amount > 0 is required';
  END IF;

  FOR v_stock IN SELECT value FROM jsonb_array_elements(p_stock)
  LOOP
    v_inv_type := lower(btrim(COALESCE(v_stock ->> 'inventory_type', '')));
    v_vehicle_id := NULLIF(v_stock ->> 'vehicle_id', '')::uuid;
    v_part_id := NULLIF(v_stock ->> 'part_id', '')::uuid;
    v_basis := NULL;

    IF v_inv_type = 'vehicle' THEN
      IF v_vehicle_id IS NULL THEN
        RAISE EXCEPTION 'vehicle_id is required for vehicle stock lines';
      END IF;
      SELECT purchase_price INTO v_basis FROM public.vehicles WHERE id = v_vehicle_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Vehicle not found';
      END IF;
      v_part_id := NULL;
    ELSIF v_inv_type = 'part' THEN
      IF v_part_id IS NULL THEN
        RAISE EXCEPTION 'part_id is required for part stock lines';
      END IF;
      SELECT purchase_price INTO v_basis FROM public.parts WHERE id = v_part_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Part not found';
      END IF;
      v_vehicle_id := NULL;
    ELSE
      RAISE EXCEPTION 'Invalid inventory_type';
    END IF;

    INSERT INTO public.landed_cost_allocations (
      pack_id, inventory_type, vehicle_id, part_id, allocated_amount, purchase_basis
    ) VALUES (
      v_pack_id, v_inv_type, v_vehicle_id, v_part_id, 0, v_basis
    );
    v_stock_count := v_stock_count + 1;
  END LOOP;

  IF v_stock_count = 0 THEN
    RAISE EXCEPTION 'At least one stock line is required';
  END IF;

  PERFORM private.redistribute_landed_cost_allocations(v_pack_id, v_method);
  RETURN v_pack_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_landed_cost_pack(date, text, text, text, uuid, uuid, uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_landed_cost_pack(date, text, text, text, uuid, uuid, uuid, uuid, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_landed_cost_charge(
  p_pack_id uuid,
  p_charge_type text,
  p_description text,
  p_amount numeric,
  p_supplier_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pack public.landed_cost_packs%ROWTYPE;
  v_id uuid;
  v_sort integer;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF COALESCE(p_charge_type, '') NOT IN ('freight', 'duty', 'insurance', 'handling', 'other') THEN
    RAISE EXCEPTION 'Invalid charge_type';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Charge amount must be greater than zero';
  END IF;

  pack := private.assert_draft_landed_cost_pack(p_pack_id);

  SELECT COALESCE(max(sort_order), 0) + 1 INTO v_sort
  FROM public.landed_cost_charges
  WHERE pack_id = p_pack_id;

  INSERT INTO public.landed_cost_charges (
    pack_id, charge_type, description, amount, supplier_id, sort_order
  ) VALUES (
    p_pack_id,
    p_charge_type,
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    round(p_amount, 2),
    p_supplier_id,
    v_sort
  )
  RETURNING id INTO v_id;

  IF pack.allocation_method = 'manual' THEN
    PERFORM private.refresh_landed_cost_pack_totals(p_pack_id);
  ELSE
    PERFORM private.redistribute_landed_cost_allocations(p_pack_id, pack.allocation_method);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_landed_cost_charge(uuid, text, text, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_landed_cost_charge(uuid, text, text, numeric, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_landed_cost_charge(p_charge_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pack_id uuid;
  pack public.landed_cost_packs%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT pack_id INTO v_pack_id FROM public.landed_cost_charges WHERE id = p_charge_id;
  IF v_pack_id IS NULL THEN
    RAISE EXCEPTION 'Charge not found';
  END IF;

  pack := private.assert_draft_landed_cost_pack(v_pack_id);
  DELETE FROM public.landed_cost_charges WHERE id = p_charge_id;

  IF NOT EXISTS (SELECT 1 FROM public.landed_cost_charges WHERE pack_id = v_pack_id) THEN
    RAISE EXCEPTION 'Pack must retain at least one charge';
  END IF;

  IF pack.allocation_method = 'manual' THEN
    PERFORM private.refresh_landed_cost_pack_totals(v_pack_id);
  ELSE
    PERFORM private.redistribute_landed_cost_allocations(v_pack_id, pack.allocation_method);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_landed_cost_charge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_landed_cost_charge(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_landed_cost_allocation(
  p_pack_id uuid,
  p_inventory_type text,
  p_vehicle_id uuid,
  p_part_id uuid,
  p_allocated_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pack public.landed_cost_packs%ROWTYPE;
  v_inv_type text := lower(btrim(COALESCE(p_inventory_type, '')));
  v_vehicle_id uuid := p_vehicle_id;
  v_part_id uuid := p_part_id;
  v_basis numeric(14, 2);
  v_id uuid;
  v_amount numeric(14, 2);
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  pack := private.assert_draft_landed_cost_pack(p_pack_id);

  IF v_inv_type = 'vehicle' THEN
    IF v_vehicle_id IS NULL THEN
      RAISE EXCEPTION 'vehicle_id is required';
    END IF;
    SELECT purchase_price INTO v_basis FROM public.vehicles WHERE id = v_vehicle_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vehicle not found';
    END IF;
    v_part_id := NULL;
  ELSIF v_inv_type = 'part' THEN
    IF v_part_id IS NULL THEN
      RAISE EXCEPTION 'part_id is required';
    END IF;
    SELECT purchase_price INTO v_basis FROM public.parts WHERE id = v_part_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Part not found';
    END IF;
    v_vehicle_id := NULL;
  ELSE
    RAISE EXCEPTION 'Invalid inventory_type';
  END IF;

  IF p_allocated_amount IS NOT NULL AND p_allocated_amount < 0 THEN
    RAISE EXCEPTION 'Allocated amount cannot be negative';
  END IF;

  v_amount := COALESCE(round(p_allocated_amount, 2), 0);

  INSERT INTO public.landed_cost_allocations (
    pack_id, inventory_type, vehicle_id, part_id, allocated_amount, purchase_basis
  ) VALUES (
    p_pack_id, v_inv_type, v_vehicle_id, v_part_id, v_amount, v_basis
  )
  RETURNING id INTO v_id;

  IF p_allocated_amount IS NULL THEN
    PERFORM private.redistribute_landed_cost_allocations(p_pack_id, pack.allocation_method);
  ELSIF pack.allocation_method <> 'manual' THEN
    UPDATE public.landed_cost_packs SET
      allocation_method = 'manual',
      updated_at = now()
    WHERE id = p_pack_id;
    PERFORM private.refresh_landed_cost_pack_totals(p_pack_id);
  ELSE
    PERFORM private.refresh_landed_cost_pack_totals(p_pack_id);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_landed_cost_allocation(uuid, text, uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_landed_cost_allocation(uuid, text, uuid, uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_landed_cost_allocation(p_allocation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pack_id uuid;
  pack public.landed_cost_packs%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT pack_id INTO v_pack_id FROM public.landed_cost_allocations WHERE id = p_allocation_id;
  IF v_pack_id IS NULL THEN
    RAISE EXCEPTION 'Allocation not found';
  END IF;

  pack := private.assert_draft_landed_cost_pack(v_pack_id);
  DELETE FROM public.landed_cost_allocations WHERE id = p_allocation_id;

  IF NOT EXISTS (SELECT 1 FROM public.landed_cost_allocations WHERE pack_id = v_pack_id) THEN
    RAISE EXCEPTION 'Pack must retain at least one allocation';
  END IF;

  IF pack.allocation_method = 'manual' THEN
    PERFORM private.refresh_landed_cost_pack_totals(v_pack_id);
  ELSE
    PERFORM private.redistribute_landed_cost_allocations(v_pack_id, pack.allocation_method);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_landed_cost_allocation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_landed_cost_allocation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.redistribute_landed_cost_pack(
  p_pack_id uuid,
  p_method text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  PERFORM private.assert_draft_landed_cost_pack(p_pack_id);
  PERFORM private.redistribute_landed_cost_allocations(p_pack_id, p_method);
END;
$$;

REVOKE ALL ON FUNCTION public.redistribute_landed_cost_pack(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redistribute_landed_cost_pack(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_landed_cost_pack(p_pack_id uuid)
RETURNS public.landed_cost_packs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pack public.landed_cost_packs%ROWTYPE;
  v_charge_total numeric(14, 2);
  v_alloc_total numeric(14, 2);
  r record;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  pack := private.assert_draft_landed_cost_pack(p_pack_id);
  PERFORM private.refresh_landed_cost_pack_totals(p_pack_id);

  SELECT total_charges INTO v_charge_total
  FROM public.landed_cost_packs WHERE id = p_pack_id;

  IF v_charge_total IS NULL OR v_charge_total <= 0 THEN
    RAISE EXCEPTION 'Cannot post a pack with no charges';
  END IF;

  SELECT COALESCE(sum(allocated_amount), 0) INTO v_alloc_total
  FROM public.landed_cost_allocations
  WHERE pack_id = p_pack_id;

  IF NOT EXISTS (SELECT 1 FROM public.landed_cost_allocations WHERE pack_id = p_pack_id) THEN
    RAISE EXCEPTION 'Cannot post a pack with no allocations';
  END IF;

  IF abs(v_alloc_total - v_charge_total) > 0.02 THEN
    RAISE EXCEPTION 'Allocation total % must match charge total %',
      v_alloc_total, v_charge_total;
  END IF;

  FOR r IN
    SELECT *
    FROM public.landed_cost_allocations
    WHERE pack_id = p_pack_id
    FOR UPDATE
  LOOP
    IF r.inventory_type = 'vehicle' THEN
      UPDATE public.vehicles SET
        landed_cost = round(COALESCE(purchase_price, 0) + r.allocated_amount, 2),
        updated_at = now()
      WHERE id = r.vehicle_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Vehicle % missing during post', r.vehicle_id;
      END IF;
    ELSE
      UPDATE public.parts SET
        landed_cost = round(COALESCE(purchase_price, 0) + r.allocated_amount, 2),
        updated_at = now()
      WHERE id = r.part_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Part % missing during post', r.part_id;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.landed_cost_packs SET
    status = 'posted',
    posted_at = now(),
    posted_by = auth.uid(),
    updated_at = now()
  WHERE id = p_pack_id
  RETURNING * INTO pack;

  RETURN pack;
END;
$$;

REVOKE ALL ON FUNCTION public.post_landed_cost_pack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_landed_cost_pack(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_landed_cost_pack(p_pack_id uuid)
RETURNS public.landed_cost_packs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pack public.landed_cost_packs%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT * INTO pack FROM public.landed_cost_packs WHERE id = p_pack_id FOR UPDATE;
  IF pack.id IS NULL THEN
    RAISE EXCEPTION 'Landed-cost pack not found';
  END IF;
  IF pack.status = 'cancelled' THEN
    RETURN pack;
  END IF;
  IF pack.status = 'posted' THEN
    RAISE EXCEPTION 'Posted packs cannot be cancelled (landed_cost already applied)';
  END IF;

  UPDATE public.landed_cost_packs SET
    status = 'cancelled',
    updated_at = now()
  WHERE id = p_pack_id
  RETURNING * INTO pack;

  RETURN pack;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_landed_cost_pack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_landed_cost_pack(uuid) TO authenticated;

-- Guard: do not introduce a zero-arg is_workspace_user overload.
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
