BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('77000000-0000-4000-8000-000000000001','catalog-admin@example.invalid'),
 ('77000000-0000-4000-8000-000000000002','catalog-customer@example.invalid');
INSERT INTO public.admin_profiles(id,role,full_name,is_active)
VALUES ('77000000-0000-4000-8000-000000000001','admin','Catalog regression',true)
ON CONFLICT (id) DO UPDATE SET role='admin',is_active=true;
SELECT set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
INSERT INTO public.vehicle_model_specs(make,model,normalized_make,normalized_model,length_m,width_m,height_m,volume_m3)
VALUES ('Regression Motors','Small Test','regression motors','small test',4,1.5,1.4,8.4);
INSERT INTO public.vehicles(id,title,slug,make,model,price,show_price,is_published,destination_markets)
VALUES ('77000000-0000-4000-8000-000000000011','Small Test','catalog-regression-small','Regression Motors','SMALL-Test',10,false,true,ARRAY['ke',' KE ','tz']);
INSERT INTO public.vehicles(id,title,slug,make,model,volume_m3)
VALUES ('77000000-0000-4000-8000-000000000012','Custom size','catalog-regression-custom','Regression Motors','Small Test',10.5);
INSERT INTO public.parts(id,part_code,name,slug,brand,part_number,is_published,search_keywords)
VALUES ('77000000-0000-4000-8000-000000000021','CAT-TEST-P','Headlight','catalog-regression-part','Toyota','81110-52J30',true,ARRAY['Aqua','NHP10']);
DO $$
BEGIN
  ASSERT (SELECT volume_m3=8.4 FROM public.vehicles WHERE id='77000000-0000-4000-8000-000000000011'), 'future uploads use normalized make/model volume';
  ASSERT (SELECT volume_m3=10.5 FROM public.vehicles WHERE id='77000000-0000-4000-8000-000000000012'), 'explicit vehicle volume overrides the model default';
  ASSERT (SELECT destination_markets=ARRAY['KE','TZ'] FROM public.vehicles WHERE id='77000000-0000-4000-8000-000000000011'), 'country assignments are normalized and isolated';
  PERFORM public.bulk_update_vehicle_prices(ARRAY['77000000-0000-4000-8000-000000000011']::uuid[],'price_fob','set',10000);
  ASSERT (SELECT price_fob=10000 AND price=10000 AND show_price FROM public.vehicles WHERE id='77000000-0000-4000-8000-000000000011'), 'bulk FOB immediately becomes the visible listing price';
  PERFORM public.bulk_update_vehicle_prices(ARRAY['77000000-0000-4000-8000-000000000011']::uuid[],'price_cf','set',11000);
  ASSERT (SELECT price_fob=10000 AND price=10000 AND price_cf=11000 FROM public.vehicles WHERE id='77000000-0000-4000-8000-000000000011'), 'C&F remains a separate quote';
  PERFORM public.bulk_update_vehicle_prices(ARRAY['77000000-0000-4000-8000-000000000011']::uuid[],'price_fob','decrease_percent',150);
  ASSERT (SELECT price_fob=0 AND price=0 FROM public.vehicles WHERE id='77000000-0000-4000-8000-000000000011'), 'percentage decreases stop at zero';
  UPDATE public.vehicles SET price_fob=9000 WHERE id='77000000-0000-4000-8000-000000000011';
  ASSERT (SELECT price=9000 FROM public.vehicles WHERE id='77000000-0000-4000-8000-000000000011'), 'manual/API FOB updates also sync the listing price';
  UPDATE public.parts SET search_keywords=ARRAY['Toyota Aqua','NHP10'] WHERE id='77000000-0000-4000-8000-000000000021';
  ASSERT (SELECT catalog_search_text ILIKE '%aqua%' FROM public.parts WHERE id='77000000-0000-4000-8000-000000000021'), 'fitment tags are searchable case-insensitively';
  BEGIN
    PERFORM public.bulk_update_vehicle_prices(ARRAY['77000000-0000-4000-8000-000000000011']::uuid[],'price_fob','set','NaN'::numeric);
    ASSERT false, 'NaN prices must be rejected';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    PERFORM public.bulk_update_vehicle_prices(ARRAY['77000000-0000-4000-8000-000000000011']::uuid[],'price','set',1);
    ASSERT false, 'legacy price field must not bypass FOB';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;
SELECT set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000002',true);
DO $$
BEGIN
  BEGIN
    PERFORM public.bulk_update_vehicle_prices(ARRAY['77000000-0000-4000-8000-000000000011']::uuid[],'price_fob','set',1);
    ASSERT false, 'customer accounts cannot edit prices';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  ASSERT (SELECT count(*)=1 FROM public.vehicles WHERE id='77000000-0000-4000-8000-000000000011' AND destination_markets @> ARRAY['KE']), 'Kenya sees its assigned vehicle';
  ASSERT (SELECT count(*)=0 FROM public.vehicles WHERE id='77000000-0000-4000-8000-000000000011' AND destination_markets @> ARRAY['NG']), 'Nigeria does not inherit Kenya picks';
  ASSERT (SELECT catalog_search_text ILIKE '%aqua%' FROM public.parts WHERE id='77000000-0000-4000-8000-000000000021'), 'public tag search has the required column grant';
END;
$$;
RESET ROLE;
ROLLBACK;
