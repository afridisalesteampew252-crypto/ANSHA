/* Customer self-service portal registration and Google Play account-deletion workflow. */

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS self_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS link_status text NOT NULL DEFAULT 'admin_created',
  ADD COLUMN IF NOT EXISTS linked_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.customer_profiles
  DROP CONSTRAINT IF EXISTS customer_profiles_link_status_check;
ALTER TABLE public.customer_profiles
  ADD CONSTRAINT customer_profiles_link_status_check
  CHECK (link_status IN ('admin_created', 'matched', 'new', 'review_required'));

CREATE OR REPLACE FUNCTION public.ensure_customer_portal_profile(p_full_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  caller_email text;
  confirmed_at timestamptz;
  display_name text;
  matched_customer_id uuid;
  match_count integer := 0;
  any_match_count integer := 0;
  profile_record public.customer_profiles%ROWTYPE;
  resolved_status text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = caller_id) THEN
    RAISE EXCEPTION 'Staff accounts cannot be used as customer portal accounts'
      USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(u.email)), u.email_confirmed_at,
         left(nullif(btrim(COALESCE(p_full_name, u.raw_user_meta_data ->> 'full_name', '')), ''), 160)
  INTO caller_email, confirmed_at, display_name
  FROM auth.users u
  WHERE u.id = caller_id;

  IF caller_email IS NULL OR confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Verify your email before creating portal access'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO profile_record
  FROM public.customer_profiles
  WHERE id = caller_id;

  IF FOUND THEN
    IF profile_record.is_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'This portal account is inactive' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
      'id', profile_record.id,
      'customer_id', profile_record.customer_id,
      'link_status', profile_record.link_status,
      'created', false
    );
  END IF;

  SELECT count(*)
  INTO any_match_count
  FROM public.customers c
  WHERE c.is_active = true
    AND c.email IS NOT NULL
    AND lower(btrim(c.email)) = caller_email;

  SELECT count(*), min(c.id::text)::uuid
  INTO match_count, matched_customer_id
  FROM public.customers c
  WHERE c.is_active = true
    AND c.email IS NOT NULL
    AND lower(btrim(c.email)) = caller_email
    AND NOT EXISTS (
      SELECT 1 FROM public.customer_profiles cp WHERE cp.customer_id = c.id
    );

  IF match_count = 1 AND any_match_count = 1 THEN
    resolved_status := 'matched';
  ELSE
    INSERT INTO public.customers (full_name, email, is_active)
    VALUES (COALESCE(display_name, caller_email), caller_email, true)
    RETURNING id INTO matched_customer_id;
    resolved_status := CASE WHEN any_match_count > 0 THEN 'review_required' ELSE 'new' END;
  END IF;

  INSERT INTO public.customer_profiles (
    id, customer_id, email, full_name, is_active, self_registered, link_status, linked_at
  )
  VALUES (
    caller_id, matched_customer_id, caller_email, COALESCE(display_name, caller_email),
    true, true, resolved_status, now()
  )
  RETURNING * INTO profile_record;

  RETURN jsonb_build_object(
    'id', profile_record.id,
    'customer_id', profile_record.customer_id,
    'link_status', profile_record.link_status,
    'created', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_customer_portal_profile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_customer_portal_profile(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  customer_id uuid,
  email_snapshot text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_note text,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_deletion_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  CONSTRAINT account_deletion_requests_reason_len
    CHECK (reason IS NULL OR char_length(reason) <= 1000),
  CONSTRAINT account_deletion_requests_review_note_len
    CHECK (review_note IS NULL OR char_length(review_note) <= 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_open_idx
  ON public.account_deletion_requests (auth_user_id)
  WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS account_deletion_requests_status_requested_idx
  ON public.account_deletion_requests (status, requested_at DESC);

DROP TRIGGER IF EXISTS account_deletion_requests_updated_at ON public.account_deletion_requests;
CREATE TRIGGER account_deletion_requests_updated_at
BEFORE UPDATE ON public.account_deletion_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_read_own_deletion_requests ON public.account_deletion_requests;
CREATE POLICY customer_read_own_deletion_requests
  ON public.account_deletion_requests FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS account_admin_manage_deletion_requests ON public.account_deletion_requests;
CREATE POLICY account_admin_manage_deletion_requests
  ON public.account_deletion_requests FOR ALL TO authenticated
  USING ((SELECT private.is_account_admin()))
  WITH CHECK ((SELECT private.is_account_admin()));

REVOKE ALL ON public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.account_deletion_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.request_my_account_deletion(p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  profile_record public.customer_profiles%ROWTYPE;
  request_record public.account_deletion_requests%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO profile_record
  FROM public.customer_profiles
  WHERE id = caller_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active portal profile required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO request_record
  FROM public.account_deletion_requests
  WHERE auth_user_id = caller_id AND status IN ('pending', 'approved')
  ORDER BY requested_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.account_deletion_requests (
      auth_user_id, customer_id, email_snapshot, reason
    )
    VALUES (
      caller_id, profile_record.customer_id, profile_record.email,
      nullif(left(btrim(COALESCE(p_reason, '')), 1000), '')
    )
    RETURNING * INTO request_record;
  END IF;

  RETURN to_jsonb(request_record);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_my_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  request_record public.account_deletion_requests%ROWTYPE;
BEGIN
  UPDATE public.account_deletion_requests
  SET status = 'cancelled', updated_at = now()
  WHERE auth_user_id = caller_id AND status = 'pending'
  RETURNING * INTO request_record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending deletion request found' USING ERRCODE = 'P0002';
  END IF;

  RETURN to_jsonb(request_record);
END;
$$;

REVOKE ALL ON FUNCTION public.request_my_account_deletion(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_my_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_my_account_deletion(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_account_deletion() TO authenticated;

COMMENT ON FUNCTION public.ensure_customer_portal_profile(text) IS
  'Creates an authenticated, email-verified customer portal profile; links one exact unclaimed CRM email match, otherwise creates an isolated customer record.';
COMMENT ON TABLE public.account_deletion_requests IS
  'Customer-initiated account deletion requests. Admin approval is completed by the portal-delete-account Edge Function; statutory transaction records may be retained only in anonymized form.';
