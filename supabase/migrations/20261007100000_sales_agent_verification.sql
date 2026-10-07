/* Manual sales/freelancer verification. Contact details are reviewed by an
   active account admin; this does not claim SMS, email OTP or identity checks.
   All public writes use guarded RPCs, with the existing admin-only append-only
   audit log recording contact changes and review decisions. */

CREATE TABLE public.sales_agent_verifications (
  agent_id uuid PRIMARY KEY REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 160),
  email text NOT NULL CHECK (char_length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text NOT NULL CHECK (phone ~ '^\+?[0-9]{7,15}$'),
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended')),
  referral_code text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '')
    CHECK (referral_code ~ '^[a-f0-9]{32}$'),
  reviewed_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text CHECK (char_length(review_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_agent_verifications_reviewed_by_idx
  ON public.sales_agent_verifications(reviewed_by) WHERE reviewed_by IS NOT NULL;
COMMENT ON TABLE public.sales_agent_verifications IS
  'Manual admin review of sales/freelancer contact details. Login identity is unchanged. Referral codes are permanent, and only active verified agents can receive new referrals.';

ALTER TABLE public.sales_agent_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_agent_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sales_agent_verifications TO authenticated;
GRANT ALL ON public.sales_agent_verifications TO service_role;
CREATE POLICY admin_or_self_read_sales_agent_verification
  ON public.sales_agent_verifications FOR SELECT TO authenticated
  USING (
    (SELECT private.is_account_admin())
    OR (agent_id = (SELECT auth.uid()) AND (SELECT private.is_field_agent()))
  );

-- Caller-independent target predicate, for intake and assignment RPCs. It must
-- not accidentally check the submitting customer instead of the referred agent.
CREATE FUNCTION private.is_verified_sales_agent(p_agent_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles p
    JOIN public.sales_agent_verifications v ON v.agent_id = p.id
    WHERE p.id = p_agent_id AND p.is_active = true
      AND p.role IN ('sales', 'freelancer') AND v.verification_status = 'verified'
  );
$$;
REVOKE ALL ON FUNCTION private.is_verified_sales_agent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_verified_sales_agent(uuid) TO authenticated, service_role;

-- Even trusted bulk/contact tooling must preserve a code already handed out.
CREATE FUNCTION private.guard_sales_agent_referral_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'An agent referral code cannot be changed' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_sales_agent_referral_code() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER preserve_sales_agent_referral_code BEFORE UPDATE
  ON public.sales_agent_verifications FOR EACH ROW
  EXECUTE FUNCTION private.guard_sales_agent_referral_code();

CREATE FUNCTION public.get_sales_agents()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_role text;
  result jsonb;
BEGIN
  SELECT role INTO caller_role FROM public.admin_profiles
  WHERE id = caller_id AND is_active = true;
  IF caller_role IS NULL OR caller_role NOT IN ('admin', 'sales', 'freelancer') THEN
    RAISE EXCEPTION 'Agent verification access required' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'agent_id', p.id, 'full_name', coalesce(v.full_name, p.full_name, ''),
    'email', coalesce(v.email, p.email, ''), 'phone', coalesce(v.phone, ''),
    'role', p.role, 'is_active', p.is_active,
    'verification_status', coalesce(v.verification_status, 'pending'),
    'referral_code', v.referral_code, 'reviewed_at', v.reviewed_at,
    'review_note', v.review_note
  ) ORDER BY coalesce(v.full_name, p.full_name, ''), p.id), '[]'::jsonb)
  INTO result
  FROM public.admin_profiles p
  LEFT JOIN public.sales_agent_verifications v ON v.agent_id = p.id
  WHERE p.role IN ('sales', 'freelancer') AND (caller_role = 'admin' OR p.id = caller_id);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_sales_agents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_agents() TO authenticated;

CREATE FUNCTION public.save_sales_agent_contact(
  p_agent_id uuid, p_full_name text, p_email text, p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_role text;
  target_role text;
  clean_name text := btrim(coalesce(p_full_name, ''));
  clean_email text := lower(btrim(coalesce(p_email, '')));
  raw_phone text := btrim(coalesce(p_phone, ''));
  clean_phone text;
  previous public.sales_agent_verifications%ROWTYPE;
  saved public.sales_agent_verifications%ROWTYPE;
  contact_changed boolean;
BEGIN
  SELECT role INTO caller_role FROM public.admin_profiles
  WHERE id = caller_id AND is_active = true;
  IF caller_role IS NULL OR NOT (
    caller_role = 'admin' OR (caller_role IN ('sales', 'freelancer') AND p_agent_id = caller_id)
  ) THEN
    RAISE EXCEPTION 'Agent contact edit access required' USING ERRCODE = '42501';
  END IF;
  -- Serialize creation and review against the parent row as well as the contact.
  SELECT role INTO target_role FROM public.admin_profiles WHERE id = p_agent_id FOR UPDATE;
  IF target_role IS NULL OR target_role NOT IN ('sales', 'freelancer') THEN
    RAISE EXCEPTION 'Sales or freelancer account required' USING ERRCODE = '22023';
  END IF;
  IF char_length(clean_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Enter a full name between 2 and 160 characters' USING ERRCODE = '22023';
  END IF;
  IF char_length(clean_email) > 254 OR clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid contact email' USING ERRCODE = '22023';
  END IF;
  IF char_length(raw_phone) > 40 OR raw_phone !~ '^\+?[0-9 ()\.\-]+$' THEN
    RAISE EXCEPTION 'Enter a valid contact phone' USING ERRCODE = '22023';
  END IF;
  clean_phone := regexp_replace(raw_phone, '[ ()\.\-]', '', 'g');
  IF clean_phone !~ '^\+?[0-9]{7,15}$' THEN
    RAISE EXCEPTION 'Contact phone must contain 7 to 15 digits' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO previous FROM public.sales_agent_verifications WHERE agent_id = p_agent_id FOR UPDATE;
  contact_changed := previous.agent_id IS NULL OR
    (previous.full_name, previous.email, previous.phone) IS DISTINCT FROM (clean_name, clean_email, clean_phone);
  IF NOT contact_changed THEN RETURN to_jsonb(previous); END IF;
  INSERT INTO public.sales_agent_verifications(agent_id, full_name, email, phone)
  VALUES(p_agent_id, clean_name, clean_email, clean_phone)
  ON CONFLICT (agent_id) DO UPDATE SET
    full_name = EXCLUDED.full_name, email = EXCLUDED.email, phone = EXCLUDED.phone,
    -- Editing contact cannot undo an admin suspension. A new review is required.
    verification_status = CASE WHEN previous.verification_status = 'suspended' THEN 'suspended' ELSE 'pending' END,
    reviewed_by = CASE WHEN previous.verification_status = 'suspended' THEN previous.reviewed_by ELSE NULL END,
    reviewed_at = CASE WHEN previous.verification_status = 'suspended' THEN previous.reviewed_at ELSE NULL END,
    review_note = CASE WHEN previous.verification_status = 'suspended' THEN previous.review_note ELSE NULL END,
    updated_at = now()
  RETURNING * INTO saved;
  PERFORM private.write_audit_log('sales_agent_contact_saved', 'sales_agent_verification', p_agent_id,
    jsonb_build_object('previous_contact', CASE WHEN previous.agent_id IS NULL THEN NULL ELSE
      jsonb_build_object('full_name', previous.full_name, 'email', previous.email, 'phone', previous.phone) END,
      'contact', jsonb_build_object('full_name', saved.full_name, 'email', saved.email, 'phone', saved.phone),
      'previous_status', previous.verification_status, 'status', saved.verification_status), caller_id);
  RETURN to_jsonb(saved);
END;
$$;
REVOKE ALL ON FUNCTION public.save_sales_agent_contact(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sales_agent_contact(uuid,text,text,text) TO authenticated;

CREATE FUNCTION public.review_sales_agent(
  p_agent_id uuid, p_status text, p_note text DEFAULT NULL, p_expected_contact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  target public.admin_profiles%ROWTYPE;
  previous public.sales_agent_verifications%ROWTYPE;
  reviewed public.sales_agent_verifications%ROWTYPE;
  clean_status text := lower(btrim(coalesce(p_status, '')));
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT private.is_account_admin() THEN
    RAISE EXCEPTION 'Active account admin required to review agents' USING ERRCODE = '42501';
  END IF;
  IF clean_status NOT IN ('pending', 'verified', 'rejected', 'suspended') OR char_length(clean_note) > 2000 THEN
    RAISE EXCEPTION 'Invalid review status or note' USING ERRCODE = '22023';
  END IF;
  IF clean_status IN ('rejected', 'suspended') AND clean_note IS NULL THEN
    RAISE EXCEPTION 'A rejection or suspension reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO target FROM public.admin_profiles WHERE id = p_agent_id FOR UPDATE;
  IF target.id IS NULL OR target.role NOT IN ('sales', 'freelancer') THEN
    RAISE EXCEPTION 'Sales or freelancer account required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO previous FROM public.sales_agent_verifications WHERE agent_id = p_agent_id FOR UPDATE;
  IF previous.agent_id IS NULL THEN
    RAISE EXCEPTION 'Save complete agent contact details before review' USING ERRCODE = '22023';
  END IF;
  -- The review screen supplies exactly the contact it displayed. Reject a
  -- decision made from stale data rather than approve unseen contact changes.
  IF p_expected_contact IS NOT NULL AND p_expected_contact IS DISTINCT FROM
    jsonb_build_object('full_name', previous.full_name, 'email', previous.email, 'phone', previous.phone) THEN
    RAISE EXCEPTION 'Contact details changed. Refresh and review the latest submission.' USING ERRCODE = '40001';
  END IF;
  IF clean_status = 'verified' AND (
    target.is_active IS DISTINCT FROM true OR char_length(previous.full_name) NOT BETWEEN 2 AND 160
    OR char_length(previous.email) > 254 OR previous.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR previous.phone !~ '^\+?[0-9]{7,15}$'
  ) THEN
    RAISE EXCEPTION 'Verification requires an active account and valid name, email and phone' USING ERRCODE = '22023';
  END IF;
  UPDATE public.sales_agent_verifications SET verification_status = clean_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = clean_note, updated_at = now()
  WHERE agent_id = p_agent_id RETURNING * INTO reviewed;
  PERFORM private.write_audit_log('sales_agent_reviewed', 'sales_agent_verification', p_agent_id,
    jsonb_build_object('previous_status', previous.verification_status, 'status', reviewed.verification_status,
      'note', clean_note, 'contact', jsonb_build_object('full_name', reviewed.full_name, 'email', reviewed.email, 'phone', reviewed.phone)), auth.uid());
  RETURN to_jsonb(reviewed);
END;
$$;
REVOKE ALL ON FUNCTION public.review_sales_agent(uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_sales_agent(uuid,text,text,jsonb) TO authenticated;
