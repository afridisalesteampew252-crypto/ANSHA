/* Phase 60: Team Chat presence — last_seen_at for offline status labels. */

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS admin_profiles_last_seen_at_idx
  ON public.admin_profiles (last_seen_at DESC NULLS LAST);

/* Authenticated clients may only touch their own last_seen_at (plus existing profile fields). */
GRANT UPDATE (full_name, avatar_url, last_seen_at) ON public.admin_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_admin_last_seen()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  stamp timestamptz := timezone('utc', now());
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  UPDATE public.admin_profiles
  SET last_seen_at = stamp
  WHERE id = (SELECT auth.uid());

  RETURN stamp;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_admin_last_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_admin_last_seen() TO authenticated;

COMMENT ON COLUMN public.admin_profiles.last_seen_at IS
  'UTC timestamp of last Team Chat / admin presence heartbeat; used for offline last-seen labels.';
