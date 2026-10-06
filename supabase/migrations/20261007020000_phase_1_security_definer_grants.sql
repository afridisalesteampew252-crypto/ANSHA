/*
  Phase 1 security hardening — SECURITY DEFINER execution grants

  Scope:
  - Do not change function bodies.
  - Keep the existing fixed search_path = '' protection.
  - Remove PUBLIC/anon execution from functions that require authentication.
  - Keep verify_invoice publicly callable because it powers public invoice QR verification.
  - Explicitly grant only the intended API roles.

  IMPORTANT:
  This migration is prepared on the security/phase-1-definer-rls branch only.
  It has NOT been applied to the production Supabase project.
*/

-- Authentication-only native FCM registration.
REVOKE EXECUTE ON FUNCTION public.register_fcm_push_token(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_fcm_push_token(text, text)
  TO authenticated;

-- Browser push registration stores a user_id when authenticated and is used
-- for user-targeted notifications. Anonymous registration is not required.
REVOKE EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, boolean, boolean, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, boolean, boolean, boolean, text)
  TO authenticated;

-- Public invoice authenticity verification is intentionally callable by anon.
-- Remove the implicit PUBLIC grant and make the intended public role explicit.
REVOKE EXECUTE ON FUNCTION public.verify_invoice(uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_invoice(uuid)
  TO anon;

-- Keep a database-level record of the intended security boundary.
COMMENT ON FUNCTION public.register_fcm_push_token(text, text)
  IS 'Authenticated-only SECURITY DEFINER RPC for registering an FCM device token.';

COMMENT ON FUNCTION public.register_push_subscription(text, text, text, boolean, boolean, boolean, text)
  IS 'Authenticated-only SECURITY DEFINER RPC for registering a browser push subscription.';

COMMENT ON FUNCTION public.verify_invoice(uuid)
  IS 'Intentionally public invoice authenticity verification RPC; returns only the verification payload defined by the function body.';
