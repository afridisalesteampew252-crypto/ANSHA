/* Consolidate account-deletion RLS after advisor review. All writes use guarded RPC/Edge code. */

DROP POLICY IF EXISTS customer_read_own_deletion_requests ON public.account_deletion_requests;
DROP POLICY IF EXISTS account_admin_manage_deletion_requests ON public.account_deletion_requests;

CREATE POLICY authenticated_read_relevant_deletion_requests
  ON public.account_deletion_requests FOR SELECT TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR (SELECT private.is_account_admin())
  );

REVOKE INSERT, UPDATE, DELETE ON public.account_deletion_requests FROM authenticated;
GRANT SELECT ON public.account_deletion_requests TO authenticated;
