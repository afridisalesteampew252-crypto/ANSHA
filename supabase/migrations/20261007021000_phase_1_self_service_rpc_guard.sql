/*
  Phase 1 security hardening — authenticated self-service RPC guard

  cancel_my_account_deletion() is a SECURITY DEFINER function intended only
  for the currently signed-in user's own pending deletion request.

  Add an explicit authentication guard before any privileged table operation.
*/

CREATE OR REPLACE FUNCTION public.cancel_my_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  request_record public.account_deletion_requests%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.account_deletion_requests
  SET status = 'cancelled',
      updated_at = now()
  WHERE auth_user_id = caller_id
    AND status = 'pending'
  RETURNING * INTO request_record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending deletion request found' USING ERRCODE = 'P0002';
  END IF;

  RETURN to_jsonb(request_record);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cancel_my_account_deletion()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_account_deletion()
  TO authenticated;

COMMENT ON FUNCTION public.cancel_my_account_deletion()
  IS 'Authenticated self-service cancellation of the caller''s own pending account deletion request.';
