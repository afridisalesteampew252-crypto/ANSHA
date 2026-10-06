/*
  Phase 1: finish SECURITY DEFINER search-path hardening.

  All functions below already qualify application objects with their schema.
  pg_catalog remains implicitly available when search_path is empty.
*/

ALTER FUNCTION public.is_admin() SET search_path = '';
ALTER FUNCTION private.open_workspace_request_from_intake() SET search_path = '';

ALTER FUNCTION public.create_workspace_request(
  text, text, text, uuid, timestamptz, uuid, uuid, uuid, uuid
) SET search_path = '';
ALTER FUNCTION public.update_workspace_request(
  uuid, text, uuid, boolean, timestamptz, boolean, text, text
) SET search_path = '';
ALTER FUNCTION public.record_workspace_request_event(uuid, text) SET search_path = '';

ALTER FUNCTION public.link_chat_conversation(uuid, text, uuid) SET search_path = '';
ALTER FUNCTION public.unlink_chat_conversation(uuid) SET search_path = '';

ALTER FUNCTION public.register_workspace_request_attachment(
  uuid, text, text, text, bigint
) SET search_path = '';
ALTER FUNCTION public.delete_workspace_request_attachment(uuid) SET search_path = '';

ALTER FUNCTION public.process_workspace_request_due_reminders() SET search_path = '';

ALTER FUNCTION public.register_vehicle_lifecycle_event_attachment(
  uuid, text, text, text, bigint
) SET search_path = '';
ALTER FUNCTION public.delete_vehicle_lifecycle_event_attachment(uuid) SET search_path = '';

ALTER FUNCTION public.update_my_customer_profile(
  text, text, text, text, text, text, text,
  text, text, text, text, text, text
) SET search_path = '';

-- is_admin is an authenticated RLS helper, not a public discovery endpoint.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
