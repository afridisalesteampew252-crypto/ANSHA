/* Phase 24: PWA web push subscriptions + public deals/offers. */

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  notify_insights boolean NOT NULL DEFAULT true,
  notify_deals boolean NOT NULL DEFAULT true,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_insights_idx
  ON public.push_subscriptions (notify_insights)
  WHERE notify_insights = true;
CREATE INDEX IF NOT EXISTS push_subscriptions_deals_idx
  ON public.push_subscriptions (notify_deals)
  WHERE notify_deals = true;

DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Public visitors may register/update/remove their own push endpoint (keyed by endpoint).
DROP POLICY IF EXISTS anon_insert_push_subscriptions ON public.push_subscriptions;
CREATE POLICY anon_insert_push_subscriptions
  ON public.push_subscriptions FOR INSERT TO anon, authenticated
  WITH CHECK (char_length(endpoint) BETWEEN 10 AND 2000);

DROP POLICY IF EXISTS anon_delete_push_subscriptions ON public.push_subscriptions;
CREATE POLICY anon_delete_push_subscriptions
  ON public.push_subscriptions FOR DELETE TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS workspace_read_push_subscriptions ON public.push_subscriptions;
CREATE POLICY workspace_read_push_subscriptions
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS workspace_delete_push_subscriptions ON public.push_subscriptions;
CREATE POLICY workspace_delete_push_subscriptions
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_user()));

REVOKE ALL ON public.push_subscriptions FROM PUBLIC;
GRANT INSERT, DELETE ON public.push_subscriptions TO anon, authenticated;
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;

CREATE TABLE IF NOT EXISTS public.site_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  summary text CHECK (summary IS NULL OR char_length(summary) <= 500),
  href text NOT NULL DEFAULT '/parts' CHECK (char_length(trim(href)) BETWEEN 1 AND 500),
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_offers_published_idx
  ON public.site_offers (is_published, published_at DESC);

DROP TRIGGER IF EXISTS site_offers_updated_at ON public.site_offers;
CREATE TRIGGER site_offers_updated_at
BEFORE UPDATE ON public.site_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.site_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read_published_site_offers ON public.site_offers;
CREATE POLICY public_read_published_site_offers
  ON public.site_offers FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS workspace_manage_site_offers ON public.site_offers;
CREATE POLICY workspace_manage_site_offers
  ON public.site_offers FOR ALL TO authenticated
  USING ((SELECT private.is_workspace_user()))
  WITH CHECK ((SELECT private.is_workspace_user()));

REVOKE ALL ON public.site_offers FROM PUBLIC;
GRANT SELECT ON public.site_offers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_offers TO authenticated;
