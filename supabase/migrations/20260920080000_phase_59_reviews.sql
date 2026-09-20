-- Phase 59: Admin-managed customer reviews / testimonials
-- Public read of published rows; ops (admin|staff) full write — matches blog_posts.

CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text,
  location text,
  quote text NOT NULL,
  rating smallint NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT reviews_quote_len CHECK (char_length(btrim(quote)) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS reviews_published_sort_idx
  ON public.reviews (is_published, sort_order ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_sort_order_idx
  ON public.reviews (sort_order ASC, created_at DESC);

DROP TRIGGER IF EXISTS reviews_set_updated_at ON public.reviews;
CREATE TRIGGER reviews_set_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read_published_reviews ON public.reviews;
CREATE POLICY public_read_published_reviews
  ON public.reviews FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS workspace_read_all_reviews ON public.reviews;
CREATE POLICY workspace_read_all_reviews
  ON public.reviews FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS ops_insert_reviews ON public.reviews;
CREATE POLICY ops_insert_reviews
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS ops_update_reviews ON public.reviews;
CREATE POLICY ops_update_reviews
  ON public.reviews FOR UPDATE TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS ops_delete_reviews ON public.reviews;
CREATE POLICY ops_delete_reviews
  ON public.reviews FOR DELETE TO authenticated
  USING ((SELECT private.is_ops_user()));

REVOKE ALL ON public.reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;

COMMENT ON TABLE public.reviews IS
  'Phase 59: curated customer testimonials shown on /reviews and the home strip. Ops CRUD; public reads published only.';

-- Seed the previous static testimonials (idempotent by name+location)
INSERT INTO public.reviews (name, role, location, quote, rating, sort_order, is_published)
SELECT v.name, v.role, v.location, v.quote, v.rating, v.sort_order, true
FROM (VALUES
  (
    'Kwame Mensah',
    'Importer',
    'Accra, Ghana',
    'We ordered a Land Cruiser Prado from Japan stock through ANSHA. Clear photos, honest condition notes, and the paperwork arrived before the vessel — that is rare in this trade.',
    5,
    10
  ),
  (
    'Fatima Al-Rashid',
    'Workshop manager',
    'Sharjah, UAE',
    'When we need OEM remotes and sensors for Japanese models, ANSHA usually has the right Make / Model / Year match. Saves us from guessing aftermarket fitment.',
    5,
    20
  ),
  (
    'David Okonkwo',
    'Spare parts trader',
    'Lagos, Nigeria',
    'Communication is straightforward. They confirm OEM numbers before shipping and do not push stock that will not fit. That alone is worth the relationship.',
    5,
    30
  ),
  (
    'Hassan Ibrahim',
    'Fleet buyer',
    'Dubai, UAE',
    'Sourced two Hilux units for our site fleet. Export timeline from Dubai was realistic — no overselling — and the team answered every chassis question quickly.',
    4,
    40
  ),
  (
    'Amina Diallo',
    'Construction procurement',
    'Dakar, Senegal',
    'We needed a used excavator with known hours. ANSHA shared inspection details and helped us decide between two machines instead of rushing a sale.',
    5,
    50
  ),
  (
    'Ravi Perera',
    'Auto electrician',
    'Colombo, Sri Lanka',
    'Smart keys and immobilizer parts are easy to get wrong. Their team asked for the chassis and key type first. The remote we received programmed without drama.',
    5,
    60
  ),
  (
    'Joseph Mwangi',
    'Used car dealer',
    'Nairobi, Kenya',
    'Auction sheet guidance helped us avoid a car with flood history. We still buy through them when we need clean Japanese stock for East Africa.',
    5,
    70
  ),
  (
    'Sara Haddad',
    'Parts buyer',
    'Amman, Jordan',
    'Catalog search by model year and color naming actually works. We find remotes and body parts faster than hunting through WhatsApp photo dumps.',
    4,
    80
  )
) AS v(name, role, location, quote, rating, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.reviews r
  WHERE r.name = v.name AND COALESCE(r.location, '') = COALESCE(v.location, '')
);
