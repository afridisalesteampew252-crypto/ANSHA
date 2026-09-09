/*
# Security Hardening Migration

## Overview
Fixes security vulnerabilities identified during the security audit:

1. **is_admin() function callable by anon** — The SECURITY DEFINER function `is_admin()` was executable by anyone (anon + authenticated) via the REST API. An unauthenticated user could call `/rest/v1/rpc/is_admin` to check if any user ID is an admin, enabling admin enumeration. Fixed by revoking EXECUTE from anon and PUBLIC, granting it only to authenticated.

2. **handle_updated_at() mutable search_path** — The trigger function had no search_path set, allowing potential search_path manipulation. Fixed by setting `SET search_path = public`.

3. **slugify() mutable search_path** — Same issue. Fixed by setting `SET search_path = public`.

4. **Leaked password protection disabled** — This is a Supabase Auth setting that cannot be changed via SQL; it must be enabled in the Supabase dashboard. Flagging for manual remediation.

## Changes
- REVOKE EXECUTE on is_admin() from PUBLIC and anon
- GRANT EXECUTE on is_admin() to authenticated only
- ALTER handle_updated_at() to SET search_path = public
- ALTER slugify() to SET search_path = public
*/

-- Fix 1: Restrict is_admin() to authenticated only
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Fix 2: Set search_path on handle_updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix 3: Set search_path on slugify
CREATE OR REPLACE FUNCTION public.slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        trim(input),
        '[^a-zA-Z0-9\s-]',
        '',
        'g'
      ),
      '\s+',
      '-',
      'g'
    )
  );
$$;