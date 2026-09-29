ALTER TABLE public.export_market_configs
  ADD COLUMN IF NOT EXISTS year_restriction text,
  ADD COLUMN IF NOT EXISTS destination_port text,
  ADD COLUMN IF NOT EXISTS transit_time text,
  ADD COLUMN IF NOT EXISTS vessel_schedule text,
  ADD COLUMN IF NOT EXISTS shipping_line text,
  ADD COLUMN IF NOT EXISTS inspection text,
  ADD COLUMN IF NOT EXISTS route_note text;

COMMENT ON COLUMN public.export_market_configs.year_restriction IS 'Admin-maintained vehicle age/import eligibility guidance for the country page.';
COMMENT ON COLUMN public.export_market_configs.destination_port IS 'Admin-maintained destination port or inland transit route guidance.';
COMMENT ON COLUMN public.export_market_configs.transit_time IS 'Indicative shipment transit time shown on the country page.';
COMMENT ON COLUMN public.export_market_configs.vessel_schedule IS 'Indicative vessel schedule shown on the country page.';
COMMENT ON COLUMN public.export_market_configs.shipping_line IS 'Shipping line guidance shown on the country page.';
COMMENT ON COLUMN public.export_market_configs.inspection IS 'Inspection and customs guidance shown on the country page.';
COMMENT ON COLUMN public.export_market_configs.route_note IS 'Additional inland route, caveat, or source note for the country page.';
