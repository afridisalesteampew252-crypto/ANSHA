/* Phase 49: Marketing campaigns MVP — ops-only campaign records + send hooks.

Channels: push | email | offer. Status: draft | scheduled | sent.
Send hooks reuse Edge Functions send-web-push / send-outbound-email (and offer → deals push).
Not a full ESP / automation product.

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- marketing_campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('push', 'email', 'offer')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_campaigns_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS marketing_campaigns_created_at_idx
  ON public.marketing_campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_campaigns_status_idx
  ON public.marketing_campaigns (status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_campaigns_channel_idx
  ON public.marketing_campaigns (channel, created_at DESC);

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_select_marketing_campaigns ON public.marketing_campaigns;
CREATE POLICY ops_select_marketing_campaigns
  ON public.marketing_campaigns FOR SELECT TO authenticated
  USING ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS ops_insert_marketing_campaigns ON public.marketing_campaigns;
CREATE POLICY ops_insert_marketing_campaigns
  ON public.marketing_campaigns FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_ops_user())
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS ops_update_marketing_campaigns ON public.marketing_campaigns;
CREATE POLICY ops_update_marketing_campaigns
  ON public.marketing_campaigns FOR UPDATE TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS ops_delete_marketing_campaigns ON public.marketing_campaigns;
CREATE POLICY ops_delete_marketing_campaigns
  ON public.marketing_campaigns FOR DELETE TO authenticated
  USING ((SELECT private.is_ops_user()));

REVOKE ALL ON public.marketing_campaigns FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;

COMMENT ON TABLE public.marketing_campaigns IS
  'Phase 49: ops-only marketing campaign records (push/email/offer). Send via existing Edge helpers; not full ESP automation.';

-- ---------------------------------------------------------------------------
-- Guard: do not introduce a zero-arg is_workspace_user overload
-- ---------------------------------------------------------------------------
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
END;
$$;
