/* Consolidate profile policies introduced across earlier phases and add legacy FK indexes. */

DROP POLICY IF EXISTS admin_read_admin_profiles ON public.admin_profiles;
DROP POLICY IF EXISTS self_read_admin_profile ON public.admin_profiles;
DROP POLICY IF EXISTS workspace_read_admin_profiles ON public.admin_profiles;
CREATE POLICY workspace_read_admin_profiles
ON public.admin_profiles
FOR SELECT
TO authenticated
USING (private.is_workspace_user());

DROP POLICY IF EXISTS admin_update_admin_profiles ON public.admin_profiles;
DROP POLICY IF EXISTS self_update_admin_profile ON public.admin_profiles;
CREATE POLICY admin_or_self_update_admin_profiles
ON public.admin_profiles
FOR UPDATE
TO authenticated
USING (public.is_admin() OR id = (SELECT auth.uid()))
WITH CHECK (public.is_admin() OR id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS blog_posts_author_id_idx ON public.blog_posts(author_id);
CREATE INDEX IF NOT EXISTS import_jobs_created_by_idx ON public.import_jobs(created_by);
