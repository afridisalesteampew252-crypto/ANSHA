-- Shared credential lockout for the admin and customer password login gateway.
-- The optional Auth password-verification hook also covers direct Auth API calls.
CREATE TABLE private.password_login_attempts (
  identifier_hash text PRIMARY KEY CHECK (identifier_hash ~ '^[0-9a-f]{64}$'),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  window_started_at timestamptz,
  locked_until timestamptz,
  in_flight uuid,
  in_flight_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON private.password_login_attempts FROM PUBLIC, anon, authenticated;
ALTER TABLE private.password_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION private.password_login_state(p_hash text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'attempts', attempts,
    'locked_until', locked_until,
    'retry_after', greatest(0, ceil(extract(epoch FROM locked_until - clock_timestamp())))::integer
  ) FROM private.password_login_attempts WHERE identifier_hash = p_hash;
$$;
REVOKE ALL ON FUNCTION private.password_login_state(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.apply_password_login_outcome(p_hash text, p_valid boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  attempt private.password_login_attempts;
  observed_at timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO attempt FROM private.password_login_attempts
  WHERE identifier_hash = p_hash FOR UPDATE;
  IF attempt.locked_until > observed_at THEN
    RETURN private.password_login_state(p_hash);
  END IF;
  IF p_valid IS TRUE THEN
    UPDATE private.password_login_attempts
    SET attempts = 0, window_started_at = NULL, locked_until = NULL,
        in_flight = NULL, in_flight_until = NULL, updated_at = observed_at
    WHERE identifier_hash = p_hash;
  ELSIF p_valid IS FALSE THEN
    IF attempt.window_started_at IS NULL
       OR attempt.window_started_at <= observed_at - interval '5 minutes' THEN
      attempt.attempts := 0;
      attempt.window_started_at := observed_at;
    END IF;
    attempt.attempts := least(3, attempt.attempts + 1);
    UPDATE private.password_login_attempts
    SET attempts = attempt.attempts, window_started_at = attempt.window_started_at,
        locked_until = CASE WHEN attempt.attempts >= 3 THEN observed_at + interval '5 minutes' ELSE NULL END,
        in_flight = NULL, in_flight_until = NULL, updated_at = observed_at
    WHERE identifier_hash = p_hash;
  ELSE
    -- Network errors and Auth throttling do not count as a wrong password.
    UPDATE private.password_login_attempts
    SET in_flight = NULL, in_flight_until = NULL, updated_at = observed_at
    WHERE identifier_hash = p_hash;
  END IF;
  RETURN private.password_login_state(p_hash);
END;
$$;
REVOKE ALL ON FUNCTION private.apply_password_login_outcome(text, boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.claim_password_login_attempt(p_identifier_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  attempt private.password_login_attempts;
  reservation uuid := gen_random_uuid();
  observed_at timestamptz := clock_timestamp();
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service access required' USING ERRCODE = '42501';
  END IF;
  IF p_identifier_hash IS NULL OR p_identifier_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid login identifier';
  END IF;
  INSERT INTO private.password_login_attempts(identifier_hash)
  VALUES (p_identifier_hash) ON CONFLICT DO NOTHING;
  SELECT * INTO attempt FROM private.password_login_attempts
  WHERE identifier_hash = p_identifier_hash FOR UPDATE;
  IF attempt.locked_until > observed_at THEN
    RETURN private.password_login_state(p_identifier_hash) || jsonb_build_object('allowed', false);
  END IF;
  IF attempt.in_flight_until > observed_at THEN
    RETURN private.password_login_state(p_identifier_hash) || jsonb_build_object(
      'allowed', false, 'busy', true,
      'retry_after', ceil(extract(epoch FROM attempt.in_flight_until - observed_at))::integer
    );
  END IF;
  IF attempt.window_started_at IS NULL
     OR attempt.window_started_at <= observed_at - interval '5 minutes' THEN
    UPDATE private.password_login_attempts
    SET attempts = 0, window_started_at = NULL, locked_until = NULL
    WHERE identifier_hash = p_identifier_hash;
  END IF;
  UPDATE private.password_login_attempts
  SET in_flight = reservation, in_flight_until = observed_at + interval '30 seconds', updated_at = observed_at
  WHERE identifier_hash = p_identifier_hash;
  RETURN private.password_login_state(p_identifier_hash)
    || jsonb_build_object('allowed', true, 'reservation', reservation);
END;
$$;

CREATE FUNCTION public.finish_password_login_attempt(p_identifier_hash text, p_reservation uuid, p_valid boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pending uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service access required' USING ERRCODE = '42501';
  END IF;
  SELECT in_flight INTO pending FROM private.password_login_attempts
  WHERE identifier_hash = p_identifier_hash FOR UPDATE;
  -- A configured Auth hook records the outcome first; do not count it twice.
  IF pending IS NOT NULL AND pending = p_reservation THEN
    RETURN private.apply_password_login_outcome(p_identifier_hash, p_valid);
  END IF;
  RETURN private.password_login_state(p_identifier_hash);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_password_login_attempt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_password_login_attempt(text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_password_login_attempt(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_password_login_attempt(text, uuid, boolean) TO service_role;

-- Enable in Supabase Auth -> Hooks -> Password Verification Attempt after staging
-- regression. supabase_auth_admin is the only caller; no customer/staff Data API grant.
CREATE FUNCTION public.hook_password_login_lockout(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  identifier text;
  attempt private.password_login_attempts;
BEGIN
  SELECT encode(sha256(convert_to(lower(btrim(email)), 'UTF8')), 'hex') INTO identifier
  FROM auth.users WHERE id = (event->>'user_id')::uuid;
  IF identifier IS NULL OR jsonb_typeof(event->'valid') IS DISTINCT FROM 'boolean' THEN
    RETURN jsonb_build_object('decision', 'reject', 'message', 'Password verification failed.', 'should_logout_user', false);
  END IF;
  INSERT INTO private.password_login_attempts(identifier_hash)
  VALUES(identifier) ON CONFLICT DO NOTHING;
  SELECT * INTO attempt FROM private.password_login_attempts
  WHERE identifier_hash = identifier FOR UPDATE;
  IF attempt.locked_until > clock_timestamp() THEN
    RETURN jsonb_build_object('decision', 'reject', 'message', 'Too many failed attempts. Try again after 5 minutes.', 'should_logout_user', false);
  END IF;
  PERFORM private.apply_password_login_outcome(identifier, (event->>'valid')::boolean);
  RETURN jsonb_build_object('decision', 'continue');
END;
$$;
REVOKE ALL ON FUNCTION public.hook_password_login_lockout(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.hook_password_login_lockout(jsonb) TO supabase_auth_admin;

-- The reset request is authorized again inside the DB and produces an audit entry.
CREATE FUNCTION public.audit_customer_password_reset_request(p_customer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (SELECT private.is_account_admin()) THEN
    RAISE EXCEPTION 'Only an active account administrator may request a customer password reset' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_profiles cp JOIN public.customers c ON c.id = cp.customer_id
    WHERE cp.customer_id = p_customer_id AND cp.is_active AND c.is_active
  ) THEN
    RAISE EXCEPTION 'Active customer portal account not found';
  END IF;
  PERFORM private.write_audit_log('customer_password_reset_requested', 'customer', p_customer_id);
END;
$$;
REVOKE ALL ON FUNCTION public.audit_customer_password_reset_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_customer_password_reset_request(uuid) TO authenticated;

-- An admin can undo a recent UI assignment without overwriting a later change.
CREATE FUNCTION public.restore_customer_owner(p_customer_id uuid, p_expected_owner_id uuid, p_previous_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_owner uuid;
BEGIN
  IF NOT (SELECT private.is_account_admin()) THEN
    RAISE EXCEPTION 'Only an active administrator can undo an assignment' USING ERRCODE = '42501';
  END IF;
  SELECT owner_id INTO current_owner FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
  IF current_owner IS DISTINCT FROM p_expected_owner_id THEN
    RAISE EXCEPTION 'The assignment changed again. Refresh before reassigning this customer.';
  END IF;
  RETURN public.assign_customer_owner(p_customer_id, p_previous_owner_id);
END;
$$;
REVOKE ALL ON FUNCTION public.restore_customer_owner(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_customer_owner(uuid, uuid, uuid) TO authenticated;
