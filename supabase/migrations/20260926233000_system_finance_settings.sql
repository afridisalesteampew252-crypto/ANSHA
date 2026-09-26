-- Editable finance defaults. Existing monetary transactions keep their original currency.
CREATE TABLE IF NOT EXISTS public.system_finance_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_currency text NOT NULL DEFAULT 'AED' CHECK (default_currency ~ '^[A-Z]{3}$'),
  enabled_currencies text[] NOT NULL DEFAULT ARRAY['AED','USD','PKR','JPY','EUR','GBP']::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  CONSTRAINT system_finance_currencies_valid CHECK (
    array_length(enabled_currencies, 1) BETWEEN 1 AND 30
    AND default_currency = ANY(enabled_currencies)
    AND array_to_string(enabled_currencies, ',') ~ '^[A-Z]{3}(,[A-Z]{3})*$'
  )
);
INSERT INTO public.system_finance_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.system_finance_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_finance_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.system_finance_settings TO authenticated;
CREATE POLICY system_finance_settings_read ON public.system_finance_settings
  FOR SELECT TO authenticated USING ((SELECT private.is_workspace_user()));
CREATE POLICY system_finance_settings_admin_update ON public.system_finance_settings
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_platform_admin()))
  WITH CHECK ((SELECT private.is_platform_admin()));
