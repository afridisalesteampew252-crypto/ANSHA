BEGIN;

DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.claim_password_login_attempt(text)', 'EXECUTE'), 'anonymous callers cannot create login attempts';
  ASSERT NOT has_function_privilege('authenticated', 'public.finish_password_login_attempt(text,uuid,boolean)', 'EXECUTE'), 'customers cannot reset their server counters';
  ASSERT NOT has_function_privilege('authenticated', 'public.hook_password_login_lockout(jsonb)', 'EXECUTE'), 'customers cannot forge Auth hook outcomes';
  ASSERT has_function_privilege('supabase_auth_admin', 'public.hook_password_login_lockout(jsonb)', 'EXECUTE'), 'Auth can execute the hook';
END;
$$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $$
DECLARE
  identifier text := repeat('a', 64);
  claim jsonb;
  state jsonb;
BEGIN
  FOR attempt IN 1..3 LOOP
    claim := public.claim_password_login_attempt(identifier);
    ASSERT (claim->>'allowed')::boolean, 'first three password attempts must be permitted';
    IF attempt = 1 THEN
      state := public.claim_password_login_attempt(identifier);
      ASSERT (state->>'busy')::boolean AND NOT (state->>'allowed')::boolean, 'concurrent requests must not pass the same reservation';
    END IF;
    state := public.finish_password_login_attempt(identifier, (claim->>'reservation')::uuid, false);
    ASSERT (state->>'attempts')::integer = attempt, 'each failed password counts once';
    IF attempt < 3 THEN ASSERT (state->>'retry_after')::integer = 0, 'first two failures must not lock'; END IF;
  END LOOP;
  ASSERT (state->>'retry_after')::integer BETWEEN 299 AND 300, 'third failure starts a five minute lock';
  claim := public.claim_password_login_attempt(identifier);
  ASSERT NOT (claim->>'allowed')::boolean AND (claim->>'retry_after')::integer > 0, 'fresh browser requests cannot bypass lockout';
  state := public.finish_password_login_attempt(identifier, gen_random_uuid(), true);
  ASSERT (state->>'attempts')::integer = 3, 'forged or old reservations cannot clear a lock';

  identifier := repeat('b', 64);
  claim := public.claim_password_login_attempt(identifier);
  state := public.finish_password_login_attempt(identifier, (claim->>'reservation')::uuid, false);
  claim := public.claim_password_login_attempt(identifier);
  state := public.finish_password_login_attempt(identifier, (claim->>'reservation')::uuid, NULL);
  ASSERT (state->>'attempts')::integer = 1, 'transport failures do not count as a wrong password';
  claim := public.claim_password_login_attempt(identifier);
  state := public.finish_password_login_attempt(identifier, (claim->>'reservation')::uuid, true);
  ASSERT (state->>'attempts')::integer = 0 AND (state->>'retry_after')::integer = 0, 'successful password resets prior failures';
END;
$$;
RESET ROLE;

UPDATE private.password_login_attempts
SET locked_until = clock_timestamp() - interval '1 second', window_started_at = clock_timestamp() - interval '6 minutes'
WHERE identifier_hash = repeat('a', 64);
SET LOCAL ROLE service_role;
DO $$
DECLARE claim jsonb;
BEGIN
  claim := public.claim_password_login_attempt(repeat('a', 64));
  ASSERT (claim->>'allowed')::boolean AND (claim->>'attempts')::integer = 0, 'expired locks allow a fresh attempt window';
END;
$$;
RESET ROLE;

-- Known-user Auth hook + app gateway share the same hash and never count twice.
INSERT INTO auth.users(id, email) VALUES('74000000-0000-4000-8000-000000000011', 'lockout-regression@example.invalid');
DO $$
DECLARE
  identifier text := encode(sha256(convert_to('lockout-regression@example.invalid', 'UTF8')), 'hex');
  claim jsonb;
  state jsonb;
  hook jsonb;
BEGIN
  FOR attempt IN 1..3 LOOP
    claim := public.claim_password_login_attempt(identifier);
    hook := public.hook_password_login_lockout('{"user_id":"74000000-0000-4000-8000-000000000011","valid":false}');
    state := public.finish_password_login_attempt(identifier, (claim->>'reservation')::uuid, false);
    ASSERT (state->>'attempts')::integer = attempt, 'gateway must not recount a configured Auth hook result';
  END LOOP;
  hook := public.hook_password_login_lockout('{"user_id":"74000000-0000-4000-8000-000000000011","valid":true}');
  ASSERT hook->>'decision' = 'reject' AND (hook->>'should_logout_user')::boolean = false, 'locked direct Auth requests cannot bypass with a valid password or logout existing sessions';
END;
$$;

SET LOCAL ROLE supabase_auth_admin;
DO $$
DECLARE hook jsonb;
BEGIN
  hook := public.hook_password_login_lockout('{"user_id":"74000000-0000-4000-8000-000000000011","valid":true}');
  ASSERT hook->>'decision' = 'reject', 'the actual Auth role can execute the configured hook';
END;
$$;
RESET ROLE;

ROLLBACK;
