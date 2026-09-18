/* Fix: private.is_workspace_user() is not unique

Root cause:
  Phase 9 created private.is_workspace_user(uuid DEFAULT auth.uid()).
  Phase 25 also created a zero-arg private.is_workspace_user() that does
  not replace the uuid overload. Postgres then rejects bare calls
  private.is_workspace_user() as ambiguous — including create_invoice_v3.

Canonical signature (supports both () via DEFAULT and (uuid)):
  private.is_workspace_user(check_user_id uuid DEFAULT auth.uid())

is_ops_user / is_admin were checked and remain single-signature.
*/

DROP FUNCTION IF EXISTS private.is_workspace_user();

CREATE OR REPLACE FUNCTION private.is_workspace_user(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = check_user_id
      AND is_active = true
  );
$$;

REVOKE ALL ON FUNCTION private.is_workspace_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_workspace_user(uuid) TO authenticated;

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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'is_workspace_user'
      AND pg_get_function_identity_arguments(p.oid) = 'check_user_id uuid'
  ) THEN
    RAISE EXCEPTION
      'canonical private.is_workspace_user(check_user_id uuid) missing after fix';
  END IF;
END;
$$;
