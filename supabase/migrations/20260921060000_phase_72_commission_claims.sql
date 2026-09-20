-- Phase 72: Sales commission claims on sold stock.
-- Claimants (sales/freelancer/requester/sold_by) claim after an item is sold;
-- ops/accounts approve and mark paid.

CREATE TABLE IF NOT EXISTS public.commission_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claimant_id uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  part_id uuid REFERENCES public.parts(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(trim(currency)) = 3),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  claim_notes text CHECK (claim_notes IS NULL OR char_length(claim_notes) <= 2000),
  review_notes text CHECK (review_notes IS NULL OR char_length(review_notes) <= 2000),
  reviewed_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_claims_one_stock CHECK (
    (vehicle_id IS NOT NULL AND part_id IS NULL)
    OR (vehicle_id IS NULL AND part_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS commission_claims_vehicle_claimant_active_uidx
  ON public.commission_claims (vehicle_id, claimant_id)
  WHERE vehicle_id IS NOT NULL AND status IS DISTINCT FROM 'rejected';

CREATE UNIQUE INDEX IF NOT EXISTS commission_claims_part_claimant_active_uidx
  ON public.commission_claims (part_id, claimant_id)
  WHERE part_id IS NOT NULL AND status IS DISTINCT FROM 'rejected';

CREATE INDEX IF NOT EXISTS commission_claims_claimant_idx
  ON public.commission_claims (claimant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commission_claims_status_idx
  ON public.commission_claims (status, created_at DESC);
CREATE INDEX IF NOT EXISTS commission_claims_vehicle_idx
  ON public.commission_claims (vehicle_id)
  WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_claims_part_idx
  ON public.commission_claims (part_id)
  WHERE part_id IS NOT NULL;

DROP TRIGGER IF EXISTS commission_claims_updated_at ON public.commission_claims;
CREATE TRIGGER commission_claims_updated_at
BEFORE UPDATE ON public.commission_claims
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.commission_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_claims_select ON public.commission_claims;
CREATE POLICY commission_claims_select
  ON public.commission_claims FOR SELECT TO authenticated
  USING (
    claimant_id = (SELECT auth.uid())
    OR (SELECT private.is_ops_user())
    OR (SELECT private.is_accounts_user())
    OR EXISTS (
      SELECT 1 FROM public.admin_profiles ap
      WHERE ap.id = (SELECT auth.uid())
        AND ap.is_active = true
        AND ap.role = 'manager'
    )
  );

-- Writes go through SECURITY DEFINER RPCs only.
REVOKE ALL ON public.commission_claims FROM PUBLIC, anon;
GRANT SELECT ON public.commission_claims TO authenticated;

COMMENT ON TABLE public.commission_claims IS
  'Phase 72: per-user commission claims against sold vehicles/parts.';

-- ---------------------------------------------------------------------------
-- Claim: sold stock only; claimant must be reserved_by, sold_by, or matching requester name
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_stock_commission(
  p_amount numeric,
  p_currency text DEFAULT 'AED',
  p_vehicle_id uuid DEFAULT NULL,
  p_part_id uuid DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_claimant_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_claimant uuid;
  v_role text;
  v_name text;
  v_status text;
  v_reserved_by uuid;
  v_sold_by uuid;
  v_requester text;
  v_currency text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF (p_vehicle_id IS NULL AND p_part_id IS NULL)
     OR (p_vehicle_id IS NOT NULL AND p_part_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of vehicle or part';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Commission amount must be positive';
  END IF;

  SELECT role, full_name INTO v_role, v_name
  FROM public.admin_profiles
  WHERE id = v_uid AND is_active = true;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Active workspace profile required';
  END IF;

  -- Ops/accounts may file on behalf of another user; others always claim as self.
  IF p_claimant_id IS NOT NULL
     AND p_claimant_id IS DISTINCT FROM v_uid
     AND v_role IN ('admin', 'staff', 'accounts') THEN
    v_claimant := p_claimant_id;
  ELSE
    v_claimant := v_uid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = v_claimant AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Claimant profile not found';
  END IF;

  IF p_vehicle_id IS NOT NULL THEN
    SELECT stock_status, reserved_by, sold_by, reservation_requester_name, COALESCE(currency, 'AED')
    INTO v_status, v_reserved_by, v_sold_by, v_requester, v_currency
    FROM public.vehicles WHERE id = p_vehicle_id;
  ELSE
    SELECT stock_status, reserved_by, sold_by, reservation_requester_name, COALESCE(currency, 'AED')
    INTO v_status, v_reserved_by, v_sold_by, v_requester, v_currency
    FROM public.parts WHERE id = p_part_id;
  END IF;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Stock item not found';
  END IF;

  IF v_status IS DISTINCT FROM 'sold' THEN
    RAISE EXCEPTION 'Commission can only be claimed after the item is sold';
  END IF;

  -- Self-claim eligibility (ops filing on behalf skips this)
  IF v_claimant = v_uid AND v_role NOT IN ('admin', 'staff', 'accounts') THEN
    IF v_reserved_by IS DISTINCT FROM v_uid
       AND v_sold_by IS DISTINCT FROM v_uid
       AND (
         v_requester IS NULL
         OR lower(trim(v_requester)) IS DISTINCT FROM lower(trim(COALESCE(v_name, '')))
       )
    THEN
      RAISE EXCEPTION 'You can only claim commission on stock you reserved, requested, or marked sold';
    END IF;
  END IF;

  INSERT INTO public.commission_claims (
    claimant_id,
    vehicle_id,
    part_id,
    invoice_id,
    amount,
    currency,
    claim_notes,
    status
  ) VALUES (
    v_claimant,
    p_vehicle_id,
    p_part_id,
    p_invoice_id,
    p_amount,
    upper(trim(COALESCE(NULLIF(p_currency, ''), v_currency, 'AED'))),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stock_commission(numeric, text, uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_stock_commission(numeric, text, uuid, uuid, uuid, text, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.claim_stock_commission IS
  'Phase 72: claim commission on a sold vehicle or part.';

-- ---------------------------------------------------------------------------
-- Review: approve / reject / mark paid (ops + accounts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_commission_claim(
  p_claim_id uuid,
  p_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_role text;
  v_row public.commission_claims%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role
  FROM public.admin_profiles
  WHERE id = v_uid AND is_active = true;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'staff', 'accounts') THEN
    RAISE EXCEPTION 'Only ops or accounts can review commission claims';
  END IF;

  IF p_status NOT IN ('approved', 'paid', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'Invalid review status';
  END IF;

  SELECT * INTO v_row FROM public.commission_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  UPDATE public.commission_claims
  SET
    status = p_status,
    review_notes = COALESCE(NULLIF(trim(COALESCE(p_review_notes, '')), ''), review_notes),
    reviewed_by = v_uid,
    reviewed_at = now(),
    paid_at = CASE WHEN p_status = 'paid' THEN now() ELSE paid_at END
  WHERE id = p_claim_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_commission_claim(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_commission_claim(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.review_commission_claim IS
  'Phase 72: approve, reject, or mark paid a commission claim.';
