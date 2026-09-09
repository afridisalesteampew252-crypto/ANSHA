/*
# Seed Sample Parts Data

## Overview
Adds sample automotive spare parts across multiple categories so the public catalog has content to display.

## What's Added
- 10 sample parts spanning Headlights, Engines, Brakes, Suspension, Body Parts, Electrical categories
- Parts include realistic OEM numbers, part numbers, conditions, pricing, and compatibility data
- Vehicle compatibility entries for Toyota, Honda, Nissan models
- All parts are published and some are featured on the homepage
*/

-- Get category IDs
DO $$
DECLARE
  cat_headlights uuid;
  cat_engines uuid;
  cat_brakes uuid;
  cat_suspension uuid;
  cat_body uuid;
  cat_electrical uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid;
  p6 uuid; p7 uuid; p8 uuid; p9 uuid; p10 uuid;
BEGIN
  SELECT id INTO cat_headlights FROM public.categories WHERE slug = 'headlights';
  SELECT id INTO cat_engines FROM public.categories WHERE slug = 'engines';
  SELECT id INTO cat_brakes FROM public.categories WHERE slug = 'brakes';
  SELECT id INTO cat_suspension FROM public.categories WHERE slug = 'suspension';
  SELECT id INTO cat_body FROM public.categories WHERE slug = 'body-parts';
  SELECT id INTO cat_electrical FROM public.categories WHERE slug = 'electrical';

  -- Part 1: Toyota Aqua Headlight
  INSERT INTO public.parts (part_code, name, slug, category_id, brand, part_number, oem_number, condition, price, currency, quantity, location, description, is_published, is_featured, show_price)
  VALUES ('ANS-P-000001', 'Toyota Aqua NHP10 Left Headlight Assembly', 'toyota-aqua-nhp10-left-headlight-assembly', cat_headlights, 'Toyota', '81110-0Y020', '81110-0Y020-C1', 'used', 185.00, 'USD', 2, 'Warehouse A - Shelf 12', 'Used left headlight assembly from Toyota Aqua 2014. Glass in good condition, no cracks. All mounting tabs intact. Bulbs included.', true, true, true)
  RETURNING id INTO p1;

  -- Part 2: Toyota Prius Headlight
  INSERT INTO public.parts (part_code, name, slug, category_id, brand, part_number, oem_number, condition, price, currency, quantity, location, description, is_published, is_featured, show_price)
  VALUES ('ANS-P-000002', 'Toyota Prius ZVW30 Right LED Headlight', 'toyota-prius-zvw30-right-led-headlight', cat_headlights, 'Toyota', '81110-47242', '81110-47242-90', 'used', 320.00, 'USD', 1, 'Warehouse A - Shelf 14', 'Used right LED headlight from Toyota Prius 2016. Excellent condition. LED module tested and working. Minor scuff on housing.', true, true, true)
  RETURNING id INTO p2;

  -- Part 3: Honda Civic Engine
  INSERT INTO public.parts (part_code, name, slug, category_id, brand, part_number, oem_number, condition, price, currency, quantity, location, description, is_published, is_featured, show_price)
  VALUES ('ANS-P-000003', 'Honda Civic R18A Engine Assembly', 'honda-civic-r18a-engine-assembly', cat_engines, 'Honda', 'R18A1-1000001', 'R18A1', 'used', 1500.00, 'USD', 1, 'Warehouse B - Engine Bay 3', 'Complete R18A 1.8L engine assembly from Honda Civic 2012. 85,000 km mileage. Compression tested, all cylinders within spec. Includes wiring harness and ECU.', true, true, true)
  RETURNING id INTO p3;

  -- Part 4: Nissan Altima Brake Caliper
  INSERT INTO public.parts (part_code, name, slug, category_id, brand, part_number, oem_number, condition, price, currency, quantity, location, description, is_published, is_featured, show_price)
  VALUES ('ANS-P-000004', 'Nissan Altima L33 Front Brake Caliper Pair', 'nissan-altima-l33-front-brake-caliper-pair', cat_brakes, 'Nissan', '41012-3TA0A', '41012-3TA0A-02', 'refurbished', 145.00, 'USD', 3, 'Warehouse A - Shelf 22', 'Refurbished front brake caliper pair for Nissan Altima 2013-2018. Pistons resealed, guide pins replaced. Ready to install.', true, false, true)
  RETURNING id INTO p4;

  -- Part 5: Toyota Corolla Shock Absorber
  INSERT INTO public.parts (part_code, name, slug, category_id, brand, part_number, oem_number, condition, price, currency, quantity, location, description, is_published, is_featured, show_price)
  VALUES ('ANS-P-000005', 'Toyota Corolla NRE180 Front Shock Absorber Pair', 'toyota-corolla-nre180-front-shock-absorber-pair', cat_suspension, 'Toyota', '48510-02610', '48510-02610-01', 'used', 90.00, 'USD', 2, 'Warehouse A - Shelf 30', 'Used front shock absorber pair from Toyota Corolla 2015. Good working condition, no leaks. Removed from low-mileage vehicle.', true, false, true)
  RETURNING id INTO p5;

  -- Part 6: Honda Accord Front Bumper
  INSERT INTO public.parts (part_code, name, slug, category_id, brand, part_number, oem_number, condition, price, currency, quantity, location, description, is_published, is_featured, show_price)
  VALUES ('ANS-P-000006', 'Honda Accord CV1 Front Bumper Cover', 'honda-accord-cv1-front-bumper-cover', cat_body, 'Honda', '71100-TVA-A01', '71100-TVA-A01ZZ', 'used', 210.00, 'USD', 1, 'Warehouse C - Body Parts Area', 'Used front bumper cover for Honda Accord 2018. Minor scratches, no major damage. Primed and ready for paint. Crystal Black Pearl color.', true, true, true)
  RETURNING id INTO p6;

  -- Part 7: Toyota Hilux Alternator
  INSERT INTO public.parts (part_code, name, slug, category_id, brand, part_number, oem_number, condition, price, currency, quantity, location, description, is_published, is_featured, show_price)
  VALUES ('ANS-P-000007', 'Toyota Hilux 150A Alternator', 'toyota-hilux-150a-alternator', cat_electrical, 'Denso', '27060-0P170', '27060-0P170-12', 'refurbished', 175.00, 'USD', 4, 'Warehouse B - Electrical 5', 'Refurbished 150A alternator for Toyota Hilux 2.4L/2.8L diesel. Tested output 14.2V at idle. New bearings and regulator. 6-month warranty.', true, false, true)
  RETURNING id INTO p7;

  -- Part 8: Nissan X-Trail Headlight
  INSERT INTO public.parts (part_code, name, slug, category_id, brand, part_number, oem_number, condition, price, currency, quantity, location, description, is_published, is_featured, show_price)
  VALUES ('ANS-P-000008', 'Nissan X-Trail T32 Left Xenon Headlight', 'nissan-x-trail-t32-left-xenon-headlight', cat_headlights, 'Nissan', '26010-4RA0A', '26010-4RA0A-02', 'used', 280.00, 'USD', 1, 'Warehouse A - Shelf 15', 'Used left xenon headlight from Nissan X-Trail 2015. Ballast included and working. Lens clear, no moisture damage. Auto-leveling motor functional.', true, false, true)
  RETURNING id INTO p8;

  -- Part 9: Honda CR-V Brake Disc Set
  INSERT INTO public.parts (part_code, name, slug, category_id, brand, part_number, oem_number, condition, price, currency, quantity, location, description, is_published, is_featured, show_price)
  VALUES ('ANS-P-000009', 'Honda CR-V RE5 Front Brake Disc Set', 'honda-crv-re5-front-brake-disc-set', cat_brakes, 'Honda', '45251-SR3-505', '45251-SR3-505-02', 'new', 120.00, 'USD', 5, 'Warehouse A - Shelf 25', 'New front brake disc set (pair) for Honda CR-V 2007-2011. OEM specification. Never installed. Original packaging.', true, false, true)
  RETURNING id INTO p9;

  -- Part 10: Toyota Camry Starter Motor
  INSERT INTO public.parts (part_code, name, slug, category_id, brand, part_number, oem_number, condition, price, currency, quantity, location, description, is_published, is_featured, show_price)
  VALUES ('ANS-P-000010', 'Toyota Camry 2.5L Starter Motor', 'toyota-camry-25l-starter-motor', cat_electrical, 'Denso', '28100-0T020', '28100-0T020-01', 'used', 95.00, 'USD', 3, 'Warehouse B - Electrical 8', 'Used starter motor from Toyota Camry 2.5L 2014. Tested and working. Bench tested at 12V, cranks strong. Clean terminals.', true, false, true)
  RETURNING id INTO p10;

  -- Compatibility entries
  -- Part 1: Toyota Aqua
  INSERT INTO public.part_compatibility (part_id, make, model, variant, chassis_code, engine_code, year_from, year_to) VALUES
    (p1, 'Toyota', 'Aqua', 'G', 'NHP10', '1NZ-FXE', 2011, 2014),
    (p1, 'Toyota', 'Aqua', 'S', 'NHP10', '1NZ-FXE', 2011, 2014),
    (p1, 'Toyota', 'Prius C', 'Standard', 'NHP10', '1NZ-FXE', 2012, 2014);

  -- Part 2: Toyota Prius
  INSERT INTO public.part_compatibility (part_id, make, model, variant, chassis_code, engine_code, year_from, year_to) VALUES
    (p2, 'Toyota', 'Prius', 'A Premium', 'ZVW30', '2ZR-FXE', 2009, 2015),
    (p2, 'Toyota', 'Prius', 'S', 'ZVW30', '2ZR-FXE', 2009, 2015);

  -- Part 3: Honda Civic
  INSERT INTO public.part_compatibility (part_id, make, model, variant, chassis_code, engine_code, year_from, year_to) VALUES
    (p3, 'Honda', 'Civic', '1.8S', 'FB6', 'R18A1', 2012, 2015),
    (p3, 'Honda', 'Civic', '1.8G', 'FB6', 'R18A1', 2012, 2015),
    (p3, 'Honda', 'Civic', '1.8 VTi', 'FK6', 'R18A1', 2012, 2015);

  -- Part 4: Nissan Altima
  INSERT INTO public.part_compatibility (part_id, make, model, variant, chassis_code, engine_code, year_from, year_to) VALUES
    (p4, 'Nissan', 'Altima', '2.5S', 'L33', 'QR25DE', 2013, 2018),
    (p4, 'Nissan', 'Altima', '2.5SV', 'L33', 'QR25DE', 2013, 2018),
    (p4, 'Nissan', 'Altima', '3.5SL', 'L33', 'VQ35DE', 2013, 2018);

  -- Part 5: Toyota Corolla
  INSERT INTO public.part_compatibility (part_id, make, model, variant, chassis_code, engine_code, year_from, year_to) VALUES
    (p5, 'Toyota', 'Corolla', 'AXIO G', 'NRE160', '1NR-FE', 2012, 2018),
    (p5, 'Toyota', 'Corolla', 'AXIO X', 'NRE160', '1NR-FE', 2012, 2018),
    (p5, 'Toyota', 'Corolla', 'FIELDER', 'NZE161', '1ZR-FAE', 2012, 2018);

  -- Part 6: Honda Accord
  INSERT INTO public.part_compatibility (part_id, make, model, variant, chassis_code, engine_code, year_from, year_to) VALUES
    (p6, 'Honda', 'Accord', '2.0 EX', 'CV1', 'R20A3', 2018, 2022),
    (p6, 'Honda', 'Accord', '2.4 EX-L', 'CW1', 'K24W3', 2018, 2022);

  -- Part 7: Toyota Hilux
  INSERT INTO public.part_compatibility (part_id, make, model, variant, chassis_code, engine_code, year_from, year_to) VALUES
    (p7, 'Toyota', 'Hilux', '2.4 GD-6', 'GUN125', '2GD-FTV', 2015, 2020),
    (p7, 'Toyota', 'Hilux', '2.8 GD-6', 'GUN126', '1GD-FTV', 2015, 2020),
    (p7, 'Toyota', 'Fortuner', '2.8 GD-6', 'GDJ150', '1GD-FTV', 2015, 2020);

  -- Part 8: Nissan X-Trail
  INSERT INTO public.part_compatibility (part_id, make, model, variant, chassis_code, engine_code, year_from, year_to) VALUES
    (p8, 'Nissan', 'X-Trail', '2.0 4WD', 'T32', 'MR20DD', 2013, 2018),
    (p8, 'Nissan', 'X-Trail', '2.5 4WD', 'T32', 'QR25DE', 2013, 2018),
    (p8, 'Nissan', 'Rogue', 'SL 2.5', 'T32', 'QR25DE', 2014, 2018);

  -- Part 9: Honda CR-V
  INSERT INTO public.part_compatibility (part_id, make, model, variant, chassis_code, engine_code, year_from, year_to) VALUES
    (p9, 'Honda', 'CR-V', '2.0L 4WD', 'RE5', 'R20A2', 2007, 2011),
    (p9, 'Honda', 'CR-V', '2.4L 4WD', 'RE5', 'K24Z1', 2007, 2011);

  -- Part 10: Toyota Camry
  INSERT INTO public.part_compatibility (part_id, make, model, variant, chassis_code, engine_code, year_from, year_to) VALUES
    (p10, 'Toyota', 'Camry', '2.5G', 'ASV50', '2AR-FE', 2011, 2017),
    (p10, 'Toyota', 'Camry', '2.5 Hybrid', 'AVV50', '2AR-FXE', 2011, 2017);
END $$;